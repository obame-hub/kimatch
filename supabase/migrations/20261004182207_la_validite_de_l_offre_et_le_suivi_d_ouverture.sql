-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA VALIDITÉ DE L'OFFRE ET LE SUIVI D'OUVERTURE — William, 04/10/2026
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- « Ok pour ton idée Compte à rebours de validité et ok pour Suivi d'ouverture. »
--
-- 1. LA VALIDITÉ saisie à la génération se garde sur la version (`validite_offre`) : la fiche compte
--    à rebours, l'offre passe « expirée » à l'heure dite et ne s'envoie plus ; une alerte part la
--    veille (`alerte_validite_le` évite de la répéter — voir api/offre/alerter-validite.ts).
--
-- 2. LE SUIVI D'OUVERTURE : la proposition part par un LIEN (`/proposition/<jeton>`) plutôt qu'en
--    pièce jointe. Le jeton (244 bits aléatoires) est la seule autorisation du client, qui n'a pas de
--    compte Kimatch. `fn_ouvrir_proposition` est donc ouverte à `anon` — c'est voulu, et c'est la
--    seule chose qu'elle ouvre : la proposition de CE jeton, rien d'autre. Chaque ouverture se compte ;
--    la première prévient le consultant. Les robots des messageries qui « cliquent » les liens
--    n'exécutent pas la page : seule une vraie ouverture appelle la fonction. Un membre de KiWee
--    connecté qui ouvre le lien pour le vérifier n'est pas compté.

alter table public.versions_recommandation
  add column if not exists validite_offre timestamptz,
  add column if not exists alerte_validite_le timestamptz;

comment on column public.versions_recommandation.validite_offre is
  'Jusqu''à quand l''offre générée est valable (saisie à la génération du PDF, 04/10/2026).';

create table if not exists public.propositions_envoyees (
  id uuid primary key default gen_random_uuid(),
  jeton text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  version_id uuid not null references public.versions_recommandation(id) on delete cascade,
  document_id uuid unique references public.documents(id) on delete set null,
  url text not null,
  nom_fichier text,
  valide_jusqu_au timestamptz,
  cree_par uuid references public.profils(id) on delete set null default auth.uid(),
  date_creation timestamptz not null default now(),
  nb_ouvertures integer not null default 0,
  premiere_ouverture timestamptz,
  derniere_ouverture timestamptz
);
create index if not exists propositions_envoyees_version_idx on public.propositions_envoyees(version_id);

alter table public.propositions_envoyees enable row level security;
create policy authenticated_all on public.propositions_envoyees for all to authenticated using (true) with check (true);
create policy propositions_envoyees_pas_aux_partenaires on public.propositions_envoyees as restrictive for all to authenticated
  using (not public.est_partenaire()) with check (not public.est_partenaire());
revoke all on public.propositions_envoyees from anon;

create or replace function public.fn_ouvrir_proposition(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien public.propositions_envoyees;
  v_reco record;
  v_premiere boolean;
  v_expiree boolean;
begin
  if p_jeton is null or length(p_jeton) < 32 then return null; end if;
  select * into v_lien from public.propositions_envoyees where jeton = p_jeton;
  if not found then return null; end if;

  -- Un membre de KiWee connecté (qui vérifie son lien) ne compte pas pour une ouverture du client.
  v_premiere := v_lien.premiere_ouverture is null and auth.uid() is null;
  if auth.uid() is null then
  update public.propositions_envoyees
     set nb_ouvertures = nb_ouvertures + 1,
         premiere_ouverture = coalesce(premiere_ouverture, now()),
         derniere_ouverture = now()
   where id = v_lien.id;
  end if;

  select r.id, r.proprietaire_id, c.nom as compte_nom, p.prenom, p.nom, p.email, p.telephone
    into v_reco
    from public.versions_recommandation v
    join public.recommandations r on r.id = v.recommandation_id
    left join public.comptes c on c.id = r.compte_id
    left join public.profils p on p.id = coalesce(r.proprietaire_id, v_lien.cree_par)
   where v.id = v_lien.version_id;

  if v_premiere and coalesce(v_reco.proprietaire_id, v_lien.cree_par) is not null then
    insert into public.notifications (destinataire_profil_id, titre, message, lien, entite_type, entite_id, categorie)
    values (coalesce(v_reco.proprietaire_id, v_lien.cree_par),
            'Proposition ouverte par le client',
            coalesce(v_reco.compte_nom, 'Le client') || ' vient d''ouvrir sa proposition commerciale.',
            '/recommandations/' || v_reco.id, 'recommandation', v_reco.id, 'proposition_ouverte');
  end if;

  v_expiree := v_lien.valide_jusqu_au is not null and v_lien.valide_jusqu_au < now();
  return jsonb_build_object(
    'url', case when v_expiree then null else v_lien.url end,
    'nom_fichier', v_lien.nom_fichier,
    'client', v_reco.compte_nom,
    'valide_jusqu_au', v_lien.valide_jusqu_au,
    'expiree', v_expiree,
    'consultant', jsonb_build_object('nom', trim(coalesce(v_reco.prenom, '') || ' ' || coalesce(v_reco.nom, '')), 'email', v_reco.email, 'telephone', v_reco.telephone)
  );
end;
$$;

revoke all on function public.fn_ouvrir_proposition(text) from public;
grant execute on function public.fn_ouvrir_proposition(text) to anon, authenticated;
