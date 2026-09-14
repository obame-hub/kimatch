-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RETROUVER LE FIL GMAIL DES CONVERSATIONS REPRISES DE SALESFORCE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : « oui fais le rattrapage des 1 082 conversations Salesforce ».
--
-- ══ POURQUOI ELLES SONT MUETTES ══════════════════════════════════════════════════════════════
--
-- Les 1 593 mails repris de Salesforce portent dans `fil_discussion` un `Message-ID` RFC —
-- `<CAGtyFLx_AmGa8...@mail.gmail.com>` — c'est-à-dire l'identifiant d'un MESSAGE, tandis que le
-- rapatriement des réponses interroge Gmail par identifiant de CONVERSATION, une suite
-- hexadécimale sans chevrons. Les deux ne se ressemblent que de loin.
--
-- Résultat : ces 1 082 conversations sont exclues du rapatriement (filtre `not like '<%'` dans
-- `api/gmail/rapatrier.ts`), et les réponses des clients qui s'y trouvent ne remonteront jamais.
--
-- Gmail sait faire la conversion : une recherche `rfc822msgid:` sur le Message-ID rend le message,
-- et donc son `threadId`. C'est ce que fait `scripts/retrouver-fils-gmail.cjs`.
--
-- ══ ON GARDE L'ANCIEN IDENTIFIANT, ET C'EST TOUT L'OBJET DE CETTE MIGRATION ══════════════════
--
-- Le rattrapage REMPLACE `fil_discussion` par l'identifiant Gmail. Sans copie de l'ancien, une
-- recherche qui se tromperait de message — deux mails au même sujet, un transfert, une liste de
-- diffusion — écraserait pour de bon la seule trace qui permettait de le vérifier. On ne saurait
-- même pas quelles lignes ont été touchées.
--
-- `fil_origine_salesforce` retient donc le Message-ID d'origine. Il sert à trois choses : revenir
-- en arrière, savoir quelles conversations viennent de la reprise, et ne pas rechercher deux fois
-- ce qui a déjà été trouvé.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists fil_origine_salesforce text;

comment on column public.interactions.fil_origine_salesforce is
  'Le `ThreadIdentifier` RFC que Salesforce portait avant que le rattrapage du 14/09/2026 ne le '
  'remplace par l''identifiant de conversation Gmail. Renseigné uniquement sur les lignes que ce '
  'rattrapage a touchées — il dit à la fois d''où elles viennent et comment revenir en arrière.';

-- Le script cherche « ce qui reste à convertir » : les Message-ID pas encore retrouvés. L'index
-- porte donc sur la colonne d'origine, la seule qui distingue le fait et le reste.
create index if not exists idx_interactions_fil_origine_salesforce
  on public.interactions (fil_origine_salesforce) where fil_origine_salesforce is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA CONVERSION EST RÉVERSIBLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- C'est la seule chose qui compte ici. On simule ce que fera le script — remplacer le fil en
-- gardant l'ancien — puis on revient en arrière, et on vérifie qu'on retrouve exactement l'état
-- de départ. Si le retour ne marche pas, le rattrapage ne doit pas être lancé.
--
do $$
declare
  type_email  uuid;
  piste_essai uuid;
  essai       uuid;
  ancien      text := '<garde-fou-' || gen_random_uuid()::text || '@mail.gmail.com>';
  relu        record;
begin
  select id into type_email from public.types_interactions where code = 'EMAIL';
  select id into piste_essai from public.pistes limit 1;

  insert into public.interactions
    (type_interaction_id, date_interaction, objet, sens, piste_id, fil_discussion)
  values (type_email, now(), 'Garde-fou de migration', 'SORTANT', piste_essai, ancien)
  returning id into essai;

  -- Ce que fera le script : on garde l'ancien, on pose l'identifiant Gmail.
  update public.interactions
     set fil_origine_salesforce = fil_discussion,
         fil_discussion = '18f2a3b4c5d6e7f8'
   where id = essai and fil_discussion like '<%';

  select * into relu from public.interactions where id = essai;
  if relu.fil_discussion <> '18f2a3b4c5d6e7f8' or relu.fil_origine_salesforce <> ancien then
    raise exception 'La conversion n''a pas gardé l''ancien identifiant : % / %',
      relu.fil_discussion, relu.fil_origine_salesforce;
  end if;

  -- Le retour en arrière, qui doit rendre l'état exact du départ.
  update public.interactions
     set fil_discussion = fil_origine_salesforce,
         fil_origine_salesforce = null
   where id = essai;

  select * into relu from public.interactions where id = essai;
  if relu.fil_discussion <> ancien or relu.fil_origine_salesforce is not null then
    raise exception 'Le retour en arrière ne rend pas l''état de départ : % / %',
      relu.fil_discussion, relu.fil_origine_salesforce;
  end if;

  delete from public.interactions where id = essai;
  raise notice 'Garde-fou : la conversion garde l''ancien fil, et le retour en arrière rend l''état exact.';
end $$;

commit;
