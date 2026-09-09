-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TROIS TAUX D'UNE AFFAIRE, ET QUI ENCAISSE ENTRE KIWEE ET LE FOURNISSEUR
--
-- William, 09/09/2026, en refondant les montants de la recommandation. La chaîne qu'il décrit :
--
--   Montant brut  = Σ par compteur (conso annuelle × marge €/MWh × TAUX RÉPARTITION ÷ 12 × mois)
--   CIP           = Montant brut × TAUX COMMISSIONNEMENT
--   Chiffre d'aff.= Montant brut − CIP
--   CAA           = commission de l'apporteur, montant fixe saisi au cas par cas
--   Montant net   = Chiffre d'affaires − CAA
--   Montant       = Montant brut × (1 − TAUX COMMERCIAUX) − CAA        ← référence des commissions
--
-- Trois taux, donc, et ils ne vivent pas au même endroit parce qu'ils ne disent pas la même chose.
--
-- ── LE TAUX DE RÉPARTITION EXISTAIT DÉJÀ, SOUS UN NOM QUI NE LE DISAIT PAS ──
--
-- `comptes.taux_marge_kiwee` vaut 0,5000 sur les 2 768 comptes actifs — exactement les 50 % de la
-- formule. Il a été créé le 03/09/2026 pour « Montant de l'affaire », un champ que William
-- supprime aujourd'hui, mais le taux, lui, reste : c'est la part de la marge qui revient à Kiwee.
--
-- ON LE RENOMME PLUTÔT QUE D'EN CRÉER UN AUTRE. « Taux marge Kiwee » et « Taux répartition »
-- désigneraient la même chose sur la même table, et la seconde colonne serait celle qu'on oublie
-- de remplir. Le renommage garde les 2 768 valeurs et la contrainte qui les borne.
--
-- ── LES DEUX AUTRES SONT NEUFS, ET PORTÉS PAR LE PARTENAIRE ──
--
-- L'intermédiaire pricing prélève sa commission sur ce qu'il facture au fournisseur : le taux lui
-- appartient, pas à Kiwee, et il diffère d'un partenaire à l'autre. `taux_commissionnement` est
-- celui qui sert au chiffre d'affaires réel ; `taux_commerciaux` sert au « Montant », la référence
-- des commissions commerciales, et il est délibérément différent — 15 % contre 25 %.
--
-- ILS SONT NULS PAR DÉFAUT, ET C'EST VOULU : un compte qui n'est pas un intermédiaire n'a pas de
-- taux de commissionnement, et zéro dirait « il prélève 0 % », ce qui n'est pas la même chose.
--
-- ── QUI EST L'INTERMÉDIAIRE SUR UNE AFFAIRE : LE FOURNISSEUR LE SAIT ──
--
-- William : « cela dépend de l'offre retenue. Si c'est une offre faite par un de nos partenaires en
-- direct (Kiwee), alors pas de partenaires. Par contre il existe des fournisseurs propres à
-- l'intermédiaire OBD et à l'intermédiaire Energix. »
--
-- Le rattachement vit donc sur le FOURNISSEUR : chacun des 52 sait s'il passe par un intermédiaire,
-- et lequel. Nul = Kiwee facture en direct, donc pas de CIP et le chiffre d'affaires égale le
-- montant brut. Le mettre sur la recommandation aurait obligé à le ressaisir à chaque affaire, et
-- à le corriger 300 fois le jour où un fournisseur change de camp.
--
-- LA COLONNE PART VIDE. Personne ici ne sait quels fournisseurs appartiennent à OBD ou à Energix :
-- c'est une connaissance métier, elle se renseigne depuis les fiches fournisseur.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Le taux de répartition reprend son vrai nom ──
alter table comptes rename column taux_marge_kiwee to taux_repartition;
alter table comptes rename constraint comptes_taux_marge_kiwee_check to comptes_taux_repartition_check;

comment on column comptes.taux_repartition is
  'Part de la marge €/MWh qui revient à Kiwee, de 0 à 1. Portée par le FOURNISSEUR, lue par v_montants_recommandation. 0,50 partout au 09/09/2026.';

-- ── 2. Les deux taux de l'intermédiaire pricing ──
alter table comptes
  add column if not exists taux_commissionnement numeric(5, 4),
  add column if not exists taux_commerciaux numeric(5, 4);

alter table comptes drop constraint if exists comptes_taux_commissionnement_check;
alter table comptes add constraint comptes_taux_commissionnement_check
  check (taux_commissionnement is null or (taux_commissionnement >= 0 and taux_commissionnement <= 1));

alter table comptes drop constraint if exists comptes_taux_commerciaux_check;
alter table comptes add constraint comptes_taux_commerciaux_check
  check (taux_commerciaux is null or (taux_commerciaux >= 0 and taux_commerciaux <= 1));

comment on column comptes.taux_commissionnement is
  'Ce que l''intermédiaire pricing prélève sur ce qu''il facture au fournisseur, de 0 à 1. Sert au chiffre d''affaires réel. Nul sur un compte qui n''est pas un intermédiaire.';
comment on column comptes.taux_commerciaux is
  'Taux servant au « Montant », la référence des commissions commerciales. Volontairement différent du taux de commissionnement.';

-- ── 3. Le fournisseur dit par quel intermédiaire il passe ──
alter table comptes
  add column if not exists intermediaire_partenaire_id uuid references comptes (id) on delete set null;

create index if not exists idx_comptes_intermediaire_partenaire
  on comptes (intermediaire_partenaire_id) where intermediaire_partenaire_id is not null;

comment on column comptes.intermediaire_partenaire_id is
  'Sur un compte FOURNISSEUR : l''intermédiaire pricing par lequel Kiwee passe pour ce fournisseur. Nul = facturation directe par Kiwee, donc pas de CIP.';

-- ── 4. Les taux de départ des intermédiaires connus ──
--
-- 25 % et 15 %, les valeurs que William donne pour l'instant. Elles ne sont posées QUE sur les
-- comptes de type « partenaire » : un fournisseur ou un client n'a pas de taux de commissionnement,
-- et lui en poser un ferait croire qu'il prélève quelque chose.
update comptes
set taux_commissionnement = 0.2500,
    taux_commerciaux = 0.1500,
    date_modification = now()
where actif and type_compte = 'partenaire'
  and taux_commissionnement is null and taux_commerciaux is null;

do $$
declare
  n_partenaires int;
  n_fournisseurs int;
begin
  select count(*) into n_partenaires from comptes where actif and type_compte = 'partenaire';
  select count(*) into n_fournisseurs from comptes where actif and type_compte = 'fournisseur';
  raise notice 'Taux posés sur % partenaire(s). % fournisseur(s) restent à rattacher à leur intermédiaire.',
    n_partenaires, n_fournisseurs;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les trois taux, par type de compte.
--   select type_compte, count(*),
--          count(*) filter (where taux_repartition is not null)      as repartition,
--          count(*) filter (where taux_commissionnement is not null) as commissionnement,
--          count(*) filter (where taux_commerciaux is not null)      as commerciaux
--   from comptes where actif group by 1;
--
--   -- Les fournisseurs et leur intermédiaire — vide au départ, à renseigner depuis les fiches.
--   select nom, intermediaire_partenaire_id from comptes
--   where actif and type_compte = 'fournisseur' order by nom;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
