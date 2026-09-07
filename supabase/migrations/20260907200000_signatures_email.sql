-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA SIGNATURE EMAIL DE CHAQUE COMMERCIAL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « quand on clique sur un mail dans Kimatch, ça ouvre un volet pour écrire le
-- mail dans Kimatch comme dans Cockpit, connecté au Gmail. […] Il faut bien la signature de chacun
-- de nos commerciaux. »
--
-- ══ UNE TABLE, ET NON UNE COLONNE SUR `profils` ══
--
-- `profils` est lu partout — listes, sélecteurs de propriétaire, assignations. Y ajouter un bloc HTML
-- de plusieurs kilo-octets le ferait voyager dans chacune de ces requêtes, pour un usage qui ne
-- concerne qu'un seul écran. La signature vit donc à côté, chargée seulement quand on écrit un mail.
--
-- ══ CHACUN LA SIENNE, ET CHACUN LA SIENNE SEULEMENT ══
--
-- Une signature porte un nom, une fonction, un téléphone : c'est une identité. Les politiques RLS
-- laissent donc chacun lire et écrire la sienne, et personne celle des autres — sauf les
-- administrateurs en lecture, pour pouvoir dépanner « ma signature ne part pas ».
--
-- ══ CHACUN DÉMARRE AVEC QUELQUE CHOSE, PAS AVEC UNE PAGE BLANCHE ══
--
-- Une signature vide serait techniquement correcte et pratiquement inutile : les dix personnes
-- écriraient leurs premiers mails sans signature, et personne ne penserait à aller la remplir avant
-- qu'un client le remarque. On amorce donc à partir de ce que `profils` sait déjà — le nom et
-- l'adresse — avec le nom de l'entreprise. Le téléphone et la fonction manquent : `profils` ne les
-- porte pas, et les inventer serait pire que les laisser à compléter.
--
-- Le HTML reste volontairement simple. Une signature part chez des clients qui la liront dans
-- Outlook, Gmail, un webmail de FAI : les styles en ligne et les balises de base passent partout,
-- une grille CSS non.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.profils_signatures_email (
  profil_id  uuid primary key references public.profils(id) on delete cascade,
  -- Le bloc HTML tel qu'il sera collé en bas du mail. 20 000 caractères : de quoi tenir un logo en
  -- data-URI si quelqu'un en met un, sans permettre d'y coller une page entière.
  corps_html text not null default '',
  -- Un commercial peut vouloir écrire sans signature ponctuellement ; c'est un choix par mail, dans
  -- le volet. Ceci est son défaut à lui.
  active_par_defaut boolean not null default true,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  constraint corps_html_taille check (length(corps_html) <= 20000)
);

comment on table public.profils_signatures_email is
  'La signature email de chaque personne, collée en bas des mails envoyés depuis Kimatch. Séparée '
  'de `profils` pour ne pas faire voyager un bloc HTML dans toutes les requêtes qui lisent un profil.';

-- ── RLS : chacun la sienne ────────────────────────────────────────────────────────────────────
--
-- TOUTE TABLE NAÎT SOUS RLS SANS POLITIQUE, donc invisible même pour son créateur. C'est un piège
-- rencontré assez souvent sur ce projet pour mériter d'être rappelé ici.
alter table public.profils_signatures_email enable row level security;

drop policy if exists lecture_sa_signature on public.profils_signatures_email;
create policy lecture_sa_signature on public.profils_signatures_email
  for select to authenticated
  using (profil_id = auth.uid() or public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists ecriture_sa_signature on public.profils_signatures_email;
create policy ecriture_sa_signature on public.profils_signatures_email
  for insert to authenticated
  with check (profil_id = auth.uid());

drop policy if exists maj_sa_signature on public.profils_signatures_email;
create policy maj_sa_signature on public.profils_signatures_email
  for update to authenticated
  using (profil_id = auth.uid()) with check (profil_id = auth.uid());

-- La date de modification suit, comme partout ailleurs.
drop trigger if exists trg_signature_date_modification on public.profils_signatures_email;
create or replace function public.fn_touch_date_modification()
returns trigger language plpgsql as $$
begin
  new.date_modification := now();
  return new;
end;
$$;
create trigger trg_signature_date_modification
  before update on public.profils_signatures_email
  for each row execute function public.fn_touch_date_modification();

-- ── L'amorçage ────────────────────────────────────────────────────────────────────────────────
insert into public.profils_signatures_email (profil_id, corps_html)
select p.id,
       '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f2937;">'
       || '<strong>' || coalesce(p.prenom, '') || ' ' || coalesce(upper(p.nom), '') || '</strong><br/>'
       -- LA FONCTION EST À COMPLÉTER, et le dire dans la signature elle-même est le seul rappel qui
       -- marche : personne ne va spontanément dans un écran de réglages.
       || '<span style="color:#6b7280;">[votre fonction — à compléter dans Mon profil]</span><br/>'
       || 'KiWee Énergie<br/>'
       || '<a href="mailto:' || p.email || '" style="color:#47762f;">' || p.email || '</a>'
       || '</p>'
from public.profils p
where p.actif = true
  and coalesce(p.email, '') <> ''
on conflict (profil_id) do nothing;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
do $$
declare
  n_profils integer;
  n_signatures integer;
  n_politiques integer;
begin
  select count(*) into n_profils from profils where actif = true and coalesce(email,'') <> '';
  select count(*) into n_signatures from profils_signatures_email;
  select count(*) into n_politiques from pg_policies where tablename = 'profils_signatures_email';

  -- Une table sous RLS sans politique est invisible : la vérifier ici évite de découvrir dans
  -- l'écran que « la signature ne se charge pas » sans erreur.
  if n_politiques < 3 then
    raise exception 'Seulement % politique(s) RLS sur profils_signatures_email : la table serait invisible. Rien n''est appliqué.', n_politiques;
  end if;

  if n_signatures < n_profils then
    raise exception 'Amorçage incomplet : % signature(s) pour % profil(s) actifs avec email. Rien n''est appliqué.',
      n_signatures, n_profils;
  end if;

  raise notice 'Signatures en place : % profils amorcés, % politiques RLS.', n_signatures, n_politiques;
end $$;

commit;
