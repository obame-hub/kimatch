-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE INTERACTION ET UNE TÂCHE PEUVENT SE RATTACHER À UNE REQUÊTE
--
-- William, 07/09/2026 : « les fiches Requête, Piste, Opportunité doivent avoir exactement le même
-- volet activité que les autres ».
--
-- CE QUI BLOQUAIT, MESURÉ LE 07/09/2026. Les trois fiches montrent un `FluxActualite` — l'historique
-- des modifications du dossier — là où les cinq autres (Compte, Site, Contact, Recommandation, Suivi
-- de contrat) montrent un `ActivityFeed` : les échanges, les tâches et les documents. Deux
-- composants, deux contenus, un seul emplacement.
--
-- Piste et Opportunité peuvent basculer sans toucher au schéma : `interactions` et `actions` portent
-- déjà `piste_id` et `opportunite_id`. Mieux, 8 942 interactions sont DÉJÀ rattachées à des pistes et
-- ne s'affichent nulle part — elles réapparaissent d'elles-mêmes.
--
-- La requête, elle, n'a aucune colonne. Sur les onze contextes d'une interaction — compte, contact,
-- site, signal, mandat, recommandation, version, action, opportunité, suivi de contrat, piste — la
-- requête est le seul objet de travail absent. Écrire une note sur une requête était donc impossible,
-- et le volet ne pouvait pas être « exactement le même » que sur les autres fiches.
--
-- ══ ET LA CONTRAINTE DE CONTEXTE DOIT SUIVRE, SUR LES DEUX TABLES ══
--
-- `interactions_contexte_check` et `actions_contexte_check` exigent qu'AU MOINS un contexte soit
-- renseigné. Ajouter la colonne sans reprendre la contrainte donnerait une colonne inutilisable :
-- une note portée par la seule requête serait refusée à l'insertion, ses autres contextes étant
-- nuls.
--
-- C'EST LE PIÈGE DU 31/08 SUR `actions_contexte_check`, ET CELUI DU 01/09 SUR LES PISTES : la
-- colonne avait été ajoutée, pas la contrainte, et les tâches créées depuis une opportunité étaient
-- rejetées par la base. Ni le build, ni les types, ni le lint ne l'avaient vu — seul un essai
-- fonctionnel l'a montré. Les deux contraintes sont donc reprises dans la même transaction, et le
-- garde-fou essaie VRAIMENT les deux insertions avant de les annuler.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ══
--
-- Aucune donnée n'est déplacée : les 7 requêtes existantes n'ont aucun échange à rattacher, leur
-- volet se remplira à l'usage. Rien n'est retiré non plus — l'historique des modifications reste
-- atteignable par le contrôle « Historique » que la fiche Requête porte déjà.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LES DEUX COLONNES ═════════════════════════════════════════════════════════════════════════

alter table public.interactions
  add column if not exists requete_id uuid references public.requetes(id) on delete set null;

comment on column public.interactions.requete_id is
  'La requête concernée, quand l''échange porte sur une demande interne et non sur une affaire.';

alter table public.actions
  add column if not exists requete_id uuid references public.requetes(id) on delete set null;

comment on column public.actions.requete_id is
  'La requête concernée, pour une tâche créée depuis le volet d''activité de sa fiche.';

-- `on delete set null` et non `cascade` : supprimer une requête ne doit pas emporter l'appel qui a
-- eu lieu à son sujet. C'est le choix fait pour les dix autres contextes, et l'appel garde de toute
-- façon son compte et son contact.

-- ══ 2. LES INDEX ═════════════════════════════════════════════════════════════════════════════════
-- Le volet lit tous les échanges d'une requête par date décroissante. Sans index, chaque ouverture
-- de fiche balaierait la table entière — 8 942 interactions rien que pour les pistes.

create index if not exists interactions_requete_idx
  on public.interactions (requete_id, date_interaction desc) where requete_id is not null;

create index if not exists actions_requete_idx
  on public.actions (requete_id) where requete_id is not null;

-- ══ 3. LES CONTRAINTES DE CONTEXTE, REPRISES À L'IDENTIQUE PLUS LA REQUÊTE ═══════════════════════

alter table public.interactions drop constraint if exists interactions_contexte_check;
alter table public.interactions add constraint interactions_contexte_check check (
  compte_id is not null
  or contact_id is not null
  or site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or action_id is not null
  or opportunite_id is not null
  or suivi_contrat_id is not null
  or piste_id is not null
  or requete_id is not null
);

-- `actions_contexte_check` ne cite pas `contact_id`, et ce n'est pas un oubli de ma part : la
-- contrainte est reprise telle qu'elle existe en base au 07/09/2026, à laquelle s'ajoute la seule
-- requête. Y glisser `contact_id` au passage relâcherait une règle que personne n'a demandé de
-- relâcher, dans une migration qui parle d'autre chose.
alter table public.actions drop constraint if exists actions_contexte_check;
alter table public.actions add constraint actions_contexte_check check (
  site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or opportunite_id is not null
  or piste_id is not null
  or suivi_contrat_id is not null
  or requete_id is not null
);

-- ── Le garde-fou : les deux contraintes doivent VRAIMENT accepter le seul contexte « requête » ──
-- Constater que la colonne existe ne prouve rien ; c'est l'insertion qui prouve. On les essaie pour
-- de bon, puis on les retire — l'essai vit et meurt dans cette transaction.
do $$
declare
  v_requete       uuid;
  v_type_inter    uuid;
  v_type_action   uuid;
  v_statut_action uuid;
  v_essai         uuid;
begin
  select id into v_requete from public.requetes limit 1;
  if v_requete is null then
    raise notice 'Essai fonctionnel impossible : aucune requete en base';
    return;
  end if;

  -- L'interaction.
  select id into v_type_inter from public.types_interactions where code = 'AUTRE';
  if v_type_inter is null then
    select id into v_type_inter from public.types_interactions limit 1;
  end if;
  if v_type_inter is not null then
    insert into public.interactions (type_interaction_id, date_interaction, objet, requete_id)
    values (v_type_inter, now(), 'Essai de contrainte — annule dans la meme transaction', v_requete)
    returning id into v_essai;
    delete from public.interactions where id = v_essai;
    raise notice 'Essai reussi : une interaction sur la seule requete est acceptee';
  else
    raise exception 'Aucun type d interaction en base : la contrainte n a pas pu etre eprouvee';
  end if;

  -- La tâche. `titre` et `statut_id` sont obligatoires, en plus du type.
  select id into v_type_action from public.types_actions limit 1;
  select id into v_statut_action from public.statuts_actions limit 1;
  if v_type_action is not null and v_statut_action is not null then
    insert into public.actions (type_action_id, titre, statut_id, requete_id)
    values (v_type_action, 'Essai de contrainte — annule', v_statut_action, v_requete)
    returning id into v_essai;
    delete from public.actions where id = v_essai;
    raise notice 'Essai reussi : une tache sur la seule requete est acceptee';
  else
    raise exception 'Aucun type ou statut d action en base : la contrainte n a pas pu etre eprouvee';
  end if;
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   select table_name, column_name from information_schema.columns
--    where table_schema='public' and column_name='requete_id' order by table_name;
--   -- Attendu : deux lignes, actions et interactions.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('interactions_contexte_check','actions_contexte_check');
--   -- Attendu : les deux définitions citent requete_id.
--
--   Puis, dans l'application : ouvrir une requête, écrire une note dans le volet de droite. Elle doit
--   apparaître dans le fil sans erreur « violates check constraint ».
