-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA NATURE DE L'ÉCHÉANCE DEVIENT FILTRABLE : v_compteurs_liste
--
-- La diapositive 6 de Michel (24/08/2026) distingue l'échéance PROUVÉE — « contrat rattaché dans
-- Kiwee » — de l'échéance ESTIMÉE — « date déclarée par le client, sans preuve ». Le calcul existe
-- déjà côté application (`src/lib/echeance.ts`) et s'affiche sur chaque compteur, mais la LISTE des
-- 7 899 compteurs ne peut pas filtrer dessus : il faudrait charger les 7 899 lignes et leurs contrats
-- dans le navigateur pour trier, ce qui est exactement ce qui a gelé l'onglet le 24/08.
--
-- CETTE VUE NE STOCKE RIEN, ELLE DÉDUIT — comme le fait l'application, et pour la même raison : une
-- colonne « prouvée » se cocherait sans preuve, ce que la définition de Michel cherche justement à
-- fermer. La preuve reste le contrat lui-même.
--
-- LA RÈGLE EST REPRISE À L'IDENTIQUE DE `echeance.ts`, ligne pour ligne :
--   · la preuve est la date de fin la PLUS LOINTAINE parmi les contrats encore en cours ou à venir
--     (`date_fin >= current_date`) — un compteur couvert par des contrats successifs est couvert
--     jusqu'au dernier ;
--   · un contrat TERMINÉ ne prouve rien : le client a signé ailleurs depuis, et la date déclarée
--     parle de ce contrat-là, absent de Kimatch. Mesuré le 24/08 : sur 634 compteurs dont l'échéance
--     diffère de leur contrat, 252 ont un contrat déjà terminé — la divergence y est normale ;
--   · PROUVÉE s'il existe une telle preuve, ESTIMÉE s'il n'y a qu'une date déclarée, ABSENTE sinon ;
--   · CONTREDIT au-delà de 31 jours d'écart entre la déclarée et la preuve : en dessous, c'est une
--     convention de dernier jour, pas un désaccord.
-- Toute divergence entre ce fichier et `echeance.ts` serait un bug : deux écrans afficheraient deux
-- natures pour le même compteur.
--
-- `security_invoker = true` : la vue s'exécute avec les droits de CELUI QUI LIT, donc les politiques
-- RLS de `compteurs` et de `contrats` continuent de s'appliquer. Sans cette option, une vue Supabase
-- lit avec les droits de son propriétaire et devient un contournement silencieux de RLS. Les vues
-- plus anciennes du dépôt ne la portent pas ; ce n'est pas une raison pour en créer une de plus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_compteurs_liste;

create view public.v_compteurs_liste
with (security_invoker = true) as
select
  c.id,
  c.numero_point,
  c.site_id,
  c.actif,
  c.consommation_annuelle_mwh,
  c.localisation_site,
  c.date_echeance                                   as date_declaree,
  te.code                                           as type_energie_code,
  s.nom                                             as site_nom,
  s.compte_id                                       as compte_id,
  p.date_preuve,
  -- La date à retenir : celle du contrat quand il y en a un, la déclarée sinon.
  coalesce(p.date_preuve, c.date_echeance)           as date_echeance,
  case
    when p.date_preuve is not null then 'PROUVEE'
    when c.date_echeance is not null then 'ESTIMEE'
    else 'ABSENTE'
  end                                               as nature_echeance,
  (
    p.date_preuve is not null
    and c.date_echeance is not null
    and abs(p.date_preuve - c.date_echeance) > 31
  )                                                 as contredit
from public.compteurs c
left join public.types_energies te on te.id = c.type_energie_id
left join public.sites s           on s.id = c.site_id
left join lateral (
  -- La preuve vivante : la fin la plus lointaine parmi les contrats non terminés du compteur.
  select max(ct.date_fin) as date_preuve
  from public.contrats_compteurs cc
  join public.contrats ct on ct.id = cc.contrat_id
  where cc.compteur_id = c.id
    and ct.actif
    and ct.date_fin >= current_date
) p on true;

comment on view public.v_compteurs_liste is
  'Compteurs avec la nature de leur échéance (prouvée / estimée / absente) déduite des contrats en cours. Règle identique à src/lib/echeance.ts — diapositive 6 de Michel, 24/08/2026.';

grant select on public.v_compteurs_liste to authenticated, anon, service_role;

commit;
