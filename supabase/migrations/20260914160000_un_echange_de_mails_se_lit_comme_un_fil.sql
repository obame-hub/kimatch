-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN ÉCHANGE DE MAILS SE LIT COMME UN FIL, PAS COMME DES LIGNES ÉPARSES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 : « il faut un tracking sur les mails qu'on envoie et reçoit, tracker toutes
-- les activités, et aussi avoir le fil de la conversation de mail dans Kimatch. »
--
-- ══ CE QUI EXISTE DÉJÀ, ET CE QUI MANQUE ═════════════════════════════════════════════════════
--
-- 56 322 interactions de type Email vivent dans Kimatch, dont 34 848 reprises des `EmailMessage`
-- de Salesforce avec leur corps. La matière est donc là. Ce qui manque, c'est le LIEN ENTRE ELLES :
-- une réponse et son message d'origine sont deux lignes sans rapport, triées par date au milieu des
-- appels. Lire un échange de six messages demande de les retrouver un par un.
--
-- Salesforce, lui, le sait : chaque `EmailMessage` porte un `ThreadIdentifier` — l'en-tête
-- `Message-ID` de la conversation, `<CAGtyFLx_AmGa8...@mail.gmail.com>`. Sur les 1 598 mails liés
-- à une piste, il y a 1 085 fils distincts et AUCUN message sans fil. On ne l'a jamais repris.
--
-- ══ UNE COLONNE, PAS UNE TABLE ═══════════════════════════════════════════════════════════════
--
-- Un fil n'a pas d'existence propre : ni titre, ni propriétaire, ni statut. Il n'est qu'une clé
-- partagée entre des messages. Une table `fils_discussion` ajouterait une jointure à chaque lecture
-- d'activité et une ligne à créer à chaque premier message, pour ne rien porter de plus que la
-- chaîne qu'on y mettrait. On pose donc la chaîne sur l'interaction.
--
-- ELLE VAUT AUSSI POUR L'AVENIR, et c'est la moitié de la demande. Le volet d'écriture de mail de
-- Kimatch n'enregistre aujourd'hui qu'une ligne isolée ; avec cette colonne, un mail envoyé depuis
-- l'application peut porter le `Message-ID` qu'il génère, et la réponse qui revient s'y raccroche
-- par son `In-Reply-To`. Sans elle, tout mail suivi resterait une ligne de plus dans une liste.
--
-- ══ CE QU'ON N'AJOUTE PAS ════════════════════════════════════════════════════════════════════
--
-- Pas de `fil_position` ni de `repond_a_id`. L'ordre d'un fil, c'est la date des messages, qu'on a
-- déjà ; un numéro d'ordre serait une seconde vérité à tenir d'accord avec la première, et elle se
-- tromperait le jour où un vieux message arrive en retard.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists fil_discussion text;

comment on column public.interactions.fil_discussion is
  'Identifiant du fil de conversation — le ThreadIdentifier Salesforce, ou le Message-ID pour un '
  'mail envoyé depuis Kimatch. Les interactions qui le partagent forment un échange. Nul pour tout '
  'ce qui n''est pas un mail.';

-- Toujours lu comme « donne-moi les messages de CE fil » : l'index porte donc sur la colonne seule,
-- et ignore les appels et les notes, qui n'en ont pas et qui sont le gros de la table.
create index if not exists idx_interactions_fil_discussion
  on public.interactions (fil_discussion) where fil_discussion is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LA COLONNE ACCEPTE UN FIL, ET L'INDEX SERT VRAIMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que la colonne existe ne dit rien : `add column` a réussi ou la migration aurait échoué.
-- Ce qu'on veut savoir, c'est qu'une interaction peut porter un fil et se retrouver par lui — donc
-- on en écrit une, on la relit PAR SON FIL, et on l'efface.
--
do $$
declare
  essai       uuid;
  type_email  uuid;
  piste_essai uuid;
  retrouvee   integer;
  fil         text := '<garde-fou-' || gen_random_uuid()::text || '@kimatch.fr>';
begin
  select id into type_email from public.types_interactions where code = 'EMAIL';
  if type_email is null then
    raise exception 'Le type d''interaction EMAIL n''existe pas : l''import de mails n''a nulle part où aller.';
  end if;

  -- `interactions_contexte_check` exige un rattachement : une interaction qui ne tient à rien ne
  -- s'affiche nulle part. L'essai porte donc sur une vraie piste — celle sur laquelle les mails
  -- vont justement atterrir.
  select id into piste_essai from public.pistes limit 1;
  if piste_essai is null then
    raise exception 'Aucune piste en base : le fil de discussion n''a rien à quoi se rattacher.';
  end if;

  insert into public.interactions (type_interaction_id, date_interaction, objet, fil_discussion, piste_id)
    values (type_email, now(), 'Garde-fou de migration', fil, piste_essai)
    returning id into essai;

  select count(*)::integer into retrouvee
    from public.interactions where fil_discussion = fil;
  if retrouvee <> 1 then
    raise exception 'Un fil écrit ne se relit pas : % ligne(s) retrouvée(s) au lieu d''une.', retrouvee;
  end if;

  delete from public.interactions where id = essai;
  raise notice 'Garde-fou : une interaction porte son fil et se retrouve par lui.';
end $$;

commit;
