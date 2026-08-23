-- La chaîne commerciale : Liste → Piste → Opportunité → Recommandation → Rémunération, plus Requête.
--
-- MÉMO DE MICHEL, 23/08/2026. Il distingue deux familles : les objets PASSIFS (ce que Kimatch sait —
-- comptes, contacts, sites, compteurs, contrats, factures, mandats, rémunérations) et les objets
-- ACTIFS (ce que Kimatch fait). La chaîne active est :
--
--   LISTE → PISTE → OPPORTUNITÉ → RECOMMANDATION → CONTRAT → RÉMUNÉRATION
--
-- et la REQUÊTE vit à côté, en parallèle : « Requête → Traitement → Résolution ».
--
-- CE QUI EXISTAIT DÉJÀ, et qu'on ne touche pas : comptes, contacts, sites, compteurs, contrats,
-- mandats, recommandations (1 707) avec leurs versions et leurs offres. Et les SIGNAUX — 864 lignes,
-- onze types qui recoupent exactement la liste des « signaux positifs » de Michel, avec un statut
-- « Transformé en recommandation ». Michel, 23/08/2026 : « je préfère qu'on crée d'abord les
-- opportunités et ensuite on fera le point sur les signaux qui permettent de lancer automatiquement
-- une opportunité. » On prépare donc le rattachement sans l'automatiser.
--
-- CE QUI MANQUAIT : les cinq tables de ce fichier.
--
-- CE QUE JE N'AI PAS INVENTÉ. Le score de maturité de la maquette — « chaque déclencheur apporte des
-- points selon sa nature multipliée par son urgence, les jours sans action retirent des points » —
-- demande des barèmes que Michel n'a pas encore donnés. La colonne `score_maturite` existe donc, mais
-- rien ne la calcule : elle attend ses règles plutôt qu'une formule de mon cru.

begin;

-- ══ 0. RATTRAPAGE, A EXECUTER AVANT TOUTE ECRITURE ═══════════════════════════
--
-- La premiere version de ce fichier posait `trg_audit_trace` sur les neuf tables, y compris quatre
-- qui n'ont pas les colonnes que ce declencheur ecrit (`cree_par_id`, `modifie_par_id`,
-- `proprietaire_id`). Resultat : toute ecriture sur ces quatre tables echouait avec « record "new"
-- has no field "cree_par_id" » — et notamment l'ajout d'un site ou d'un compteur au perimetre d'une
-- opportunite, c'est-a-dire le cas des syndics.
--
-- Ce retrait est EN TETE et non a la fin : le semis des statuts, plus bas, est un `insert`, et un
-- declencheur `before insert` s'execute avant meme que `on conflict do nothing` n'ait son mot a dire.
-- Le laisser en fin de fichier rendait la migration irrejouable.
do $$
declare t text;
begin
  foreach t in array array['opportunites_sites', 'opportunites_compteurs',
                           'statuts_opportunites', 'statuts_requetes']
  loop
    -- `to_regclass` renvoie null si la table n'existe pas encore : premiere application, rien a faire.
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_audit_trace on public.%I', t);
    end if;
  end loop;
end $$;

-- ══ 1. LISTE ════════════════════════════════════════════════════════════════
--
-- « Au départ : une ligne avec un contact, une société, un email et un téléphone. » Une liste EST
-- cette ligne — un contact brut, non qualifié, avant toute vérification.
create table if not exists public.listes (
  id uuid primary key default gen_random_uuid(),
  reference text,
  -- Les quatre informations de départ, toutes facultatives : une ligne incomplète est justement ce
  -- qu'il faut pouvoir stocker pour la compléter ensuite.
  societe text,
  contact_nom text,
  email text,
  telephone text,
  source text,
  commentaire text,
  -- La piste née de cette ligne, quand la qualification aboutit.
  piste_id uuid,
  statut_id uuid,
  proprietaire_id uuid references public.profils (id) on delete set null,
  cree_par_id uuid references public.profils (id) on delete set null,
  modifie_par_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

-- ══ 2. PISTE ════════════════════════════════════════════════════════════════
--
-- « Une Piste est un contact fiable et joignable, identifié comme responsable des contrats
-- d'énergie. » La bascule depuis la Liste exige cinq validations, et Michel insiste sur la
-- dernière : « et surtout que la personne est bien responsable ou décisionnaire des contrats
-- d'énergie ». Les cinq sont donc des colonnes et non un commentaire : c'est la règle de passage.
create table if not exists public.pistes (
  id uuid primary key default gen_random_uuid(),
  reference text,
  societe text,
  contact_nom text,
  email text,
  telephone text,
  -- Les cinq validations. `false` par défaut et non `null` : une case non cochée veut dire « pas
  -- encore vérifié », ce qui est l'état de départ de toute piste.
  contact_valide boolean not null default false,
  societe_validee boolean not null default false,
  email_valide boolean not null default false,
  portable_valide boolean not null default false,
  est_decisionnaire boolean not null default false,
  -- Les objets du patrimoine, dès qu'on les reconnaît. Facultatifs : « il n'est pas nécessaire à ce
  -- stade de connaître les compteurs ou les échéances. »
  compte_id uuid references public.comptes (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  liste_id uuid references public.listes (id) on delete set null,
  opportunite_id uuid,
  commentaire text,
  statut_id uuid,
  proprietaire_id uuid references public.profils (id) on delete set null,
  cree_par_id uuid references public.profils (id) on delete set null,
  modifie_par_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

-- REJOUABLE. Ces deux clefs croisees etaient les seules a ne pas etre precedees d'un `drop if
-- exists` : un second passage de la migration echouait dessus en 42710, « constraint already
-- exists » — constate le 23/08/2026, apres une premiere application pourtant reussie. Une migration
-- qu'on ne peut pas relancer est un piege : on ne sait plus si elle est passee, et la relancer pour
-- le verifier casse.
alter table public.listes drop constraint if exists listes_piste_fk;
alter table public.listes
  add constraint listes_piste_fk foreign key (piste_id) references public.pistes (id) on delete set null;

-- ══ 3. OPPORTUNITÉ ══════════════════════════════════════════════════════════
--
-- « Une Opportunité représente un potentiel commercial concret. Elle peut concerner plusieurs
-- immeubles et plusieurs compteurs, notamment pour les syndics. Une Opportunité peut générer une ou
-- plusieurs Recommandations. »
create table if not exists public.statuts_opportunites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text,
  icone text,
  est_cloture boolean not null default false,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

insert into public.statuts_opportunites (code, libelle, ordre, est_cloture) values
  ('NOUVELLE', 'Nouvelle', 10, false),
  ('EN_QUALIFICATION', 'En qualification', 20, false),
  ('EN_ATTENTE', 'En attente', 30, false),
  ('QUALIFIEE', 'Qualifiée', 40, false),
  ('CLOTUREE', 'Clôturée', 50, true)
on conflict (code) do nothing;

create table if not exists public.opportunites (
  id uuid primary key default gen_random_uuid(),
  reference text,
  -- « Piste / Portefeuille / Demande entrante / Partenaire → Opportunité »
  origine text,
  type_opportunite text,
  compte_id uuid references public.comptes (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  piste_id uuid references public.pistes (id) on delete set null,
  -- Le signal qui l'a déclenchée, quand il y en a un. Les signaux existent déjà (864 lignes) : on
  -- prépare le lien, l'automatisation viendra quand Michel aura fait le point dessus.
  signal_id uuid references public.signaux (id) on delete set null,
  statut_id uuid references public.statuts_opportunites (id) on delete set null,
  -- « Qualification de fin : Convertie | Non qualifiée | Perdue | Reportée | Annulée »
  qualification_fin text,
  motif_cloture text,
  date_cloture timestamptz,
  date_reactivation timestamptz,
  -- Le dernier prérequis de conversion, celui qu'aucune donnée ne peut déduire : « l'accord du client
  -- pour lancer une Recommandation ».
  accord_client boolean not null default false,
  -- La prochaine action, telle que la maquette la porte : un libellé, une échéance, et sa clôture.
  prochaine_action text,
  prochaine_action_echeance timestamptz,
  prochaine_action_faite_le timestamptz,
  -- LE SCORE ATTEND SES RÈGLES. Aucun calcul ne l'alimente : les barèmes (points par nature du
  -- déclencheur, multiplicateur d'urgence, décote journalière, seuils) n'ont pas encore été donnés.
  -- Une formule inventée ici classerait des opportunités réelles sur des chiffres imaginaires.
  score_maturite integer,
  commentaire text,
  proprietaire_id uuid references public.profils (id) on delete set null,
  cree_par_id uuid references public.profils (id) on delete set null,
  modifie_par_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

alter table public.opportunites drop constraint if exists opportunites_origine_check;
alter table public.opportunites add constraint opportunites_origine_check
  check (origine is null or origine = any (array['PISTE', 'PORTEFEUILLE', 'DEMANDE_ENTRANTE', 'PARTENAIRE']));

alter table public.opportunites drop constraint if exists opportunites_qualification_check;
alter table public.opportunites add constraint opportunites_qualification_check
  check (qualification_fin is null or qualification_fin = any (array['CONVERTIE', 'NON_QUALIFIEE', 'PERDUE', 'REPORTEE', 'ANNULEE']));

alter table public.pistes drop constraint if exists pistes_opportunite_fk;
alter table public.pistes
  add constraint pistes_opportunite_fk foreign key (opportunite_id) references public.opportunites (id) on delete set null;

-- LE PÉRIMÈTRE. « Elle peut concerner plusieurs sites, immeubles ou compteurs. » Deux tables de
-- liaison plutôt qu'une colonne : un syndic apporte plusieurs immeubles, et tous les compteurs d'un
-- immeuble n'entrent pas forcément dans l'opportunité.
create table if not exists public.opportunites_sites (
  id uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  date_creation timestamptz not null default now(),
  unique (opportunite_id, site_id)
);

create table if not exists public.opportunites_compteurs (
  id uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites (id) on delete cascade,
  compteur_id uuid not null references public.compteurs (id) on delete cascade,
  date_creation timestamptz not null default now(),
  unique (opportunite_id, compteur_id)
);

-- LE LIEN VERS LES RECOMMANDATIONS. Facultatif, et il le restera : les 1 707 recommandations
-- existantes sont nées avant l'opportunité, leur en inventer une serait écrire une histoire qui n'a
-- pas eu lieu.
alter table public.recommandations
  add column if not exists opportunite_id uuid references public.opportunites (id) on delete set null;

-- ══ 4. REQUÊTE ══════════════════════════════════════════════════════════════
--
-- « Un autre objet actif mais parallèle à la chaîne commerciale. Elle sert à traiter et résoudre un
-- problème ou une demande : facturation, contrat, compteur, fournisseur, document, réclamation. »
create table if not exists public.statuts_requetes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text,
  icone text,
  est_cloture boolean not null default false,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

insert into public.statuts_requetes (code, libelle, ordre, est_cloture) values
  ('NOUVELLE', 'Nouvelle', 10, false),
  ('EN_TRAITEMENT', 'En traitement', 20, false),
  ('RESOLUE', 'Résolue', 30, true),
  ('ABANDONNEE', 'Abandonnée', 40, true)
on conflict (code) do nothing;

create table if not exists public.requetes (
  id uuid primary key default gen_random_uuid(),
  reference text,
  -- Le sujet, tel que Michel l'énumère.
  categorie text,
  objet text,
  description text,
  resolution text,
  -- Ce que la requête concerne. Tout est facultatif : une réclamation peut arriver avant qu'on
  -- sache à quel compteur elle se rattache.
  compte_id uuid references public.comptes (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  compteur_id uuid references public.compteurs (id) on delete set null,
  contrat_id uuid references public.contrats (id) on delete set null,
  statut_id uuid references public.statuts_requetes (id) on delete set null,
  date_echeance timestamptz,
  date_resolution timestamptz,
  proprietaire_id uuid references public.profils (id) on delete set null,
  cree_par_id uuid references public.profils (id) on delete set null,
  modifie_par_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

alter table public.requetes drop constraint if exists requetes_categorie_check;
alter table public.requetes add constraint requetes_categorie_check
  check (categorie is null or categorie = any (array[
    'FACTURATION', 'CONTRAT', 'COMPTEUR', 'FOURNISSEUR', 'DOCUMENT', 'RECLAMATION', 'AUTRE'
  ]));

-- ══ 5. RÉMUNÉRATION ═════════════════════════════════════════════════════════
--
-- Objet PASSIF chez Michel — « ce que Kimatch sait » — et bout de chaîne : « Contrat via KiWee →
-- Recommandation acceptée → Rémunération. Contrat hors KiWee → Recommandation acceptée mais pas de
-- rémunération KiWee, sauf exception. »
create table if not exists public.remunerations (
  id uuid primary key default gen_random_uuid(),
  reference text,
  -- Ce qui la produit. Le contrat d'abord : c'est sa signature qui ouvre le droit.
  contrat_id uuid references public.contrats (id) on delete set null,
  recommandation_id uuid references public.recommandations (id) on delete set null,
  compte_id uuid references public.comptes (id) on delete set null,
  fournisseur_compte_id uuid references public.comptes (id) on delete set null,
  -- Attendue puis perçue : l'écart entre les deux est le suivi.
  montant_attendu_ht numeric,
  montant_percu_ht numeric,
  date_attendue date,
  date_perception date,
  -- « Sauf exception » : un contrat hors Kiwee peut donner lieu à rémunération, et il faut pouvoir
  -- dire pourquoi.
  hors_kiwee boolean not null default false,
  motif_exception text,
  commentaire text,
  statut text,
  proprietaire_id uuid references public.profils (id) on delete set null,
  cree_par_id uuid references public.profils (id) on delete set null,
  modifie_par_id uuid references public.profils (id) on delete set null,
  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

alter table public.remunerations drop constraint if exists remunerations_statut_check;
alter table public.remunerations add constraint remunerations_statut_check
  check (statut is null or statut = any (array['ATTENDUE', 'FACTUREE', 'PERCUE', 'ANNULEE']));

-- ══ Les index dont les écrans ont besoin ════════════════════════════════════
create index if not exists idx_opportunites_compte on public.opportunites (compte_id);
create index if not exists idx_opportunites_statut on public.opportunites (statut_id);
create index if not exists idx_opportunites_echeance on public.opportunites (prochaine_action_echeance)
  where prochaine_action_echeance is not null;
create index if not exists idx_recommandations_opportunite on public.recommandations (opportunite_id)
  where opportunite_id is not null;
create index if not exists idx_pistes_compte on public.pistes (compte_id);
create index if not exists idx_requetes_compte on public.requetes (compte_id);
create index if not exists idx_requetes_statut on public.requetes (statut_id);
create index if not exists idx_remunerations_contrat on public.remunerations (contrat_id);

-- ══ RLS ET AUDIT, comme les tables existantes ═══════════════════════════════
--
-- MÊME RÈGLE QUE PARTOUT AILLEURS : `authenticated_all`, ouverte aux personnes connectées. C'est le
-- choix fait le 14/08 pour tout Kimatch — « l'outil est celui d'une équipe de dix personnes qui se
-- remplacent ». Une table créée sans politique serait MUETTE pour l'application : RLS est actif par
-- défaut et refuse tout tant qu'aucune politique ne l'autorise.
--
-- LA POLITIQUE VA SUR LES NEUF TABLES, LE DECLENCHEUR D'AUDIT SUR CINQ SEULEMENT. `fn_audit_trace`
-- ecrit `new.cree_par_id`, `new.proprietaire_id` et `new.modifie_par_id` : posee sur une table qui
-- n'a pas ces colonnes, elle fait echouer la moindre ecriture avec « record "new" has no field
-- "cree_par_id" ». C'est ce qui se passait sur les quatre tables ci-dessous, et cela cassait
-- justement l'ajout d'un site ou d'un compteur au perimetre — le cas des syndics. Verifie le
-- 23/08/2026 : aucune autre table de Kimatch ne porte ce declencheur sans ces colonnes, la
-- convention est donc bien « audit sur les objets metier, pas sur les tables de liaison ni sur les
-- referentiels de statuts ». Les liaisons n'ont rien a auditer (on les cree et on les supprime,
-- on ne les modifie pas) et les statuts ne bougent qu'en migration.
do $$
declare t text;
begin
  foreach t in array array['listes', 'pistes', 'opportunites', 'opportunites_sites',
                           'opportunites_compteurs', 'requetes', 'remunerations',
                           'statuts_opportunites', 'statuts_requetes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;

  -- Le declencheur, uniquement la ou les colonnes d'audit existent.
  foreach t in array array['listes', 'pistes', 'opportunites', 'requetes', 'remunerations']
  loop
    execute format('drop trigger if exists trg_audit_trace on public.%I', t);
    execute format('create trigger trg_audit_trace before insert or update on public.%I for each row execute function fn_audit_trace()', t);
  end loop;

  -- Le retrait des quatre tables posees a tort est fait en tete de fichier (section 0).
end $$;

commit;

-- Vérification après application (à coller tel quel) :
--
--   select table_name from information_schema.tables where table_schema='public'
--    and table_name in ('listes','pistes','opportunites','opportunites_sites',
--                       'opportunites_compteurs','requetes','remunerations',
--                       'statuts_opportunites','statuts_requetes') order by 1;
--   -- attendu : les 9 tables
--
--   select code, libelle from public.statuts_opportunites order by ordre;
--   -- attendu : Nouvelle, En qualification, En attente, Qualifiée, Clôturée
--
--   select count(*) from pg_policy where polrelid = 'public.opportunites'::regclass;
--   -- attendu : 1 — sans elle, la table serait muette pour l'application
