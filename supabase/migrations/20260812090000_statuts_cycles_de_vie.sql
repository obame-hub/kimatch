-- ============================================================================================
-- Cycles de vie des mandats, recommandations, versions et contrats
-- Réunion du 12/08/2026 (William, Michel, Naoëlle) + les trois notes de cadrage de William.
--
-- La règle qui gouverne tout le fichier : un objet porte DEUX statuts distincts quand sa
-- progression et sa vie sont deux choses différentes. Le mandat et le contrat sont dans ce cas —
-- « il est bien signé, mais on voit ici qu'il a bien un statut actif » (William, à propos d'un
-- mandat signé le 22/07/2025 et valable jusqu'au 22/07/2028). Salesforce faisait déjà cette
-- distinction : Etape__c pour la progression, Statut pour la vie.
--
-- À RELIRE AVANT EXÉCUTION. Aucune ligne n'est supprimée : les valeurs qui disparaissent du
-- modèle cible sont désactivées, jamais effacées, pour que l'historique reste lisible.
-- ============================================================================================

begin;

-- ============================================================================================
-- 1. MANDATS — ajout d'Annulé et de Refusé
-- ============================================================================================
-- « en base de données, il faut récupérer le statut du Salesforce, à savoir Annulé, Refusé et
-- puis l'Expiré. J'ai expliqué à Nawel que l'Expiré, c'est calculé : il faut qu'il ait été signé
-- et que la date de fin soit dépassée. » (William)
--
-- « À préparer » est conservé tel quel (décision de Naoëlle — on ne le renomme pas en Brouillon).
-- « Actif » est conservé : c'est le statut vert affiché à côté du nom du mandat, atteint dès la
-- signature. Les 1068 mandats actifs sont tous signés et un seul a une date de fin dépassée : la
-- règle d'expiration est donc déjà respectée en base, il ne manque que son recalcul continu.

update public.statuts_mandats
   set code = 'ANNULE', libelle = 'Annulé', date_modification = now()
 where code = 'REVOQUE';

insert into public.statuts_mandats (code, libelle, ordre, couleur, icone, est_actif, est_cloture)
select 'REFUSE', 'Refusé', 65, '#c2452d', 'x-circle', false, true
 where not exists (select 1 from public.statuts_mandats where code = 'REFUSE');

-- Le seul mandat actif dont la validité a expiré. Cette requête est la forme exacte que prendra
-- le recalcul quotidien : elle doit rester rejouable sans effet de bord.
update public.mandats m
   set statut_id = (select id from public.statuts_mandats where code = 'EXPIRE'),
       date_modification = now()
 where m.date_signature is not null
   and m.date_fin_validite < current_date
   and m.statut_id = (select id from public.statuts_mandats where code = 'ACTIF');

-- ============================================================================================
-- 2. RECOMMANDATIONS — passage de 9 étapes à 4
-- ============================================================================================
-- Maquette « Fiche Recommandation » : Diagnostic → Consultation → Décision → Clôture, la clôture
-- prenant le libellé de sa finalité (Acceptée, Refusée, Expirée).
--
-- Le mapping Salesforce vient de la réunion, et il corrige la note de cadrage écrite :
-- « Consultation, ça correspondait à En instruction. Décision, c'était en gros négociation.
--  Négociation, contractualisation, tout ça, c'était décision. » — Contractualisation n'est donc
-- PAS une étape à part, contrairement à ce que disait la note. Elle est absorbée par Décision,
-- dont le sens est « on a envoyé l'offre et j'attends qu'il me dise ce qu'il en pense ».
--
-- Clôture = Expirée, et non « Abandonnée » comme l'annonçait la note (décision de Naoëlle,
-- confirmée par la maquette : finMap = {acceptee, refusee, expiree}).

insert into public.etapes_recommandation (code, libelle, ordre, actif)
select v.code, v.libelle, v.ordre, true
  from (values
    ('DIAGNOSTIC',   'Diagnostic',   10),
    ('CONSULTATION', 'Consultation', 20),
    ('DECISION',     'Décision',     30),
    ('CLOTURE',      'Clôture',      40)
  ) as v(code, libelle, ordre)
 where not exists (select 1 from public.etapes_recommandation e where e.code = v.code);

-- La finalité de clôture doit rester distinguable après le regroupement dans « Clôture ».
-- On la stocke sur la recommandation, comme le fait la maquette (state.finalite).
alter table public.recommandations
  add column if not exists finalite_cloture text
  check (finalite_cloture in ('ACCEPTEE', 'REFUSEE', 'EXPIREE'));

comment on column public.recommandations.finalite_cloture is
  'Sous-statut de l''étape Clôture : ACCEPTEE, REFUSEE ou EXPIREE. Nul tant que la recommandation n''est pas clôturée.';

-- L'ORDRE DES DEUX UPDATES QUI SUIVENT COMPTE. La finalité se lit dans l'étape actuelle, et
-- l'update suivant écrase cette étape : reporter d'abord perdrait définitivement l'information.
-- « Clôturée » portait les 373 opportunités Salesforce « Abandonée » : elles deviennent Expirée.
update public.recommandations r
   set finalite_cloture = m.finalite,
       date_cloture = coalesce(r.date_cloture, r.date_modification)
  from public.etapes_recommandation e,
       (values ('ACCEPTEE', 'ACCEPTEE'), ('REFUSEE', 'REFUSEE'), ('CLOTUREE', 'EXPIREE')) as m(ancien, finalite)
 where e.id = r.etape_id
   and e.code = m.ancien
   and r.finalite_cloture is null;

-- Report des recommandations existantes vers les 4 étapes cibles.
-- « À actualiser » ne portait que les 4 recommandations que la migration y avait mises par erreur :
-- son mapping était positionnel et envoyait « Contractualisation » vers « À actualiser ». Or
-- Contractualisation appartient à Décision (« Négociation, contractualisation, tout ça, c'était
-- décision »), donc ces 4 lignes atterrissent au bon endroit.
with cible as (
  select r.id,
         case
           when e.code in ('A_PREPARER', 'EN_ANALYSE', 'EN_PREPARATION') then 'DIAGNOSTIC'
           when e.code = 'PRETE'                                        then 'CONSULTATION'
           when e.code in ('PRESENTEE', 'ACTUALISATION')                then 'DECISION'
           when e.code in ('ACCEPTEE', 'REFUSEE', 'CLOTUREE')           then 'CLOTURE'
         end as code_cible
    from public.recommandations r
    join public.etapes_recommandation e on e.id = r.etape_id
)
update public.recommandations r
   set etape_id = (select id from public.etapes_recommandation where code = c.code_cible),
       date_modification = now()
  from cible c
 where c.id = r.id
   and c.code_cible is not null;

-- Désactivation des 9 anciennes étapes, une fois les recommandations reportées.
update public.etapes_recommandation
   set actif = false, date_modification = now()
 where code in ('A_PREPARER', 'EN_ANALYSE', 'EN_PREPARATION', 'PRETE',
                'PRESENTEE', 'ACTUALISATION', 'ACCEPTEE', 'REFUSEE', 'CLOTUREE');

-- ============================================================================================
-- 3. VERSIONS DE RECOMMANDATION — 9 statuts vers 6
-- ============================================================================================
-- « on a dit que c'était en construction, donc ça, c'est quand par exemple il y a quelqu'un qui
--  bosse dessus. Disponible, en gros, ça veut dire prêt, ça veut dire qu'elle est prête à être
--  envoyée. Et en décision, ça veut dire qu'on l'a envoyée, qu'elle est présentée au client. »
-- (William) — puis Acceptée, Refusée ou Expirée.

insert into public.statuts_versions_recommandation (code, libelle, ordre, actif)
select v.code, v.libelle, v.ordre, true
  from (values
    ('EN_CONSTRUCTION', 'En construction', 10),
    ('DISPONIBLE',      'Disponible',      20),
    ('EN_DECISION',     'En décision',     30)
  ) as v(code, libelle, ordre)
 where not exists (select 1 from public.statuts_versions_recommandation s where s.code = v.code);

-- Les trois statuts de clôture existent déjà, on aligne seulement leurs libellés sur la cible.
update public.statuts_versions_recommandation set libelle = 'Acceptée', ordre = 40, date_modification = now() where code = 'ACCEPTEE';
update public.statuts_versions_recommandation set libelle = 'Refusée',  ordre = 50, date_modification = now() where code = 'REFUSEE';
update public.statuts_versions_recommandation set libelle = 'Expirée',  ordre = 60, date_modification = now() where code = 'EXPIREE';

-- Report des versions existantes.
--
-- Deux corrections de la migration initiale sont appliquées ici :
--
--  a) `date_presentation_client` fait foi sur le statut texte. Elle porte la valeur du champ
--     Salesforce Date_offre_envoyee__c, c'est-à-dire la case « ✈️ Offre envoyée » de la cotation.
--     Or offre envoyée = présentée au client = « En décision ». 760 versions sur 2001 la portent.
--
--  b) La migration avait mappé « Abandonnée » (Salesforce) vers REFUSEE, alors que la règle dit
--     Expirée. C'est ce qui produit les 1245 versions « Refusée par le client » — un chiffre que
--     Michel a repéré en réunion (une recommandation « prête » dont toutes les versions étaient
--     refusées) et qui rend la statistique de refus client fausse. Comme aucun statut Salesforce
--     ne mène à un refus de version, toute version encore marquée REFUSEE est en réalité expirée.
with cible as (
  select v.id,
         case
           -- Acceptée : décision favorable réelle, on n'y touche pas.
           when s.code = 'ACCEPTEE' then 'ACCEPTEE'
           -- Refusée héritée de la migration : c'est une expiration, pas un refus.
           when s.code = 'REFUSEE'  then 'EXPIREE'
           when s.code = 'EXPIREE'  then 'EXPIREE'
           when s.code in ('REMPLACEE', 'ARCHIVEE') then 'EXPIREE'
           -- Envoyée au client : le fait qu'elle ait une date de présentation prime sur le statut.
           when v.date_presentation_client is not null then 'EN_DECISION'
           when s.code in ('VALIDEE', 'PRESENTEE') then 'DISPONIBLE'
           when s.code in ('BROUILLON', 'A_VALIDER') then 'EN_CONSTRUCTION'
         end as code_cible
    from public.versions_recommandation v
    join public.statuts_versions_recommandation s on s.id = v.statut_version_id
)
update public.versions_recommandation v
   set statut_version_id = (select id from public.statuts_versions_recommandation where code = c.code_cible),
       date_modification = now()
  from cible c
 where c.id = v.id
   and c.code_cible is not null;

update public.statuts_versions_recommandation
   set actif = false, date_modification = now()
 where code in ('BROUILLON', 'A_VALIDER', 'VALIDEE', 'PRESENTEE', 'REMPLACEE', 'ARCHIVEE');

-- ============================================================================================
-- 4. CONTRATS — deux cycles de vie séparés
-- ============================================================================================
-- Cycle 1, de la demande fournisseur à la signature : Brouillon → Demandé → Réceptionné →
-- Envoyé → Signé. Le passage par « Demandé » est optionnel : Erwan pourra éditer lui-même
-- certains contrats et aller directement de Brouillon à Réceptionné.
--
-- Cycle 2, la vie du contrat après validation par l'administrateur : À venir / En cours /
-- Expiré, recalculé en continu depuis les dates. Les 1598 contrats ont tous une date de début
-- ET une date de fin, le recalcul est donc fiable sur l'intégralité du parc.

create table if not exists public.statuts_contrats_avancement (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text,
  icone text,
  est_cloture boolean not null default false,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.statuts_contrats_avancement is
  'Cycle 1 du contrat : de la demande au fournisseur jusqu''à la signature electronique. Ne pas confondre avec contrats.statut_signature, colonne texte heritee et vide sur les 1598 lignes.';

insert into public.statuts_contrats_avancement (code, libelle, ordre, couleur, icone, est_cloture)
select v.code, v.libelle, v.ordre, v.couleur, v.icone, v.fin
  from (values
    ('BROUILLON',   'Brouillon',    10, '#83868f', 'file',        false),
    ('DEMANDE',     'Demandé',      20, '#b08f14', 'send',        false),
    ('RECEPTIONNE', 'Réceptionné',  30, '#3d95a5', 'inbox',       false),
    ('ENVOYE',      'Envoyé',       40, '#9d5b30', 'pen-line',    false),
    ('SIGNE',       'Signé',        50, '#0d7a5f', 'check-check', true)
  ) as v(code, libelle, ordre, couleur, icone, fin)
 where not exists (select 1 from public.statuts_contrats_avancement s where s.code = v.code);

create table if not exists public.statuts_contrats_vie (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text,
  icone text,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.statuts_contrats_vie is
  'Cycle 2 du contrat, recalculé en continu depuis date_debut et date_fin. Jamais saisi à la main.';

insert into public.statuts_contrats_vie (code, libelle, ordre, couleur, icone)
select v.code, v.libelle, v.ordre, v.couleur, v.icone
  from (values
    ('A_VENIR',  'À venir', 10, '#3d95a5', 'clock'),
    ('EN_COURS', 'En cours', 20, '#0d7a5f', 'play'),
    ('EXPIRE',   'Expiré',  30, '#83868f', 'minus')
  ) as v(code, libelle, ordre, couleur, icone)
 where not exists (select 1 from public.statuts_contrats_vie s where s.code = v.code);

alter table public.contrats
  add column if not exists statut_avancement_id uuid references public.statuts_contrats_avancement(id),
  add column if not exists statut_vie_id       uuid references public.statuts_contrats_vie(id),
  add column if not exists date_validation     timestamptz,
  add column if not exists valide_par_id       uuid references public.profils(id);

comment on column public.contrats.date_validation is
  'Validation manuelle par l''administrateur, qui fait basculer le contrat du cycle 1 au cycle 2.';

-- Report du statut unique actuel vers les deux nouveaux champs.
-- Les contrats déjà en cycle 2 court-circuitent la validation manuelle : leur cycle 1 est
-- forcé à « Signé », sinon ils réapparaîtraient dans la file d'attente de signature.
with cible as (
  select c.id,
         case
           when s.code in ('A_VENIR', 'ACTIF', 'TERMINE', 'SIGNE') then 'SIGNE'
           when s.code = 'A_SIGNER'                                then 'ENVOYE'
           when s.code = 'EN_PREPARATION'                          then 'DEMANDE'
           else 'BROUILLON'
         end as sig,
         case
           when s.code in ('A_VENIR', 'ACTIF', 'TERMINE') then
             case
               when c.date_debut > current_date then 'A_VENIR'
               when c.date_fin  <= current_date then 'EXPIRE'
               else 'EN_COURS'
             end
           else null
         end as vie
    from public.contrats c
    join public.statuts_contrats s on s.id = c.statut_id
)
update public.contrats c
   set statut_avancement_id = (select id from public.statuts_contrats_avancement where code = k.sig),
       statut_vie_id = case when k.vie is null then null
                            else (select id from public.statuts_contrats_vie where code = k.vie) end,
       -- La date de validation est inconnue pour les contrats migrés : la date de signature en
       -- tient lieu, faute de mieux, plutôt que de laisser un cycle 2 sans point de départ.
       date_validation = case when k.vie is null then null else coalesce(c.date_signature, c.date_debut) end,
       date_modification = now()
  from cible k
 where k.id = c.id;

-- ============================================================================================
-- 5. E-MAIL DE VALIDATION DES CONTRATS
-- ============================================================================================
-- « ajouter l'adresse de validation dans la table parametres_emails existante, comme
--  fonctionnalité configurable plutôt que codée en dur. » (note de cadrage, point 3)

insert into public.parametres_emails (module, actif, destinataires, sujet_template)
select 'validation_contrat', true, array['w.goupil@kiwee-energie.fr'],
       'Contrat signé à valider — {{compte}} ({{reference}})'
 where not exists (select 1 from public.parametres_emails where module = 'validation_contrat');

commit;

-- ============================================================================================
-- CE QUI RESTE HORS DE CE FICHIER, ET POURQUOI
-- ============================================================================================
--
-- 1. Le propriétaire des mandats, contrats et recommandations. Les colonnes existent mais sont
--    vides sur la totalité des lignes (1429/1429 mandats, 1597/1598 contrats, 1692/1693
--    recommandations) — pas seulement sur le mandat ADB Conseil repéré en réunion. Tant qu'elles
--    le sont, « le tableau de bord n'est censé montrer que les enregistrements qui nous
--    appartiennent » passe forcément par le propriétaire du compte rattaché, qui lui est renseigné
--    (2739/2759). Remplir ces colonnes est une décision métier : le créateur ou le propriétaire du
--    compte ? À trancher avec William avant tout backfill.
--
-- 2. Annulé et Refusé sur les mandats existants. Les statuts sont créés ici, mais aucune donnée
--    ne permet de savoir QUELS mandats sont annulés ou refusés : le champ Etape__c est vide sur
--    les 1364 mandats des exports Salesforce. Il faut une nouvelle extraction — d'où l'action
--    « William doit contacter Erwan pour vérifier la mise à jour des statuts des mandats ».
--
-- 3. Le recalcul continu de l'expiration (mandats) et du cycle 2 (contrats). Les requêtes de ce
--    fichier sont rejouables telles quelles ; il leur manque un déclencheur quotidien.
--
-- 4. Le suivi DocuSign (ouvert, consulté, signé) et la consultation d'une recommandation par le
--    client. Rien en base aujourd'hui, alors que c'est ce que William attend dans le fil. La
--    table `evenements_metier` est le bon réceptacle : sa structure convient déjà et 16 types y
--    sont définis, mais elle ne contient aucune ligne car personne ne l'écrit.
--
-- 5. Le centre de notifications. Aucune table. Les trois notes de cadrage le mentionnent comme
--    s'il existait ; aujourd'hui il n'y a que l'e-mail via parametres_emails.
