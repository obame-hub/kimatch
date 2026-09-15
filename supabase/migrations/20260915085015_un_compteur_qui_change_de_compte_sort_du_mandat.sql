-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR QUI CHANGE DE COMPTE SORT DU MANDAT QUI LE COUVRAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « Le mandat est propre au compteur mais également à un compte. Donc un
-- changement de compte entraîne de manière systémique une caducité du mandat (ce dernier n'est plus
-- valable). C'est un statut à créer sur le mandat (passage de Actif (vert) à caduque (rouge)).
-- C'est différent de "Expiré" auquel cas le mandat a juste dépassé sa période limite de validité.
-- Le statut "Caduque" n'est par définition possible que si le mandat était "Actif" au préalable. »
--
-- Puis, sur les mandats qui couvrent plusieurs compteurs : « Le mandat est toujours valide par
-- définition, mais le compteur doit être ajouté dans un nouvel endroit, le "périmètre caduque".
-- Donc cette fois ce n'est pas le mandat qui est caduque dans son entièreté, c'est le compteur qui
-- n'est plus couvert par ce mandat. Si TOUS les compteurs du mandat changent de compte, alors dans
-- ce cas c'est tout le mandat qui devient caduque. »
--
-- ══ POURQUOI LA CADUCITÉ EST D'ABORD UNE PROPRIÉTÉ DU LIEN, PAS DU MANDAT ══
--
-- Un mandat signé par une société l'autorise à faire négocier SES points de livraison. Quand l'un
-- d'eux part chez une autre société, le document ne devient pas faux : il cesse simplement de
-- couvrir ce PDL-là. La couverture se perd donc ligne par ligne, dans `mandats_compteurs`.
--
-- 307 des 1 112 mandats actifs couvrent plusieurs compteurs, jusqu'à 38. Faire basculer le mandat
-- entier au premier départ aurait retiré leur couverture à 37 compteurs dont personne n'a rien
-- demandé — et un compteur non couvert ne peut plus être mis en recommandation.
--
-- LE MANDAT NE BASCULE QUE LORSQU'IL NE COUVRE PLUS RIEN. C'est le cas le plus fréquent : 799 des
-- 1 112 mandats actifs ne portent qu'un seul compteur (6 n'en portent aucun).
--
-- ══ « CADUQUE » N'EST PAS « EXPIRÉ », ET ENCORE MOINS « ANNULÉ » ══
--
-- Expiré : le mandat a dépassé sa date de validité — le temps a passé, personne n'a rien fait.
-- Annulé / Refusé : une décision humaine, avant ou après signature.
-- Caduque : le mandat était valide, il l'est resté, mais son objet a changé de mains.
--
-- Les distinguer n'est pas de la nuance : « expiré » se règle par un renouvellement auprès du même
-- client, « caduque » demande un NOUVEAU mandat auprès d'une AUTRE société.
--
-- LE STATUT NE S'ATTEINT QUE DEPUIS « ACTIF », comme demandé. Un mandat encore en brouillon ou
-- envoyé garde son statut : ses compteurs sortent du périmètre, mais rien n'a jamais été signé, il
-- n'y a donc rien à rendre caduc.
--
-- ══ CE QUI N'EST PAS TRAITÉ ICI, ET C'EST VOULU ══
--
-- Le contrat ne devient PAS caduc. William, même message : « le contrat lui n'est pas caduque, il
-- doit rester attaché au compte de base (celui présent sur le contrat) et au(x) compteur(s). Dans la
-- logique, un changement de société devrait entraîner un avenant au contrat mentionnant le nouveau
-- compte mais on ne s'en occupe pas. »
--
-- ══ 35 MANDATS ACTIFS SONT DÉJÀ DANS CE CAS, ET ON N'Y TOUCHE PAS ══
--
-- 41 liaisons pointent vers un compteur qui n'appartient plus au compte du mandat — héritage de la
-- reprise Salesforce, pas d'un déplacement fait dans Kimatch. Les marquer d'office reviendrait à
-- retirer leur couverture à des compteurs sans que personne n'ait rien décidé. Cette migration
-- POSE LA RÈGLE POUR L'AVENIR ; le rattrapage est une décision de William, à faire sur pièces.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. LE STATUT ─────────────────────────────────────────────────────────────────────────────────
--
-- `ordre = 62` : après « Expiré » (60) et avant « Refusé » (65), parce que la barre de progression
-- des mandats (CheminConversion.tsx) lit cet ordre pour savoir ce qui vient après « Actif » (50).
--
-- `est_cloture = true` : le mandat ne mène plus à rien, il sort des files de travail.
-- `est_actif = true` : la colonne dit que le STATUT est proposable, pas que le mandat l'est —
-- « Expiré » la porte aussi. On s'aligne sur lui, puisque c'est le voisin de sens.
insert into statuts_mandats (code, libelle, ordre, couleur, icone, est_actif, est_cloture)
values ('CADUQUE', 'Caduque', 62, '#B91C1C', 'link-2-off', true, true)
on conflict (code) do update
   set libelle = excluded.libelle, ordre = excluded.ordre, couleur = excluded.couleur,
       icone = excluded.icone, est_cloture = excluded.est_cloture;

-- ── 2. LE PÉRIMÈTRE CADUQUE ──────────────────────────────────────────────────────────────────────
--
-- La ligne N'EST PAS SUPPRIMÉE. « Le compteur doit être ajouté dans un nouvel endroit, le périmètre
-- caduque » : effacer le lien ferait disparaître du mandat la trace de ce qu'il couvrait, et un
-- document signé ne se réécrit pas. On date la sortie, on dit pourquoi, et on garde tout.
alter table mandats_compteurs
  add column if not exists caduc_depuis   timestamptz,
  add column if not exists caduc_motif    text,
  -- Le compte que le compteur a REJOINT. C'est la question qu'on se posera en relisant le mandat
  -- dans six mois : « il est parti où ? » — et c'est aussi là qu'il faudra faire signer le nouveau.
  add column if not exists caduc_compte_id uuid references comptes(id) on delete set null;

comment on column mandats_compteurs.caduc_depuis is
  'Date à laquelle ce compteur a cessé d''être couvert par ce mandat, parce qu''il a changé de compte. Nul = toujours couvert.';

-- L'index sert la lecture normale — « les compteurs encore couverts » — qui est faite à chaque
-- ouverture de fiche compte, de mandat et d''assistant de recommandation.
create index if not exists idx_mandats_compteurs_encore_couverts
  on mandats_compteurs (mandat_id) where caduc_depuis is null;

-- ── 3. LA RÈGLE, POSÉE DANS LE GESTE QUI LA DÉCLENCHE ────────────────────────────────────────────
--
-- Elle vit dans `fn_rattacher_compteur` et non dans un déclencheur sur `compteurs.compte_id`, pour
-- une raison précise : le motif. Un déclencheur saurait QUE le compte a changé, jamais POURQUOI, et
-- ne pourrait pas écrire « suivi du compteur vers DIMOTRANS » dans le périmètre caduque. Le jour où
-- un import massif déplacerait des compteurs, un déclencheur rendrait aussi des centaines de
-- mandats caducs sans que personne l'ait voulu.
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
  v_liens_caducs integer := 0; v_mandats_caducs integer := 0;
  v_requetes integer := 0; v_interactions integer := 0; v_restes_sur_le_lieu integer;
  v_site_suit boolean := false;
  v_responsable_nom text; v_relais_nom text; v_tache uuid := null;
  v_type_appel uuid; v_statut_a_faire uuid; v_statut_caduque uuid;
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
  -- Les contrats, les recommandations et les opportunités ne bougent pas : ce sont des engagements
  -- du compte d'origine. Le contrat en particulier RESTE ATTACHÉ au compte qui l'a signé et aux
  -- compteurs qu'il couvre — décision de William du 15/09/2026, l'avenant relève du juridique et
  -- n'est pas traité dans Kimatch.
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

  -- ── 2. LE PÉRIMÈTRE CADUQUE DES MANDATS ──────────────────────────────────────────────────────
  --
  -- LA CONDITION EST « LE MANDAT N'EST PLUS CELUI DU COMPTE DU COMPTEUR », et non « le mandat
  -- appartenait au compte d'origine » : c'est la formulation vraie de la règle, et elle couvre au
  -- passage le cas où l'on ramène un compteur chez la société qui le mandatait — le lien reste alors
  -- intact, comme il doit.
  --
  -- `caduc_depuis is null` : on ne redate pas une sortie déjà actée. Un compteur qui voyage trois
  -- fois garde la date à laquelle il a quitté CE mandat-là.
  update mandats_compteurs mc
     set caduc_depuis    = now(),
         caduc_motif     = 'Le compteur a rejoint ' || v_nom_dest || '.' ||
                           case when p_motif is null then '' else ' ' || p_motif end,
         caduc_compte_id = p_compte_destination_id,
         date_modification = now()
    from mandats m
   where mc.mandat_id = m.id
     and mc.compteur_id = any(v_compteurs)
     and mc.caduc_depuis is null
     and m.compte_id is distinct from p_compte_destination_id;
  get diagnostics v_liens_caducs = row_count;

  -- LE MANDAT ENTIER NE BASCULE QUE S'IL NE COUVRE PLUS RIEN, et seulement depuis « Actif ».
  -- Un mandat qui n'a JAMAIS eu de compteur ne devient pas caduc par vacuité : `exists` l'exige.
  if v_liens_caducs > 0 then
    select id into v_statut_caduque from statuts_mandats where code = 'CADUQUE';
    if v_statut_caduque is null then
      raise exception 'Référence manquante : statuts_mandats.CADUQUE.';
    end if;

    update mandats m
       set statut_id = v_statut_caduque, date_modification = now()
     where m.statut_id = (select id from statuts_mandats where code = 'ACTIF')
       and exists (select 1 from mandats_compteurs x where x.mandat_id = m.id)
       and not exists (
             select 1 from mandats_compteurs x
              where x.mandat_id = m.id and x.caduc_depuis is null)
       and exists (
             select 1 from mandats_compteurs x
              where x.mandat_id = m.id and x.compteur_id = any(v_compteurs));
    get diagnostics v_mandats_caducs = row_count;
  end if;

  -- ── 3. LA LIGNE `sites`, quand plus rien du compte d'origine ne s'y accroche ──────────────────
  select count(*) into v_restes_sur_le_lieu
    from compteurs cp
   where cp.site_id = v_site and cp.compte_id = v_compte_origine;
  if v_restes_sur_le_lieu = 0 then
    update sites set compte_id = p_compte_destination_id
     where id = v_site and compte_id = v_compte_origine;
    v_site_suit := found;
  end if;

  -- ── 4. LES REQUÊTES, qui recopient le compte ─────────────────────────────────────────────────
  --
  -- Seulement celles qui pointaient vers l'ancien : une réclamation déjà rangée ailleurs l'a été
  -- exprès.
  update requetes set compte_id = p_compte_destination_id
   where compteur_id = any(v_compteurs) and compte_id = v_compte_origine;
  get diagnostics v_requetes = row_count;

  -- ── 5. LES INTERACTIONS DU LIEU, seulement si le lieu a suivi ────────────────────────────────
  --
  -- Elles s'accrochent au site, pas au compteur : les déplacer quand le site reste chez l'origine
  -- emmènerait des échanges qui concernent encore d'autres compteurs.
  if v_site_suit then
    update interactions set compte_id = p_compte_destination_id
     where site_id = v_site and compte_id = v_compte_origine;
    get diagnostics v_interactions = row_count;
  end if;

  -- ── 6. LE RESPONSABLE ────────────────────────────────────────────────────────────────────────
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

  -- ── 7. LE RELAIS SUIT, SE RATTACHE, ET SE SIGNALE ────────────────────────────────────────────
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

  -- ── 8. LA TRACE ──────────────────────────────────────────────────────────────────────────────
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
    'caducite', jsonb_build_object(
      'liens_caducs', v_liens_caducs,
      'mandats_caducs', v_mandats_caducs),
    'restes', jsonb_build_object(
      'mandats', v_mandats, 'contrats', v_contrats,
      'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$$;

comment on function public.fn_rattacher_compteur(uuid, uuid, boolean, text, uuid, text) is
  'Rattache un compteur à un autre compte, en écrivant compteurs.compte_id. Sort le compteur du périmètre des mandats qui ne sont plus ceux de son compte, et rend le mandat caduc quand il ne couvre plus rien.';

grant execute on function public.fn_rattacher_compteur(uuid, uuid, boolean, text, uuid, text) to authenticated;
