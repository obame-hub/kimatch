-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SAVOIR QUAND UN MAIL ENVOYÉ EST OUVERT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 : « tracker quand ils lisent l'email, quand ils ouvrent nos emails ».
--
-- ══ COMMENT ÇA MARCHE, ET CE QUE ÇA VAUT ═════════════════════════════════════════════════════
--
-- Le corps du mail porte une image d'un pixel, transparente, dont l'adresse désigne l'envoi. Quand
-- le destinataire affiche le message, son client demande l'image, et nous savons qu'elle a été
-- demandée. Il n'existe pas d'autre moyen : un mail ne prévient pas qu'on le lit.
--
-- TROIS LIMITES, ET IL FAUT LES DIRE PLUTÔT QUE LES DÉCOUVRIR :
--
--   1. GMAIL RECOPIE LES IMAGES SUR SES SERVEURS avant de les afficher. La demande arrive donc de
--      Google, parfois AVANT que la personne ouvre le message. Une ouverture peut être un
--      préchargement.
--   2. QUI BLOQUE LES IMAGES NE COMPTERA JAMAIS, même en ayant lu. Beaucoup de clients d'entreprise
--      le font par défaut : l'absence d'ouverture ne prouve rien.
--   3. L'EXPÉDITEUR LUI-MÊME déclenche le pixel s'il relit son envoi dans ses « Envoyés ».
--
-- Conséquence assumée : `nb_ouvertures` est un INDICE, jamais une preuve. On garde donc le compte
-- ET les dates — « ouvert 4 fois, la dernière hier » se lit autrement que « ouvert une fois il y a
-- trois semaines » — et l'écran dit que c'est indicatif au lieu de laisser croire à une certitude.
--
-- ══ LE JETON EST LE SECRET, IL N'Y A RIEN À SIGNER ═══════════════════════════════════════════
--
-- L'adresse du pixel porte un `uuid` tiré au hasard, propre à l'envoi. Il ne se devine pas, et il
-- ne désigne que ce mail-là : personne ne peut fabriquer d'ouvertures sur un autre échange, ni
-- remonter d'une adresse à l'identifiant d'une interaction. Une signature HMAC ferait la même chose
-- en exigeant une clé de plus à configurer et à ne jamais perdre.
--
-- PAS DE VALEUR PAR DÉFAUT SUR LA COLONNE : la table porte 82 000 lignes, dont 80 000 qui ne sont
-- pas des mails sortants. Un `default gen_random_uuid()` réécrirait la table entière pour donner un
-- secret à des appels téléphoniques. Le jeton se pose à l'envoi, là où il sert.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists jeton_ouverture uuid,
  add column if not exists premiere_ouverture_le timestamptz,
  add column if not exists derniere_ouverture_le timestamptz,
  add column if not exists nb_ouvertures integer not null default 0;

comment on column public.interactions.jeton_ouverture is
  'Le secret qui identifie cet envoi dans l''adresse du pixel de suivi. Tiré au hasard à l''envoi, '
  'posé uniquement sur les mails partis de Kimatch.';
comment on column public.interactions.nb_ouvertures is
  'Combien de fois l''image de suivi a été demandée. INDICE ET NON PREUVE : Gmail précharge les '
  'images, un client qui les bloque ne comptera jamais, et l''expéditeur qui relit son envoi '
  'compte aussi. Voir l''en-tête de la migration 20260914210000.';

-- Le pixel cherche l'envoi PAR SON JETON, et rien d'autre : c'est la seule lecture de cette
-- colonne, et elle doit être immédiate — un mail ouvert n'attend pas.
create unique index if not exists idx_interactions_jeton_ouverture
  on public.interactions (jeton_ouverture) where jeton_ouverture is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UNE OUVERTURE S'ENREGISTRE, ET LA DEUXIÈME NE REMPLACE PAS LA PREMIÈRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le défaut à ne pas laisser passer serait d'écraser `premiere_ouverture_le` à chaque demande : on
-- perdrait le délai entre l'envoi et la lecture, qui est justement ce qu'on veut savoir. On simule
-- donc deux ouvertures et on vérifie que la première date tient.
--
do $$
declare
  piste_essai uuid;
  type_email  uuid;
  essai       uuid;
  jeton       uuid := gen_random_uuid();
  relu        record;
  t1          timestamptz;
begin
  select id into type_email from public.types_interactions where code = 'EMAIL';
  select id into piste_essai from public.pistes limit 1;
  if type_email is null or piste_essai is null then
    raise exception 'Type EMAIL ou piste absents : le garde-fou n''a rien sur quoi écrire.';
  end if;

  insert into public.interactions
    (type_interaction_id, date_interaction, objet, sens, piste_id, jeton_ouverture)
  values (type_email, now(), 'Garde-fou de migration', 'SORTANT', piste_essai, jeton)
  returning id into essai;

  /* `clock_timestamp()` ET NON `now()`, et c'est le premier essai qui l'a appris : `now()` rend
     l'heure de DÉBUT DE TRANSACTION et ne bouge pas à l'intérieur. Les deux ouvertures portaient
     donc la même date, et le garde-fou refusait — à juste titre. En production chaque demande du
     pixel est sa propre transaction, l'écart se serait vu ; ici il ne se serait jamais vu.
     `clock_timestamp()` donne l'instant de l'écriture : plus juste des deux côtés, et testable. */
  update public.interactions
     set premiere_ouverture_le = coalesce(premiere_ouverture_le, clock_timestamp()),
         derniere_ouverture_le = clock_timestamp(),
         nb_ouvertures = nb_ouvertures + 1
   where jeton_ouverture = jeton;
  select premiere_ouverture_le into t1 from public.interactions where id = essai;

  -- Seconde ouverture, une seconde plus tard : seule la dernière doit bouger.
  perform pg_sleep(1);
  update public.interactions
     set premiere_ouverture_le = coalesce(premiere_ouverture_le, clock_timestamp()),
         derniere_ouverture_le = clock_timestamp(),
         nb_ouvertures = nb_ouvertures + 1
   where jeton_ouverture = jeton;

  select * into relu from public.interactions where id = essai;

  if relu.nb_ouvertures <> 2 then
    raise exception 'Deux ouvertures comptées % fois.', relu.nb_ouvertures;
  end if;
  if relu.premiere_ouverture_le <> t1 then
    raise exception 'La première ouverture a été écrasée : le délai entre envoi et lecture est perdu.';
  end if;
  if relu.derniere_ouverture_le <= t1 then
    raise exception 'La dernière ouverture n''a pas avancé.';
  end if;

  delete from public.interactions where id = essai;
  raise notice 'Garde-fou : deux ouvertures comptées, la première date tient, la dernière avance.';
end $$;

commit;
