-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PATRIMOINE EN QUATRE BLOCS : v_patrimoine_synthese
--
-- Page 2 du dossier UX du 26/08/2026, règle n° 2, mot pour mot : « Afficher uniquement le nombre de
-- comptes client/prospect et par segment, le nombre de compteurs avec échéance vide ou dépassée, le
-- nombre de compteurs sans responsable, et les compteurs à échéance valide répartis par période. »
--
-- LE MOT « UNIQUEMENT » EST LA CONSIGNE PRINCIPALE. La version que j'avais livrée le matin même —
-- score sur 100, quatre dimensions pondérées, tableau des 2 635 comptes — est remplacée par du
-- comptage. Et l'appel enregistré confirme le revirement : « on ne va pas le compter, on ne va pas le
-- compter ». Ce qu'il veut mesurer, il l'a dit juste après : « le plus important, c'est de savoir le
-- nombre de compteurs qui ont des dates d'échéance vides ou fausses, c'est-à-dire dépassées ».
--
-- UNE VUE D'UNE SEULE LIGNE, et c'est délibéré : la page affiche des totaux, pas une liste. Un seul
-- aller-retour rapporte les treize nombres, là où treize `count` séparés en auraient fait treize.
--
-- ══ CE QUE LA BASE NE SAIT PAS DIRE, ET QUE JE N'INVENTE PAS ══
--
-- « CLIENT / PROSPECT » N'EXISTE PAS. Mesuré le 26/08 : les 2 698 comptes consommateurs portent tous
-- `type_compte = 'client'`, il n'y a pas une seule ligne « prospect ». La distinction qu'il demande
-- n'est donc pas une donnée qu'on aurait oublié d'afficher, c'est une donnée qui n'a jamais été
-- saisie. La vue rend donc les deux mesures qui EXISTENT et qui s'en approchent le plus :
--
--   `nb_avec_contrat` — 511 comptes ont au moins un contrat actif. C'est la définition la plus
--   défendable d'un client : quelqu'un chez qui Kiwee a placé de la fourniture.
--   `nb_sans_contrat`  — les autres. Ce sont des comptes en portefeuille, pas nécessairement des
--   prospects au sens commercial ; l'écran le dit plutôt que de les étiqueter.
--
-- Le jour où un champ « prospect » sera saisi, il remplacera ces deux colonnes. En attendant, deux
-- nombres vrais valent mieux qu'un libellé faux.
--
-- ══ LES BORNES DE PÉRIODE ══
--
-- 0-3, 4-6, 7-12, plus de 12 mois — les intervalles de sa maquette. Ils se calculent sur la date
-- RETENUE de `v_compteurs_liste` (celle du contrat quand il y en a un, la déclarée sinon), et non sur
-- la seule date déclarée : c'est la date sur laquelle le commercial va agir.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_patrimoine_synthese;

create view public.v_patrimoine_synthese
with (security_invoker = true) as
with comptes_consommateurs as (
  select c.id, c.segment
  from public.comptes c
  join public.types_comptes tc on tc.id = c.type_compte_id
  where c.actif and tc.libelle = 'Consommateur'
),
avec_contrat as (
  select distinct ct.compte_id
  from public.contrats ct
  where ct.actif and ct.compte_id is not null
)
select
  -- ── Bloc 1 : les comptes ──
  (select count(*) from comptes_consommateurs)                                        as nb_comptes,
  (select count(*) from comptes_consommateurs cc
     where exists (select 1 from avec_contrat a where a.compte_id = cc.id))            as nb_avec_contrat,
  (select count(*) from comptes_consommateurs cc
     where not exists (select 1 from avec_contrat a where a.compte_id = cc.id))        as nb_sans_contrat,

  -- ── Bloc 2 : la donnée d'échéance à corriger ──
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance = 'ABSENTE')                                      as nb_echeance_vide,
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE' and date_echeance < current_date)    as nb_echeance_depassee,

  -- ── Bloc 3 : les compteurs orphelins de responsable ──
  (select count(*) from public.compteurs where actif and responsable_contact_id is null)
                                                                                       as nb_sans_responsable,
  (select count(*) from public.compteurs where actif)                                  as nb_compteurs,

  -- ── Bloc 4 : les échéances valides, par période ──
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE' and date_echeance >= current_date)   as nb_echeance_valide,
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE'
       and date_echeance >= current_date
       and date_echeance < current_date + interval '3 months')                         as nb_0_3_mois,
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE'
       and date_echeance >= current_date + interval '3 months'
       and date_echeance < current_date + interval '6 months')                         as nb_4_6_mois,
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE'
       and date_echeance >= current_date + interval '6 months'
       and date_echeance < current_date + interval '12 months')                        as nb_7_12_mois,
  (select count(*) from public.v_compteurs_liste
     where actif and nature_echeance <> 'ABSENTE'
       and date_echeance >= current_date + interval '12 months')                       as nb_plus_12_mois;

comment on view public.v_patrimoine_synthese is
  'Les quatre blocs de la page Patrimoine : comptes, échéances à corriger, compteurs sans responsable, échéances valides par période. Règle n° 2 du dossier UX du 26/08/2026. « Client / prospect » est rendu par « avec contrat / sans contrat » — le champ prospect n''existe pas en base.';

grant select on public.v_patrimoine_synthese to authenticated, anon, service_role;

commit;
