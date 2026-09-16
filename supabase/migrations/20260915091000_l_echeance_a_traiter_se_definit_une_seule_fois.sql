-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'ÉCHÉANCE À TRAITER SE DÉFINIT UNE SEULE FOIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le Cockpit a besoin des mêmes compteurs que la fiche compte, mais sur une fenêtre plus large
-- (18 mois au lieu d'un an), échéances dépassées et vides comprises, et filtrés par propriétaire.
-- Écrire une seconde fonction aurait donné DEUX définitions de « échéance à traiter », qui
-- divergeraient au premier ajustement métier. Les critères passent donc dans une vue, et les deux
-- appelants la lisent.
--
-- ══ TROIS ÉCARTS RELEVÉS DANS `lister_echeances_a_traiter` LE 15/09/2026 ══
--
-- 1. `date_echeance is not null` et `>= today` excluent les échéances VIDES et DÉPASSÉES. Sur
--    7 899 compteurs, 588 n'ont aucune échéance (relevé du 24/08). La fiche compte n'en voulait
--    pas — « les urgences à traiter » y parlent de ce qui arrive. Le Cockpit en veut : une
--    échéance dépassée est le cas où l'on a déjà perdu, et une échéance absente celui où l'on ne
--    sait rien.
--
-- 2. La fenêtre d'un an est écrite en dur. Elle devient un filtre de l'appelant.
--
-- 3. `join opportunites o on … and o.actif` EXCLUT UN COMPTEUR DÈS QU'UNE OPPORTUNITÉ LE TOUCHE,
--    close ou non. `actif` est le drapeau de corbeille, pas « ouverte ». Un compteur dont
--    l'opportunité a été perdue il y a deux ans est donc écarté POUR TOUJOURS.
--
-- ══ POURQUOI DEUX COLONNES ET NON UNE CORRECTION ══
--
-- Corriger le troisième écart dans la vue changerait, en silence, les chiffres de la fiche compte —
-- l'écran que 541 comptes consultent aujourd'hui. La vue porte donc LES DEUX FAITS :
--
--     a_opportunite_liee     une opportunité non supprimée touche ce compteur (l'ancien sens)
--     a_opportunite_vivante  une opportunité NON CLOSE le touche          (le sens juste)
--
-- `lister_echeances_a_traiter` garde `a_opportunite_liee` et rend exactement ce qu'elle rendait.
-- Le Cockpit lit `a_opportunite_vivante`. Personne ne subit le choix de l'autre, et l'écart est
-- écrit ici plutôt que découvert plus tard.
--
-- ══ LA RECOMMANDATION NON CLÔTURÉE COMPTE TOUJOURS COMME « DÉJÀ TRAITÉ » ══
--
-- Reprise telle quelle de la migration 20260911150000 : la recommandation vient après
-- l'opportunité dans le cycle, et un compteur dont la consultation est lancée n'est pas une
-- urgence. Ce critère n'avait pas le défaut du précédent — il teste bien l'étape, pas la corbeille.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view v_echeances_a_traiter as
select
  v.id                        as compteur_id,
  v.compte_id,
  v.responsable_contact_id,
  v.numero_point,
  v.site_nom,
  v.type_energie_code,
  v.consommation_annuelle_mwh,
  v.date_echeance,
  v.nature_echeance,
  (v.date_echeance - (now() at time zone 'Europe/Paris')::date)::integer as jours_restants,
  exists (
    select 1
      from opportunites_compteurs oc
      join opportunites o on o.id = oc.opportunite_id and o.actif
     where oc.compteur_id = v.id
  ) as a_opportunite_liee,
  exists (
    select 1
      from opportunites_compteurs oc
      join opportunites o on o.id = oc.opportunite_id
     where oc.compteur_id = v.id
       and o.actif
       and o.date_cloture is null
       and o.qualification_fin is null
  ) as a_opportunite_vivante,
  exists (
    select 1
      from recommandations_compteurs rc
      join recommandations r          on r.id = rc.recommandation_id and r.actif
      join etapes_recommandation e    on e.id = r.etape_id and e.code <> 'CLOTUREE'
     where rc.compteur_id = v.id
  ) as a_recommandation_ouverte
from v_compteurs_liste v
where v.actif;

comment on view v_echeances_a_traiter is
  'Un compteur actif, son échéance et sa nature, plus trois faits : une opportunité non supprimée '
  'le touche, une opportunité NON CLOSE le touche, une recommandation non clôturée le couvre. '
  'La vue ne filtre ni la fenêtre ni le propriétaire : c''est à l''appelant de le faire. '
  'Les échéances vides et dépassées y sont présentes.';

grant select on v_echeances_a_traiter to authenticated;

-- ══ LA FONCTION DE LA FICHE COMPTE LIT LA VUE, ET NE CHANGE PAS DE COMPORTEMENT ═══════════════
--
-- Mêmes bornes, même exclusion (`a_opportunite_liee`, l'ancien sens), même tri : l'échéance
-- d'abord, le volume ensuite, « à urgence égale, c'est le montant en jeu qui départage ».
-- Et toujours AUCUN filtre par propriétaire : on est sur la fiche d'un compte, et tous les
-- commerciaux voient tous les comptes (Naoëlle, 14/08/2026).

create or replace function public.lister_echeances_a_traiter(p_compte_id uuid)
returns table (
  compteur_id     uuid,
  numero_point    text,
  site_nom        text,
  type_energie    text,
  consommation    numeric,
  date_echeance   date,
  nature_echeance text,
  jours_restants  integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.compteur_id,
    e.numero_point,
    e.site_nom,
    e.type_energie_code,
    e.consommation_annuelle_mwh,
    e.date_echeance,
    e.nature_echeance,
    e.jours_restants
  from v_echeances_a_traiter e
  where e.compte_id = p_compte_id
    and e.date_echeance is not null
    and e.date_echeance >= (now() at time zone 'Europe/Paris')::date
    and e.date_echeance <= (now() at time zone 'Europe/Paris')::date + interval '1 year'
    and not e.a_opportunite_liee
    and not e.a_recommandation_ouverte
  order by e.date_echeance asc, e.consommation_annuelle_mwh desc nulls last;
$$;

comment on function public.lister_echeances_a_traiter is
  'Les compteurs d''un compte dont le contrat tombe dans l''année ET sur lesquels rien n''est '
  'lancé — ni opportunité liée, ni recommandation non clôturée. Triés par urgence, puis par '
  'volume. Lit v_echeances_a_traiter depuis le 15/09/2026, à comportement inchangé.';

grant execute on function public.lister_echeances_a_traiter(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION — c'est celui qui compte, et il est comparatif
--
-- La fonction doit rendre EXACTEMENT ce qu'elle rendait avant. Sur le compte témoin de la
-- migration 20260911150000 (CABINET CADOT-BEAUPLET, relevé du 11/09) :
--
--   select count(*), round(sum(consommation)::numeric, 0)
--     from lister_echeances_a_traiter('76c53356-4e82-4dac-8d89-c946c7269792');
--   -- attendu : 22 compteurs, 2 707 MWh
--
-- Et l'écart que la vue rend visible, sur toute la base :
--
--   select count(*) from v_echeances_a_traiter
--    where a_opportunite_liee and not a_opportunite_vivante;
--   -- les compteurs qu'une opportunité CLOSE écartait pour toujours
-- ════════════════════════════════════════════════════════════════════════════════════════════════
