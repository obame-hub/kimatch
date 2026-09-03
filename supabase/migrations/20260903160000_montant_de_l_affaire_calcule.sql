-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MONTANT DE L'AFFAIRE SE CALCULE, ET LE PARTAGE DE LA MARGE DEVIENT UN CHAMP
--
-- William, 03/09/2026 : « il faut que ce soit les 2 : il doit être calculé, mais éditable tout de
-- même à tout moment. Pour le calculer il faut partir de l'offre retenue avec la marge multipliée
-- par la durée […] que l'on divise par 2 ou autre en fonction des règles de split différent selon
-- les fournisseurs. »
--
-- Son exemple, vérifié en base sur la recommandation 8deb0671 (CABINET MOLINIER - SDC LE FONTENAY) :
-- 227 MWh ÷ 12 × 36 mois × (4 €/MWh × 0,5) = 1 362 €.
--
-- ══ TROIS RÉPONSES DE WILLIAM, TROIS DÉCISIONS ══
--
-- 1. LE PARTAGE N'EST PAS TOUJOURS DE MOITIÉ. « Non pas toujours par 2, et certains fournisseurs on
--    prend moins que ça. » Il croyait que le réglage existait déjà — ce qu'il avait vu dans
--    « Modifier les prix » est une ligne d'AFFICHAGE, « marge ÷ 2 (partagée avec le fournisseur) »,
--    que rien ne permet de changer. Le commentaire de `PART_KIWEE_DANS_LA_MARGE` prévoyait le jour où
--    ce partage deviendrait propre à chaque fournisseur : c'est aujourd'hui.
--    Naoëlle : « mets un champ à 50 % chez tous les fournisseurs pour le moment, je changerai par la
--    suite, les taux doivent être éditables. » D'où `comptes.taux_marge_kiwee`, à 0,50 partout.
--
-- 2. UNE MARGE FIXE EST AUSSI EN €/MWh. « Une marge fixe c'est en €/MWh du style 4 €/MWh. Donc y'a
--    pas de montant de l'affaire sans calcul. »
--
--    CELA CONTREDIT LE MODÈLE, ET C'EST ASSUMÉ. Le champ `marge_fixe_eur` porte ce commentaire, écrit
--    d'après la règle de Michel du 21/08 : « Marge que le fournisseur impose, en EUROS et non au MWh
--    — elle ne dépend pas du volume consommé ». Le texte d'aide de l'écran dit la même chose : « en
--    euros et pour TOUTE LA DURÉE du contrat, ni au mégawattheure, ni par an ».
--    Naoëlle a tranché : « fais ce que William dit, il est mieux renseigné que Michel. » Les deux
--    types de marge passent donc par la même formule au MWh, et il n'existe plus de montant qui ne
--    soit pas calculé.
--
--    CE QUE ÇA CHANGE POUR LES DEUX LIGNES DÉJÀ SAISIES. Deux offres portent `type_marge = 'FIXE'` :
--    TOTAL ENERGIES avec 120 sur 227 MWh, et GAZ EUROPEEN avec 6 sur 8 MWh. Le 120 a de toute
--    évidence été saisi comme un forfait en euros — lu en €/MWh, il donnerait 40 860 € de montant.
--    AUCUNE DES DEUX N'EST L'OFFRE RETENUE, donc aucun montant n'en découle aujourd'hui. Mais
--    l'écran doit changer d'unité en même temps que le calcul, sinon on continuera d'y saisir des
--    forfaits : c'est fait dans le même commit (SaisiePrixDialog).
--
-- 3. LA SAISIE MANUELLE GAGNE. « Oui la version modifiée à la main écrase le calcul, mais dans
--    l'historique des champs faut bien tracer qui a modifié quoi et quand. »
--    Pour qu'une saisie SURVIVE au recalcul suivant, il faut se souvenir qu'elle est manuelle : d'où
--    `recommandations.montant_saisi_manuellement`. Sans ce drapeau, « la saisie écrase le calcul »
--    ne durerait que jusqu'au prochain passage du calcul.
--    LA TRAÇABILITÉ, ELLE, EXISTE DÉJÀ : `trg_audit_trace` est en place sur `recommandations` et a
--    enregistré 1 599 modifications de `montant` avec leur auteur et leur horodatage. Rien à ajouter.
--
-- ══ LA VUE PLUTÔT QU'UN CALCUL DANS L'ÉCRAN ══
--
-- Le montant sert à trois endroits : la fiche, la liste des recommandations et la somme du tableau de
-- bord. Trois implémentations d'une même formule finiraient par donner trois chiffres. La vue est
-- donc l'unique définition, et l'écran ne fait que la lire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LE TAUX DE PARTAGE, PAR FOURNISSEUR ══
alter table public.comptes
  add column if not exists taux_marge_kiwee numeric(5, 4) not null default 0.5000;

alter table public.comptes
  drop constraint if exists comptes_taux_marge_kiwee_check;
alter table public.comptes
  add constraint comptes_taux_marge_kiwee_check
  check (taux_marge_kiwee >= 0 and taux_marge_kiwee <= 1);

comment on column public.comptes.taux_marge_kiwee is
  'Part de la marge annoncée au fournisseur qui revient à KiWee, entre 0 et 1. 0,5 par défaut — la règle de Michel du 21/08/2026 — mais « certains fournisseurs on prend moins que ça » (William, 03/09/2026) : le taux se saisit fournisseur par fournisseur sur sa fiche. N''a de sens que sur un compte de type FOURNISSEUR.';

-- ══ 2. LE DRAPEAU DE SAISIE MANUELLE ══
alter table public.recommandations
  add column if not exists montant_saisi_manuellement boolean not null default false;

comment on column public.recommandations.montant_saisi_manuellement is
  'Vrai quand quelqu''un a écrit le montant à la main : le recalcul ne doit alors plus l''écraser. « La version modifiée à la main écrase le calcul » (William, 03/09/2026) — sans ce drapeau, cette règle ne tiendrait que jusqu''au passage suivant du calcul.';

-- Les 1 047 montants venus de Salesforce ne sont pas des saisies : ils viennent d'un import, et le
-- calcul ne les retrouve pas (aucune offre retenue derrière eux). On ne les marque donc PAS comme
-- manuels — sinon on gèlerait pour toujours des chiffres qu'on voudra peut-être recalculer le jour
-- où leurs offres seront saisies.

-- ══ 3. LA FORMULE, UNE SEULE FOIS ══
create or replace view public.v_montant_recommandation
with (security_invoker = true) as
with derniere_version as (
  -- LA MÊME RÈGLE QUE `recalculer_statut_recommandation` : la version que l'application désigne comme
  -- courante, à défaut le plus grand numéro. Deux façons de choisir « la dernière version »
  -- finiraient par désigner deux versions différentes.
  select distinct on (v.recommandation_id)
    v.recommandation_id, v.id as version_id, v.numero_version
  from public.versions_recommandation v
  order by v.recommandation_id, v.version_actuelle desc nulls last, v.numero_version desc nulls last
),
lignes as (
  select
    dv.recommandation_id,
    o.id                                        as offre_id,
    f.nom                                       as fournisseur_nom,
    coalesce(f.taux_marge_kiwee, 0.5)           as taux,
    o.duree_mois,
    ofc.consommation_annuelle_reference_mwh     as conso,
    ofc.type_marge,
    -- LES DEUX TYPES PASSENT PAR LA MÊME FORMULE, décision du 03/09 : une marge fixe est en €/MWh
    -- comme une variable. `marge_reelle_eur_mwh` est ce que l'écran fait saisir sous
    -- « Marge de référence (brute) ».
    case when ofc.type_marge = 'FIXE' then ofc.marge_fixe_eur else ofc.marge_reelle_eur_mwh end
                                                as marge_eur_mwh
  from derniere_version dv
  join public.versions_recommandation_compteurs vrc on vrc.version_recommandation_id = dv.version_id
  join public.offres_fournisseurs_compteurs ofc on ofc.version_recommandation_compteur_id = vrc.id
  join public.offres_fournisseurs o on o.id = ofc.offre_fournisseur_id
  left join public.comptes f on f.id = o.compte_fournisseur_id
  where o.est_offre_recommandee
    and o.actif
    and ofc.actif
    and coalesce(vrc.actif, true)
)
select
  r.id                                          as recommandation_id,
  count(l.offre_id)                             as nb_compteurs,
  -- Le montant : la somme des compteurs de l'offre retenue. `null` quand rien n'est calculable —
  -- et non zéro : « je ne sais pas » et « zéro euro » ne se lisent pas pareil sur une fiche.
  case
    when count(l.offre_id) = 0 then null
    when bool_or(l.conso is not null and l.marge_eur_mwh is not null and l.duree_mois is not null) then
      round(sum(
        (coalesce(l.conso, 0) / 12.0) * coalesce(l.duree_mois, 0) * (coalesce(l.marge_eur_mwh, 0) * l.taux)
      ), 2)
    else null
  end                                           as montant_calcule,
  -- Ce qui a servi au calcul, pour que la fiche puisse l'expliquer sans refaire la requête.
  max(l.fournisseur_nom)                        as fournisseur_nom,
  max(l.taux)                                   as taux_marge,
  max(l.duree_mois)                             as duree_mois,
  sum(l.conso)                                  as conso_totale_mwh,
  max(l.marge_eur_mwh)                          as marge_eur_mwh,
  -- Ce qui manque, pour le dire plutôt que d'afficher un tiret muet.
  count(*) filter (where l.conso is null)       as sans_conso,
  count(*) filter (where l.marge_eur_mwh is null) as sans_marge,
  count(*) filter (where l.duree_mois is null)  as sans_duree
from public.recommandations r
left join lignes l on l.recommandation_id = r.id
group by r.id;

comment on view public.v_montant_recommandation is
  'Le montant de l''affaire calculé depuis l''offre retenue de la dernière version : somme sur ses compteurs de (conso ÷ 12) × durée en mois × (marge €/MWh × taux du fournisseur). Formule de William du 03/09/2026. Nul quand aucune offre retenue ou aucune donnée exploitable.';

-- ── Le garde-fou ──
do $$
declare
  v_exemple numeric;
  v_calculables integer;
  v_taux_hors_bornes integer;
begin
  -- L'exemple de William doit tomber juste, sinon la formule n'est pas celle qu'il a décrite.
  select montant_calcule into v_exemple
    from public.v_montant_recommandation
   where recommandation_id = '8deb0671-5df4-4c4f-b798-9b45945a4ebd';
  if v_exemple is distinct from 1362.00 then
    raise exception 'L''exemple de William donne % au lieu de 1362.00', v_exemple;
  end if;

  select count(*) into v_taux_hors_bornes from public.comptes
   where taux_marge_kiwee < 0 or taux_marge_kiwee > 1;
  if v_taux_hors_bornes > 0 then
    raise exception '% comptes portent un taux hors de [0,1]', v_taux_hors_bornes;
  end if;

  select count(*) into v_calculables
    from public.v_montant_recommandation where montant_calcule is not null;
  raise notice 'Montant calculable sur % recommandations. Exemple William : % EUR', v_calculables, v_exemple;
end;
$$;

commit;
