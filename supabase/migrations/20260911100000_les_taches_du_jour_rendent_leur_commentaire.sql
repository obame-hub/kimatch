-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TÂCHES DU JOUR RENDENT AUSSI LEUR COMMENTAIRE
--
-- William, 11/09/2026 : « dans le tableau ce sont des tâches ouvertes, donc on doit pouvoir les
-- terminer (case à cocher) ou les reporter ou les modifier ».
--
-- Terminer et reporter ne demandent que l'identifiant, que la fonction rendait déjà. MODIFIER, lui,
-- ouvre `PanneauEditionTache`, qui édite trois champs : l'intitulé, l'échéance et le commentaire.
-- Les deux premiers étaient là ; le troisième manquait.
--
-- ── POURQUOI L'AJOUTER À LA FONCTION PLUTÔT QUE D'ALLER LE CHERCHER À L'OUVERTURE ──
--
-- Un second aller-retour au moment du clic sur le crayon coûterait une attente visible sur un geste
-- qui doit être instantané, et surtout il ferait vivre le formulaire sur une donnée lue à un autre
-- moment que la ligne qu'on regarde. Une colonne `text` de plus sur au plus quelques dizaines de
-- lignes ne pèse rien à côté.
--
-- Le corps de la fonction est REPRIS À L'IDENTIQUE de `20260910330000`, avec la seule colonne
-- `a.commentaire` ajoutée en dernier — le type de retour changeant, `create or replace` ne suffit
-- pas et il faut passer par un `drop`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists lister_taches_du_jour();

create function lister_taches_du_jour()
returns table (
  id           uuid,
  titre        text,
  statut       text,
  type_code    text,
  type_libelle text,
  porteur_type text,
  porteur_id   uuid,
  porteur_nom  text,
  contact_id   uuid,
  contact_nom  text,
  date_prevue  timestamptz,
  a_une_heure  boolean,
  commentaire  text
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui)
  select
    a.id,
    a.titre,
    case
      when (a.date_prevue at time zone 'Europe/Paris')::date < j.aujourdhui then 'EN_RETARD'
      when (a.date_prevue at time zone 'Europe/Paris')::time <> '00:00:00'  then 'PROGRAMMEE'
      else 'DU_JOUR'
    end                                                     as statut,
    ta.code, ta.libelle,
    case
      when r.id  is not null then 'RECOMMANDATION'
      when sc.id is not null then 'SUIVI_CONTRAT'
      when rq.id is not null then 'REQUETE'
      when op.id is not null then 'OPPORTUNITE'
      when pi.id is not null then 'PISTE'
      else 'AUCUN'
    end                                                     as porteur_type,
    coalesce(r.id, sc.id, rq.id, op.id, pi.id)              as porteur_id,
    coalesce(
      r.nom,  r.reference,
      sc.reference,
      rq.objet, rq.reference,
      op.reference,
      pi.reference, pi.contact_nom
    )                                                       as porteur_nom,
    c.id,
    nullif(trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')), ''),
    a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::time <> '00:00:00',
    -- LA SEULE NOUVEAUTÉ DE CETTE MIGRATION.
    a.commentaire
  from actions a
  join statuts_actions sa on sa.id = a.statut_id
  cross join moi
  cross join jour j
  left join types_actions ta      on ta.id = a.type_action_id
  left join recommandations r     on r.id  = a.recommandation_id and r.actif
  left join suivis_contrats sc    on sc.id = a.suivi_contrat_id
  left join requetes rq           on rq.id = a.requete_id
  left join opportunites op       on op.id = a.opportunite_id and op.actif
  left join pistes pi             on pi.id = a.piste_id and pi.actif
  left join contacts c            on c.id  = a.contact_id
  where a.actif
    and sa.code not in ('TERMINEE', 'ANNULEE')
    and a.responsable_profil_id = moi.profil_id
    and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                          at time zone 'Europe/Paris';
$$;

comment on function lister_taches_du_jour is
  'Mes tâches ouvertes en retard ou dues aujourd''hui, avec leur statut, leur porteur, leur contact et leur commentaire. Le commentaire sert au panneau d''édition ouvert depuis le tableau.';

grant execute on function lister_taches_du_jour() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select statut, count(*), count(commentaire) as avec_commentaire
--     from lister_taches_du_jour() group by 1 order by 1;
--
--   -- Le nombre de lignes doit être RIGOUREUSEMENT IDENTIQUE à celui d'avant la migration : seule
--   -- une colonne est ajoutée, aucune condition n'a bougé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
