-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES PISTES ACCUEILLENT LES LEADS SALESFORCE, RANGÉS EN LOTS DE TRAVAIL
--
-- Michel, 01/09/2026 : « il faut importer les leads comme pistes même si c'est un chantier ». La
-- demande vient de l'analyse des signaux : 804 des 839 « contacts » derrière les appels manquants
-- sont en réalité des Leads, et 3 570 consignations d'appels leur sont rattachées. Tant que les
-- Leads n'existent pas dans Kimatch, ces appels n'ont nulle part où atterrir et le critère
-- « interactions » du barème reste à zéro sur 489 des 596 contacts éligibles.
--
-- ══ CE QUI ARRIVE, MESURÉ AVANT D'ÉCRIRE ══
--
--   5 308 Leads dans l'org, dont 177 déjà convertis — ceux-là existent déjà en compte + contact,
--         on ne les reprend pas, ce serait créer des doublons de clients.
--   5 131 Leads non convertis à reprendre :
--           4 463 « Nouvelle »
--             374 « En cours de qualification »
--             294 « Disqualifiée »          → importées INACTIVES (décision de Michel, 01/09)
--
--   Taux de remplissage sur ces 5 131, qui décide des colonnes ajoutées ici :
--
--           Company        5 131 (100 %)      Activité         854 (17 %)
--           SIRET          4 962  (97 %)      Email            689 (13 %)
--           Segment        5 065  (99 %)      Fonction         614 (12 %)
--           SIREN          4 913  (96 %)      Commentaire      201  (4 %)
--           Source         4 946  (96 %)      Portable          56  (1 %)
--           Ville          4 527  (88 %)      Échéance          40  (0,8 %)
--           Téléphone      3 814  (74 %)      Type d'énergie     0
--           Nombre de lots 3 544  (69 %)
--
-- DEUX ENSEIGNEMENTS À DIRE PLUTÔT QU'À TAIRE. Le type d'énergie n'est renseigné sur AUCUN lead :
-- aucune colonne n'est créée pour lui. Et l'échéance ne l'est que sur 40 : ces pistes n'alimenteront
-- donc PAS le critère « échéance » du barème des signaux — elles apportent du volume d'appel et de
-- l'historique, pas des échéances. Attendre le contraire serait se tromper sur ce que fait ce
-- chantier.
--
-- ══ LE RAPPROCHEMENT AVEC LES COMPTES EXISTANTS ══
--
-- Croisement des 5 131 leads avec les 2 770 comptes, sur SIRET puis SIREN puis nom :
--
--     121 correspondent à un compte déjà présent   → la piste est rattachée à ce compte
--   5 010 n'ont aucune correspondance              → prospects neufs, c'est le gros du lot
--
-- 188 SIRET reviennent plusieurs fois PARMI LES LEADS (409 lignes) : ce sont des doublons côté
-- Salesforce. On les importe tels quels — les fusionner serait une décision commerciale, pas une
-- migration —, mais `siret` est indexé pour qu'on puisse les retrouver et les traiter.
--
-- ══ POURQUOI DES LOTS, ET POURQUOI UNE NOUVELLE TABLE ══
--
-- Les leads sont déjà répartis entre les commerciaux : Thomas 1 687, Matthieu 1 492, Marie 1 010,
-- Fabien 936, William 5, Guillaume 1. Livrés à plat, chacun ouvrirait son écran sur un mur de mille
-- à dix-sept cents lignes — exactement la peur que le plafond de vingt signaux cherchait à éviter.
-- Michel a choisi les listes de travail : on ouvre un lot, on le termine, on passe au suivant.
--
-- LA TABLE `listes` NE POUVAIT PAS SERVIR À ÇA, contrairement à ce que son nom laisse croire. Ses
-- colonnes — `societe`, `contact_nom`, `email`, `telephone`, `piste_id` — en font une table de
-- PRÉ-PISTE : une ligne brute de prospection qui devient une piste. Elle porte déjà `piste_id`, et
-- `pistes.liste_id` pointe vers elle : les deux se référencent mutuellement. S'en servir comme
-- regroupement aurait mis un troisième sens sur une paire qui en a déjà deux.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LES LOTS DE PROSPECTION ══
create table if not exists public.lots_prospection (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  -- Le commercial à qui le lot est confié. Les pistes portent aussi leur propriétaire : c'est lui
  -- qui fait foi ligne à ligne, le lot dit seulement à qui on a remis le paquet.
  proprietaire_id uuid references public.profils(id),
  -- D'où vient le lot — « Reprise Salesforce du 01/09/2026 », « Fichier salon », « Achat de base ».
  origine text,
  commentaire text,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  cree_par_id uuid references public.profils(id),
  modifie_par_id uuid references public.profils(id)
);

comment on table public.lots_prospection is
  'Un paquet de pistes confié à un commercial et travaillé d''un bloc. Distinct de `listes`, qui est une table de pré-pistes.';

create index if not exists lots_prospection_proprietaire_idx
  on public.lots_prospection (proprietaire_id) where actif;

-- ══ 2. CE QUE LES PISTES DOIVENT PORTER EN PLUS ══
alter table public.pistes
  -- L'identifiant Salesforce : c'est lui qui rend l'import rejouable sans rien dupliquer, et lui
  -- qui permettra de rattacher les 3 570 appels consignés sur les Leads.
  add column if not exists id_salesforce text,
  add column if not exists lot_id uuid references public.lots_prospection(id),
  -- SIRET et SIREN sont remplis à 97 % et 96 % : ce sont les seules clés fiables pour rapprocher une
  -- piste d'un compte, aujourd'hui comme le jour où le prospect deviendra client.
  add column if not exists siret text,
  add column if not exists siren text,
  add column if not exists ville text,
  add column if not exists code_postal text,
  -- 99 % de « Syndic professionnel » ou « Entreprise » : c'est le découpage qui sert aux lots.
  add column if not exists segment text,
  add column if not exists source text,
  add column if not exists fonction text,
  add column if not exists activite text,
  add column if not exists nombre_de_lots integer,
  -- Le statut Salesforce est conservé TEL QUEL, sans être traduit. `statut_id` reste nul comme sur
  -- les cinq pistes existantes : aucun référentiel de statut de piste n'est utilisé par l'écran, et
  -- en inventer un ici serait décider à la place de Michel.
  add column if not exists statut_salesforce text,
  add column if not exists motif_disqualification text;

create unique index if not exists pistes_id_salesforce_unique
  on public.pistes (id_salesforce) where id_salesforce is not null;
create index if not exists pistes_siret_idx on public.pistes (siret) where siret is not null;
create index if not exists pistes_lot_idx on public.pistes (lot_id) where actif;

comment on column public.pistes.id_salesforce is 'Lead.Id — clé d''idempotence de l''import et point d''accroche des appels consignés.';
comment on column public.pistes.statut_salesforce is 'Lead.Status repris sans traduction : Nouvelle, En cours de qualification, Disqualifiée.';

-- ══ 3. LA SÉCURITÉ ══
-- Une table créée par migration naît avec RLS ACTIF et AUCUNE politique : sans les deux lignes qui
-- suivent, `lots_prospection` serait invisible à tout le monde, y compris à l'application, et
-- l'écran de prospection afficherait des pistes sans jamais pouvoir nommer leur lot.
-- Les politiques recopient celles de `pistes`, pour que le lot ne soit ni plus ni moins visible que
-- ce qu'il contient.
alter table public.lots_prospection enable row level security;

drop policy if exists lots_prospection_lecture on public.lots_prospection;
create policy lots_prospection_lecture on public.lots_prospection
  for select to authenticated using (true);

drop policy if exists lots_prospection_ecriture on public.lots_prospection;
create policy lots_prospection_ecriture on public.lots_prospection
  for all to authenticated using (true) with check (true);

-- ── Le garde-fou ──
do $$
declare
  v_politiques integer;
begin
  select count(*) into v_politiques from pg_policies where tablename = 'lots_prospection';
  if v_politiques = 0 then
    raise exception 'lots_prospection est sous RLS sans aucune politique : la table serait invisible';
  end if;

  -- Les cinq pistes déjà présentes ne doivent avoir bougé d'aucune façon.
  if (select count(*) from public.pistes) <> 5 then
    raise exception 'Le nombre de pistes a changé pendant une migration qui ne devait rien insérer';
  end if;
end;
$$;

commit;
