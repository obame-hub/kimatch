-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE DEMANDE DE RATTACHEMENT ÉCARTÉE NE REVIENT PAS À CHAQUE RECHARGEMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 23/09/2026, capture à l'appui : « quand je refresh j'ai la modale qui s'affiche en
-- permanence ».
--
-- ══ C'EST UN DÉFAUT QUE J'AI INTRODUIT EN RÉPARANT L'AUTRE ══
--
-- La modale ne s'ouvrait jamais ; depuis ce matin elle s'ouvre. Mais le drapeau qui l'empêche de se
-- rouvrir sur un appel déjà écarté est un `useRef` — il vit dans la mémoire de l'onglet, et il MEURT
-- AU RECHARGEMENT. Chaque F5 repose donc la même question sur la même interaction, indéfiniment.
--
-- Pire : tant qu'aucun appel plus récent n'arrive, c'est TOUJOURS la même qui est proposée. Naoëlle
-- l'a écartée dix fois et elle est revenue dix fois. Une question qu'on a déjà refusée et qui
-- réapparaît sans fin, c'est une question qu'on cesse de lire — et le jour où elle porte sur un
-- appel qu'il fallait vraiment rattacher, elle est fermée par réflexe.
--
-- ══ POURQUOI EN BASE ET NON DANS LE NAVIGATEUR ══
--
-- `localStorage` aurait suffi pour le PC de Naoëlle, et rien d'autre. La consigne est que tout
-- marche depuis Kimatch, mobile compris : une demande écartée sur le téléphone doit rester écartée
-- sur l'ordinateur, sinon la question revient dès qu'on change d'écran. Et c'est un fait qui
-- concerne l'interaction, pas l'appareil.
--
-- ══ CE QUE CETTE COLONNE NE DIT PAS ══
--
-- Écarter la DEMANDE n'est pas refuser le RATTACHEMENT. L'appel reste non rattaché, donc il continue
-- de paraître dans « Appels à rattacher » sur la vue d'ensemble — c'est la consigne du 23/09 : « si
-- la personne quitte et ne rattache pas, on l'ajoute à la liste de rattachement ». On note seulement
-- qu'on ne veut plus que la modale s'ouvre d'elle-même pour celui-là.
--
-- C'est exactement la distinction faite le 22/09 pour `appels_en_cours.ecarte_le` : un fait
-- d'interface, jamais un résultat commercial.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists rattachement_ecarte_le timestamptz;

comment on column public.interactions.rattachement_ecarte_le is
  'Quand la modale « À quoi se rapportait cet appel ? » a été fermée sans choisir, pour cet appel. '
  'La modale ne se rouvrira plus d''elle-même dessus. N''affirme RIEN sur le rattachement : l''appel '
  'reste non rattaché et continue de paraître dans « Appels à rattacher ». Avant cette colonne, le '
  'drapeau vivait dans un `useRef` et mourait au rechargement — la même question revenait à chaque F5.';

-- L'index sert la requête de la modale, qui écarte ces lignes à chaque sondage — toutes les dix
-- secondes, pour toute l'équipe. Partiel : seules les lignes écartées nous intéressent ici.
create index if not exists idx_interactions_rattachement_ecarte
  on public.interactions (auteur_profil_id, date_interaction desc)
  where rattachement_ecarte_le is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ÉCARTER LA QUESTION NE DOIT PAS RATTACHER L'APPEL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible, et qu'on éprouve ici : se souvenir d'un refus. Le RISQUE n'est
-- pas qu'on l'oublie — la modale reparaîtrait, c'est le défaut d'aujourd'hui et il se voit. Le
-- risque, c'est qu'un geste d'interface se mette à écrire une donnée métier : qu'écarter la
-- question fasse disparaître l'appel de « Appels à rattacher », et qu'il ne soit jamais traité.
--
do $$
declare
  v_type    uuid;
  v_contact uuid;
  v_compte  uuid;
  v_i       uuid;
  v_opp     uuid;
  v_reco    uuid;
  v_req     uuid;
  v_piste   uuid;
begin
  select id into v_type from public.types_interactions where code = 'APPEL' limit 1;
  select c.id, c.compte_id into v_contact, v_compte
    from public.contacts c where c.compte_id is not null limit 1;
  if v_type is null or v_contact is null then
    raise notice 'Garde-fou ignoré : ni type APPEL ni contact rattaché en base.';
    return;
  end if;

  insert into public.interactions (
    type_interaction_id, date_interaction, objet, sens, auteur_profil_id, contact_id, compte_id
  ) values (
    v_type, clock_timestamp(), 'zzz essai garde-fou', 'SORTANT',
    (select id from public.profils order by date_creation limit 1), v_contact, v_compte
  ) returning id into v_i;

  -- LE GESTE QUE LA MIGRATION AUTORISE : écarter la question, et rien d'autre.
  update public.interactions
     set rattachement_ecarte_le = clock_timestamp()
   where id = v_i;

  select opportunite_id, recommandation_id, requete_id, piste_id
    into v_opp, v_reco, v_req, v_piste
    from public.interactions where id = v_i;

  if v_opp is not null or v_reco is not null or v_req is not null or v_piste is not null then
    raise exception 'Écarter la question a rattaché l''appel à un objet : un geste d''interface a écrit une donnée métier.';
  end if;

  if (select rattachement_ecarte_le from public.interactions where id = v_i) is null then
    raise exception 'Le refus n''a pas été retenu : la modale reparaîtrait au prochain rechargement.';
  end if;

  delete from public.interactions where id = v_i;
  raise notice 'Garde-fou : écarter la question s''en souvient, sans rattacher l''appel à quoi que ce soit.';
end $$;

commit;
