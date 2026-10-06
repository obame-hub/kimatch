-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PRICER : UN COMPTEUR SANS POINTE, UNE OFFRE NON PROPOSÉE D'UN CLIC — William, 06/10/2026
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. « En électricité, la colonne Pointe n'est pas obligatoire, certains compteurs n'en ont pas.
--    Dans ce cas, ajouter la possibilité de supprimer la colonne. » C'est le compteur qui n'a pas de
--    pointe, pas l'offre : la marque vit sur le compteur (`compteurs_electricite.sans_pointe`) et vaut
--    pour toutes ses versions. Une synchronisation Enedis ne la touche pas.
--
-- 2. « Pouvoir mentionner qu'une ligne n'est pas proposée par le fournisseur, mais le fait de barrer
--    et supprimer les prix doit être immédiat. » Supprimer les prix d'une ligne est réservé aux
--    administrateurs (`suppression_reservee_aux_admins`) : le pricing passe donc par cette fonction,
--    qui ne fait que ça — l'offre devient INDISPONIBLE et ses prix partent ; rouverte, elle revient
--    EN_ATTENTE. Refusée sans être connecté, et aux partenaires.

alter table public.compteurs_electricite add column if not exists sans_pointe boolean not null default false;
comment on column public.compteurs_electricite.sans_pointe is
  'Le compteur n''a pas de poste Pointe : le Pricer n''en montre pas la colonne (William, 06/10/2026). Sans effet si le compteur consomme en pointe.';

create or replace function public.fn_offre_non_proposee(p_offre uuid, p_non_proposee boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.est_partenaire() then
    raise exception 'Action réservée à l''équipe KiWee';
  end if;
  if p_non_proposee then
    delete from public.offres_fournisseurs_compteurs where offre_fournisseur_id = p_offre;
    update public.offres_fournisseurs set statut = 'INDISPONIBLE', date_modification = now() where id = p_offre;
  else
    update public.offres_fournisseurs set statut = 'EN_ATTENTE', date_modification = now() where id = p_offre and statut = 'INDISPONIBLE';
  end if;
end $$;
revoke all on function public.fn_offre_non_proposee(uuid, boolean) from public, anon;
grant execute on function public.fn_offre_non_proposee(uuid, boolean) to authenticated;
