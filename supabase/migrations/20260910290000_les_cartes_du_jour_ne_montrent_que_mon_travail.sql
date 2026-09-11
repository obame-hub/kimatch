-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES CARTES DU JOUR NE MONTRENT QUE MON TRAVAIL
--
-- William, 10/09/2026 : « Important : seuls les enregistrements propres à l'utilisateur qui ouvre
-- la page doivent s'afficher. » Et une cinquième carte : les pistes à prospecter.
--
-- ── CE QUI CHANGE PAR RAPPORT À LA PREMIÈRE VERSION ──
--
-- La fonction comptait pour toute l'équipe. Elle compte désormais pour l'appelant, et elle rend un
-- sixième… septième nombre : les pistes.
--
-- ── « À MOI » N'A PAS LE MÊME SENS POUR UNE TÂCHE ET POUR UN DOSSIER ──
--
-- Une TÂCHE est à moi quand j'en suis le responsable : `actions.responsable_profil_id`. C'est la
-- colonne que « Ma journée » utilise déjà, et la seule renseignée sur les tâches (461 sur 473).
--
-- Un DOSSIER — piste ou opportunité — est à moi quand j'en suis le propriétaire :
-- `proprietaire_id`. C'est le mot de William : « les pistes pour lesquelles JE SUIS PROPRIÉTAIRE ».
--
-- LES DEUX CARTES DE DOSSIERS NE REGARDENT DONC PAS QUI PORTE LA TÂCHE. Une piste qui m'appartient
-- et sur laquelle un collègue a une relance ouverte compte : le dossier attend une suite, et c'est
-- moi qui en réponds. L'inverse — compter les dossiers d'autrui parce que la tâche est à moi —
-- ferait apparaître dans mon tableau des affaires que je ne pilote pas.
--
-- ── `auth.uid()` EST L'IDENTIFIANT DU PROFIL ──
--
-- `profils.id` porte directement l'identifiant du compte Supabase : `useUploadMaPhoto` écrit
-- `.eq('id', utilisateur.id)`. Aucune table de correspondance à traverser.
--
-- SANS SESSION, `auth.uid()` VAUT NULL et tous les compteurs tombent à zéro. C'est le bon
-- comportement : une page ouverte sans être connecté ne doit rien révéler.
--
-- ── CE QUE CHACUN VERRA, MESURÉ LE 10/09/2026 ──
--
--   Matthieu Bruere   85 appels, 0 mail, 51 pistes, 13 opportunités
--   Thomas Le Guen    13 appels, 28 pistes, 2 opportunités
--   Fabien Dubarry    5 appels, 112 mails
--   William Goupil    zéro partout — il n'a aucune tâche à son nom
--
-- Le tableau de bord d'un administrateur qui ne prospecte pas est vide, et c'est exact.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists compter_cartes_du_jour();

create or replace function compter_cartes_du_jour()
returns table (
  appels                 integer,
  mails                  integer,
  livrables              integer,
  pistes_a_prospecter    integer,
  perimetre_a_detecter   integer,
  mandat_a_recuperer     integer,
  recommandation_a_creer integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  -- Toutes les tâches encore ouvertes, avec leur type et les dossiers qu'elles touchent.
  ouvertes as (
    select a.responsable_profil_id, a.piste_id, a.opportunite_id, ta.code as type_code
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    left join types_actions ta on ta.id = a.type_action_id
    where a.actif and sa.code not in ('TERMINEE', 'ANNULEE')
  ),
  -- MES tâches : celles dont je suis le responsable.
  mes_taches as (
    select o.* from ouvertes o, moi where o.responsable_profil_id = moi.profil_id
  ),
  -- MES pistes qui attendent quelque chose. Une piste compte UNE fois, quel que soit le nombre de
  -- tâches ouvertes qu'elle porte : c'est un dossier à traiter, pas une charge de travail.
  mes_pistes as (
    select distinct pi.id
    from ouvertes o
    join pistes pi on pi.id = o.piste_id and pi.actif
    cross join moi
    where pi.proprietaire_id = moi.profil_id
  ),
  -- MES opportunités qui attendent quelque chose, avec leur statut.
  mes_opportunites as (
    select distinct op.id, so.code as statut
    from ouvertes o
    join opportunites op on op.id = o.opportunite_id and op.actif
    join statuts_opportunites so on so.id = op.statut_id
    cross join moi
    where op.proprietaire_id = moi.profil_id
      and so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
  )
  select
    (select count(*) from mes_taches where type_code = 'APPELER')::integer,
    (select count(*) from mes_taches where type_code = 'ENVOYER_EMAIL')::integer,
    (select count(*) from mes_taches where type_code = 'LIVRABLE')::integer,
    (select count(*) from mes_pistes)::integer,
    (select count(*) from mes_opportunites
      where statut in ('NOUVELLE', 'EN_QUALIFICATION'))::integer,
    (select count(*) from mes_opportunites where statut = 'COUVERTURE_MANDAT')::integer,
    (select count(*) from mes_opportunites where statut = 'PRETE_A_CONVERTIR')::integer;
$$;

comment on function compter_cartes_du_jour is
  'Les sept nombres de la première ligne du tableau de bord, POUR L''APPELANT : ses tâches ouvertes par type (Appel, Mail, Livrable), ses pistes à prospecter, et ses opportunités à suivre par statut. Une tâche est à moi par responsable_profil_id, un dossier par proprietaire_id.';

grant execute on function compter_cartes_du_jour() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Depuis l'application, connecté : select * from compter_cartes_du_jour();
--   -- Depuis un outil d'administration, auth.uid() est nul et la fonction rend sept zéros.
--   -- Pour vérifier un utilisateur donné, remplacer `moi` par son identifiant à la main.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
