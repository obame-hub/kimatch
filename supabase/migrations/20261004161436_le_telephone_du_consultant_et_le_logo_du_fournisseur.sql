-- ══ CE QUE LA PROPOSITION COMMERCIALE PDF AFFICHE ET QUI MANQUAIT — 04/10/2026 ══
-- William : le bloc « Votre consultant KiWee » porte le nom, le mail ET le téléphone du propriétaire de
-- la recommandation ; chaque offre porte le logo rond de son fournisseur (« ajoute le champ logo et je
-- déposerai au fur et à mesure »).
alter table public.profils add column if not exists telephone text;
comment on column public.profils.telephone is 'Le téléphone professionnel, affiché au client dans la proposition commerciale (bloc consultant).';

alter table public.comptes_fournisseurs add column if not exists logo_url text;
comment on column public.comptes_fournisseurs.logo_url is 'Le logo du fournisseur (bucket public « logos »), le plus net possible : il est imprimé dans la proposition commerciale.';

-- Un logo n'est pas une donnée de client : il se lit sans session, comme les avatars, et s'imprime.
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do update set public = true;
drop policy if exists logos_lecture on storage.objects;
create policy logos_lecture on storage.objects for select to public using (bucket_id = 'logos');
drop policy if exists logos_depot on storage.objects;
create policy logos_depot on storage.objects for insert to authenticated with check (bucket_id = 'logos' and not public.est_partenaire());
drop policy if exists logos_remplacement on storage.objects;
create policy logos_remplacement on storage.objects for update to authenticated using (bucket_id = 'logos' and not public.est_partenaire()) with check (bucket_id = 'logos' and not public.est_partenaire());
drop policy if exists logos_suppression on storage.objects;
create policy logos_suppression on storage.objects for delete to authenticated using (bucket_id = 'logos' and not public.est_partenaire());
