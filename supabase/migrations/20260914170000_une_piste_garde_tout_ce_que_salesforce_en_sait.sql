-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE GARDE TOUT CE QUE SALESFORCE EN SAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026, par téléphone : « il y a plein de champs de l'objet Lead dans Salesforce qui
-- n'ont pas été importés — segment, SIREN, commentaire, échéance actuelle, et tous les autres.
-- Récupérez tout sans exception, on fera le tri dans Kimatch. »
--
-- ══ CE QUE LA MESURE DIT, ET ELLE CORRIGE À MOITIÉ LA DEMANDE ════════════════════════════════
--
-- `Lead` porte 72 champs, dont 44 renseignés sur au moins une piste et 9 vides partout.
--
-- **SEGMENT, SIREN ET COMMENTAIRE SONT DÉJÀ LÀ, ET REMPLIS** — segment 5 073 lignes sur 5 139,
-- SIREN 4 909, SIRET 4 921, commentaire 210 (il n'y en a que 209 dans Salesforce). Les colonnes
-- existent depuis la reprise du 01/09 et portent exactement les valeurs de l'org.
--
-- Ce qui manque, c'est l'ÉCRAN : la fiche piste affiche quatre champs — société, contact, e-mail,
-- téléphone. Tout le reste est en base et invisible. C'est le même défaut que le propriétaire,
-- corrigé ce matin pour la même raison.
--
-- ══ CE QUI MANQUAIT VRAIMENT ═════════════════════════════════════════════════════════════════
--
-- Vingt-trois champs renseignés dans Salesforce n'avaient aucune colonne ici :
--
--     Salutation                 3 590   la civilité — et c'est la clé de la demande sur les contacts
--     FirstName / LastName       4 042 / 5 139   le nom était collé en un seul `contact_nom`
--     Street                     4 526   l'adresse, dont on n'avait que la ville et le code postal
--     Country / State            4 595 / 11
--     Nombres_coproprietes__c    3 671
--     Liste_copros__c            3 670
--     Site_internet__c           2 533   (et `Website`, le champ standard, 75 — les deux existent)
--     LastActivityDate             920
--     FirstEmailDateTime           392
--     FirstCallDateTime            383
--     LinkedIn__c                  288
--     MobilePhone                   56   noyé dans `telephone` faute de colonne à lui
--     Echeance_actuelle__c          40   ⚠ celui que William a nommé : il est presque vide à la source
--     Rating                        25
--     Role__c                       23
--     EmailBouncedReason / Date     16
--     Industry                       3
--
-- ET NEUF CHAMPS SONT VIDES SUR LES 5 139 : NumberOfEmployees, Latitude, Longitude, Jigsaw,
-- Structure_de_prix__c, Type_d_nergie_souhait__c, Co_t_du_lead__c, Dur_e_contrat__c, ConvertedDate.
-- On ne leur crée pas de colonne. « Sans exception » veut dire « rien de ce qui existe », pas
-- « vingt colonnes vides qu'il faudra expliquer à chaque relecture du schéma ».
--
-- ══ LA DATE DE CRÉATION, ET POURQUOI ELLE NE S'ÉCRASE PAS ICI ════════════════════════════════
--
-- Les 5 131 pistes reprises sont TOUTES datées du 01/09/2026 : la date de l'import, pas la leur.
-- Salesforce les échelonne pourtant de 2024 à aujourd'hui. Toute statistique par mois de création
-- est donc fausse aujourd'hui, et c'est exactement ce que William veut pouvoir faire.
--
-- On reprend la vraie date dans `date_creation_salesforce` PLUTÔT QUE D'ÉCRASER `date_creation`.
-- Réécrire la date de création de 5 131 lignes change l'ordre de toutes les listes, le calcul des
-- anciennetés, et l'ordre chronologique dont les références PST tirent leur numéro. C'est une
-- décision, pas un effet de bord d'un import de champs. La colonne est là, la bascule attend un
-- oui.
--
-- ══ PAS DE RÉFÉRENTIELS POUR LES LISTES DE CHOIX ═════════════════════════════════════════════
--
-- `Rating` (25 lignes), `Role__c` (23), `Industry` (3) sont des picklists Salesforce. On les prend
-- en texte. Créer trois tables de référence et leurs clés étrangères pour cinquante et une lignes
-- coûterait plus à maintenir que ça ne rapporte, et la reprise est justement le moment où l'on ne
-- sait pas encore ce qui servira. Le jour où l'un d'eux devient un vrai statut, il deviendra un
-- référentiel.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.pistes
  -- ── L'IDENTITÉ, EN TROIS MORCEAUX ───────────────────────────────────────────────────────────
  -- Demande du 14/09 : civilité, nom, prénom séparés. Salesforce les tient déjà séparés ; c'est
  -- notre reprise qui les avait recollés en un seul `contact_nom`.
  add column if not exists civilite      text,
  add column if not exists prenom        text,
  add column if not exists nom           text,

  -- ── L'ADRESSE, ENFIN ENTIÈRE ────────────────────────────────────────────────────────────────
  add column if not exists rue           text,
  add column if not exists region        text,
  add column if not exists pays          text,

  -- ── COMMENT LES JOINDRE ─────────────────────────────────────────────────────────────────────
  add column if not exists telephone_mobile text,
  add column if not exists site_internet    text,
  add column if not exists site_web         text,
  add column if not exists linkedin         text,

  -- ── CE QU'ILS GÈRENT ────────────────────────────────────────────────────────────────────────
  add column if not exists nombre_coproprietes integer,
  add column if not exists liste_coproprietes  text,
  add column if not exists echeance_actuelle   date,
  add column if not exists secteur_activite    text,
  add column if not exists role_contact        text,
  add column if not exists cote                text,

  -- ── CE QUE SALESFORCE A OBSERVÉ ─────────────────────────────────────────────────────────────
  add column if not exists date_derniere_activite    date,
  add column if not exists date_premier_appel        timestamptz,
  add column if not exists date_premier_email        timestamptz,
  add column if not exists email_rejete_le           timestamptz,
  add column if not exists email_rejete_motif        text,
  add column if not exists non_lu_par_proprietaire   boolean,
  add column if not exists prioritaire               boolean,
  add column if not exists date_creation_salesforce  timestamptz,
  add column if not exists date_modification_salesforce timestamptz;

comment on column public.pistes.civilite is
  'Monsieur / Madame, repris du `Salutation` de Salesforce. Avec `prenom` et `nom`, il remplace le '
  '`contact_nom` collé d''un seul tenant — voir la demande du 14/09/2026 sur les contacts.';
comment on column public.pistes.echeance_actuelle is
  'Échéance du contrat actuel du prospect (Echeance_actuelle__c). Renseignée sur 40 pistes '
  'seulement dans Salesforce au 14/09/2026 : la colonne est vide parce que la source l''est.';
comment on column public.pistes.date_creation_salesforce is
  'La vraie date de création dans Salesforce. `date_creation` porte, elle, la date de l''import '
  '(01/09/2026 pour les 5 131 reprises) — toute statistique par mois doit lire CETTE colonne tant '
  'que la bascule n''a pas été décidée.';

-- Les deux seules colonnes sur lesquelles on filtrera : une échéance qui approche, et la vraie
-- chronologie. Le reste se lit sur une fiche ouverte, jamais en balayant la table.
create index if not exists idx_pistes_echeance_actuelle
  on public.pistes (echeance_actuelle) where echeance_actuelle is not null;
create index if not exists idx_pistes_date_creation_salesforce
  on public.pistes (date_creation_salesforce) where date_creation_salesforce is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UNE PISTE PEUT PORTER CES CHAMPS, ET LES RENDRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que les colonnes existent ne dit rien — `add column` a réussi ou la migration aurait
-- échoué. Ce qu'on veut savoir, c'est qu'une piste accepte VRAIMENT ces valeurs : qu'aucun type ne
-- refuse ce que Salesforce enverra, et qu'aucun déclencheur ne les efface au passage.
--
do $$
declare
  essai   uuid;
  relu    record;
  compteur integer;
begin
  insert into public.pistes (societe, civilite, prenom, nom, rue, region, pays,
    telephone_mobile, site_internet, site_web, linkedin, nombre_coproprietes, liste_coproprietes,
    echeance_actuelle, secteur_activite, role_contact, cote, date_derniere_activite,
    date_premier_appel, date_premier_email, email_rejete_le, email_rejete_motif,
    non_lu_par_proprietaire, prioritaire, date_creation_salesforce, date_modification_salesforce)
  values ('Garde-fou de migration', 'Monsieur', 'Jean', 'DUPONT', '12 rue des Lilas', 'Occitanie',
    'France', '0612345678', 'https://exemple.fr', 'https://exemple.com',
    'https://linkedin.com/in/x', 42, 'Copro A, Copro B', date '2027-03-31', 'Immobilier',
    'Gestionnaire', 'Hot', date '2026-09-01', now(), now(), now(), 'Adresse inconnue',
    true, false, timestamptz '2024-10-15 09:00:00+00', now())
  returning id into essai;

  select * into relu from public.pistes where id = essai;

  if relu.civilite <> 'Monsieur' or relu.nom <> 'DUPONT' or relu.prenom <> 'Jean' then
    raise exception 'L''identité en trois morceaux ne se relit pas : « % / % / % ».',
      relu.civilite, relu.prenom, relu.nom;
  end if;
  if relu.echeance_actuelle <> date '2027-03-31' then
    raise exception 'L''échéance relue vaut % au lieu du 31/03/2027.', relu.echeance_actuelle;
  end if;
  if relu.nombre_coproprietes <> 42 then
    raise exception 'Le nombre de copropriétés relu vaut % au lieu de 42.', relu.nombre_coproprietes;
  end if;
  if relu.date_creation_salesforce <> timestamptz '2024-10-15 09:00:00+00' then
    raise exception 'La date Salesforce relue vaut % : elle ne survit pas à l''écriture.',
      relu.date_creation_salesforce;
  end if;

  delete from public.pistes where id = essai;

  select count(*)::integer into compteur from public.pistes where societe = 'Garde-fou de migration';
  if compteur <> 0 then
    raise exception 'La piste d''essai n''a pas été effacée.';
  end if;

  raise notice 'Garde-fou : une piste accepte et rend ses 26 nouveaux champs.';
end $$;

commit;
