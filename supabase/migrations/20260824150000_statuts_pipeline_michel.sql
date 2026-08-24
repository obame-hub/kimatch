-- Les statuts des trois objets actifs, tels que Michel les fixe.
--
-- SOURCE : sa présentation « Kimatch — du premier contact au contrat d'énergie » du 24/08/2026,
-- diapositive 13 « Des statuts simples rendent le flux lisible », précisée par les diapositives 9
-- (signal), 10 (opportunité) et 11 (recommandation). Et sa raison, pendant l'appel : « je me perds
-- sur les statuts des objets qu'on a ».
--
--   SIGNAL          Nouveau → À qualifier → Converti → Écarté
--   OPPORTUNITÉ     Nouvelle → En qualification → Couverture mandat → Prête à convertir
--                   → Convertie → Abandonnée
--   RECOMMANDATION  Brouillon → Consultation → Offres reçues → À présenter → Présentée
--                   → Acceptée / Refusée / Abandonnée
--
-- SA RÈGLE, qui explique la forme du référentiel : « le statut évolue, il ne régresse jamais ». Les
-- `ordre` sont donc strictement croissants et sans doublon — ce qui n'était pas le cas
-- d'`etapes_recommandation`, où quatre valeurs d'ordre étaient partagées par deux lignes.
--
-- ON RENOMME EN PLACE, ON NE DOUBLE PAS. Les trois colonnes de statut sont des clés étrangères :
-- créer de nouvelles lignes en laissant les anciennes laisserait 864 signaux et 1 707
-- recommandations pointer vers des statuts hors pipeline, et remplirait les listes de choix de
-- doublons. C'est la méthode d'hier pour les opportunités, et elle donne ici des codes propres :
-- chaque ligne existante est réaffectée plutôt que dupliquée avec un suffixe.
--
-- RIEN N'EST DEVINÉ. Les deux reclassements qui demandaient un choix se lisent dans les données :
--   · les 1 573 recommandations « Clôture » portent leur issue dans `finalite_cloture` — 867
--     ACCEPTEE, 320 REFUSEE, 386 EXPIREE (vérifié) ;
--   · les 625 signaux « Clôturé » se partagent entre 542 liés à une recommandation et 83 sans
--     (vérifié) : les premiers ont abouti, les seconds ont été écartés.

begin;

-- ══ 1. SIGNAL ═══════════════════════════════════════════════════════════════

-- « Reporté » n'a aucun signal et n'existe pas chez Michel : sa ligne devient « Converti », ce qui
-- évite d'en créer une et d'en supprimer une autre.
update public.statuts_signaux set code = 'CONVERTI', libelle = 'Converti', ordre = 30 where code = 'REPORTE';
insert into public.statuts_signaux (code, libelle, ordre) values ('CONVERTI', 'Converti', 30)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre;

-- LA RÉPARTITION AVANT LE RENOMMAGE. Les 542 signaux clôturés qui ont produit une recommandation
-- deviennent « Converti » ; après le renommage de « Clôturé », les deux groupes pointeraient vers la
-- même ligne et on ne saurait plus les distinguer.
update public.signaux g
set statut_id = (select id from public.statuts_signaux where code = 'CONVERTI')
where g.recommandation_id is not null
  and g.statut_id = (select id from public.statuts_signaux where code = 'CLOTURE');

-- Ce qui reste de « Clôturé » n'a rien produit : c'est « Écarté ».
update public.statuts_signaux set code = 'ECARTE', libelle = 'Écarté', ordre = 40 where code = 'CLOTURE';

-- « À contacter » et « Contacté » disent la même chose dans le nouveau vocabulaire — le signal est
-- pris en main, il reste à qualifier. La première sert de cible, la seconde y est ramenée.
update public.statuts_signaux set code = 'A_QUALIFIER', libelle = 'À qualifier', ordre = 20 where code = 'A_CONTACTER';
update public.signaux
set statut_id = (select id from public.statuts_signaux where code = 'A_QUALIFIER')
where statut_id in (select id from public.statuts_signaux where code in ('CONTACTE', 'INTERET_CONFIRME'));

-- Le « Refusé » historique est un signal écarté.
update public.signaux
set statut_id = (select id from public.statuts_signaux where code = 'ECARTE')
where statut_id in (select id from public.statuts_signaux where code in ('REFUSE', 'TRANSFORME'));

update public.statuts_signaux set libelle = 'Nouveau', ordre = 10 where code = 'NOUVEAU';

insert into public.statuts_signaux (code, libelle, ordre) values
  ('NOUVEAU', 'Nouveau', 10),
  ('A_QUALIFIER', 'À qualifier', 20),
  ('CONVERTI', 'Converti', 30),
  ('ECARTE', 'Écarté', 40)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre;

delete from public.statuts_signaux s
where s.code not in ('NOUVEAU', 'A_QUALIFIER', 'CONVERTI', 'ECARTE')
  and not exists (select 1 from public.signaux g where g.statut_id = s.id);

-- ══ 2. OPPORTUNITÉ ══════════════════════════════════════════════════════════
--
-- Deux paliers changent de nom par rapport à hier, et un s'ajoute. « À compléter » devient
-- « Couverture mandat » — diapositive 10 : « vérifier chaque site du périmètre » — et « À valider »
-- devient « Prête à convertir » — « données et conditions réunies ». « Abandonnée » manquait.
update public.statuts_opportunites set code = 'EN_QUALIFICATION', libelle = 'En qualification', ordre = 20 where code = 'A_QUALIFIER';
update public.statuts_opportunites set code = 'COUVERTURE_MANDAT', libelle = 'Couverture mandat', ordre = 30 where code = 'A_COMPLETER';
update public.statuts_opportunites set code = 'PRETE_A_CONVERTIR', libelle = 'Prête à convertir', ordre = 40 where code = 'A_VALIDER';

insert into public.statuts_opportunites (code, libelle, ordre, est_cloture) values
  ('NOUVELLE', 'Nouvelle', 10, false),
  ('EN_QUALIFICATION', 'En qualification', 20, false),
  ('COUVERTURE_MANDAT', 'Couverture mandat', 30, false),
  ('PRETE_A_CONVERTIR', 'Prête à convertir', 40, false),
  ('CONVERTIE', 'Convertie', 50, true),
  ('ABANDONNEE', 'Abandonnée', 60, true)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre, est_cloture = excluded.est_cloture;

delete from public.statuts_opportunites s
where s.code not in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR', 'CONVERTIE', 'ABANDONNEE')
  and not exists (select 1 from public.opportunites o where o.statut_id = s.id);

-- ══ 3. RECOMMANDATION ═══════════════════════════════════════════════════════
--
-- Le référentiel portait treize lignes pour quatre réellement utilisées, dont neuf jamais servies —
-- et quatre valeurs d'`ordre` en double. Les lignes inutilisées portent déjà les bons libellés
-- (« Acceptée », « Refusée », « Présentée au client ») : elles servent donc de cibles, ce qui évite
-- des codes suffixés.
update public.etapes_recommandation set libelle = 'Acceptée', ordre = 70 where code = 'ACCEPTEE';
update public.etapes_recommandation set libelle = 'Refusée', ordre = 80 where code = 'REFUSEE';
update public.etapes_recommandation set code = 'ABANDONNEE', libelle = 'Abandonnée', ordre = 90 where code = 'CLOTUREE';
update public.etapes_recommandation set libelle = 'Présentée', ordre = 50 where code = 'PRESENTEE';
update public.etapes_recommandation set code = 'OFFRES_RECUES', libelle = 'Offres reçues', ordre = 30 where code = 'EN_ANALYSE';
update public.etapes_recommandation set code = 'A_PRESENTER', libelle = 'À présenter', ordre = 40 where code = 'PRETE';

insert into public.etapes_recommandation (code, libelle, ordre) values
  ('OFFRES_RECUES', 'Offres reçues', 30),
  ('A_PRESENTER', 'À présenter', 40),
  ('PRESENTEE', 'Présentée', 50),
  ('ACCEPTEE', 'Acceptée', 70),
  ('REFUSEE', 'Refusée', 80),
  ('ABANDONNEE', 'Abandonnée', 90)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre;

-- LA RÉPARTITION DES 1 573 CLÔTURÉES, d'après leur finalité et avant tout renommage.
update public.recommandations r
set etape_id = (select id from public.etapes_recommandation where code = 'ACCEPTEE')
where r.finalite_cloture = 'ACCEPTEE'
  and r.etape_id = (select id from public.etapes_recommandation where code = 'CLOTURE');

update public.recommandations r
set etape_id = (select id from public.etapes_recommandation where code = 'REFUSEE')
where r.finalite_cloture = 'REFUSEE'
  and r.etape_id = (select id from public.etapes_recommandation where code = 'CLOTURE');

-- « Expirée » est un abandon : l'offre n'a pas été suivie d'une décision. C'est le troisième terme
-- de la diapositive 11, « accepter, refuser ou abandonner ».
update public.recommandations r
set etape_id = (select id from public.etapes_recommandation where code = 'ABANDONNEE')
where r.etape_id = (select id from public.etapes_recommandation where code = 'CLOTURE');

-- Puis les paliers vivants. « Diagnostic » est le brouillon : le périmètre est repris, rien n'est
-- encore demandé aux fournisseurs. « Décision » devient « Présentée » : l'offre est chez le client,
-- la décision se joue — et les six recommandations qui y sont rejoignent cette ligne.
update public.etapes_recommandation set code = 'BROUILLON', libelle = 'Brouillon', ordre = 10 where code = 'DIAGNOSTIC';
update public.etapes_recommandation set libelle = 'Consultation', ordre = 20 where code = 'CONSULTATION';

update public.recommandations
set etape_id = (select id from public.etapes_recommandation where code = 'PRESENTEE')
where etape_id in (select id from public.etapes_recommandation where code in ('DECISION', 'ACTUALISATION'));

update public.recommandations
set etape_id = (select id from public.etapes_recommandation where code = 'BROUILLON')
where etape_id in (select id from public.etapes_recommandation where code in ('A_PREPARER', 'EN_PREPARATION'));

delete from public.etapes_recommandation e
where e.code not in ('BROUILLON', 'CONSULTATION', 'OFFRES_RECUES', 'A_PRESENTER', 'PRESENTEE',
                     'ACCEPTEE', 'REFUSEE', 'ABANDONNEE')
  and not exists (select 1 from public.recommandations r where r.etape_id = e.id);

commit;
