-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SUIVI DE CONTRAT — L'OBJET
--
-- Dossier de transmission KiMatch du 31/08/2026, § 7 : « Création automatique dès qu'un contrat
-- passe au statut "Signé". Le suivi couvre la vie entière du contrat. » Et le critère de recette,
-- § 11 : « Un contrat signé crée automatiquement un suivi et ses premières actions. Le suivi
-- conserve tous ses rattachements et trace les événements automatiques. »
--
-- C'est le dernier objet de la chaîne : piste → opportunité → recommandation → contrat → SUIVI. Là
-- où les quatre premiers servent à gagner l'affaire, celui-ci sert à la tenir — bienvenue,
-- résiliation de l'ancien fournisseur, bascule, première facture, points clients, renouvellement.
--
-- ══ LA MESURE QUI COMMANDE LE DÉCLENCHEUR ══
--
-- Le document dit « dès qu'un contrat passe au statut Signé ». Mesuré ce jour sur la production :
--
--     1 602  contrats actifs
--     1 346  au statut SIGNE, A_VENIR, ACTIF, TERMINE ou RESILIE
--         3  portent une `date_signature`
--
-- Les 694 contrats repris de Salesforce n'ont jamais reçu de date de signature — la reprise ne
-- l'alimentait pas. Un déclencheur fondé sur `date_signature` ne verrait donc que trois contrats sur
-- mille trois cent quarante-six. Il se fonde sur le STATUT, qui est vrai partout.
--
-- ══ HUIT ÉTAPES, CELLES DU DOCUMENT ══
--
-- Reprises mot pour mot, avec leur finalité. La huitième, « Terminé ou résilié », est UNE étape
-- portant une FINALITÉ séparée — même partage que `versions_recommandation.statut` / `resultat` et
-- `recommandations.etape` / `finalite_cloture`, imposé par Michel le 28/08/2026. « Où en est ce
-- suivi ? » et « comment s'est-il terminé ? » sont deux questions : les fondre obligerait chaque
-- écran qui demande « est-ce fini ? » à énumérer deux codes.
--
-- ══ L'ÉTAPE AVANCE, ELLE NE RECULE JAMAIS ══
--
-- `recalculer_etape_suivi_contrat` déduit une étape des dates du contrat, et n'écrit que si elle est
-- PLUS AVANCÉE que l'actuelle. Deux raisons.
--
-- D'abord, deux étapes ne se déduisent d'aucune donnée : « Résiliation à confirmer » attend une
-- preuve d'envoi, « En renouvellement » attend qu'on ouvre l'opportunité. Ce sont des actes. Un
-- recalcul qui écraserait la valeur courante les effacerait à chaque passage.
--
-- Ensuite, un suivi qui recule est un mensonge : on n'a pas « dé-envoyé » le dossier de bienvenue
-- parce qu'une date a changé. La monotonie rend la fonction rejouable sans dégât — on peut la lancer
-- sur les 1 346 suivis autant de fois qu'on veut.
--
-- ══ CE QUI SE RATTACHE, ET CE QUI N'A RIEN DEMANDÉ ══
--
-- Le § 7 exige : contrat, compte, contacts, sites, compteurs, fournisseur, actions, interactions,
-- documents, requêtes, opportunités liées.
--
-- Trois de ces liens n'ont besoin d'AUCUNE colonne nouvelle, et les ajouter aurait créé deux
-- vérités à tenir d'accord :
--
--   documents  déjà porté par `entite_type` / `entite_id` — il suffit d'écrire 'suivi_contrat'
--   requêtes   déjà porté par `requetes.contrat_id` — les requêtes du suivi sont celles du contrat
--   compteurs  portés par le site du contrat, comme partout ailleurs
--
-- Deux en ont besoin : `actions.suivi_contrat_id` et `interactions.suivi_contrat_id`. Sans elles,
-- une action créée sur un suivi partirait au niveau du site et n'y reviendrait jamais.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LES HUIT ÉTAPES
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.etapes_suivis_contrats (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  libelle      text not null,
  -- La finalité du document : ce que l'étape sert à obtenir. Affichée à l'écran, elle évite que
  -- « À préparer » ne dise rien sur ce qu'il y a à préparer.
  finalite     text not null,
  ordre        integer not null,
  actif        boolean not null default true,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

insert into public.etapes_suivis_contrats (code, libelle, finalite, ordre) values
  ('A_PREPARER',                 'À préparer',                 'Envoyer le dossier de bienvenue et préparer la résiliation', 10),
  ('RESILIATION_A_CONFIRMER',    'Résiliation à confirmer',    'Confirmer l''envoi réel et relancer si nécessaire',           20),
  ('EN_ATTENTE_ACTIVATION',      'En attente d''activation',   'Éviter la double signature et préparer la bascule',           30),
  ('CONTRAT_ACTIF',              'Contrat actif',              'Confirmer la bascule fournisseur',                             40),
  ('SUIVI_CLIENT',               'Suivi client',               'Facture M+2, attentes, suivi M+4 à M+6, cross-sell',           50),
  ('RENOUVELLEMENT_A_ANTICIPER', 'Renouvellement à anticiper', 'Déclencher l''anticipation à échéance moins douze mois',       60),
  ('EN_RENOUVELLEMENT',          'En renouvellement',          'Piloter l''opportunité et la nouvelle recommandation',         70),
  ('CLOTURE',                    'Terminé ou résilié',         'Clore en conservant l''historique',                            80)
on conflict (code) do update
  set libelle = excluded.libelle, finalite = excluded.finalite, ordre = excluded.ordre, actif = true;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. LE SUIVI
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.suivis_contrats (
  id          uuid primary key default gen_random_uuid(),
  reference   text,
  -- Le contrat suivi. `on delete cascade` : un suivi sans son contrat ne veut rien dire.
  contrat_id  uuid not null references public.contrats(id) on delete cascade,
  -- LES RATTACHEMENTS SONT RECOPIÉS À LA CRÉATION, pas rejoints à la lecture. Le § 7 demande que
  -- « le suivi conserve tous ses rattachements » : si le contrat change de site deux ans plus tard,
  -- le suivi doit continuer à dire sur quel site il a été ouvert. Ils restent modifiables à la main.
  compte_id             uuid references public.comptes(id) on delete set null,
  site_id               uuid references public.sites(id) on delete set null,
  fournisseur_compte_id uuid references public.comptes(id) on delete set null,
  contact_principal_id  uuid references public.contacts(id) on delete set null,
  recommandation_id     uuid references public.recommandations(id) on delete set null,
  etape_id    uuid not null references public.etapes_suivis_contrats(id),
  -- Séparée de l'étape, comme le résultat d'une version l'est de son statut.
  finalite    text check (finalite is null or finalite in ('TERMINE', 'RESILIE')),
  -- L'INDICATEUR DE SANTÉ N'EST PAS STOCKÉ ICI. Le § 9 l'exige : « Impossible d'afficher un statut
  -- incohérent ». Une santé écrite en base se désynchronise dès qu'une action prend du retard. Elle
  -- se calcule dans `v_suivis_contrats_liste`. Cette colonne ne sert qu'à la FORCER à la main quand
  -- le terrain sait quelque chose que les données ne disent pas.
  sante_forcee text check (sante_forcee is null or sante_forcee in ('SAIN', 'A_SURVEILLER', 'A_RISQUE', 'OPPORTUNITE')),
  motif_sante_forcee text,
  date_ouverture timestamptz not null default now(),
  date_cloture   timestamptz,
  commentaire    text,
  responsable_profil_id uuid references public.profils(id) on delete set null,
  proprietaire_id uuid references public.profils(id) on delete set null,
  actif       boolean not null default true,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  cree_par_id    uuid references public.profils(id) on delete set null,
  modifie_par_id uuid references public.profils(id) on delete set null,
  -- Une clôture doit dire laquelle : terminé n'est pas résilié.
  constraint suivis_contrats_cloture_check check (
    finalite is null or date_cloture is not null
  )
);

-- UN SEUL SUIVI VIVANT PAR CONTRAT. L'index partiel est ce qui rend `creer_suivi_contrat`
-- réellement idempotent : sans lui, deux appels concurrents créeraient deux suivis du même contrat.
create unique index if not exists suivis_contrats_un_par_contrat
  on public.suivis_contrats (contrat_id) where actif;

create index if not exists suivis_contrats_compte_idx on public.suivis_contrats (compte_id);
create index if not exists suivis_contrats_etape_idx  on public.suivis_contrats (etape_id);
create index if not exists suivis_contrats_site_idx   on public.suivis_contrats (site_id);

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LES DEUX RATTACHEMENTS QUI MANQUAIENT
-- ══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.actions
  add column if not exists suivi_contrat_id uuid references public.suivis_contrats(id) on delete set null;
create index if not exists actions_suivi_contrat_idx on public.actions (suivi_contrat_id);

alter table public.interactions
  add column if not exists suivi_contrat_id uuid references public.suivis_contrats(id) on delete set null;
create index if not exists interactions_suivi_contrat_idx on public.interactions (suivi_contrat_id);

-- `actions_contexte_check` exige au moins un rattachement — bonne règle, mais sa liste ignorait ce
-- nouveau. Sans cette extension, la toute première action créée par le déclencheur serait refusée.
alter table public.actions drop constraint if exists actions_contexte_check;
alter table public.actions add constraint actions_contexte_check check (
  site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or opportunite_id is not null
  or piste_id is not null
  or suivi_contrat_id is not null
);

-- Même chose côté interactions : une note écrite sur un suivi doit être un rattachement valide.
alter table public.interactions drop constraint if exists interactions_contexte_check;
alter table public.interactions add constraint interactions_contexte_check check (
  compte_id is not null
  or contact_id is not null
  or site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or action_id is not null
  or opportunite_id is not null
  or suivi_contrat_id is not null
);

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. LE VOCABULAIRE D'ACTIONS DU SUIVI
--
-- Les treize types existants sont tous commerciaux — appeler, préparer le mandat, présenter la
-- recommandation. Aucun ne dit « contrôler la première facture ». Les gestes du § 8 ont besoin de
-- leurs propres types, sinon ils s'appelleraient tous « Autre action » et aucun filtre ne les
-- retrouverait.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

insert into public.types_actions (code, libelle, ordre, actif) values
  ('VERIFIER_PERIMETRE',        'Vérifier le périmètre du suivi',   200, true),
  ('ENVOYER_BIENVENUE',         'Envoyer le dossier de bienvenue',  210, true),
  ('PREPARER_RESILIATION',      'Préparer la résiliation',          220, true),
  ('CONFIRMER_RESILIATION',     'Confirmer l''envoi de résiliation', 230, true),
  ('CONTROLER_BASCULE',         'Contrôler la bascule fournisseur', 240, true),
  ('CONTROLER_PREMIERE_FACTURE','Contrôler la première facture',    250, true),
  ('POINT_SUIVI_CLIENT',        'Faire le point de suivi client',   260, true),
  ('BILAN_ANNUEL',              'Conduire le bilan annuel',         270, true),
  ('ANTICIPER_RENOUVELLEMENT',  'Anticiper le renouvellement',      280, true)
on conflict (code) do update
  set libelle = excluded.libelle, ordre = excluded.ordre, actif = true;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. DROITS ET TRAÇABILITÉ
--
-- Une table créée par migration naît avec RLS actif et AUCUNE politique : tout est refusé, y compris
-- la lecture, et l'écran serait vide sans le moindre message d'erreur. On reprend exactement la
-- forme des autres tables — accès complet aux authentifiés, suppression réservée aux admins — parce
-- que le § 9 l'impose : « Conserver les règles d'accès actuelles jusqu'à validation explicite d'une
-- nouvelle matrice de droits. »
-- ══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.suivis_contrats        enable row level security;
alter table public.etapes_suivis_contrats enable row level security;

drop policy if exists authenticated_all on public.suivis_contrats;
create policy authenticated_all on public.suivis_contrats
  for all to authenticated using (true) with check (true);

drop policy if exists suppression_reservee_aux_admins on public.suivis_contrats;
create policy suppression_reservee_aux_admins on public.suivis_contrats
  for delete to authenticated
  using (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists lecture_pour_tous on public.etapes_suivis_contrats;
create policy lecture_pour_tous on public.etapes_suivis_contrats
  for select to authenticated, anon using (true);

grant select, insert, update, delete on public.suivis_contrats to authenticated;
grant select on public.suivis_contrats to anon;
grant select on public.etapes_suivis_contrats to authenticated, anon;

-- L'historique et la signature des lignes, comme sur les autres objets.
drop trigger if exists trg_audit_trace on public.suivis_contrats;
create trigger trg_audit_trace
  before insert or update on public.suivis_contrats
  for each row execute function public.fn_audit_trace();

commit;
