-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN NUMÉRO SE RECONNAÎT MÊME QUAND IL EST ÉCRIT AUTREMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Thomas, 21/09/2026, sur la fenêtre de fin d'appel : « comme ça m'affiche que le numéro de
-- téléphone, je sais même pas à qui ça correspond, donc je peux pas dire si j'ai eu ou pas ».
--
-- Il a raison, et c'est pire que ce qu'il croit : sur 262 appels non qualifiés des trente derniers
-- jours, 199 ne portent QUE le numéro — ni contact, ni compte, ni piste.
--
-- ══ LE DÉFAUT N'EST PAS QU'ON NE CHERCHE PAS, C'EST QU'ON CHERCHE MAL ══
--
-- `api/allo/webhook.ts` reconnaît déjà l'appelant, avec la bonne intention — comparer les neuf
-- derniers chiffres pour faire tomber l'indicatif. Mais il le fait en SQL par
-- `telephone like '%612345678'`, c'est-à-dire sur la CHAÎNE BRUTE. Or 1 319 numéros sont écrits
-- avec des espaces ou des points (« 06 12 34 56 78 ») : le motif ne peut pas les atteindre.
--
-- Mesuré sur les 85 numéros orphelins encore présents : la méthode actuelle en reconnaît 3, la
-- comparaison sur les chiffres seuls en reconnaît 18. Six fois plus, sans changer une seule donnée.
--
-- ══ POURQUOI UNE FONCTION EN BASE PLUTÔT QUE DU CODE ══
--
-- Trois endroits posent la même question — le webhook qui reçoit l'appel, la carte qui l'affiche,
-- et le clic-pour-appeler qui part d'une fiche. Écrite trois fois, la règle divergerait à la
-- première correction. Écrite ici, elle est la même pour tout le monde, et un index la rend
-- utilisable sans parcourir 3 880 lignes à chaque sonnerie.
--
-- ON GARDE NEUF CHIFFRES, ET C'EST VOLONTAIRE. Dix feraient tomber les numéros stockés sans le zéro
-- initial, neuf suffisent à distinguer deux abonnés français, et c'est déjà la maille que le
-- webhook avait choisie.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fin_numero(numero text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(numero, ''), '[^0-9]', '', 'g'), 9), '')
$$;

comment on function public.fin_numero(text) is
  'Les neuf derniers chiffres d''un numéro, séparateurs et indicatif retirés. Sert à reconnaître '
  'un appelant quel que soit le format de saisie : « +33 6 12 34 56 78 », « 06 12 34 56 78 » et '
  '« 0612345678 » rendent tous « 612345678 ». Immutable, donc indexable.';

-- Les index qui rendent la reconnaissance instantanée : sans eux, chaque appel entrant parcourrait
-- les 3 261 contacts puis les 3 880 pistes pendant que le téléphone sonne.
create index if not exists idx_contacts_fin_telephone on contacts (public.fin_numero(telephone));
create index if not exists idx_contacts_fin_mobile    on contacts (public.fin_numero(telephone_mobile));
create index if not exists idx_pistes_fin_telephone   on pistes   (public.fin_numero(telephone));
create index if not exists idx_pistes_fin_mobile      on pistes   (public.fin_numero(telephone_mobile));

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- QUI APPELLE : UNE SEULE QUESTION, UNE SEULE RÉPONSE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le webhook, la carte d'appel et le clic-pour-appeler posent tous la même question. Écrite trois
-- fois, elle divergerait à la première correction — c'est exactement ce qui vient d'arriver avec le
-- `LIKE`. Elle est donc écrite ici, une fois.
--
-- L'ORDRE COMPTE : un contact connu l'emporte sur une piste. Une piste est un prospect qu'on n'a
-- pas encore qualifié ; si le numéro correspond aux deux, c'est que la piste a été convertie, et
-- c'est la fiche client qui intéresse le commercial au moment où il décroche.
create or replace function public.qui_appelle(p_numero text)
returns table (contact_id uuid, compte_id uuid, piste_id uuid, nom text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cible as (select public.fin_numero(p_numero) as fin),
  le_contact as (
    select c.id, c.compte_id,
           nullif(trim(coalesce(c.prenom,'') || ' ' || coalesce(c.nom,'')), '') as nom
      from contacts c, cible
     where cible.fin is not null
       and (public.fin_numero(c.telephone) = cible.fin
         or public.fin_numero(c.telephone_mobile) = cible.fin)
     limit 1
  ),
  la_piste as (
    select p.id,
           coalesce(nullif(p.societe, ''), nullif(p.contact_nom, '')) as nom
      from pistes p, cible
     where cible.fin is not null
       and p.actif
       and (public.fin_numero(p.telephone) = cible.fin
         or public.fin_numero(p.telephone_mobile) = cible.fin)
       and not exists (select 1 from le_contact)
     limit 1
  )
  select id, compte_id, null::uuid, nom from le_contact
  union all
  select null::uuid, null::uuid, id, nom from la_piste
$$;

comment on function public.qui_appelle(text) is
  'À qui appartient ce numéro : un contact d''abord, une piste à défaut. Rend aussi le nom, pour '
  'que la fenêtre de fin d''appel dise « Olivia Jat » au lieu d''un numéro que personne ne '
  'reconnaît. Un contact l''emporte sur une piste : si les deux répondent, la piste a été '
  'convertie et c''est la fiche client qui compte.';

grant execute on function public.qui_appelle(text) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES CINQ ÉCRITURES D'UN MÊME NUMÉRO DOIVENT SE REJOINDRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- C'est toute la raison d'être de cette fonction. On éprouve les formats réellement mesurés dans
-- les fiches — `+33…`, `0033…`, espaces, points, brut — et le cas qui doit ÉCHOUER : deux abonnés
-- différents ne doivent pas se confondre, sans quoi un appel serait attribué au mauvais client.
--
do $$
declare
  attendu text := '612345678';
begin
  if public.fin_numero('+33 6 12 34 56 78') is distinct from attendu
     or public.fin_numero('0033612345678')  is distinct from attendu
     or public.fin_numero('06 12 34 56 78') is distinct from attendu
     or public.fin_numero('06.12.34.56.78') is distinct from attendu
     or public.fin_numero('0612345678')     is distinct from attendu
     or public.fin_numero('33612345678')    is distinct from attendu then
    raise exception 'Deux écritures du même numéro ne se rejoignent pas.';
  end if;

  if public.fin_numero('0612345679') = attendu then
    raise exception 'Deux numéros différents sont confondus : un appel serait attribué au mauvais client.';
  end if;

  if public.fin_numero(null) is not null or public.fin_numero('') is not null then
    raise exception 'Un numéro absent doit rendre null, pour ne jamais s''apparier avec un autre vide.';
  end if;

  raise notice 'Garde-fou : les six écritures se rejoignent, deux abonnés distincts restent distincts.';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU DE `qui_appelle` : UN NUMÉRO INCONNU NE DOIT DÉSIGNER PERSONNE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque de cette fonction n'est pas de ne rien trouver, c'est de désigner LE MAUVAIS CLIENT :
-- un appel attribué à quelqu'un d'autre écrit une fausse histoire dans sa fiche, et rien ne le
-- signale. On vérifie donc les deux bords — un numéro absurde ne rend rien, et un numéro réel rend
-- une seule ligne, celle de son propriétaire.
--
do $$
declare
  n_inconnu int;
  v_tel     text;
  v_id      uuid;
  v_trouve  uuid;
  n_lignes  int;
begin
  select count(*) into n_inconnu from public.qui_appelle('+33 9 99 99 99 98');
  if n_inconnu <> 0 then
    raise exception 'Un numéro inconnu désigne quelqu''un : % ligne(s).', n_inconnu;
  end if;

  -- Un contact réel, repris avec une écriture DIFFÉRENTE de celle qui est stockée.
  select c.id, c.telephone into v_id, v_tel
    from public.contacts c
   where public.fin_numero(c.telephone) is not null
   order by c.date_creation desc
   limit 1;

  if v_id is null then
    raise notice 'Aucun contact avec téléphone — contrôle de reconnaissance sauté.';
  else
    select count(*) into n_lignes from public.qui_appelle('+33 ' || public.fin_numero(v_tel));
    select contact_id into v_trouve from public.qui_appelle('+33 ' || public.fin_numero(v_tel)) limit 1;
    if n_lignes <> 1 then
      raise exception 'Un numéro connu rend % ligne(s) au lieu d''une seule.', n_lignes;
    end if;
    if v_trouve is distinct from v_id then
      raise exception 'L''appel serait attribué au mauvais contact (% au lieu de %).', v_trouve, v_id;
    end if;
    raise notice 'Garde-fou : un numéro connu désigne son propriétaire, un inconnu ne désigne personne.';
  end if;
end $$;

commit;
