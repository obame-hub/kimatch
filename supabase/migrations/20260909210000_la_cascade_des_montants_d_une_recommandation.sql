-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA CASCADE DES MONTANTS D'UNE RECOMMANDATION
--
-- William, 09/09/2026, en refondant les champs de montant : « à mes yeux ils ne sont pas assez
-- précis ou clairs ». Six montants au lieu de quatre, et chacun répond à une question distincte.
--
--   MONTANT BRUT   ce que Kiwee (ou son intermédiaire) facture au fournisseur
--   CIP            ce que l'intermédiaire pricing prélève au passage
--   CHIFFRE D'AFF. ce qui entre réellement dans les caisses de Kiwee
--   CAA            ce qu'on reverse à l'apporteur d'affaires
--   MONTANT NET    ce qui reste après l'apporteur
--   MONTANT        la référence des commissions commerciales et des objectifs
--
-- ── LA FORMULE EXISTAIT DÉJÀ, POUR UN CHAMP QU'ON SUPPRIME ──
--
-- `v_montant_recommandation` (migration 20260903160000) calculait « Montant de l'affaire » ainsi :
-- `Σ par compteur (conso ÷ 12 × mois × marge €/MWh × taux)`. C'est exactement le montant brut de
-- William. Le champ disparaît, la formule reste — et la vue est remplacée par celle-ci, qui va
-- jusqu'au bout de la chaîne.
--
-- ── POURQUOI LE CALCUL EST FAIT LIGNE PAR LIGNE, PUIS AGRÉGÉ ──
--
-- Une offre peut mêler des compteurs à marge VARIABLE (€/MWh) et à marge FIXE (un montant en
-- euros). William, 09/09/2026 : « dans le cas où c'est une marge fixe, alors marge brute / chiffre
-- d'affaires / montant net et montant sont égaux à cette marge fixe ». Une marge fixe traverse donc
-- la cascade SANS être entamée : ni volume, ni durée, ni taux de répartition, ni commission
-- d'intermédiaire.
--
-- Appliquer cette règle au niveau de la recommandation obligerait à choisir entre les deux
-- traitements pour une offre mixte. Au niveau de la LIGNE, chaque compteur suit sa nature et la
-- somme est juste dans tous les cas.
--
-- ── LA COMMISSION D'APPORTEUR NE SE DÉDUIT QU'UNE FOIS ──
--
-- Elle est portée par la recommandation, pas par le compteur : c'est un montant négocié pour
-- l'affaire entière. Elle se soustrait donc APRÈS la somme des lignes, jamais dedans.
--
-- Et jamais sur une affaire à marge fixe — William : « il n'y a jamais d'apporteur d'affaires dans
-- ce cas ». La règle n'est pas codée en dur pour autant : si une telle affaire portait malgré tout
-- une commission d'apporteur, elle serait déduite. Interdire ici ce que la saisie autorise
-- produirait un montant que personne ne saurait rapprocher de la fiche.
--
-- ── QUI PRÉLÈVE, ET COMBIEN ──
--
-- Le fournisseur de l'offre retenue dit par quel intermédiaire on passe
-- (`comptes.intermediaire_partenaire_id`), et l'intermédiaire porte ses deux taux. Aucun
-- intermédiaire = Kiwee facture en direct : la CIP vaut zéro et le chiffre d'affaires égale le
-- montant brut. C'est le cas de tous les fournisseurs au 09/09/2026, le rattachement restant à
-- saisir fiche par fiche.
--
-- LES DEUX TAUX NE SONT PAS INTERCHANGEABLES. `taux_commissionnement` dit ce qui est réellement
-- prélevé ; `taux_commerciaux` sert au « Montant », la base de commissionnement des commerciaux, et
-- vaut 15 % là où le premier vaut 25 %. Le même euro facturé produit donc deux chiffres différents,
-- et c'est voulu.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists v_montant_recommandation;

create or replace view v_montants_recommandation as
with derniere_version as (
  select distinct on (v.recommandation_id)
    v.recommandation_id,
    v.id as version_id
  from versions_recommandation v
  order by v.recommandation_id, v.version_actuelle desc nulls last, v.numero_version desc nulls last
),
lignes as (
  select
    dv.recommandation_id,
    o.id                                   as offre_id,
    f.nom                                  as fournisseur_nom,
    inter.nom                              as intermediaire_nom,
    coalesce(f.taux_repartition, 0.5)      as taux_repartition,
    -- Sans intermédiaire, rien n'est prélevé : Kiwee facture en direct.
    coalesce(inter.taux_commissionnement, 0) as taux_commissionnement,
    coalesce(inter.taux_commerciaux, 0)      as taux_commerciaux,
    o.duree_mois,
    ofc.consommation_annuelle_reference_mwh as conso,
    ofc.type_marge,
    ofc.marge_fixe_eur,
    ofc.marge_reelle_eur_mwh                as marge_eur_mwh
  from derniere_version dv
  join versions_recommandation_compteurs vrc on vrc.version_recommandation_id = dv.version_id
  join offres_fournisseurs_compteurs ofc on ofc.version_recommandation_compteur_id = vrc.id
  join offres_fournisseurs o on o.id = ofc.offre_fournisseur_id
  left join comptes f on f.id = o.compte_fournisseur_id
  left join comptes inter on inter.id = f.intermediaire_partenaire_id
  where o.est_offre_recommandee and o.actif and ofc.actif and coalesce(vrc.actif, true)
),
calculees as (
  select
    l.*,
    -- Le brut de la ligne : la marge fixe telle quelle, ou le produit volume × durée × marge × taux.
    case
      when l.type_marge = 'FIXE' then l.marge_fixe_eur
      when l.conso is not null and l.marge_eur_mwh is not null and l.duree_mois is not null
        then l.conso / 12.0 * l.duree_mois::numeric * l.marge_eur_mwh * l.taux_repartition
      else null
    end as brut_ligne,
    -- Une marge fixe ne se partage pas : elle traverse la cascade intacte.
    case when l.type_marge = 'FIXE' then 0 else l.taux_commissionnement end as taux_cip_ligne,
    case when l.type_marge = 'FIXE' then 0 else l.taux_commerciaux end as taux_com_ligne
  from lignes l
)
select
  r.id as recommandation_id,
  count(c.offre_id)                                    as nb_compteurs,
  max(c.fournisseur_nom)                               as fournisseur_nom,
  max(c.intermediaire_nom)                             as intermediaire_nom,
  max(c.taux_repartition)                              as taux_repartition,
  max(c.taux_cip_ligne)                                as taux_commissionnement,
  max(c.taux_com_ligne)                                as taux_commerciaux,
  max(c.duree_mois)                                    as duree_mois,
  sum(c.conso)                                         as conso_totale_mwh,
  max(c.marge_eur_mwh)                                 as marge_eur_mwh,
  bool_or(c.type_marge = 'FIXE')                       as a_une_marge_fixe,

  -- ── La cascade ──
  round(sum(c.brut_ligne), 2)                                            as montant_brut,
  round(sum(c.brut_ligne * c.taux_cip_ligne), 2)                         as commission_intermediaire,
  round(sum(c.brut_ligne * (1 - c.taux_cip_ligne)), 2)                   as chiffre_affaires,
  coalesce(r.marge_apporteur, 0)                                         as commission_apporteur,
  round(sum(c.brut_ligne * (1 - c.taux_cip_ligne)) - coalesce(r.marge_apporteur, 0), 2) as montant_net,
  round(sum(c.brut_ligne * (1 - c.taux_com_ligne)) - coalesce(r.marge_apporteur, 0), 2) as montant_reference,

  -- ── Ce qui manque, nommé, pour que l'écran puisse le dire ──
  count(*) filter (where c.conso is null and c.type_marge <> 'FIXE')          as sans_conso,
  count(*) filter (where c.marge_eur_mwh is null and c.type_marge <> 'FIXE')  as sans_marge,
  count(*) filter (where c.duree_mois is null and c.type_marge <> 'FIXE')     as sans_duree,
  count(*) filter (where c.brut_ligne is null)                                as lignes_incalculables
from recommandations r
left join calculees c on c.recommandation_id = r.id
group by r.id, r.marge_apporteur;

comment on view v_montants_recommandation is
  'La cascade des montants d''une recommandation, depuis l''offre retenue de sa version courante. Une seule implémentation de la formule — la fiche, la liste et le tableau de bord la lisent tous ici.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les recommandations réellement calculables, et leur cascade.
--   select recommandation_id, nb_compteurs, montant_brut, commission_intermediaire,
--          chiffre_affaires, commission_apporteur, montant_net, montant_reference
--   from v_montants_recommandation where montant_brut is not null;
--
--   -- La cohérence de la cascade : CA = brut − CIP, net = CA − CAA.
--   select count(*) as incoherences from v_montants_recommandation
--   where montant_brut is not null
--     and (round(chiffre_affaires + commission_intermediaire, 2) <> montant_brut
--          or round(montant_net + commission_apporteur, 2) <> chiffre_affaires);
-- ════════════════════════════════════════════════════════════════════════════════════════════════
