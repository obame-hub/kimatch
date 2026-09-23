-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- KIMATCH N'ATTEND PLUS QU'ALLO VEUILLE BIEN PARLER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 23/09/2026 : « je comprends pas pourquoi les appels n'apparaissent pas dans le fil
-- d'activité des contacts ? je me suis appelée plusieurs fois ». Puis : « j'ai appelé après et là
-- maintenant et je les vois pas ».
--
-- ══ CE QU'ON A MESURÉ, ET QUI N'EST PAS CE QU'ON CROYAIT ══
--
-- Les appels N'ÉTAIENT PAS PERDUS. Ils arrivaient en retard — très en retard. Relevé sur 60 appels
-- de la journée du 23/09, en comparant la fin réelle de l'appel (démarrage + durée annoncée par
-- Allo) à l'instant où son `call.completed` nous parvient :
--
--     appel de 15:19  ->  reçu 15:31   retard 11 min
--     appel de 15:31  ->  reçu 15:52   retard 20 min
--     appel de 15:45  ->  reçu 16:11   retard 26 min
--     appel de 16:13  ->  reçu 16:55   retard 41 min
--     appel de 16:19  ->  reçu 17:02   retard 43 min
--
-- Retard médian sur la journée : 10,8 minutes. Mais il CROÎT d'heure en heure et ne se rattrape
-- jamais : c'est une file d'attente qui s'allonge chez eux, pas un aléa réseau.
--
-- ══ POURQUOI C'EST FATAL POUR CE QU'ON EN FAIT ══
--
-- L'interaction n'est écrite qu'à `call.completed`. Tant qu'il n'arrive pas, l'appel n'existe nulle
-- part dans Kimatch : ni dans le fil d'activité de la fiche, ni dans la modale de rattachement, ni
-- dans les compteurs du jour. Le commercial vient de raccrocher et son écran ne sait rien.
--
-- ET UNE MODALE QUI S'OUVRE QUARANTE-CINQ MINUTES PLUS TARD NE SERT À RIEN : on a enchaîné trois
-- autres appels, on ne sait plus duquel elle parle, et l'on ferme sans répondre. C'est exactement
-- le mécanisme des 262 appels non qualifiés du mois.
--
-- ══ CE QU'ON FAIT : KIMATCH ÉCRIT L'APPEL LUI-MÊME ══
--
-- Au clic sur « Appeler », Kimatch n'attend plus personne : il écrit la ligne d'appel ET
-- l'interaction, tout de suite. La fiche montre l'appel dans la seconde, et la modale peut le
-- proposer au raccroché.
--
-- QUAND ALLO SE RÉVEILLE, IL COMPLÈTE AU LIEU DE DUPLIQUER. C'est tout l'enjeu, et c'est traité
-- dans `api/allo/webhook.ts` : il retrouve l'interaction par le triplet (numéro, auteur, fenêtre de
-- temps) et y verse ce que lui seul connaît — la durée, l'enregistrement, la transcription, le
-- résumé. Sans ce rapprochement, chaque appel produirait DEUX lignes dans l'historique.
--
-- ══ CE QU'ON SE REFUSE À INVENTER ══
--
-- On n'écrit ni durée, ni résultat, ni décroché : à l'instant du clic, l'appel n'a pas encore eu
-- lieu. `resultat` reste nul jusqu'à ce qu'Allo parle — et s'il ne parle jamais, il reste nul. Un
-- appel dont on ignore l'issue doit se voir comme tel, pas se déguiser en appel abouti. C'est la
-- même règle que pour la croix qui écrivait `PAS_DE_REPONSE` (voir 20260922123000).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── D'où vient cette ligne : d'Allo, ou de notre propre clic ? ──
--
-- Sans cette colonne on ne pourrait pas distinguer un appel qu'Allo a confirmé d'un appel que nous
-- avons seulement déclenché — et donc pas savoir lesquels attendent encore leur contenu.
alter table public.appels_en_cours
  add column if not exists ouvert_par_kimatch boolean not null default false;

comment on column public.appels_en_cours.ouvert_par_kimatch is
  'Vrai quand c''est le clic « Appeler » de Kimatch qui a ouvert cette ligne, et non un événement '
  'd''Allo. Mesuré le 23/09/2026 : Allo livre ses `call.completed` avec 11 à 43 minutes de retard, '
  'donc on n''attend plus. Allo complétera la ligne quand il parlera.';

alter table public.interactions
  add column if not exists ouverte_par_kimatch boolean not null default false;

comment on column public.interactions.ouverte_par_kimatch is
  'Vrai quand l''interaction a été écrite au clic « Appeler », avant qu''Allo ne confirme l''appel. '
  'Elle n''a alors ni durée, ni enregistrement, ni transcription : `api/allo/webhook.ts` les verse '
  'au `call.completed`, en retrouvant la ligne par (numéro, auteur, fenêtre de temps).';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA FONCTION : OUVRIR UN APPEL SANS RIEN INVENTER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER parce qu'elle écrit dans deux tables au nom de qui clique, et qu'on veut que la
-- règle de rattachement soit la même pour tout le monde — elle vit ici et non dans dix écrans.
--
-- ELLE SE SERT DE `qui_appelle` (migration 20260921160000) pour retrouver le propriétaire du
-- numéro : c'est déjà la fonction qui compare les chiffres seuls, et donc la seule qui reconnaisse
-- les 1 319 numéros écrits avec des espaces. Les écrans n'ont ainsi rien à passer d'autre que le
-- numéro — et c'est heureux, parce que la plupart des boutons « Appeler » de Kimatch ne
-- connaissent pas l'identifiant du contact qu'ils composent.
create or replace function public.ouvrir_appel_kimatch(
  p_numero text,
  p_email_allo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_appel        uuid;
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
    return null;
  end if;

  v_fin := public.fin_numero(p_numero);

  /* L'AUTEUR EST CELUI DU COMPTE ALLO, PAS CELUI QUI CLIQUE. Naoëlle opère le compte de William :
     ses appels doivent porter le même auteur que ceux qu'Allo écrira, sinon l'historique se
     scinderait en deux et la modale ne retrouverait pas ses petits. Même règle que `useAppelEnCours`
     et que `DemandeRattachement`. */
  select id into v_profil from public.profils where lower(email) = lower(p_email_allo) limit 1;
  if v_profil is null then
    return null;
  end if;

  /* ══ ON NE ROUVRE PAS UN APPEL QU'ON VIENT D'OUVRIR ══
     Un double-clic, ou deux écrans qui composent le même numéro coup sur coup, ne doivent pas
     produire deux lignes. Deux minutes : plus court qu'un rappel délibéré, plus long qu'une
     hésitation de souris. */
  select id into v_recent
    from public.appels_en_cours
   where user_email = lower(p_email_allo)
     and numero_normalise = v_fin
     and demarre_le > v_maintenant - interval '2 minutes'
   order by demarre_le desc
   limit 1;
  if v_recent is not null then
    return v_recent;
  end if;

  -- À qui appartient ce numéro ? `qui_appelle` compare les chiffres, pas les chaînes.
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

  /* ══ L'INTERACTION, TOUT DE SUITE — MAIS SEULEMENT SI ON SAIT OÙ LA RANGER ══
     `interactions_contexte_check` exige au moins un contexte. Un numéro que Kimatch ne connaît pas
     n'en a aucun : l'appel reste alors dans `appels_en_cours` et l'écran « Appels à rattacher » le
     reprendra. C'est la même dérivation que dans le webhook, et c'est la bonne place. */
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
      );
    end if;
  end if;

  return v_appel;
end $$;

comment on function public.ouvrir_appel_kimatch(text, text) is
  'Écrit l''appel et son interaction au clic « Appeler », sans attendre Allo — mesuré le '
  '23/09/2026, ses `call.completed` arrivent avec 11 à 43 minutes de retard, et l''appel n''existe '
  'nulle part dans Kimatch d''ici là. N''invente ni durée ni résultat : le webhook les versera. '
  'Rend l''identifiant de l''appel, ou null si le numéro est vide ou l''adresse Allo inconnue.';

grant execute on function public.ouvrir_appel_kimatch(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : COMPLÉTER, JAMAIS DUPLIQUER
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible, et qu'on éprouve ici : l'appel paraît dans la seconde. Mais le
-- RISQUE n'est pas là — un appel qui n'apparaît pas se voit tout de suite. Le risque, c'est qu'Allo
-- arrive quarante-cinq minutes plus tard et écrive une SECONDE ligne : l'historique de la fiche
-- afficherait alors chaque appel en double, et personne ne saurait laquelle croire.
--
-- On éprouve donc les deux : que la ligne naisse, et qu'un second clic sur le même numéro ne la
-- redouble pas. Le rapprochement fait par le webhook est éprouvé, lui, dans `api/allo/__tests__`.
--
do $$
declare
  v_a1      uuid;
  v_a2      uuid;
  v_contact uuid;
  v_compte  uuid;
  v_n       integer;
  v_duree   integer;
  v_res     text;
begin
  -- Un contact réel, pour que `qui_appelle` ait quelque chose à trouver.
  select c.id, c.compte_id into v_contact, v_compte
    from public.contacts c
   where c.telephone_mobile is not null and c.compte_id is not null
   limit 1;
  if v_contact is null then
    raise notice 'Garde-fou ignoré : aucun contact avec mobile et compte en base.';
    return;
  end if;

  v_a1 := public.ouvrir_appel_kimatch(
    (select telephone_mobile from public.contacts where id = v_contact),
    'w.goupil@kiwee-energie.fr');

  if v_a1 is null then
    raise exception 'Le clic « Appeler » n''a produit aucun appel : la fiche resterait muette.';
  end if;

  -- CE QU'ON REFUSE D'INVENTER : à l'instant du clic, l'appel n'a pas encore eu lieu.
  select duree_secondes, resultat into v_duree, v_res
    from public.appels_en_cours where id = v_a1;
  if v_duree is not null or v_res is not null then
    raise exception 'Une durée ou un résultat ont été inventés sur un appel qui vient de partir.';
  end if;

  -- L'interaction doit exister tout de suite : c'est tout l'objet de la migration.
  select count(*) into v_n from public.interactions
   where contact_id = v_contact and ouverte_par_kimatch
     and date_interaction > clock_timestamp() - interval '1 minute';
  if v_n < 1 then
    raise exception 'Aucune interaction écrite au clic : l''appel resterait invisible dans le fil.';
  end if;

  -- LE CAS QUI DOIT ÉCHOUER : un second clic ne doit pas redoubler la ligne.
  v_a2 := public.ouvrir_appel_kimatch(
    (select telephone_mobile from public.contacts where id = v_contact),
    'w.goupil@kiwee-energie.fr');
  if v_a2 is distinct from v_a1 then
    raise exception 'Deux clics rapprochés ont ouvert deux appels : la fiche les afficherait en double.';
  end if;

  delete from public.interactions
   where contact_id = v_contact and ouverte_par_kimatch
     and date_interaction > clock_timestamp() - interval '1 minute';
  delete from public.appels_en_cours where id = v_a1;

  raise notice 'Garde-fou : l''appel et son interaction naissent au clic, sans durée inventée, et un second clic ne les redouble pas.';
end $$;

commit;
