-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA QUALITÉ DES DONNÉES, COMPTE PAR COMPTE
--
-- Michel, 24/08/2026 : « Les échéances dépassées, données manquantes ou compteurs sans contrat
-- doivent plutôt générer une alerte portefeuille et ne pas prendre la place des 20 signaux
-- commerciaux ». Naoëlle, 01/09/2026, sur la forme : « un écran Qualité des données, avec les
-- problèmes regroupés par compte ».
--
-- ══ POURQUOI PAR COMPTE, ET NON PAR COMPTEUR ══
--
-- La liste plate des compteurs en anomalie fait 6 690 lignes. Personne ne traite 6 690 lignes, et
-- surtout ce n'est pas ainsi que le travail se fait : on appelle un syndic UNE fois et on récupère
-- les vingt échéances qui manquent, on ne l'appelle pas vingt fois. CABINET MICHAU porte à lui seul
-- 307 compteurs en anomalie — c'est un coup de téléphone, pas trois cents.
--
-- ══ LES QUATRE ANOMALIES, ET CE QU'ELLES COÛTENT ══
--
--   sans contrat          6 457 compteurs   on ne sait pas chez qui il est fourni
--   échéance dépassée     3 883             la date est passée, donc plus personne ne sait quand relancer
--   sans responsable      1 181             on ne sait pas qui appeler pour ce compteur
--   sans échéance           592             aucune date, ni déclarée ni prouvée
--
-- ELLES SE CHEVAUCHENT, ET LA VUE LE DIT. Un même compteur peut être sans contrat ET sans échéance.
-- La somme des quatre colonnes (12 113) n'est donc PAS un nombre de compteurs : `compteurs_en_defaut`
-- compte les compteurs DISTINCTS qui portent au moins une anomalie. Confondre les deux ferait
-- annoncer deux fois le travail réel.
--
-- ══ LE VOLUME EST LÀ POUR TRIER, PAS POUR DÉCORER ══
--
-- `mwh_en_defaut` additionne la consommation annuelle des compteurs en anomalie. Entre deux comptes
-- à dix compteurs manquants, celui qui pèse 4 000 MWh se traite avant celui qui en pèse 40 : la
-- donnée manquante y coûte plus cher. Sans cette colonne, l'écran ne saurait trier que par nombre,
-- et enverrait les commerciaux sur les gros volumes de lignes plutôt que sur les gros volumes tout
-- court.
--
-- `security_invoker = true` : la vue lit avec les droits de celui qui l'interroge, pas ceux de son
-- créateur — sans quoi elle contournerait les politiques RLS des comptes et des sites.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view public.v_qualite_donnees_compte
with (security_invoker = true) as
with defauts as (
  select
    s.compte_id,
    cm.id as compteur_id,
    cm.consommation_annuelle_mwh,
    (not exists (select 1 from public.contrats_compteurs cc where cc.compteur_id = cm.id)) as sans_contrat,
    (cm.date_echeance is not null and cm.date_echeance < current_date)                     as echeance_depassee,
    (cm.date_echeance is null)                                                             as sans_echeance,
    (cm.responsable_contact_id is null)                                                    as sans_responsable
  from public.compteurs cm
  join public.sites s on s.id = cm.site_id
  where cm.actif and s.compte_id is not null
)
select
  cp.id                                   as compte_id,
  cp.nom                                  as compte_nom,
  cp.proprietaire_id                      as compte_proprietaire_id,
  coalesce(pr.prenom || ' ' || pr.nom, '') as conseiller,
  cp.type_compte,
  count(d.compteur_id)                                                          as nb_compteurs,
  count(*) filter (where d.sans_contrat)                                        as sans_contrat,
  count(*) filter (where d.echeance_depassee)                                   as echeance_depassee,
  count(*) filter (where d.sans_echeance)                                       as sans_echeance,
  count(*) filter (where d.sans_responsable)                                    as sans_responsable,
  -- Les compteurs DISTINCTS qui portent au moins une anomalie — le vrai volume de travail.
  count(*) filter (
    where d.sans_contrat or d.echeance_depassee or d.sans_echeance or d.sans_responsable
  )                                                                             as compteurs_en_defaut,
  coalesce(sum(d.consommation_annuelle_mwh) filter (
    where d.sans_contrat or d.echeance_depassee or d.sans_echeance or d.sans_responsable
  ), 0)::numeric(14,1)                                                          as mwh_en_defaut,
  -- Les manques sur la fiche du compte elle-même, qui n'ont rien à voir avec ses compteurs.
  (cp.siret is null)                                                            as compte_sans_siret,
  (cp.proprietaire_id is null)                                                  as compte_sans_proprietaire
from public.comptes cp
left join defauts d on d.compte_id = cp.id
left join public.profils pr on pr.id = cp.proprietaire_id
where cp.actif
group by cp.id, cp.nom, cp.proprietaire_id, pr.prenom, pr.nom, cp.type_compte, cp.siret
-- Un compte sans aucun défaut n'a rien à faire sur cet écran : il n'y a rien à y corriger.
having count(*) filter (
         where d.sans_contrat or d.echeance_depassee or d.sans_echeance or d.sans_responsable
       ) > 0
    or cp.siret is null
    or cp.proprietaire_id is null;

comment on view public.v_qualite_donnees_compte is
  'Un compte par ligne, avec le détail de ses données manquantes. Alimente l''écran Qualité des données — Michel, 24/08/2026 : ces manques appellent une alerte portefeuille, pas une place dans les 20 signaux commerciaux.';

-- ── Le garde-fou : les totaux de la vue doivent égaler ceux mesurés sur la table ──
do $$
declare
  v_vue_sans_contrat bigint;
  v_reel_sans_contrat bigint;
  v_comptes bigint;
begin
  select sum(sans_contrat), count(*) into v_vue_sans_contrat, v_comptes
    from public.v_qualite_donnees_compte;

  select count(*) into v_reel_sans_contrat
    from public.compteurs cm
    join public.sites s on s.id = cm.site_id
    join public.comptes cp on cp.id = s.compte_id
   where cm.actif and cp.actif
     and not exists (select 1 from public.contrats_compteurs cc where cc.compteur_id = cm.id);

  if v_vue_sans_contrat is distinct from v_reel_sans_contrat then
    raise exception 'La vue annonce % compteurs sans contrat, la table en compte %',
      v_vue_sans_contrat, v_reel_sans_contrat;
  end if;

  raise notice 'Qualité des données : % comptes concernés, % compteurs sans contrat',
    v_comptes, v_vue_sans_contrat;
end;
$$;

commit;
