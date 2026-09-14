-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- KIMATCH SAIT LIRE LES RÉPONSES À SES MAILS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14/09/2026 : « il faut un tracking sur les mails qu'on envoie et reçoit ». Naoëlle,
-- le même jour : « vas-y fais les deux, commence par les réponses ».
--
-- ══ CE QUI EXISTE, ET LE MUR QU'ON RENCONTRE ═════════════════════════════════════════════════
--
-- Kimatch envoie avec le Gmail de chacun (`api/gmail/send.ts`), et consigne l'envoi. Depuis ce
-- matin il enregistre aussi le fil Gmail, donc on SAIT dans quelle conversation on a écrit.
--
-- Mais la réponse du client arrive dans la boîte de l'expéditeur, pas chez nous. Pour aller la
-- chercher, il faut un droit de LECTURE sur Gmail — et l'autorisation demandée jusqu'ici ne
-- couvrait que l'envoi :
--
--     gmail.send + userinfo.email        ce qu'on avait
--     + gmail.readonly                   ce qu'il faut en plus
--
-- GOOGLE N'OFFRE PAS PLUS FIN. Il n'existe pas de droit « lire seulement les conversations que
-- cette application a commencées » : c'est toute la boîte ou rien. La restriction est donc dans
-- NOTRE code — le rapatriement ne regarde que les fils dont Kimatch connaît l'identifiant, ceux
-- qu'il a lui-même ouverts — et les deux colonnes ci-dessous servent à le rendre vérifiable.
--
-- ══ CONSÉQUENCE À DIRE AVANT DE LIVRER ═══════════════════════════════════════════════════════
--
-- Les 9 personnes déjà connectées devront REFAIRE la connexion Gmail. Un jeton ne gagne pas un
-- droit après coup ; Google le délivre à l'accord, et l'accord précédent ne portait que l'envoi.
-- Tant qu'une personne n'a pas réaccepté, ses envois continuent de partir normalement et seules
-- ses réponses ne rentrent pas. `lecture_autorisee` retient laquelle en est où, pour que l'écran
-- le dise au lieu de laisser croire que tout va bien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.profils_gmail_tokens
  add column if not exists lecture_autorisee boolean,
  add column if not exists date_dernier_rapatriement timestamptz,
  add column if not exists dernier_echec_rapatriement text;

comment on column public.profils_gmail_tokens.lecture_autorisee is
  'Ce jeton permet-il de LIRE la boîte, et pas seulement d''envoyer ? `null` = pas encore essayé, '
  'faux = Google a refusé (le droit gmail.readonly n''a pas été accordé, il faut refaire la '
  'connexion). Renseigné par /api/gmail/rapatrier, jamais deviné.';
comment on column public.profils_gmail_tokens.date_dernier_rapatriement is
  'Quand on est allé chercher les réponses pour la dernière fois. Sert à ne pas relire tout '
  'l''historique à chaque passage.';
comment on column public.profils_gmail_tokens.dernier_echec_rapatriement is
  'Le dernier message d''erreur, en clair. Une tâche de nuit qui échoue en silence est une tâche '
  'qu''on croit faite.';

-- ── LE SENS D'UN MAIL RAPATRIÉ ────────────────────────────────────────────────────────────────
-- `interactions.sens` accepte déjà ENTRANT / SORTANT : rien à ajouter. Ce qui manquait, c'est de
-- pouvoir retrouver vite tous les fils d'une personne pour aller les relire.
create index if not exists idx_interactions_fil_par_auteur
  on public.interactions (auteur_profil_id, fil_discussion)
  where fil_discussion is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES TROIS COLONNES TIENNENT, ET L'INDEX SERT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  un_profil uuid;
  relu      record;
  avait     boolean;
begin
  select profil_id into un_profil from public.profils_gmail_tokens limit 1;
  if un_profil is null then
    raise notice 'Aucun compte Gmail connecté : les colonnes sont posées, rien à vérifier dessus.';
    return;
  end if;

  select lecture_autorisee into avait from public.profils_gmail_tokens where profil_id = un_profil;

  update public.profils_gmail_tokens
     set lecture_autorisee = false,
         dernier_echec_rapatriement = 'essai de migration'
   where profil_id = un_profil;

  select * into relu from public.profils_gmail_tokens where profil_id = un_profil;
  if relu.lecture_autorisee is distinct from false
     or relu.dernier_echec_rapatriement <> 'essai de migration' then
    raise exception 'Les colonnes de suivi ne retiennent pas ce qu''on y écrit.';
  end if;

  -- On remet exactement ce qui était là : une migration ne laisse pas de trace dans les données.
  update public.profils_gmail_tokens
     set lecture_autorisee = avait, dernier_echec_rapatriement = null
   where profil_id = un_profil;

  raise notice 'Garde-fou : le suivi du rapatriement s''écrit et se relit sur les % compte(s) Gmail connecté(s).',
    (select count(*) from public.profils_gmail_tokens);
end $$;

commit;
