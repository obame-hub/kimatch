-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA TÂCHE DU RELAIS SE CRÉE VRAIMENT, ET NE SE TAIT PLUS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Correctif de 20260913150000, pris à l'essai à blanc : le déplacement conservait bien le relais,
-- mais la tâche n'était jamais créée. C'EST LE CORPS QUI FAIT FOI.
--
-- DEUX FAUTES, DONT UNE SEULE ÉTAIT VISIBLE.
--
--   1. La colonne `actions.description` n'existe pas — c'est `commentaire`. Erreur bruyante, prise
--      dès la première exécution.
--
--   2. Le type d'action cherché était `RELANCE`. Le code réel est `APPELER` (libellé « Appel »), et
--      c'est le bon : on demande d'appeler le conseil syndical. `RELANCE` n'existe que dans le
--      tableau de repli du navigateur, jamais en base.
--
-- PLUS GRAVE QUE LA FAUTE DE FRAPPE : le `where exists (...)` censé protéger d'une table de
-- référence vide SAUTAIT L'INSERTION SANS RIEN DIRE. Une garde qui transforme une erreur bruyante
-- en fonctionnalité silencieusement absente ne protège de rien. Les identifiants sont donc lus dans
-- des variables, et leur absence lève une exception : une table de référence vide est un incident,
-- pas un cas de figure.
--
-- ══ VÉRIFIÉ EN ESSAI À BLANC LE 13/09/2026 ══
--
-- Compteur 21481476032220, de « SDC 4 RUE EDOUARD DETAILLE » vers « SDC LE VAL VERT », détachement
-- des contacts demandé : relais conservé, responsable détaché, tâche créée avec son message.
-- Transaction annulée volontairement.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_deplacer_compteur(
  p_compteur_id uuid, p_site_destination_id uuid,
  p_detacher_contacts boolean default false, p_motif text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_site_origine uuid; v_compte_origine uuid; v_compte_dest uuid; v_numero text;
  v_nom_dest text; v_nom_origine text;
  v_signaux integer := 0; v_requetes integer := 0; v_contacts integer := 0;
  v_mandats integer; v_contrats integer; v_recos integer; v_opportunites integer;
  v_relais uuid; v_relais_nom text; v_tache uuid := null;
  v_type_appel uuid; v_statut_a_faire uuid;
  v_correlation uuid := md5(txid_current()::text)::uuid;
begin
  select cp.site_id, cp.numero_point, cp.contact_conseil_syndical_id
    into v_site_origine, v_numero, v_relais
    from compteurs cp where cp.id = p_compteur_id;
  if v_site_origine is null then
    raise exception 'Compteur introuvable : %', p_compteur_id;
  end if;

  select g.compte_id, g.libelle into v_compte_dest, v_nom_dest
    from ( select distinct cp.groupe_site_id, cp.compte_id, cp.libelle_site as libelle from compteurs cp ) g
   where g.groupe_site_id = p_site_destination_id;
  if v_compte_dest is null then
    raise exception 'Site de destination introuvable, ou sans aucun compteur : %', p_site_destination_id;
  end if;

  select g.compte_id, g.libelle into v_compte_origine, v_nom_origine
    from ( select distinct cp.groupe_site_id, cp.compte_id, cp.libelle_site as libelle from compteurs cp ) g
   where g.groupe_site_id = v_site_origine;

  if v_site_origine = p_site_destination_id then
    raise exception 'Le compteur % est déjà rattaché au site « % ».', v_numero, v_nom_dest;
  end if;

  select count(distinct mc.mandat_id) into v_mandats
    from mandats_compteurs mc join mandats m on m.id = mc.mandat_id
   where mc.compteur_id = p_compteur_id and m.compte_id = v_compte_origine;
  select count(distinct cc.contrat_id) into v_contrats
    from contrats_compteurs cc join suivis_contrats sc on sc.id = cc.contrat_id
   where cc.compteur_id = p_compteur_id and sc.compte_id = v_compte_origine;
  select count(distinct rc.recommandation_id) into v_recos
    from recommandations_compteurs rc join recommandations r on r.id = rc.recommandation_id
   where rc.compteur_id = p_compteur_id and r.compte_id = v_compte_origine;
  select count(distinct oc.opportunite_id) into v_opportunites
    from opportunites_compteurs oc join opportunites o on o.id = oc.opportunite_id
   where oc.compteur_id = p_compteur_id and o.compte_id = v_compte_origine;

  update compteurs set site_id = p_site_destination_id where id = p_compteur_id;

  update signaux set site_id = p_site_destination_id
   where compteur_id = p_compteur_id and site_id = v_site_origine;
  get diagnostics v_signaux = row_count;

  update requetes
     set site_id   = case when site_id  = v_site_origine   then p_site_destination_id else site_id end,
         compte_id = case when compte_id = v_compte_origine then v_compte_dest         else compte_id end
   where compteur_id = p_compteur_id and (site_id = v_site_origine or compte_id = v_compte_origine);
  get diagnostics v_requetes = row_count;

  -- ── LE RESPONSABLE SE DÉTACHE, LE RELAIS RESTE ──────────────────────────────────────────────
  -- William, 13/09/2026 : le relais « se lie au nouveau compte obligatoirement, mais il reste
  -- avant tout toujours lié au compteur (le décisionnaire doit changer en revanche) ».
  if p_detacher_contacts then
    update compteurs set responsable_contact_id = null
     where id = p_compteur_id and responsable_contact_id is not null
       and not fn_contact_rattache_au_compte(responsable_contact_id, v_compte_dest);
    get diagnostics v_contacts = row_count;
  end if;

  -- ── LE RELAIS SUIT, SE RATTACHE, ET SE SIGNALE ──────────────────────────────────────────────
  if v_relais is not null and v_compte_origine is distinct from v_compte_dest then
    insert into contacts_comptes (contact_id, compte_id, relation_directe)
    values (v_relais, v_compte_dest, false) on conflict do nothing;

    select trim(c.prenom || ' ' || c.nom) into v_relais_nom from contacts c where c.id = v_relais;

    select id into v_type_appel     from types_actions   where code = 'APPELER';
    select id into v_statut_a_faire from statuts_actions where code = 'A_FAIRE';
    if v_type_appel is null or v_statut_a_faire is null then
      raise exception 'Références manquantes : types_actions.APPELER ou statuts_actions.A_FAIRE.';
    end if;

    -- LA TÂCHE PORTE LA QUESTION, PAS LE CONSTAT. « Le compteur a changé de compte » n'appelle
    -- aucun geste ; « demander quel est le nouveau cabinet » en appelle un, et c'est la seule
    -- information que le conseil syndical détient et que nous n'avons pas.
    --
    -- Elle s'accroche au SITE faute de mieux : `actions_contexte_check` n'accepte pas encore
    -- `compteur_id` parmi ses contextes. Ligne à déplacer quand le retrait de l'objet Site
    -- atteindra cette contrainte.
    insert into actions (type_action_id, statut_id, titre, commentaire, site_id, contact_id, date_prevue, priorite)
    values (v_type_appel, v_statut_a_faire,
            'Changement de cabinet — appeler le relais ' || coalesce(v_relais_nom, 'du conseil syndical'),
            'Le compteur ' || v_numero || ' est passé de « ' || coalesce(v_nom_origine, '?') ||
              ' » à « ' || v_nom_dest || ' ». Demander au conseil syndical quel est le nouveau ' ||
              'cabinet de syndic et si le contrat d''énergie suit.',
            p_site_destination_id, v_relais, (now() at time zone 'Europe/Paris')::date, 30)
    returning id into v_tache;
  end if;

  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id
  ) values (
    'compteurs', p_compteur_id, 'UPDATE',
    jsonb_build_object('site_id', v_site_origine, 'site_nom', v_nom_origine, 'compte_id', v_compte_origine),
    jsonb_build_object('site_id', p_site_destination_id, 'site_nom', v_nom_dest, 'compte_id', v_compte_dest),
    array['site_id'], p_motif, auth.uid(), 'APPLICATION', v_correlation
  );

  return jsonb_build_object(
    'geste', 'compteur', 'compteur', v_numero,
    'change_de_compte', v_compte_origine is distinct from v_compte_dest,
    'site_origine', v_nom_origine, 'site_destination', v_nom_dest,
    'suivis', jsonb_build_object('signaux', v_signaux, 'requetes', v_requetes,
                                 'contacts_detaches', v_contacts,
                                 'relais_conserve', v_relais is not null,
                                 'relais_nom', v_relais_nom, 'tache_relais', v_tache),
    'restes', jsonb_build_object('mandats', v_mandats, 'contrats', v_contrats,
                                 'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$function$;

commit;

-- ══ CONTRÔLE APRÈS APPLICATION ══
--
--   Essai à blanc dans une transaction annulée : déplacer un compteur porteur d'un relais avec
--   `p_detacher_contacts = true`, puis vérifier que `contact_conseil_syndical_id` est intact, que
--   `responsable_contact_id` est vidé, et que `suivis->>'tache_relais'` porte un identifiant.
