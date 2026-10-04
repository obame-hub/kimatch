-- ══ LE CONTRAT NAÎT DE L'OFFRE ACCEPTÉE — William, 04/10/2026 ══
-- « Quand le client accepte une offre, il faut créer le contrat selon les caractéristiques de cette
-- offre. Ensuite c'est à Erwan de demander l'édition du contrat auprès du fournisseur sélectionné. »
-- Et : « ça doit simplement clôturer la version et créer le contrat. Ce n'est que la signature du
-- contrat et la validation de ce dernier qui permet de gagner la recommandation. »
--
-- Le contrat garde l'offre dont il vient (`offre_fournisseur_id`) : ses prix, sa marge et sa durée
-- se relisent depuis elle. Deux clauses de l'offre n'avaient pas d'équivalent sur le contrat — le
-- dépôt de garantie et le SWAP — elles l'ont désormais : les cinq clauses de l'offre passent toutes.
alter table public.contrats
  add column if not exists offre_fournisseur_id uuid references public.offres_fournisseurs(id) on delete set null,
  add column if not exists clause_depot_garantie boolean,
  add column if not exists clause_swap boolean;
create index if not exists contrats_offre_fournisseur_idx on public.contrats(offre_fournisseur_id);
comment on column public.contrats.offre_fournisseur_id is
  'L''offre acceptée par le client dont le contrat découle (04/10/2026).';
