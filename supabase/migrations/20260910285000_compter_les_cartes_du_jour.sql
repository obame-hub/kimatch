-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES SIX NOMBRES DE LA PREMIÈRE LIGNE DU TABLEAU DE BORD
--
-- William, 10/09/2026 : quatre cartes en tête de page. Trois comptent les tâches ouvertes par type
-- — Appel, Mail, Livrable — la quatrième porte trois mesures sur les opportunités à suivre.
--
-- ── POURQUOI UNE FONCTION PLUTÔT QUE SIX REQUÊTES ──
--
-- Six `count` séparés, c'est six allers-retours au chargement, et six de plus à CHAQUE tâche cochée
-- — les compteurs se rafraîchissent en temps réel. Ici, un seul appel, un seul parcours de la table
-- `actions`, et les six nombres calculés là où sont les données.
--
-- ── « OUVERTE » SE DÉFINIT PAR CE QUI N'EST PAS FERMÉ ──
--
-- `statuts_actions` porte cinq codes : À faire, En cours, En attente, Terminée, Annulée. On exclut
-- les deux derniers plutôt que d'énumérer les trois premiers. UN STATUT AJOUTÉ DEMAIN compterait
-- alors comme ouvert, ce qui est le bon défaut : une tâche ni terminée ni annulée attend toujours
-- quelqu'un. La liste inverse l'aurait fait disparaître du compteur en silence.
--
-- ── LES TYPES SONT DÉSIGNÉS PAR LEUR CODE, JAMAIS PAR LEUR LIBELLÉ ──
--
-- « Appel » est le libellé de `APPELER`, « Mail » celui de `ENVOYER_EMAIL`, « Livrable » celui de
-- `LIVRABLE`. Les libellés se renomment depuis l'administration, les codes non : compter sur le
-- libellé donnerait un compteur qui tombe à zéro le jour où quelqu'un écrit « Appel téléphonique ».
--
-- ── CE QUE COMPTE LA QUATRIÈME CARTE ──
--
-- Des OPPORTUNITÉS, pas des tâches : une opportunité qui porte trois tâches ouvertes compte pour
-- une. C'est un nombre de dossiers à traiter, pas une charge de travail.
--
--   Périmètre à détecter      statut Nouvelle ou En qualification
--   Mandat à récupérer        statut Couverture mandat
--   Recommandation à créer    statut Prête à convertir
--
-- « Diminue de 1 quand la tâche est faite ou quand l'opportunité change de statut » : les deux cas
-- sont couverts par la même jointure, puisqu'elle exige simultanément un statut éligible et une
-- tâche ouverte.
--
-- ── « À AUJOURD'HUI » : L'ÉTAT DU JOUR, PAS L'ÉCHÉANCE DU JOUR ──
--
-- Deux lectures étaient possibles. Celle retenue : l'opportunité porte AUJOURD'HUI une tâche non
-- close, quelle que soit son échéance. Les trois premières cartes comptent les tâches ouvertes sans
-- filtre de date — la quatrième doit se lire dans la même unité, sinon la ligne mélange deux sens
-- du mot « ouverte ». Et « diminue quand la tâche est faite » décrit un compteur qui suit l'ÉTAT :
-- avec l'autre lecture, il changerait aussi tout seul à minuit.
--
-- Au 10/09/2026 les 15 tâches d'opportunité ouvertes ont toutes une échéance à venir (13/09 au
-- 04/10) : l'autre lecture afficherait trois zéros. Pour y passer, ajouter à `ouvertes` :
--     and a.date_prevue < (current_date + 1)::timestamptz
--
-- ── SECURITY INVOKER, ET C'EST IMPORTANT ──
--
-- La fonction s'exécute avec les droits de l'appelant : la RLS s'applique donc exactement comme sur
-- une lecture ordinaire. Une fonction `security definer` aurait montré à chacun le compte de tous,
-- en contournant silencieusement les politiques de la table.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function compter_cartes_du_jour()
returns table (
  appels                 integer,
  mails                  integer,
  livrables              integer,
  perimetre_a_detecter   integer,
  mandat_a_recuperer     integer,
  recommandation_a_creer integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with ouvertes as (
    select a.opportunite_id, ta.code as type_code
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    left join types_actions ta on ta.id = a.type_action_id
    where a.actif and sa.code not in ('TERMINEE', 'ANNULEE')
  ),
  -- Une opportunité éligible compte UNE fois, même si elle porte plusieurs tâches ouvertes.
  opportunites_en_attente as (
    select distinct o.id, so.code as statut
    from ouvertes ou
    join opportunites o on o.id = ou.opportunite_id and o.actif
    join statuts_opportunites so on so.id = o.statut_id
    where so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
  )
  select
    (select count(*) from ouvertes where type_code = 'APPELER')::integer,
    (select count(*) from ouvertes where type_code = 'ENVOYER_EMAIL')::integer,
    (select count(*) from ouvertes where type_code = 'LIVRABLE')::integer,
    (select count(*) from opportunites_en_attente
      where statut in ('NOUVELLE', 'EN_QUALIFICATION'))::integer,
    (select count(*) from opportunites_en_attente where statut = 'COUVERTURE_MANDAT')::integer,
    (select count(*) from opportunites_en_attente where statut = 'PRETE_A_CONVERTIR')::integer;
$$;

comment on function compter_cartes_du_jour is
  'Les six nombres de la première ligne du tableau de bord : tâches ouvertes par type (Appel, Mail, Livrable) et opportunités à suivre par statut. Un seul appel — les compteurs se rafraîchissent en temps réel.';

grant execute on function compter_cartes_du_jour() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select * from compter_cartes_du_jour();
--   -- au 10/09/2026 : 104 appels, 112 mails, 0 livrable, 15 périmètres, 0 mandat, 0 recommandation
-- ════════════════════════════════════════════════════════════════════════════════════════════════
