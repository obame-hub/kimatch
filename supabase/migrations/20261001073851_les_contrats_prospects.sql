-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES CONTRATS PROSPECTS — ce qu'on sait d'un contrat signé sans nous
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026 : « au lieu d'éditer un champ échéance déclarée, tu vas venir créer des
-- contrats prospects (très important de les distinguer des contrats clients) et les positionner
-- dans la frise. […] J'ai pas besoin de plus d'infos sur un contrat prospect. Juste le minimum
-- permettant d'alimenter la frise chronologique. »
--
-- ══ UNE TABLE À PART, PAS UNE NATURE DANS `contrats` ══
--
-- `contrats` est lu par une vingtaine d'écrans, de vues et d'automatismes : suivi de contrat,
-- statut de recommandation, DocuSign, Slack, commissions, patrimoine, espace partenaire. Un contrat
-- prospect glissé dedans devrait être écarté à chacun de ces endroits, et un seul oubli le ferait
-- compter comme un contrat de KiWee. Ici, il n'existe que là où on va le chercher : la frise et
-- l'échéance du compteur. Aucun automatisme ne peut le prendre pour un contrat signé.
--
-- ══ LE MINIMUM, ET TOUT PEUT RESTER INCONNU ══
--
-- Fournisseur, début, fin, durée : chacun peut être « Indéterminé ». Une fin vide se lit
-- « Indéterminée » sur le compteur. Le début se calcule depuis la fin et la durée quand les deux
-- sont connues, sinon depuis la fin du contrat précédent ; c'est l'écran qui le fait, la base
-- garde le résultat.
--
-- Un compteur par contrat prospect : c'est ce qu'un client déclare au téléphone, compteur par compteur.
-- Modifiable et supprimable par les commerciaux (William, 01/10/2026). La suppression est
-- journalisée comme partout (`historiques_entites`).

create table if not exists public.contrats_prospects (
  id                    uuid primary key default gen_random_uuid(),
  compteur_id           uuid not null references public.compteurs(id) on delete cascade,
  fournisseur_compte_id uuid references public.comptes(id) on delete set null,
  date_debut            date,
  date_fin              date,
  duree_mois            integer check (duree_mois is null or duree_mois between 1 and 240),
  cree_par_id           uuid references public.profils(id) on delete set null,
  modifie_par_id        uuid references public.profils(id) on delete set null,
  date_creation         timestamptz not null default now(),
  date_modification     timestamptz not null default now(),
  constraint contrats_prospects_dates_dans_l_ordre
    check (date_debut is null or date_fin is null or date_debut <= date_fin)
);

create index if not exists contrats_prospects_compteur_idx on public.contrats_prospects (compteur_id);

comment on table public.contrats_prospects is
  'Contrats signes sans KiWee, declares par le client : fournisseur, debut, fin, duree, chacun facultatif. Alimentent la frise et l''echeance du compteur, jamais les calculs des contrats KiWee.';

-- Qui a écrit et quand : les deux déclencheurs communs à toutes les tables.
drop trigger if exists trg_audit_trace on public.contrats_prospects;
create trigger trg_audit_trace before insert or update on public.contrats_prospects
  for each row execute function public.fn_audit_trace();
drop trigger if exists trg_journaliser_suppression on public.contrats_prospects;
create trigger trg_journaliser_suppression after delete on public.contrats_prospects
  for each row execute function public.fn_journaliser_suppression();

-- Le même cloisonnement que le compteur : un partenaire ne voit que les compteurs de ses comptes.
alter table public.contrats_prospects enable row level security;

drop policy if exists contrats_prospects_cloisonnes on public.contrats_prospects;
create policy contrats_prospects_cloisonnes on public.contrats_prospects
  for all to authenticated
  using (exists (
    select 1 from public.compteurs c
    where c.id = compteur_id
      and ((not public.est_partenaire()) or c.compte_id in (select public.comptes_du_partenaire()))
  ))
  with check (exists (
    select 1 from public.compteurs c
    where c.id = compteur_id
      and ((not public.est_partenaire()) or c.compte_id in (select public.comptes_du_partenaire()))
  ));

revoke all on public.contrats_prospects from anon;
grant select, insert, update, delete on public.contrats_prospects to authenticated;
