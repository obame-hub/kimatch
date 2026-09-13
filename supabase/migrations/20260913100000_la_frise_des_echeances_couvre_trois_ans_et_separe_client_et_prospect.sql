-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA FRISE DES ÉCHÉANCES COUVRE TROIS ANS, ET SÉPARE LE CLIENT DU PROSPECT
--
-- William, 13/09/2026 : « montrer les échéances de tous les compteurs, peu importe s'ils sont
-- engagés dans une opportunité ouverte ou non. Un toggle client/prospect peut être intéressant si
-- on veut sur le même bloc voir les 2 portefeuilles. Couvrir 36 mois. »
--
-- ── SUR « TOUS LES COMPTEURS » : C'ÉTAIT DÉJÀ LE CAS, ET C'EST BIEN QUE ÇA SE VOIE MAL ──
--
-- La version précédente n'excluait rien : `sans_suite` ne servait qu'à TEINTER un mois, jamais à
-- l'écarter. Mais rien ne le disait à l'écran, et la légende parlait surtout de ce qui n'était pas
-- lancé — au point de laisser croire à un filtre. Le commentaire de la fonction le dit désormais en
-- toutes lettres, et la légende du composant aussi.
--
-- ── LE CLIENT ET LE PROSPECT SONT DÉJÀ DANS LE MODÈLE ──
--
-- `v_compteurs_liste` calcule `nature_echeance` :
--
--     PROUVEE   la date vient d'un CONTRAT actif en base — on tient le compteur
--     ESTIMEE   la date a été déclarée, sans contrat pour l'appuyer — on ne le tient pas
--     ABSENTE   aucune date
--
-- C'est exactement la frontière client / prospect au niveau du compteur, et elle est plus honnête
-- qu'un statut posé sur le compte : un même syndic peut tenir douze résidences sous contrat et en
-- démarcher trois autres. Le portefeuille se lit donc par compteur, pas par compte.
--
-- ── TRENTE-SIX MOIS, ET POURQUOI PAS PLUS ──
--
-- Vingt-quatre mois coupaient la vue juste avant les renouvellements de troisième année, qui sont
-- ceux qu'on prépare. Sur CABINET CSJC, passer à trente-six fait apparaître quatre échéances de
-- plus — dont une de 1 639 MWh en décembre 2028, invisible jusqu'ici. Au-delà de trois ans, une
-- échéance ne se prépare plus, elle se surveille : elle a sa place dans l'onglet Compteurs, pas
-- dans une frise de travail.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.lister_charge_echeances(uuid);

create function public.lister_charge_echeances(p_compte_id uuid)
returns table (
  mois              date,
  compteurs         integer,
  mwh               numeric,
  sans_suite        integer,
  compteurs_client  integer,
  mwh_client        numeric,
  compteurs_prospect integer,
  mwh_prospect      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with mois_glissants as (
    select generate_series(
      date_trunc('month', (now() at time zone 'Europe/Paris')::date),
      date_trunc('month', (now() at time zone 'Europe/Paris')::date) + interval '35 months',
      interval '1 month'
    )::date as mois
  ),
  compteurs_dates as (
    select
      date_trunc('month', v.date_echeance)::date as mois,
      coalesce(v.consommation_annuelle_mwh, 0) as mwh,
      v.nature_echeance = 'PROUVEE' as est_client,
      not exists (
        select 1 from opportunites_compteurs oc
        join opportunites o on o.id = oc.opportunite_id and o.actif
        where oc.compteur_id = v.id
      ) and not exists (
        select 1 from recommandations_compteurs rc
        join recommandations r on r.id = rc.recommandation_id and r.actif
        join etapes_recommandation e on e.id = r.etape_id and e.code <> 'CLOTUREE'
        where rc.compteur_id = v.id
      ) as sans_suite
    from v_compteurs_liste v
    where v.compte_id = p_compte_id and v.actif and v.date_echeance is not null
  )
  select
    m.mois,
    count(c.mois)::integer,
    coalesce(sum(c.mwh), 0),
    count(*) filter (where c.sans_suite)::integer,
    count(*) filter (where c.est_client)::integer,
    coalesce(sum(c.mwh) filter (where c.est_client), 0),
    count(*) filter (where c.mois is not null and not c.est_client)::integer,
    coalesce(sum(c.mwh) filter (where not c.est_client), 0)
  from mois_glissants m
  left join compteurs_dates c on c.mois = m.mois
  group by m.mois
  order by m.mois;
$$;

comment on function public.lister_charge_echeances is
  'Les trente-six prochains mois d''échéances d''un compte, séparés client (échéance prouvée par un contrat en base) et prospect (échéance seulement déclarée). Tous les compteurs datés y figurent, qu''une opportunité soit ouverte ou non — `sans_suite` ne sert qu''à teinter, jamais à exclure.';

grant execute on function public.lister_charge_echeances(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select to_char(mois,'YYYY-MM'), compteurs, compteurs_client, compteurs_prospect
--     from lister_charge_echeances('2a76baa4-8093-4828-91c6-d07fddd897c6') where compteurs > 0;
--   -- CABINET CSJC au 13/09/2026 : 9 échéances sur 36 mois, toutes côté client, la dernière en
--   -- avril 2029. À 24 mois, quatre d'entre elles n'apparaissaient pas.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
