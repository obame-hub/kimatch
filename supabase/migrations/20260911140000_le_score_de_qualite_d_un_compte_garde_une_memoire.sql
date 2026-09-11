-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SCORE DE QUALITÉ D'UN COMPTE GARDE UNE MÉMOIRE
--
-- William, 11/09/2026, sur la carte du score du compte : « ajouter l'évolution du score par rapport
-- au dernier score enregistré, et la tendance d'évolution — le score est-il en train d'augmenter ou
-- de diminuer ».
--
-- ── LE POINT BLOQUANT : IL N'Y AVAIT AUCUN « DERNIER SCORE ENREGISTRÉ » ──
--
-- `v_qualite_compte` est une VUE. Le score se recalcule à chaque lecture depuis les compteurs, les
-- contrats et les responsables. Rien n'était conservé : la question « et hier, il valait combien ? »
-- n'avait pas de réponse possible, quelle que soit la requête.
--
-- Une mémoire devait donc être créée. Elle commence aujourd'hui, et c'est la limite honnête de cette
-- livraison : LE PREMIER JOUR, L'ÉCART VAUT ZÉRO POUR TOUT LE MONDE. Il se remplit à mesure que les
-- scores bougent.
--
-- ── UNE LIGNE SEULEMENT QUAND LE SCORE CHANGE ──
--
-- Et non une photographie quotidienne de tous les comptes. Deux raisons :
--
--   LA FORMULATION DE WILLIAM DEVIENT LITTÉRALE. « Le dernier score enregistré » est alors le
--   dernier score DIFFÉRENT, donc l'écart affiché a toujours un sens. Avec un relevé quotidien
--   systématique, « le dernier enregistré » serait celui d'hier — c'est-à-dire le même que
--   l'actuel dans la quasi-totalité des cas, et l'écart afficherait 0 en permanence.
--
--   LE VOLUME. 2 723 comptes × 365 jours font un million de lignes par an pour dire « rien n'a
--   changé ». En n'écrivant que les changements, la table reste de la taille de l'activité réelle.
--
-- ── LA TENDANCE SE LIT SUR TROIS RELEVÉS, PAS SUR DEUX ──
--
-- Avec deux points, « tendance » et « évolution » diraient exactement la même chose, et l'une des
-- deux lignes serait du remplissage. Sur trois, l'écart répond à « qu'est-ce qui vient de se
-- passer ? » et la tendance à « dans quel sens ça va ? » — un compte qui perd 5 puis regagne 8 a un
-- écart positif ET une tendance haussière ; un compte qui gagne 2 après en avoir perdu 20 a un
-- écart positif et une tendance baissière. Ce sont deux informations différentes.
--
-- ── L'ÉCRITURE EST RÉSERVÉE À LA TÂCHE PLANIFIÉE ──
--
-- La table porte une politique de LECTURE pour les connectés, et aucune politique d'écriture : seule
-- la clé de service, qu'emploie `/api/comptes/photographier-qualite`, peut y insérer. Un historique
-- qu'un navigateur peut écrire n'est plus un historique.
--
-- POURQUOI VERCEL ET NON pg_cron : l'extension est disponible mais non installée sur cette base, et
-- Vercel fait déjà tourner cinq tâches nocturnes. On suit le chemin existant plutôt que d'en ouvrir
-- un second — même raisonnement que pour l'expiration des mandats, le 21/08/2026.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.historiques_qualite_compte (
  id           uuid primary key default gen_random_uuid(),
  compte_id    uuid not null references public.comptes(id) on delete cascade,
  score        integer not null,
  nb_compteurs integer not null default 0,
  releve_le    timestamptz not null default now()
);

comment on table public.historiques_qualite_compte is
  'Les scores de qualité successifs d''un compte. Une ligne N''EST ÉCRITE QUE SI LE SCORE A CHANGÉ depuis la dernière : « le dernier score enregistré » est donc littéralement le dernier score différent, et l''écart affiché sur la fiche a toujours un sens.';

create index if not exists idx_historiques_qualite_compte_lecture
  on public.historiques_qualite_compte (compte_id, releve_le desc);

alter table public.historiques_qualite_compte enable row level security;

drop policy if exists lecture_par_les_connectes on public.historiques_qualite_compte;
create policy lecture_par_les_connectes on public.historiques_qualite_compte
  for select to authenticated using (true);

-- Aucune politique d'écriture : seule la tâche planifiée, qui passe par la clé de service, écrit.

create or replace function public.photographier_qualite_comptes()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ecrits integer;
begin
  with dernier as (
    select distinct on (compte_id) compte_id, score
    from historiques_qualite_compte
    order by compte_id, releve_le desc
  ),
  a_ecrire as (
    select q.compte_id, q.score::integer as score, coalesce(q.nb_compteurs, 0)::integer as nb_compteurs
    from v_qualite_compte q
    left join dernier d on d.compte_id = q.compte_id
    where d.compte_id is null or d.score is distinct from q.score::integer
  )
  insert into historiques_qualite_compte (compte_id, score, nb_compteurs)
  select compte_id, score, nb_compteurs from a_ecrire;

  get diagnostics v_ecrits = row_count;
  return v_ecrits;
end;
$$;

comment on function public.photographier_qualite_comptes is
  'Relève les scores de qualité qui ont changé depuis le dernier relevé. Appelée chaque nuit par /api/comptes/photographier-qualite. Rend le nombre de lignes écrites.';

create or replace function public.lire_tendance_qualite(p_compte_id uuid)
returns table (
  score_actuel    integer,
  score_precedent integer,
  releve_le       timestamptz,
  evolution       integer,
  tendance        text
)
language sql
stable
security invoker
set search_path = public
as $$
  with actuel as (
    select coalesce(q.score, 0)::integer as score
    from v_qualite_compte q where q.compte_id = p_compte_id
  ),
  releves as (
    select score, releve_le
    from historiques_qualite_compte
    where compte_id = p_compte_id
    order by releve_le desc
    limit 3
  ),
  precedent as (select score, releve_le from releves order by releve_le desc limit 1),
  ancien    as (select score from releves order by releve_le asc limit 1)
  select
    (select score from actuel),
    (select score from precedent),
    (select releve_le from precedent),
    (select score from actuel) - (select score from precedent),
    case
      when (select count(*) from releves) = 0 then 'INCONNUE'
      when (select score from actuel) > (select score from ancien) then 'HAUSSE'
      when (select score from actuel) < (select score from ancien) then 'BAISSE'
      else 'STABLE'
    end;
$$;

comment on function public.lire_tendance_qualite is
  'L''écart entre le score actuel d''un compte et son dernier score enregistré, plus la tendance sur les trois derniers relevés.';

grant execute on function public.lire_tendance_qualite(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PREMIER RELEVÉ, À JOUER UNE FOIS APRÈS L'APPLICATION
--
--   select photographier_qualite_comptes();   -- 2 723 lignes le 11/09/2026 (un relevé par compte)
--
-- Sans lui, la fiche n'aurait aucun point de comparaison jusqu'à la première nuit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
