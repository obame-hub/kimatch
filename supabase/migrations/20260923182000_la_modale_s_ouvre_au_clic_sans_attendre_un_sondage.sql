-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA MODALE S'OUVRE AU CLIC, SANS ATTENDRE UN SONDAGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 23/09/2026 : « je veux que la modale apparaisse au moment de l'appel, pas 10 secondes
-- après ».
--
-- ══ POURQUOI ELLE ATTENDAIT ══
--
-- La modale guettait l'APPARITION d'une interaction non rattachée, par un sondage toutes les dix
-- secondes. C'était le bon choix tant que l'appel nous arrivait par le webhook d'Allo : on ne
-- pouvait pas savoir qu'un appel avait eu lieu autrement qu'en regardant régulièrement.
--
-- CE N'EST PLUS VRAI DEPUIS CE MATIN. Kimatch écrit l'appel lui-même au clic (migration
-- 20260923173000) : il sait à la milliseconde près qu'un appel commence, et pour quel objet. Guetter
-- ce qu'on vient soi-même d'écrire est une attente qu'on s'impose sans raison — jusqu'à dix
-- secondes de délai pour une information qu'on avait déjà.
--
-- ══ CE QUI CHANGE ICI ══
--
-- `ouvrir_appel_kimatch` ne rendait que l'identifiant de l'APPEL. La modale, elle, a besoin de
-- l'identifiant de l'INTERACTION — c'est sur elle que le rattachement s'écrit. On rend donc les
-- deux, et l'écran peut ouvrir la fenêtre sans rien demander à personne.
--
-- ON GARDE LE SONDAGE POUR AUTANT, et ce n'est pas une hésitation : un appel passé depuis le
-- téléphone mobile, ou composé directement dans Allo, n'a pas de clic dans Kimatch. Il continue
-- d'arriver par le webhook, et la modale doit s'ouvrir pour lui aussi. Le sondage cesse d'être le
-- chemin normal pour devenir le filet.
--
-- ══ CE QU'ON NE CHANGE PAS ══
--
-- Ni la durée, ni le résultat, ni le décroché : à l'instant du clic, l'appel n'a pas encore eu lieu.
-- Voir 20260923173000 pour le détail de ce refus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

/* ON REMPLACE LA FONCTION PAR UNE QUI REND DEUX VALEURS. `create or replace` ne peut pas changer le
   type de retour d'une fonction — Postgres refuse avec « cannot change return type of existing
   function ». On la supprime donc d'abord, et c'est sans risque : elle n'est appelée que depuis
   `src/lib/telephonie.tsx`, qui part dans le même déploiement. */
drop function if exists public.ouvrir_appel_kimatch(text, text);

create function public.ouvrir_appel_kimatch(
  p_numero text,
  p_email_allo text
)
returns table (appel_id uuid, interaction_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_appel        uuid;
  v_interaction  uuid;
  v_profil       uuid;
  v_type         uuid;
  v_contact      uuid;
  v_compte       uuid;
  v_piste        uuid;
  v_fin          text;
  v_maintenant   timestamptz := clock_timestamp();
  v_recent       uuid;
begin
  if p_numero is null or btrim(p_numero) = '' then
    return;
  end if;

  v_fin := public.fin_numero(p_numero);

  /* L'AUTEUR EST CELUI DU COMPTE ALLO, PAS CELUI QUI CLIQUE. Naoëlle opère le compte de William :
     ses appels doivent porter le même auteur que ceux qu'Allo écrira, sinon l'historique se
     scinderait en deux et la modale ne retrouverait pas ses petits. */
  select id into v_profil from public.profils where lower(email) = lower(p_email_allo) limit 1;
  if v_profil is null then
    return;
  end if;

  /* ══ ON NE ROUVRE PAS UN APPEL QU'ON VIENT D'OUVRIR ══
     Un double-clic, ou deux écrans qui composent le même numéro coup sur coup, ne doivent pas
     produire deux lignes. ON REND ALORS L'INTERACTION DÉJÀ ÉCRITE plutôt que rien : sans cela, le
     second clic n'ouvrirait aucune modale et paraîtrait sans effet. */
  select id into v_recent
    from public.appels_en_cours
   where user_email = lower(p_email_allo)
     and numero_normalise = v_fin
     and demarre_le > v_maintenant - interval '2 minutes'
   order by demarre_le desc
   limit 1;

  if v_recent is not null then
    select i.id into v_interaction
      from public.interactions i
     where i.ouverte_par_kimatch
       and i.auteur_profil_id = v_profil
       and public.fin_numero(i.numero_correspondant) = v_fin
       and i.date_interaction > v_maintenant - interval '2 minutes'
     order by i.date_interaction desc
     limit 1;
    return query select v_recent, v_interaction;
    return;
  end if;

  select q.contact_id, q.compte_id, q.piste_id
    into v_contact, v_compte, v_piste
    from public.qui_appelle(p_numero) q
   limit 1;

  insert into public.appels_en_cours (
    user_email, profil_id, numero, numero_normalise, sens, demarre_le,
    contact_id, compte_id, piste_id, ouvert_par_kimatch
  ) values (
    lower(p_email_allo), v_profil, p_numero, v_fin, 'SORTANT', v_maintenant,
    v_contact, v_compte, v_piste, true
  )
  returning id into v_appel;

  /* L'INTERACTION, TOUT DE SUITE — MAIS SEULEMENT SI ON SAIT OÙ LA RANGER.
     `interactions_contexte_check` exige au moins un contexte. Un numéro inconnu n'en a aucun :
     l'appel reste alors dans `appels_en_cours`, et « Appels à rattacher » le reprendra. */
  if v_contact is not null or v_compte is not null or v_piste is not null then
    select id into v_type from public.types_interactions where code = 'APPEL' limit 1;
    if v_type is not null then
      insert into public.interactions (
        type_interaction_id, date_interaction, objet, sens,
        numero_correspondant, auteur_profil_id,
        contact_id, compte_id, piste_id, ouverte_par_kimatch
      ) values (
        v_type, v_maintenant, 'Appel sortant', 'SORTANT',
        p_numero, v_profil,
        v_contact, v_compte, v_piste, true
      )
      returning id into v_interaction;
    end if;
  end if;

  return query select v_appel, v_interaction;
end $$;

comment on function public.ouvrir_appel_kimatch(text, text) is
  'Écrit l''appel et son interaction au clic « Appeler », sans attendre Allo — ses `call.completed` '
  'arrivent avec 11 à 43 minutes de retard (mesuré le 23/09/2026). Rend les DEUX identifiants : '
  'l''écran ouvre la modale de rattachement sur `interaction_id` immédiatement, au lieu de guetter '
  'son apparition par un sondage de dix secondes. `interaction_id` est nul quand le numéro n''est '
  'rattaché à aucune fiche — l''appel part alors dans « Appels à rattacher ».';

grant execute on function public.ouvrir_appel_kimatch(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : L'IDENTIFIANT RENDU DOIT DÉSIGNER UNE VRAIE INTERACTION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : ouvrir la modale sans attendre. Le RISQUE n'est pas qu'elle
-- s'ouvre en retard — ça se voit. C'est qu'elle s'ouvre sur un identifiant qui ne désigne rien, ou
-- pire, sur l'interaction d'un AUTRE appel : le rattachement irait alors se poser sur le mauvais
-- dossier, en silence, et personne ne s'en apercevrait avant longtemps.
--
-- On éprouve donc que l'identifiant rendu est bien celui de l'interaction qu'on vient d'écrire, et
-- qu'un second clic rend LE MÊME — pas un nouveau, pas null.
--
do $$
declare
  v_contact uuid;
  v_tel     text;
  v_a1      uuid; v_i1 uuid;
  v_a2      uuid; v_i2 uuid;
  v_n       integer;
begin
  select c.id, c.telephone_mobile into v_contact, v_tel
    from public.contacts c
   where c.telephone_mobile is not null and c.compte_id is not null
   limit 1;
  if v_contact is null then
    raise notice 'Garde-fou ignoré : aucun contact avec mobile et compte en base.';
    return;
  end if;

  select appel_id, interaction_id into v_a1, v_i1
    from public.ouvrir_appel_kimatch(v_tel, 'w.goupil@kiwee-energie.fr');

  if v_a1 is null then
    raise exception 'Le clic n''a produit aucun appel : la fiche resterait muette.';
  end if;

  if v_i1 is null then
    raise exception 'Aucune interaction rendue : la modale n''aurait rien à proposer et n''ouvrirait pas.';
  end if;

  -- L'IDENTIFIANT DOIT DÉSIGNER UNE VRAIE LIGNE, et celle qu'on vient d'écrire.
  select count(*) into v_n from public.interactions
   where id = v_i1 and ouverte_par_kimatch and contact_id = v_contact;
  if v_n <> 1 then
    raise exception 'L''identifiant rendu ne désigne pas l''interaction de cet appel : la modale rattacherait le mauvais dossier.';
  end if;

  -- LE SECOND CLIC REND LE MÊME, sans rien créer de neuf.
  select appel_id, interaction_id into v_a2, v_i2
    from public.ouvrir_appel_kimatch(v_tel, 'w.goupil@kiwee-energie.fr');

  if v_a2 is distinct from v_a1 then
    raise exception 'Deux clics rapprochés ont ouvert deux appels : la fiche les afficherait en double.';
  end if;
  if v_i2 is distinct from v_i1 then
    raise exception 'Le second clic rend une autre interaction (%) que le premier (%) : la modale changerait de cible sous les doigts.', v_i2, v_i1;
  end if;

  delete from public.interactions where id = v_i1;
  delete from public.appels_en_cours where id = v_a1;

  raise notice 'Garde-fou : le clic rend l''interaction qu''il vient d''écrire, et un second clic rend la même.';
end $$;

commit;
