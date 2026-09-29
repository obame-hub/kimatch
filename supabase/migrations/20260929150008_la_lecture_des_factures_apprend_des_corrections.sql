-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA LECTURE DES FACTURES APPREND DES CORRECTIONS DES COMMERCIAUX
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 29/09/2026 : « Tu dois apprendre des corrections apportées par les commerciaux afin
-- d'être de plus en plus performant sur les extractions propres à chaque modèle de facture des
-- fournisseurs. »
--
-- ══ CE QUI S'ENREGISTRE ══
--
-- À chaque compteur créé depuis une facture, une ligne par champ appris : ce que la lecture a donné,
-- et ce que le commercial a finalement retenu. Les deux, même quand ils sont d'accord — c'est ce qui
-- permet de dire qu'une correction est SYSTÉMATIQUE chez un fournisseur plutôt qu'un accident.
--
-- ══ SEULEMENT DES CODES, JAMAIS DES DONNÉES DE CLIENT ══
--
-- Les champs appris sont ceux dont la valeur est un code commun à tous les clients : énergie,
-- fournisseur, segment, tension, plage d'utilisation, tarif et profil gaz. Pas de PDL, pas
-- d'adresse, pas de date : une correction sur ceux-là ne dit rien du modèle de facture, et elle
-- partirait chez Anthropic avec la facture d'un autre client.
--
-- ══ COMMENT ELLE SERT ══
--
-- `v_lecons_extraction` regroupe les écarts par fournisseur. L'API de lecture
-- (`api/ocr/extract-document.ts`) les lit avant chaque facture :
--   - les leçons SÛRES (au moins deux fois, et au moins deux fois sur trois) sont appliquées
--     d'office à la réponse ;
--   - toutes sont données à lire au modèle, comme consignes propres à chaque fournisseur.

create table if not exists public.extraction_observations (
  id              uuid primary key default gen_random_uuid(),
  date_creation   timestamptz not null default now(),
  cree_par_id     uuid default auth.uid() references public.profils(id) on delete set null,
  compteur_id     uuid references public.compteurs(id) on delete set null,
  /* Le fournisseur tel que la facture le nomme, normalisé (majuscules, sans accents ni espaces
     doublés) : c'est lui qui désigne un MODÈLE de facture, avant tout rapprochement avec un compte. */
  fournisseur_lu  text not null default '',
  champ           text not null check (champ in (
                    'type_energie', 'fournisseur_nom', 'segment', 'tension', 'type_utilisation',
                    'tarif_distribution', 'profil_consommation')),
  valeur_lue      text,
  valeur_retenue  text not null
);

create index if not exists extraction_observations_par_modele_idx
  on public.extraction_observations (fournisseur_lu, champ);

alter table public.extraction_observations enable row level security;

/* L'équipe écrit ses propres observations et lit celles de tous : c'est tout l'intérêt. Un partenaire
   n'y a pas accès. Personne ne modifie ni ne supprime une observation depuis l'application. */
drop policy if exists extraction_observations_lecture on public.extraction_observations;
create policy extraction_observations_lecture on public.extraction_observations
  for select to authenticated using (not public.est_partenaire());

drop policy if exists extraction_observations_ecriture on public.extraction_observations;
create policy extraction_observations_ecriture on public.extraction_observations
  for insert to authenticated
  with check (not public.est_partenaire() and cree_par_id = auth.uid());

revoke all on public.extraction_observations from anon;

create or replace view public.v_lecons_extraction
with (security_invoker = true) as
with obs as (
  select fournisseur_lu, champ, coalesce(valeur_lue, '') as lue, valeur_retenue
    from public.extraction_observations
   where date_creation > now() - interval '18 months'
),
total as (
  select fournisseur_lu, champ, lue, count(*) as n from obs group by 1, 2, 3
),
par_retenue as (
  select fournisseur_lu, champ, lue, valeur_retenue, count(*) as nb from obs group by 1, 2, 3, 4
)
select p.fournisseur_lu,
       p.champ,
       nullif(p.lue, '') as valeur_lue,
       p.valeur_retenue,
       p.nb::int         as nb,
       t.n::int          as total,
       /* SÛRE : vue au moins deux fois, et retenue au moins deux fois sur trois pour cette lecture. */
       (p.nb >= 2 and p.nb * 3 >= t.n * 2) as sure
  from par_retenue p
  join total t using (fournisseur_lu, champ, lue)
 where p.valeur_retenue <> p.lue;

revoke all on public.v_lecons_extraction from anon;
grant select on public.v_lecons_extraction to authenticated;

comment on table public.extraction_observations is
  'Une lecture de facture confrontee a ce que le commercial a retenu, champ par champ. Codes seulement.';
comment on view public.v_lecons_extraction is
  'Les ecarts entre lecture et saisie retenue, par modele de facture (fournisseur). sure = applique d''office.';
