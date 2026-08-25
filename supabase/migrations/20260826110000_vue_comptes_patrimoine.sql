-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PATRIMOINE, COMPTE PAR COMPTE : v_comptes_patrimoine
--
-- Page 2 du PDF de Michel du 25/08/2026 : « Patrimoine des comptes — mesurez la valeur de chaque
-- compte et fiabilisez les données qui pilotent vos actions ». Quatre indicateurs en tête, puis un
-- tableau des comptes avec, pour chacun, ses compteurs et la qualité de leur donnée.
--
-- TROIS DIMENSIONS, ET PAS QUATRE — c'est la seule liberté prise sur sa maquette, et elle est
-- assumée. Il en décrit quatre à 25 % : volume de compteurs, rattachement à un contact, échéances
-- valides, recommandations acceptées. Les trois dernières se mesurent : ce sont des taux, elles
-- valent 0 à 100 par construction. LE VOLUME, NON — un nombre de compteurs n'est pas un pourcentage,
-- et le transformer en score demande un objectif (« combien de compteurs vaut 100 ? ») que lui seul
-- peut fixer. Inventer ce plafond aurait produit un classement dont personne n'aurait pu expliquer
-- l'ordre. Le nombre de compteurs est donc affiché, pas noté, et la question lui est posée.
--
-- CE QUE CHAQUE DIMENSION MESURE, et pourquoi celle-là :
--
--   LIÉS À UN CONTACT — `compteurs.responsable_contact_id`. C'est le prérequis du signal : sa règle
--   du 24/08 est qu'un signal s'accroche à un contact, donc un compteur sans contact ne produira
--   jamais rien, quelle que soit son échéance. 6 718 sur 7 901 en portent un.
--
--   ÉCHÉANCES VALIDES — une échéance connue ET non dépassée, en reprenant la nature calculée par
--   `v_compteurs_liste` (prouvée ou estimée, jamais absente). Une date passée n'est pas une donnée,
--   c'est une donnée périmée : 3 474 sur 7 901 sont valides aujourd'hui.
--
--   RECOMMANDATIONS ACCEPTÉES PAR COMPTEUR — le rendement du patrimoine. Plafonné à 100 : un compte
--   qui a plus d'affaires acceptées que de compteurs est excellent, et le dire deux fois ne le rend
--   pas meilleur.
--
-- LE SCORE EST CALCULÉ DANS LA VUE et non dans le navigateur, pour que le tableau puisse TRIER et
-- PAGINER dessus en base. Sur 2 640 comptes, un tri côté navigateur imposerait de tout charger — la
-- faute qui a gelé l'onglet des compteurs le 24/08.
--
-- `security_invoker = true` : la vue lit avec les droits de l'appelant, donc les politiques RLS de
-- `comptes`, `sites` et `compteurs` continuent de s'appliquer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_comptes_patrimoine;

create view public.v_comptes_patrimoine
with (security_invoker = true) as
with compteurs_du_compte as (
  select
    s.compte_id,
    count(*)                                                              as nb_compteurs,
    count(c.responsable_contact_id)                                       as nb_avec_contact,
    count(*) filter (
      where v.nature_echeance <> 'ABSENTE'
        and v.date_echeance >= current_date
    )                                                                     as nb_echeance_valide,
    sum(coalesce(c.consommation_annuelle_mwh, 0))                         as volume_mwh
  from public.compteurs c
  join public.sites s              on s.id = c.site_id
  join public.v_compteurs_liste v  on v.id = c.id
  where c.actif
  group by s.compte_id
),
recos_du_compte as (
  select r.compte_id, count(*) as nb_acceptees
  from public.recommandations r
  join public.etapes_recommandation e on e.id = r.etape_id
  where r.actif and e.code = 'ACCEPTEE'
  group by r.compte_id
)
select
  cp.id                                        as compte_id,
  cp.nom                                       as compte_nom,
  cp.proprietaire_id,
  k.nb_compteurs,
  k.nb_avec_contact,
  k.nb_echeance_valide,
  k.volume_mwh,
  coalesce(rc.nb_acceptees, 0)                 as nb_recos_acceptees,
  round(100.0 * k.nb_avec_contact / k.nb_compteurs)                        as pct_contact,
  round(100.0 * k.nb_echeance_valide / k.nb_compteurs)                     as pct_echeance,
  least(100, round(100.0 * coalesce(rc.nb_acceptees, 0) / k.nb_compteurs)) as pct_recommandation,
  -- La moyenne des trois taux : un compte se juge sur la fiabilité de sa donnée, pas sur sa taille.
  round((
      100.0 * k.nb_avec_contact / k.nb_compteurs
    + 100.0 * k.nb_echeance_valide / k.nb_compteurs
    + least(100, 100.0 * coalesce(rc.nb_acceptees, 0) / k.nb_compteurs)
  ) / 3.0)                                                                as score
from public.comptes cp
join compteurs_du_compte k on k.compte_id = cp.id
left join recos_du_compte rc on rc.compte_id = cp.id
where cp.actif;

comment on view public.v_comptes_patrimoine is
  'Un compte, ses compteurs et la fiabilité de leur donnée : contact rattaché, échéance valide, recommandations acceptées, plus un score moyen des trois. Page 2 du PDF de Michel du 25/08/2026. Le volume de compteurs est fourni mais NON noté — le plafond reste à définir.';

grant select on public.v_comptes_patrimoine to authenticated, anon, service_role;

commit;
