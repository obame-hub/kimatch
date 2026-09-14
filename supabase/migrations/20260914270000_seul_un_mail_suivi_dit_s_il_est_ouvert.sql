-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SEUL UN MAIL SUIVI DIT S'IL EST OUVERT — PAS LES APPELS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026, capture à l'appui : sur sa fiche contact, « pas encore ouvert » s'affichait
-- sur des APPELS SORTANTS et sur des documents. Un appel ne s'ouvre pas.
--
-- ══ MA PROPRE CONTRADICTION, EN DEUX LIGNES ══════════════════════════════════════════════════
--
-- Le composant filtrait ainsi :
--
--     if (i.sens !== 'SORTANT') return null
--     // `nb_ouvertures` vaut 0 sur un mail suivi jamais ouvert, et `null` sur ce qui n'est pas suivi
--     if (i.nb_ouvertures === null) return null
--
-- Le commentaire dit vrai de ce que je VOULAIS ; la migration 20260914210000 a écrit le contraire :
--
--     add column if not exists nb_ouvertures integer not null default 0
--
-- `not null default 0` : les 20 731 appels, les notes, les mails reçus portent donc 0 comme un mail
-- jamais ouvert. Et un appel sortant EST de sens SORTANT. Les deux garde-fous tombaient ensemble.
--
-- ══ LA BONNE QUESTION N'EST PAS « COMBIEN D'OUVERTURES » ═════════════════════════════════════
--
-- C'est « CE MESSAGE PORTE-T-IL UN PIXEL ». Un seul champ le dit : `jeton_ouverture`, posé par
-- `api/gmail/send.ts` sur les mails HTML partis de Kimatch, et sur eux seuls.
--
-- ON NE L'ENVOIE PAS AU NAVIGATEUR. Ce jeton EST le secret qui permet de compter une ouverture :
-- le livrer à chaque lecture d'activité le ferait circuler dans toutes les fiches, alors qu'il
-- n'existe que pour voyager dans un mail. On expose donc une colonne calculée qui ne dit que
-- « oui / non », et le secret reste en base.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists ouverture_suivie boolean
    generated always as (jeton_ouverture is not null) stored;

comment on column public.interactions.ouverture_suivie is
  'Ce message porte-t-il un pixel de suivi ? Vrai uniquement sur les mails HTML envoyés depuis '
  'Kimatch. C''est la SEULE condition qui autorise à afficher « ouvert » ou « pas encore ouvert » : '
  '`nb_ouvertures` vaut 0 partout ailleurs, appels compris, parce que la colonne est NOT NULL '
  'DEFAULT 0. Calculée depuis `jeton_ouverture`, dont la valeur ne sort jamais de la base.';

-- Le flux d'activité lit « ce message est-il suivi » sur chaque ligne affichée. L'index ne porte
-- que sur les vrais : ils sont une poignée face aux 82 000 interactions.
create index if not exists idx_interactions_ouverture_suivie
  on public.interactions (ouverture_suivie) where ouverture_suivie;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UN APPEL NE DIT PLUS QU'IL N'EST PAS OUVERT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- C'est exactement le défaut qu'elle a vu. On crée un appel sortant et un mail suivi, et on vérifie
-- que la colonne les distingue — puis on regarde combien d'interactions en production sont
-- réellement suivies, parce que le chiffre doit être petit et qu'il dit tout.
--
do $$
declare
  type_appel  uuid;
  type_email  uuid;
  piste_essai uuid;
  appel       uuid;
  mail        uuid;
  relu_a      record;
  relu_m      record;
  suivies     integer;
  sortants    integer;
begin
  select id into type_appel from public.types_interactions where code = 'APPEL';
  select id into type_email from public.types_interactions where code = 'EMAIL';
  select id into piste_essai from public.pistes limit 1;

  insert into public.interactions (type_interaction_id, date_interaction, objet, sens, piste_id)
  values (type_appel, now(), 'Garde-fou appel', 'SORTANT', piste_essai) returning id into appel;

  insert into public.interactions
    (type_interaction_id, date_interaction, objet, sens, piste_id, jeton_ouverture)
  values (type_email, now(), 'Garde-fou mail', 'SORTANT', piste_essai, gen_random_uuid())
  returning id into mail;

  select * into relu_a from public.interactions where id = appel;
  select * into relu_m from public.interactions where id = mail;

  if relu_a.ouverture_suivie then
    raise exception 'Un appel sortant se déclare suivi : le défaut du 14/09 est toujours là.';
  end if;
  if not relu_m.ouverture_suivie then
    raise exception 'Un mail porteur de jeton ne se déclare pas suivi : rien ne s''afficherait.';
  end if;
  -- Les deux portent bien 0, et c'est précisément pourquoi `nb_ouvertures` ne peut pas trancher.
  if relu_a.nb_ouvertures <> 0 or relu_m.nb_ouvertures <> 0 then
    raise exception 'Le compte d''ouvertures ne part pas de zéro.';
  end if;

  delete from public.interactions where id in (appel, mail);

  select count(*) filter (where ouverture_suivie)::integer,
         count(*) filter (where sens = 'SORTANT')::integer
    into suivies, sortants from public.interactions;

  raise notice 'Garde-fou : % interaction(s) réellement suivie(s) sur % sortantes — les appels ne mentent plus.',
    suivies, sortants;
end $$;

commit;
