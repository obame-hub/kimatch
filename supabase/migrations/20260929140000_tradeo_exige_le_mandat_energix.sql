-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- TRADEO EXIGE LE MANDAT ENERGIX, PAS LE MANDAT KIWEE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 29/09/2026 : « il faut filtrer les mandats actifs oui, mais avec des mandats Energix. S'il
-- y a juste un mandat KiWee, ça marche pas, car c'est pas celui de Tradeo ». Energix est la
-- plateforme de Tradeo (l'API s'appelle EnergieX) : c'est SON autorisation de collecte (ACD) qu'elle
-- attend, pas celle de KiWee.
--
-- ══ LA DIFFÉRENCE EXISTAIT DÉJÀ EN BASE ══
--
-- Chaque mandat porte ses types de courtier (`mandats_courtiers` → `types_courtiers_mandat`), posés à
-- la création par l'assistant mandat (« Mandat Energix » coché ou non). Mesuré ce jour : 1 122
-- mandats actifs KiWee, dont 191 aussi Energix. Sur les 199 compteurs des dossiers ouverts, 129 ont
-- un mandat Energix actif.
--
-- La vue du 29/09 au matin acceptait n'importe quel mandat actif. Elle a ainsi proposé ESTIPARK et
-- 12 TH. SQUARE comme dossiers prêts, alors que leurs mandats sont KiWee seul : Tradeo les aurait
-- refusés.
--
-- ══ CE QUE CETTE VERSION CHANGE ══
--
--   · `energix` (nouvelle colonne, en fin de vue) : le mandat retenu est-il aussi Energix ?
--   · le mandat retenu est un mandat Energix quand le compteur en a un — c'est lui qui compte ;
--   · le PDF retenu est le PDF ENERGIX (« Mandat_Energix_… ») : le PDF KiWee n'est pas l'ACD
--     que Tradeo attend. Faute de PDF Energix, `document_id` reste vide et l'écran le dit.
--
-- La vue garde les mandats KiWee seuls : l'écran doit pouvoir dire « mandat KiWee seulement », et
-- non « pas de mandat », qui laisserait croire qu'il faut en faire signer un premier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view v_compteurs_mandat_actif
with (security_invoker = true) as
select distinct on (mc.compteur_id)
  mc.compteur_id,
  k.numero_point,
  k.compte_id,
  m.id as mandat_id,
  m.reference as mandat_reference,
  m.date_fin_validite,
  d.id as document_id,
  d.nom_fichier as document_nom,
  e.energix
from mandats_compteurs mc
join mandats m on m.id = mc.mandat_id
join statuts_mandats s on s.id = m.statut_id and s.code = 'ACTIF'
join compteurs k on k.id = mc.compteur_id
cross join lateral (
  select exists (
    select 1
    from mandats_courtiers mco
    join types_courtiers_mandat t on t.id = mco.type_courtier_id
    where mco.mandat_id = m.id and t.code = 'ENERGIX'
  ) as energix
) e
left join lateral (
  select d.id, d.nom_fichier
  from documents d
  where d.entite_type = 'mandat'
    and d.entite_id = m.id
    and d.actif
    and (d.mime_type ilike '%pdf%' or d.nom_fichier ilike '%.pdf')
    and coalesce(d.nom_fichier, '') not ilike 'certificat%'
    -- Pour un mandat Energix, seul le PDF Energix est l'ACD de Tradeo.
    and (not e.energix or d.nom_fichier ilike '%energix%' or d.nom_fichier ilike '%energiex%')
  order by d.date_creation desc
  limit 1
) d on true
where mc.caduc_depuis is null
-- Un mandat Energix d'abord, puis celui qui court le plus longtemps, puis celui qui a un PDF.
order by mc.compteur_id, e.energix desc, m.date_fin_validite desc nulls first, (d.id is null), m.date_creation desc;

comment on view v_compteurs_mandat_actif is
  'Les compteurs couverts par un mandat ACTIF (et non retirés du mandat), un par compteur, en '
  'préférant un mandat Energix. Tradeo n''accepte que les compteurs dont `energix` est vrai : c''est '
  'son autorisation de collecte, pas celle de KiWee. Lue par le banc Tradeo et par api/tradeo. Voir '
  'les migrations des 29/09/2026.';
comment on column v_compteurs_mandat_actif.mandat_id is 'Le mandat actif retenu : un mandat Energix s''il en existe un, sinon celui qui court le plus longtemps.';
comment on column v_compteurs_mandat_actif.document_id is 'Le PDF du mandat signé. Pour un mandat Energix, le PDF ENERGIX — l''ACD de Tradeo. NULL : aucun PDF de ce type rattaché.';
comment on column v_compteurs_mandat_actif.energix is 'Vrai si le mandat retenu est aussi un mandat Energix. Faux : mandat KiWee seul, que Tradeo refuse.';

commit;
