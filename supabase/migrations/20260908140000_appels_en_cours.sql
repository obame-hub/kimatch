-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPELER DEPUIS KIMATCH, ET SUIVRE L'APPEL SANS OUVRIR ALLO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 08/09/2026 : « il faut qu'on puisse, comme on a dit dans l'appel, appeler depuis Kimatch,
-- raccrocher etc. sans devoir ouvrir Allo en externe ».
--
-- ══ CE QUE L'API D'ALLO PERMET, ET CE QU'ELLE NE PERMETTRA PAS ══
--
-- Relevé le 08/09/2026 sur la table complète portée-par-endpoint de la documentation d'Allo : une
-- soixantaine d'endpoints, vingt-trois événements de webhook, et AUCUN CONTRÔLE D'APPEL. Le Power
-- Dialer sait ajouter, configurer, vider et réinitialiser une file ; il ne sait ni décrocher ni
-- raccrocher. Un bouton « Raccrocher » dans Kimatch serait un bouton mort.
--
-- CE QUI REMPLACE LE RACCROCHAGE, et rend le détour par Allo inutile, ce sont trois événements :
--
--   call.triggered   l'appel sortant part          → la carte s'ouvre dans Kimatch
--   call.answered    le correspondant décroche     → le chrono part, on sait qu'il y a quelqu'un
--   call.completed   l'appel est fini              → durée, résultat, enregistrement, transcription
--
-- Le commercial n'a donc jamais à retourner dans Allo pour savoir où il en est : Kimatch le sait.
--
-- ══ TROIS CONTRAINTES DE L'API QUI DESSINENT CETTE TABLE ══
--
-- ① `call.triggered` NE PORTE AUCUN IDENTIFIANT D'APPEL. Il donne `user_email`, `to_number` et
--    `started_at`, rien de plus. L'identifiant `cll_…` n'arrive qu'avec `call.completed`. La ligne
--    naît donc sans identifiant Allo, et se fait reconnaître plus tard sur ce triplet.
--
-- ② `call.completed` ARRIVE ENVIRON 30 SECONDES APRÈS LE RACCROCHAGE — c'est écrit dans leur
--    documentation. Entre les deux, Kimatch ne peut pas savoir que l'appel est terminé. La carte
--    reste donc « en cours » une demi-minute, et le commercial peut la clore lui-même : c'est pour
--    ça que `termine_par` distingue ce que dit Allo de ce que fait la personne.
--
-- ③ LES ÉVÉNEMENTS ARRIVENT « AU MOINS UNE FOIS », doublons compris, et Allo demande de dédupliquer
--    sur l'en-tête `webhook-id`. D'où `webhooks_allo_recus`.
--
-- ══ L'IDENTIFIANT EST LE MÊME QUE CELUI DE L'IMPORT ══
--
-- `call.completed` rend `data.id` au format `cll_…` — exactement la valeur que l'import du 07/09/2026
-- a écrite dans `interactions.source_externe_id` pour 2 550 appels. Le webhook et l'import ne
-- peuvent donc pas se dupliquer : c'est la même clé, et `interactions_source_externe_id_idx` la
-- garde unique. Vérifié avant d'écrire cette migration.
--
-- ══ CE QUI N'EST PAS ICI ══
--
-- La qualification (humain / répondeur / serveur vocal) et le renvoi du tag vers Allo viendront
-- ensuite : ils n'ont de sens qu'une fois la carte à l'écran, et mélanger les deux dans une même
-- migration rendrait les deux plus difficiles à relire.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA DÉDUPLICATION DES ÉVÉNEMENTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Allo livre « au moins une fois » : un même événement peut arriver deux fois, notamment quand notre
-- réponse tarde et qu'il réessaie. Sans cette table, un `call.completed` rejoué écrirait une seconde
-- interaction — ou, pire, rouvrirait une carte d'appel déjà classée.
create table if not exists public.webhooks_allo_recus (
  webhook_id   text primary key,
  topic        text not null,
  recu_le      timestamptz not null default now()
);

comment on table public.webhooks_allo_recus is
  'Les identifiants d''événements Allo déjà traités. Allo livre « au moins une fois » et demande de '
  'dédupliquer sur l''en-tête webhook-id : cette table est cette déduplication.';

-- Le journal n'a pas à grossir indéfiniment. On ne purge pas ici — un `delete` planifié viendra si
-- le volume le demande — mais l'index de date rend cette purge instantanée le jour venu.
create index if not exists webhooks_allo_recus_recu_le_idx
  on public.webhooks_allo_recus (recu_le);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- L'APPEL EN COURS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.appels_en_cours (
  id uuid primary key default gen_random_uuid(),

  -- ── QUI APPELLE ──
  -- `user_email` est ce que l'événement donne ; `profil_id` est ce qu'on en déduit. On garde les
  -- DEUX : un commercial dont l'adresse Allo ne correspond à aucun profil Kimatch doit tout de même
  -- voir son appel, et l'adresse brute est la seule trace permettant de comprendre pourquoi.
  user_email  text not null,
  profil_id   uuid references public.profils (id) on delete set null,

  -- ── QUI EST APPELÉ ──
  numero            text not null,
  numero_normalise   text,
  sens              text not null check (sens in ('ENTRANT', 'SORTANT')),

  -- Ce que Kimatch a reconnu au bout du fil. Aucun n'est obligatoire : un numéro inconnu reste un
  -- appel à afficher, et c'est même le cas le plus intéressant en prospection.
  contact_id  uuid references public.contacts (id) on delete set null,
  compte_id   uuid references public.comptes (id) on delete set null,
  piste_id    uuid references public.pistes (id) on delete set null,

  -- ── LA CHRONOLOGIE, TELLE QU'ALLO LA RACONTE ──
  demarre_le  timestamptz not null,
  decroche_le timestamptz,
  termine_le  timestamptz,

  /**
   * QUI A MIS FIN À LA CARTE.
   *
   * 'ALLO' quand `call.completed` est arrivé, 'COMMERCIAL' quand la personne a fermé la carte
   * elle-même sans attendre. La distinction n'est pas cosmétique : `call.completed` met environ
   * 30 secondes à arriver, et sans elle on ne saurait pas si une carte encore ouverte signifie
   * « appel en cours » ou « Allo ne nous a rien dit ».
   */
  termine_par text check (termine_par in ('ALLO', 'COMMERCIAL')),

  -- ── CE QU'ALLO REND À LA FIN ──
  source_externe_id text,           -- `cll_…`, absent avant `call.completed`
  resultat          text,           -- ANSWERED, VOICEMAIL, FAILED, BLOCKED, TRANSFERRED_*
  duree_secondes    integer,
  enregistrement_url text,
  transcription      text,
  resume_allo        text,

  /**
   * LE SERVEUR VOCAL, QU'ALLO COMPTE COMME UN DÉCROCHÉ.
   *
   * William, 08/09/2026 : « il y a plein de fois où Fabien tombait sur un répondeur et ça nous
   * disait que ça avait décroché — c'était marqué answered, sur un serveur interactif vocal. »
   *
   * `result` vaut effectivement ANSWERED dans ce cas. Mais `call.completed` porte AUSSI un champ
   * `ivr_result`, la liste des touches du menu vocal traversées : non vide, l'appel a rencontré une
   * machine. C'est ce qui permet de corriger Allo au lieu de demander au commercial de le faire.
   */
  ivr_touches jsonb,

  actif boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.appels_en_cours is
  'Un appel Allo pendant qu''il a lieu, alimenté par les webhooks call.triggered / call.answered / '
  'call.completed. Existe parce que l''API d''Allo n''expose aucun contrôle d''appel : à défaut de '
  'pouvoir raccrocher depuis Kimatch, Kimatch sait où en est l''appel. La ligne naît SANS '
  'identifiant Allo — call.triggered n''en porte pas — et se fait reconnaître ensuite sur '
  '(user_email, numero, demarre_le).';

comment on column public.appels_en_cours.source_externe_id is
  'L''identifiant `cll_…` de l''appel chez Allo, connu seulement à `call.completed`. C''est la même '
  'valeur que `interactions.source_externe_id` : le webhook et l''import ne peuvent pas se dupliquer.';

-- ── COMMENT ON RETROUVE UNE LIGNE QUAND `call.completed` ARRIVE ─────────────────────────────────
--
-- Sur le triplet, faute d'identifiant au départ. L'index n'est pas unique : deux appels du même
-- commercial vers le même numéro à la même seconde sont invraisemblables, mais une contrainte
-- unique ferait ÉCHOUER le webhook dans ce cas plutôt que de le laisser passer, et perdre un appel
-- vaut moins qu'en dupliquer un.
create index if not exists appels_en_cours_reconnaissance_idx
  on public.appels_en_cours (user_email, numero, demarre_le desc);

-- Ce que l'écran interroge en permanence : mes appels encore ouverts.
create index if not exists appels_en_cours_ouverts_idx
  on public.appels_en_cours (profil_id, actif)
  where termine_le is null;

-- L'identifiant Allo, unique quand il est là — même forme que sur `interactions`, et pour la même
-- raison : partiel, parce que les lignes qui n'en ont pas encore sont toutes « nulles ».
create unique index if not exists appels_en_cours_source_externe_id_idx
  on public.appels_en_cours (source_externe_id)
  where source_externe_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LES POLITIQUES : SANS ELLES, LA TABLE EST MUETTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Toute table créée ici naît avec Row Level Security ACTIF et zéro politique — constaté le
-- 17/08/2026 sur trois tables d'une autre migration. RLS sans politique ne lève aucune erreur : il
-- rend zéro ligne et refuse les écritures. L'écran a l'air de marcher, et il est vide.
alter table public.appels_en_cours enable row level security;
alter table public.webhooks_allo_recus enable row level security;

-- LES APPELS SE LISENT PAR TOUS. Un appel en cours est une information d'équipe — savoir que Fabien
-- est au téléphone avec ce compte évite de l'appeler en même temps. C'est la convention des ~40
-- autres tables du schéma.
drop policy if exists authenticated_all on public.appels_en_cours;
create policy authenticated_all on public.appels_en_cours
  for all to authenticated using (true) with check (true);

-- LE JOURNAL DE DÉDUPLICATION, LUI, NE SE LIT PAS DEPUIS L'APPLICATION. Il ne contient rien
-- d'utile à un utilisateur, et le webhook y écrit avec la clé de service, hors RLS. Aucune
-- politique pour `authenticated` : la table est donc fermée, ce qui est ici l'état voulu et non un
-- oubli.
grant select, insert on public.webhooks_allo_recus to service_role;

-- ── LA DATE DE MODIFICATION, ET RIEN D'AUTRE ──────────────────────────────────────────────────
--
-- `mettre_a_jour_date_modification` et NON `fn_audit_trace`, alors que c'est ce dernier qui équipe
-- la plupart des tables métier. La raison est un calcul de volume, pas une préférence.
--
-- `fn_audit_trace` écrit dans `historique_modifications` UNE LIGNE PAR COLONNE MODIFIÉE. Or un seul
-- appel produit trois écritures successives — départ, décroché, fin — et la dernière remplit d'un
-- coup une dizaine de colonnes : résultat, durée, enregistrement, transcription, résumé, identifiant
-- Allo… Soit une quinzaine de lignes d'historique PAR APPEL. Sur les 10 893 appels déjà passés par
-- l'équipe, cela aurait fait plus de 150 000 lignes, dans une table qui en compte 137 643 au
-- 08/09/2026 : on aurait doublé l'historique de Kimatch avec du bruit d'appel, et noyé les
-- modifications que quelqu'un cherche vraiment.
--
-- L'historique utile d'un appel, c'est l'appel lui-même — il est déjà dans la ligne, horodaté trois
-- fois. Ce déclencheur ne fait donc que tenir `date_modification` à jour, ce dont la carte à l'écran
-- a besoin pour se rafraîchir. C'est la fonction que 13 tables du schéma utilisent déjà.
--
-- (`fn_touch_date_modification` fait exactement la même chose et n'équipe aucune table : une
-- duplication à nettoyer un jour, pas ici.)
drop trigger if exists trg_appels_en_cours_date_modification on public.appels_en_cours;
create trigger trg_appels_en_cours_date_modification
  before update on public.appels_en_cours
  for each row execute function public.mettre_a_jour_date_modification();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- On rejoue la vie d'un appel : il part, il décroche, il finit. Et on vérifie les deux choses qui
-- rendraient cette table inutile — qu'un appel puisse naître sans identifiant Allo, et que
-- l'identifiant reste unique quand il arrive.
do $$
declare
  v_appel uuid;
  v_second uuid;
  v_refuse boolean := false;
  v_ligne  public.appels_en_cours;
begin
  -- ① UN APPEL NAÎT SANS IDENTIFIANT. `call.triggered` n'en porte pas : si la colonne était
  --    obligatoire, aucune carte ne pourrait s'ouvrir.
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le)
  values ('zzz.test@kiwee-energie.fr', '+33999999999', 'SORTANT', now())
  returning id into v_appel;

  -- ② LE DÉCROCHÉ, PUIS LA FIN.
  update public.appels_en_cours set decroche_le = now() where id = v_appel;
  update public.appels_en_cours
     set termine_le = now(), termine_par = 'ALLO', source_externe_id = 'cll_ZZZTESTGARDEFOU',
         resultat = 'ANSWERED', duree_secondes = 42
   where id = v_appel;

  select * into v_ligne from public.appels_en_cours where id = v_appel;
  if v_ligne.decroche_le is null or v_ligne.termine_le is null then
    raise exception 'La chronologie de l''appel ne s''écrit pas. Rien n''est appliqué.';
  end if;
  if v_ligne.resultat is null or v_ligne.duree_secondes is null then
    raise exception 'Les données de fin d''appel ne s''écrivent pas. Rien n''est appliqué.';
  end if;

  -- `date_modification` NE PEUT PAS ÊTRE TESTÉE ICI, et c'est un piège qui m'a coûté un essai.
  -- `now()` rend l'horodatage de la TRANSACTION, pas de l'instruction : il est constant du `begin`
  -- au `commit`. Le déclencheur fait donc bien son travail, mais il écrit la même valeur que celle
  -- posée à l'insertion, et un test d'inégalité stricte échouerait sur une migration correcte.
  -- (`clock_timestamp()` avancerait, mais changer la fonction partagée par 13 tables pour rendre un
  -- garde-fou testable serait mettre la charrue avant les bœufs.)

  -- ③ DEUX APPELS NE PEUVENT PAS PORTER LE MÊME IDENTIFIANT ALLO.
  insert into public.appels_en_cours (user_email, numero, sens, demarre_le)
  values ('zzz.test@kiwee-energie.fr', '+33999999998', 'SORTANT', now())
  returning id into v_second;
  begin
    update public.appels_en_cours set source_externe_id = 'cll_ZZZTESTGARDEFOU' where id = v_second;
  exception when unique_violation then
    v_refuse := true;
  end;

  -- Rien à nettoyer dans les deux historiques : cette table n'est ni auditée ni journalisée à la
  -- suppression, par choix expliqué plus haut. Le `delete` ci-dessous suffit donc à ne rien laisser.
  delete from public.appels_en_cours where id in (v_appel, v_second);

  if not v_refuse then
    raise exception 'Deux appels peuvent porter le même identifiant Allo. Rien n''est appliqué.';
  end if;

  raise notice 'Garde-fou passé : un appel naît sans identifiant, sa chronologie s''écrit, et l''identifiant Allo reste unique.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Il reste DEUX GESTES HORS DE LA BASE, dans cet ordre :
--
--   ① Dans Allo → Réglages → Webhooks → « Ajouter un endpoint » :
--        https://kimatch.fr/api/allo/webhook
--      en cochant call.triggered, call.answered et call.completed.
--      LE `signing_secret` N'EST DONNÉ QU'UNE FOIS, à la création. Le coller aussitôt dans les
--      variables Vercel sous le nom ALLO_WEBHOOK_SECRET, et dans `.env.local` pour le local.
--
--      L'endpoint déjà présent (…aeomxfxbonrngwtbwhfv…) appartient à un AUTRE projet Supabase, pas
--      à Kimatch : il continue de servir ce à quoi il sert, on n'y touche pas.
--
--   ② Dans Allo → Réglages → Clés API, ajouter à la clé existante :
--        DIALING_QUEUE_READ_WRITE   le bouton « Appeler »
--        TAGS_WRITE                 renvoyer la qualification dans Allo
--        USERS_READ                 associer chaque commercial à son compte Allo
--
-- Vérification : `node scripts/verifier-cle-allo.cjs`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
