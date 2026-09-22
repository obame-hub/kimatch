-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE RÉPONSE A UN SENS, ET C'EST LUI QU'ON GARDE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026, sur le score de santé de la relation : « le plus important est ce qu'il y
-- a dans cette réponse. Car s'il répond à un mail en nous disant qu'on l'emmerde et qu'il veut
-- plus jamais nous parler, impossible de lui accorder +30 car certes il y a eu réponse, mais une
-- réponse très négative. C'est l'analyse des réponses et des conversations qui doivent être
-- positifs ou négatifs et faire évoluer le score en ce sens. »
--
-- Compter les réponses était donc faux. Il faut LES LIRE. La colonne `sentiment` existait depuis
-- l'origine, en texte libre, et n'a jamais été remplie une seule fois sur 83 332 interactions.
-- On lui donne enfin un vocabulaire, et deux colonnes qui la rendent utilisable :
--
--   `sentiment`        POSITIF | NEUTRE | NEGATIF — rien d'autre, sinon le score devient illisible
--   `sentiment_source` IA ou HUMAIN — pour qu'une correction à la main ne soit jamais réécrite
--   `sentiment_motif`  la phrase qui justifie la valeur, en français
--
-- ══ POURQUOI LE MOTIF EST OBLIGATOIREMENT VISIBLE ══
--
-- Un score qui ne s'explique pas ne se conteste pas, donc ne se corrige pas, donc dérive. Le motif
-- est ce qui permet à un commercial de dire « non, ce n'est pas ça » et de cliquer.
--
-- ══ LA SOURCE N'EST PAS DÉCORATIVE ══
--
-- L'analyse repasse sur les fiches, et elle repassera encore. Sans `sentiment_source`, chaque
-- passage effacerait les corrections de la veille — c'est-à-dire exactement le travail que l'on
-- demande aux commerciaux de faire.

alter table public.interactions
  add column if not exists sentiment_source text,
  add column if not exists sentiment_motif text;

alter table public.interactions
  drop constraint if exists interactions_sentiment_check;
alter table public.interactions
  add constraint interactions_sentiment_check
  check (sentiment is null or sentiment in ('POSITIF', 'NEUTRE', 'NEGATIF'));

alter table public.interactions
  drop constraint if exists interactions_sentiment_source_check;
alter table public.interactions
  add constraint interactions_sentiment_source_check
  check (sentiment_source is null or sentiment_source in ('IA', 'HUMAIN'));

-- Le score ne lit que les interactions valencées d'une fiche : un index partiel suffit, et il
-- reste minuscule tant que l'analyse n'a pas tourné partout.
create index if not exists idx_interactions_sentiment
  on public.interactions (contact_id, date_interaction desc)
  where sentiment is not null and actif;

comment on column public.interactions.sentiment is
  'POSITIF | NEUTRE | NEGATIF — le sens de l''échange, pas le fait qu''il ait eu lieu.';
comment on column public.interactions.sentiment_source is
  'IA ou HUMAIN. Une valence posée à la main n''est jamais réécrite par l''analyse.';
comment on column public.interactions.sentiment_motif is
  'La phrase qui justifie la valence, affichée sous elle dans le fil d''activité.';
