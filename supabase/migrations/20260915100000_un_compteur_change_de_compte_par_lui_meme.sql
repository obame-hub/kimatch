-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR CHANGE DE COMPTE PAR LUI-MÊME
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « Très important de pouvoir changer rapidement de rattachement. Par exemple
-- changer le compteur 00000000000000 pour l'enlever de KIWEE ENERGIE FRANCE pour le rattacher à un
-- autre compte. »
--
-- ══ LE GESTE EXISTANT NE MARCHE PAS, ET ON EN A LA PREUVE ══
--
-- `fn_deplacer_site` écrit `sites.compte_id`. Le compteur porte désormais son PROPRE `compte_id`, et
-- `trg_compteur_herite_de_son_site` ne se déclenche que sur `update of site_id` — que ce geste ne
-- touche pas. Le compte du compteur ne suit donc jamais.
--
-- LE DÉPLACEMENT NE PREND DONC QU'À MOITIÉ, et c'est ce qui le rend difficile à voir : la fiche du
-- compteur lit son compte À TRAVERS LE SITE, donc elle affiche bien la nouvelle société. Partout
-- ailleurs — l'onglet Compteurs du compte, les listes, `v_compteurs_liste` — c'est
-- `compteurs.compte_id` qui parle, et il n'a pas bougé. Le compteur est chez l'un quand on le
-- regarde, chez l'autre quand on le cherche.
--
-- DEUX DÉPLACEMENTS ONT ÉTÉ FAITS DEPUIS LA CRÉATION DE CETTE FONCTION. Les deux sont cassés :
--
--                   fiche compteur          onglet Compteurs du compte
--   30001441765303  DIMOTRANS               DUHAMEL LOGISTIQUE        (15/09/2026 09 h 10)
--   50084515146145  FONCIA BORDEAUX         FONCIA BORDEAUX TALENCE   (10/09/2026 10 h 48)
--
-- Le taux d'échec est de 100 %, et personne ne l'a vu parce que le geste sert deux fois par semaine.
-- Cette migration ne répare PAS ces deux lignes : c'est une décision métier — quel compte a raison ?
-- — qui appartient à William. Elle donne le geste qui marche.
--
-- ══ ON ÉCRIT SUR LE COMPTEUR, PLUS SUR LE SITE ══
--
-- C'est le compteur qui contractualise. Passer par le site pour changer de société, c'était demander
-- « dans quel immeuble ranger ce PDL » quand la question est « à qui appartient-il ». Et cela rendait
-- impossible le geste demandé : on ne pouvait choisir qu'un site EXISTANT d'une autre société, donc
-- jamais rattacher un compteur à une société qui n'en a aucun.
--
-- ══ LE LIEU NE BOUGE PAS AVEC LE CONTRAT ══
--
-- Un compteur qui change de société reste dans le même immeuble. `groupe_site_id`, `libelle_site`,
-- l'adresse : rien de tout cela ne change. Le paramètre `p_emmener_le_lieu` sert le cas inverse —
-- l'immeuble entier passe chez un autre syndic — et emmène alors les compteurs voisins.
--
-- 992 lieux portent plusieurs compteurs (2 574 des 7 934, soit 32 %). Sur les deux tiers restants,
-- le compteur est seul et le paramètre ne change rien.
--
-- ══ LA LIGNE `sites` SUIT QUAND ELLE SE VIDE ══
--
-- Tant que `compteurs.site_id` est NOT NULL, une ligne `sites` existe derrière chaque lieu. Si plus
-- aucun compteur du compte d'origine ne s'y accroche, la laisser là recréerait exactement la
-- divergence qu'on vient de constater. Si d'autres compteurs y restent, elle ne bouge pas : un lieu
-- à cheval sur deux sociétés est alors la vérité, pas une incohérence.
--
-- ══ LE RESPONSABLE EST UNE DÉCISION, PAS UN EFFET DE BORD ══
--
-- William, 15/09/2026 : « Si le responsable n'est pas un contact propre au compte rattaché, propose
-- de le mettre à jour également. » Quatre réponses, parce que les situations sont différentes :
--
--   CHOISIR    un responsable parmi les contacts de la société d'arrivée
--   RATTACHER  la personne actuelle à la société d'arrivée — elle gère les deux, cas fréquent :
--              146 contacts sont déjà rattachés à plusieurs comptes
--   LAISSER    en l'état : la donnée reste vraie même bancale
--   RETIRER    le responsable : le compteur arrive sans personne à appeler
--
-- Le défaut est LAISSER. Une fonction qui efface un responsable sans qu'on l'ait demandé ferait
-- perdre la seule personne joignable sur ce PDL.
--
-- ══ LE RELAIS DE CONSEIL SYNDICAL SUIT TOUJOURS ══
--
-- William, 13/09/2026 : il « se lie au nouveau compte obligatoirement, mais il reste avant tout
-- toujours lié au compteur ». Même règle que `fn_deplacer_compteur` : on le rattache à la société
-- d'arrivée et on crée la tâche qui demande quel est le nouveau cabinet.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_rattacher_compteur(
  p_compteur_id            uuid,
  p_compte_destination_id  uuid,
  p_emmener_le_lieu        boolean default false,
  p_responsable_action     text    default 'LAISSER',
  p_responsable_contact_id uuid    default null,
  p_motif                  text    default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_compte_origine uuid; v_groupe uuid; v_site uuid; v_numero text; v_lieu text;
  v_responsable uuid; v_relais uuid;
  v_nom_origine text; v_nom_dest text;
  v_compteurs uuid[]; v_nb_emmenes integer;
  v_mandats integer; v_contrats integer; v_recos integer; v_opportunites integer;
  v_requetes integer := 0; v_interactions integer := 0; v_restes_sur_le_lieu integer;
  v_site_suit boolean := false;
  v_responsable_nom text; v_relais_nom text; v_tache uuid := null;
  v_type_appel uuid; v_statut_a_faire uuid;
  v_correlation uuid := md5(txid_current()::text)::uuid;
begin
  if p_responsable_action not in ('CHOISIR', 'RATTACHER', 'LAISSER', 'RETIRER') then
    raise exception 'Action inconnue pour le responsable : %', p_responsable_action;
  end if;

  select cp.compte_id, cp.groupe_site_id, cp.site_id, cp.numero_point, cp.libelle_site,
         cp.responsable_contact_id, cp.contact_conseil_syndical_id
    into v_compte_origine, v_groupe, v_site, v_numero, v_lieu, v_responsable, v_relais
    from compteurs cp where cp.id = p_compteur_id
    for update;
  if not found then
    raise exception 'Compteur introuvable : %', p_compteur_id;
  end if;

  select c.nom into v_nom_dest from comptes c where c.id = p_compte_destination_id;
  if v_nom_dest is null then
    raise exception 'Compte de destination introuvable : %', p_compte_destination_id;
  end if;
  select c.nom into v_nom_origine from comptes c where c.id = v_compte_origine;

  if v_compte_origine = p_compte_destination_id then
    raise exception 'Le compteur % appartient déjà à %.', v_numero, v_nom_dest;
  end if;

  -- ── CE QUI PART ──────────────────────────────────────────────────────────────────────────────
  --
  -- Les voisins ne sont emmenés QUE s'ils appartiennent encore au compte d'origine : un lieu déjà
  -- partagé entre deux sociétés ne doit pas se voir réunir de force par un geste qui ne parlait que
  -- d'un seul PDL.
  if p_emmener_le_lieu then
    select coalesce(array_agg(cp.id), array[]::uuid[]) into v_compteurs
      from compteurs cp
     where cp.groupe_site_id = v_groupe and cp.compte_id = v_compte_origine;
  else
    v_compteurs := array[p_compteur_id];
  end if;
  v_nb_emmenes := array_length(v_compteurs, 1) - 1;

  -- ── CE QUI RESTE DERRIÈRE, COMPTÉ AVANT L'ÉCRITURE ───────────────────────────────────────────
  --
  -- Un mandat est signé et couvre souvent plusieurs compteurs : le faire suivre réécrirait un
  -- document signé et arracherait les autres compteurs à leur propre compte. Même raisonnement pour
  -- les contrats, les recommandations et les opportunités. Ils ne bougent pas — l'écran le dit.
  select count(distinct mc.mandat_id) into v_mandats
    from mandats_compteurs mc join mandats m on m.id = mc.mandat_id
   where mc.compteur_id = any(v_compteurs) and m.compte_id = v_compte_origine;
  select count(distinct cc.contrat_id) into v_contrats
    from contrats_compteurs cc join suivis_contrats sc on sc.id = cc.contrat_id
   where cc.compteur_id = any(v_compteurs) and sc.compte_id = v_compte_origine;
  select count(distinct rc.recommandation_id) into v_recos
    from recommandations_compteurs rc join recommandations r on r.id = rc.recommandation_id
   where rc.compteur_id = any(v_compteurs) and r.compte_id = v_compte_origine;
  select count(distinct oc.opportunite_id) into v_opportunites
    from opportunites_compteurs oc join opportunites o on o.id = oc.opportunite_id
   where oc.compteur_id = any(v_compteurs) and o.compte_id = v_compte_origine;

  -- ── 1. LE COMPTEUR CHANGE DE COMPTE. C'est la seule écriture qui compte vraiment ──────────────
  --
  -- `site_id` n'est PAS touché : le déclencheur d'héritage ne se réveille pas, et le lieu reste ce
  -- qu'il est. C'est précisément ce que l'ancien geste faisait à l'envers.
  update compteurs set compte_id = p_compte_destination_id where id = any(v_compteurs);

  -- ── 2. LA LIGNE `sites`, quand plus rien du compte d'origine ne s'y accroche ──────────────────
  select count(*) into v_restes_sur_le_lieu
    from compteurs cp
   where cp.site_id = v_site and cp.compte_id = v_compte_origine;
  if v_restes_sur_le_lieu = 0 then
    update sites set compte_id = p_compte_destination_id
     where id = v_site and compte_id = v_compte_origine;
    v_site_suit := found;
  end if;

  -- ── 3. LES REQUÊTES, qui recopient le compte ─────────────────────────────────────────────────
  --
  -- Seulement celles qui pointaient vers l'ancien : une réclamation déjà rangée ailleurs l'a été
  -- exprès.
  update requetes set compte_id = p_compte_destination_id
   where compteur_id = any(v_compteurs) and compte_id = v_compte_origine;
  get diagnostics v_requetes = row_count;

  -- ── 4. LES INTERACTIONS DU LIEU, seulement si le lieu a suivi ────────────────────────────────
  --
  -- Elles s'accrochent au site, pas au compteur : les déplacer quand le site reste chez l'origine
  -- emmènerait des échanges qui concernent encore d'autres compteurs.
  if v_site_suit then
    update interactions set compte_id = p_compte_destination_id
     where site_id = v_site and compte_id = v_compte_origine;
    get diagnostics v_interactions = row_count;
  end if;

  -- ── 5. LE RESPONSABLE ────────────────────────────────────────────────────────────────────────
  --
  -- CE BLOC NE TOUCHE QUE LE COMPTEUR DEMANDÉ, jamais ses voisins emmenés. L'écran a posé la
  -- question sur UN responsable, celui de ce PDL ; l'appliquer aux onze autres compteurs d'un
  -- immeuble effacerait des responsables sur lesquels personne n'a été consulté.
  if p_responsable_action = 'CHOISIR' then
    if p_responsable_contact_id is null then
      raise exception 'Aucun contact fourni alors que l''action demandée est « choisir un responsable ».';
    end if;
    if not fn_contact_rattache_au_compte(p_responsable_contact_id, p_compte_destination_id) then
      raise exception 'Le contact choisi n''est pas rattaché à %.', v_nom_dest;
    end if;
    update compteurs set responsable_contact_id = p_responsable_contact_id where id = p_compteur_id;
    select trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')) into v_responsable_nom
      from contacts c where c.id = p_responsable_contact_id;

  elsif p_responsable_action = 'RATTACHER' then
    if v_responsable is null then
      raise exception 'Ce compteur n''a pas de responsable à rattacher.';
    end if;
    -- `relation_directe` reste FAUX : la personne ne change pas d'employeur, elle gagne un second
    -- rattachement. Vrai la ferait passer pour un contact propre à la société d'arrivée.
    -- `do update set actif = true` ET NON `do nothing` : un rattachement désactivé existe déjà dans
    -- la table, et `fn_contact_rattache_au_compte` exige `actif`. « Ne rien faire » aurait laissé la
    -- personne officiellement non rattachée alors que l'écran vient d'annoncer l'inverse.
    insert into contacts_comptes (contact_id, compte_id, relation_directe)
    values (v_responsable, p_compte_destination_id, false)
    on conflict (contact_id, compte_id) do update set actif = true, date_modification = now();
    select trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')) into v_responsable_nom
      from contacts c where c.id = v_responsable;

  elsif p_responsable_action = 'RETIRER' then
    update compteurs set responsable_contact_id = null where id = p_compteur_id;
  end if;

  -- ── 6. LE RELAIS SUIT, SE RATTACHE, ET SE SIGNALE ────────────────────────────────────────────
  -- TOUS LES RELAIS DES COMPTEURS EMMENÉS SE RATTACHENT, pas seulement celui du PDL désigné : les
  -- compteurs d'un même immeuble relèvent du même conseil syndical, et en oublier un le laisserait
  -- orphelin du compte où vit désormais son compteur.
  insert into contacts_comptes (contact_id, compte_id, relation_directe)
  select distinct cp.contact_conseil_syndical_id, p_compte_destination_id, false
    from compteurs cp
   where cp.id = any(v_compteurs) and cp.contact_conseil_syndical_id is not null
  on conflict (contact_id, compte_id) do update set actif = true, date_modification = now();

  if v_relais is not null then

    select trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')) into v_relais_nom
      from contacts c where c.id = v_relais;

    select id into v_type_appel     from types_actions   where code = 'APPELER';
    select id into v_statut_a_faire from statuts_actions where code = 'A_FAIRE';
    if v_type_appel is null or v_statut_a_faire is null then
      raise exception 'Références manquantes : types_actions.APPELER ou statuts_actions.A_FAIRE.';
    end if;

    -- LA TÂCHE PORTE LA QUESTION, PAS LE CONSTAT. « Le compteur a changé de compte » n'appelle aucun
    -- geste ; « demander quel est le nouveau cabinet » en appelle un, et c'est la seule information
    -- que le conseil syndical détient et que nous n'avons pas.
    --
    -- Elle s'accroche au SITE faute de mieux : `actions_contexte_check` n'admet pas encore
    -- `compteur_id` parmi ses contextes. Ligne à reprendre quand le retrait de l'objet Site
    -- atteindra cette contrainte.
    insert into actions (type_action_id, statut_id, titre, commentaire, site_id, contact_id, date_prevue, priorite)
    values (v_type_appel, v_statut_a_faire,
            'Changement de cabinet — appeler le relais ' || coalesce(v_relais_nom, 'du conseil syndical'),
            'Le compteur ' || v_numero || ' est passé de « ' || coalesce(v_nom_origine, '?') ||
              ' » à « ' || v_nom_dest || ' ». Demander au conseil syndical quel est le nouveau ' ||
              'cabinet de syndic et si le contrat d''énergie suit.',
            v_site, v_relais, (now() at time zone 'Europe/Paris')::date, 30)
    returning id into v_tache;
  end if;

  -- ── 7. LA TRACE ──────────────────────────────────────────────────────────────────────────────
  --
  -- `compte_id` reste vide, et ce n'est pas un oubli : `historiques_entites_compte_id_fkey` pointe
  -- vers `comptes` sans clause `on delete`, donc une ligne qui remplit cette colonne EMPÊCHE de
  -- supprimer le compte qu'elle désigne. Les deux comptes sont de toute façon dans les valeurs, avec
  -- leur nom en clair.
  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id
  ) values (
    'compteurs', p_compteur_id, 'UPDATE',
    jsonb_build_object('compte_id', v_compte_origine, 'compte_nom', v_nom_origine),
    jsonb_build_object('compte_id', p_compte_destination_id, 'compte_nom', v_nom_dest),
    array['compte_id'], p_motif, auth.uid(), 'APPLICATION', v_correlation
  );

  return jsonb_build_object(
    'compteur', v_numero,
    'lieu', v_lieu,
    'compte_origine', v_nom_origine,
    'compte_destination', v_nom_dest,
    'suivis', jsonb_build_object(
      'compteurs_voisins', v_nb_emmenes,
      'lieu_suit', v_site_suit,
      'requetes', v_requetes,
      'interactions', v_interactions,
      'responsable_action', p_responsable_action,
      'responsable_nom', v_responsable_nom,
      'relais_nom', v_relais_nom,
      'tache_relais', v_tache),
    'restes', jsonb_build_object(
      'mandats', v_mandats, 'contrats', v_contrats,
      'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$$;

comment on function public.fn_rattacher_compteur(uuid, uuid, boolean, text, uuid, text) is
  'Rattache un compteur à un autre compte, en écrivant compteurs.compte_id. Remplace fn_deplacer_site / fn_deplacer_compteur, qui passaient par le site et laissaient le compte du compteur en arrière.';

grant execute on function public.fn_rattacher_compteur(uuid, uuid, boolean, text, uuid, text) to authenticated;
