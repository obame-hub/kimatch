-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONTACT PORTE PLUSIEURS RÔLES, ET LA BASE SAIT DÉJÀ LESQUELS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 13/09/2026 : « Voici les rôles : Décisionnaire, Signataire, Administratif, Conseil
-- Syndical. Ce sont des rôles, pas des fonctions donc c'est un champ différent. Un choix multiple
-- est possible par exemple : Décisionnaire et signataire. »
--
-- ══ POURQUOI UN TABLEAU ET PAS UNE TABLE DE LIAISON ══
--
-- Quatre valeurs fermées, décidées par le métier, lues à chaque affichage d'un contact. Une table
-- de liaison ajouterait une sixième lecture à la fiche compte, dont on vient justement de ramener
-- les requêtes de onze à cinq (11/09/2026). Un `text[]` contraint se lit avec le contact, s'indexe
-- en GIN, et la contrainte dit la liste aussi bien qu'une clé étrangère.
--
-- `contacts.role` (singulier) N'EST PAS TOUCHÉ : il reste la source des écrans actuels tant que le
-- code ne lit pas `roles`. Deux colonnes coexistent le temps d'une livraison, pas davantage.
--
-- ══ L'AMORÇAGE NE DEVINE PAS, IL CONSTATE ══
--
-- SIGNATAIRE se lit dans les faits, pas dans un libellé : 1 078 contacts figurent déjà comme
-- `contact_signataire_id` d'un mandat, d'un contrat ou d'une recommandation. À comparer aux 512
-- marqués `contact_principal` aujourd'hui, dont 351 seulement ont réellement signé — le marqueur
-- actuel manquait 727 signataires et en inventait 161.
--
-- CONSEIL_SYNDICAL vient du lien compteur (46 désignations réelles après le nettoyage de ce matin)
-- complété des fonctions qui le déclarent en toutes lettres (87 au total).
--
-- DÉCISIONNAIRE et ADMINISTRATIF n'ont pas de fait dur : ils se déduisent de la fonction par motif,
-- sur une fonction normalisée (casse et accents). 1 560 et 1 301 contacts. Le reste — 506 contacts
-- sans aucun rôle — est laissé vide EXPRÈS : c'est ce qui alimentera la bande « À qualifier » de
-- l'onglet Contacts, et un rôle inventé y serait pire qu'un rôle absent.
--
-- ══ CE QUE LA CONTRAINTE NE DIT PAS ══
--
-- On pourrait croire que CONSEIL_SYNDICAL et SIGNATAIRE s'excluent — « les membres CS ne peuvent en
-- aucun cas contractualiser ». SIX CONTACTS DISENT LE CONTRAIRE, et trois d'entre eux ont raison :
-- quand la copropriété est son propre syndic (segment « Syndic non professionnel », comme
-- « SYNDIC BENEVOLE - 10 RUE DU ROZIER »), LE CONSEIL SYNDICAL EST LE CONTRACTANT. L'exclusivité
-- est donc une alerte d'écran, pas une contrainte de base : la poser ici effacerait trois
-- signatures légitimes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table contacts
  add column if not exists roles text[] not null default '{}';

alter table contacts
  drop constraint if exists contacts_roles_valides;

alter table contacts
  add constraint contacts_roles_valides check (
    roles <@ array['DECISIONNAIRE', 'SIGNATAIRE', 'ADMINISTRATIF', 'CONSEIL_SYNDICAL']::text[]
  );

create index if not exists idx_contacts_roles on contacts using gin (roles);

comment on column contacts.roles is
  'Rôles d''un contact, choix multiple parmi DECISIONNAIRE, SIGNATAIRE, ADMINISTRATIF, '
  'CONSEIL_SYNDICAL. Distinct de `fonction`, qui est l''intitulé de poste en texte libre. '
  'Un membre de conseil syndical ne signe pas, SAUF en syndic non professionnel où la '
  'copropriété est son propre syndic.';

-- ══ AMORÇAGE ══

with signataires as (
  select contact_signataire_id id from mandats          where contact_signataire_id is not null
  union select contact_signataire_id from contrats        where contact_signataire_id is not null
  union select contact_signataire_id from recommandations where contact_signataire_id is not null
),
conseils as (
  select contact_conseil_syndical_id id from compteurs where contact_conseil_syndical_id is not null
  union select id from contacts where fonction ~* '(^|[^a-z])cs([^a-z]|$)|conseil\s*syndic'
),
normalise as (
  select id,
         upper(translate(coalesce(fonction, ''),
                         'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ',
                         'AAAEEEEIIOOUUUCAAAEEEEIIOOUUUC')) as v
    from contacts
),
calcul as (
  select c.id,
         array_remove(array[
           case when n.v ~ 'GERANT|PRESIDENT|DIRECT|PDG|^DG$|DIRIGEANT|ASSOCIE|PROPRIETAIRE'
                then 'DECISIONNAIRE' end,
           case when c.id in (select id from signataires) then 'SIGNATAIRE' end,
           case when n.v ~ 'GESTIONNAIRE|COMPTA|ASSISTAN|SECRETAIRE|TECHNI|JURI|RESPONSABLE|CHARGE|ACHAT|ADMINISTRA|MAINTENANCE|EXPLOITATION|ENERG'
                then 'ADMINISTRATIF' end,
           case when c.id in (select id from conseils) then 'CONSEIL_SYNDICAL' end
         ], null) as roles
    from contacts c
    join normalise n on n.id = c.id
)
update contacts c
   set roles = calcul.roles
  from calcul
 where calcul.id = c.id
   and cardinality(calcul.roles) > 0;

do $$
declare avec int; sans int;
begin
  select count(*) filter (where cardinality(roles) > 0),
         count(*) filter (where cardinality(roles) = 0)
    into avec, sans
    from contacts;
  raise notice 'Rôles amorcés sur % contacts ; % restent à qualifier.', avec, sans;
end $$;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   select unnest(roles) role, count(*) from contacts group by 1 order by 2 desc;
--   -- appliqué le 13/09/2026 : DECISIONNAIRE 1560, ADMINISTRATIF 1301, SIGNATAIRE 1078,
--   --                          CONSEIL_SYNDICAL 87
--   select count(*) from contacts where cardinality(roles) = 0;  -- appliqué : 506
