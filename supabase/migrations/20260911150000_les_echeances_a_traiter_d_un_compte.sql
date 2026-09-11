-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES ÉCHÉANCES À TRAITER D'UN COMPTE
--
-- William, 11/09/2026 : « il faudrait être en mesure de ressortir les urgences à traiter vis-à-vis
-- des échéances — pour les compteurs à échéance proche de moins d'un an et sans aucune opportunité
-- ouverte ».
--
-- ── C'EST LE BLOC QUI PORTE LE PLUS DE VALEUR DE TOUTE LA FICHE ──
--
-- Mesuré sur la base le 11/09/2026, en comptant pour chaque idée combien de comptes verraient
-- réellement quelque chose :
--
--     mandats en cours de signature        8 comptes   0,3 %
--     contrats en cours de signature      21 comptes   0,8 %
--     recommandations ouvertes            91 comptes   3,3 %
--     ÉCHÉANCES SANS RIEN EN COURS       541 comptes  19,4 %   ← 969 compteurs
--
-- Soixante fois plus de comptes que les deux suivis de signature réunis. Et c'est le seul de ces
-- blocs qui parle d'argent qu'on est en train de PERDRE : les autres disent où en est le travail
-- commencé, celui-ci dit ce qu'on n'a pas commencé.
--
-- ── « SANS AUCUNE OPPORTUNITÉ OUVERTE » SE LIT PLUS LARGEMENT ──
--
-- Pris à la lettre, il faudrait ne regarder que les opportunités. Mais une échéance couverte par une
-- RECOMMANDATION non clôturée est traitée elle aussi — la recommandation vient après l'opportunité
-- dans le cycle, et un compteur qui a déjà sa consultation en cours n'est pas une urgence.
-- L'afficher en rouge enverrait le commercial ouvrir une opportunité sur un dossier déjà lancé.
--
-- Les deux exclusions sont donc appliquées. Sur les 1 081 compteurs à échéance dans l'année, 969
-- n'ont ni l'une ni l'autre — l'écart de 112 est exactement ce que cette seconde exclusion évite
-- d'afficher à tort.
--
-- ── L'ORDRE EST CELUI DU TRAVAIL ──
--
-- L'échéance d'abord, le volume ensuite. Entre deux compteurs qui tombent le même jour, celui qui
-- pèse mille mégawattheures passe devant celui qui en pèse dix : à urgence égale, c'est le montant
-- en jeu qui départage.
--
-- ── PAS DE FILTRE PAR PROPRIÉTAIRE ──
--
-- Contrairement aux fonctions du tableau de bord, celle-ci ne restreint pas à `auth.uid()` : on est
-- sur la fiche d'un compte, et tous les commerciaux voient tous les comptes (règle rappelée par
-- Naoëlle le 14/08/2026). Filtrer ici cacherait des urgences à celui qui ouvre la fiche pour aider.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

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
    v.id,
    v.numero_point,
    v.site_nom,
    v.type_energie_code,
    v.consommation_annuelle_mwh,
    v.date_echeance,
    v.nature_echeance,
    (v.date_echeance - (now() at time zone 'Europe/Paris')::date)::integer
  from v_compteurs_liste v
  where v.compte_id = p_compte_id
    and v.actif
    and v.date_echeance is not null
    and v.date_echeance >= (now() at time zone 'Europe/Paris')::date
    and v.date_echeance <= (now() at time zone 'Europe/Paris')::date + interval '1 year'
    and not exists (
      select 1 from opportunites_compteurs oc
      join opportunites o on o.id = oc.opportunite_id and o.actif
      where oc.compteur_id = v.id
    )
    and not exists (
      select 1 from recommandations_compteurs rc
      join recommandations r on r.id = rc.recommandation_id and r.actif
      join etapes_recommandation e on e.id = r.etape_id and e.code <> 'CLOTUREE'
      where rc.compteur_id = v.id
    )
  order by v.date_echeance asc, v.consommation_annuelle_mwh desc nulls last;
$$;

comment on function public.lister_echeances_a_traiter is
  'Les compteurs d''un compte dont le contrat tombe dans l''année ET sur lesquels rien n''est lancé — ni opportunité ouverte, ni recommandation non clôturée. Triés par urgence, puis par volume.';

grant execute on function public.lister_echeances_a_traiter(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select count(*), round(sum(consommation)::numeric, 0)
--     from lister_echeances_a_traiter('76c53356-4e82-4dac-8d89-c946c7269792');
--   -- CABINET CADOT-BEAUPLET au 11/09/2026 : 22 compteurs, 2 707 MWh
-- ════════════════════════════════════════════════════════════════════════════════════════════════
