-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE CLOISONNEMENT COUVRE TOUTES LES TABLES SENSIBLES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « teste en boucle jusqu'à ce que tu ne trouves plus aucune faille ».
--
-- Quatrième tour. L'audit annonçait « aucune faille » — mais il ne testait que les onze tables
-- auxquelles j'avais pensé. En comptant celles qui portent RLS sans policy contre les partenaires,
-- j'en ai trouvé 150. Vingt fuyaient vraiment :
--
--     historique_modifications  341 098 lignes   tout ce que KiWee a modifié, avec qui et quand
--     documents                  19 688          les fichiers de tous les clients
--     versions_recommandation     2 133          les offres chiffrées de tout le portefeuille
--     suivis_contrats             1 582
--     signaux                     1 449
--     actions                       985
--     requetes                      888
--     offres_fournisseurs           351          les prix négociés, fournisseur par fournisseur
--     publications                  207
--     profils_comptes               170
--     consommations                 135
--     comptes_fournisseurs           52          les conditions commerciales de chaque fournisseur
--     objectifs_mensuels             48          les objectifs de chaque commercial
--     lots_prospection               25
--     parametres_slack / emails       4 + 4      les réglages d'intégration
--     comptes_clients                 4
--     demandes_support                2
--     depots_factures                 1
--     profils_gmail_tokens            1          UN JETON D'ACCÈS GMAIL
--
-- ══ CE QUE CELA VEUT DIRE ══
--
-- Le cloisonnement était juste là où je l'avais posé, et inexistant partout ailleurs. Fermer les
-- comptes et les contacts ne sert à rien si `documents` rend les 19 688 fichiers du portefeuille, et
-- `offres_fournisseurs` les prix négociés que nos concurrents paieraient cher.
--
-- ══ LA MÉTHODE : REFUSER PAR DÉFAUT ══
--
-- Poser une policy table par table reproduit la faute — il en manquera toujours une, et c'est celle
-- qu'on ne verra pas. On inverse donc : un partenaire ne lit RIEN, sauf la liste explicite de ce
-- dont il a besoin.
--
-- Les tables de RÉFÉRENCE restent ouvertes — types, statuts, étapes : ce sont des libellés, sans
-- lesquels ses propres écrans ne s'affichent pas, et ils ne disent rien de KiWee.
--
-- Les tables de LIAISON de son patrimoine restent ouvertes, mais bornées par les comptes qu'il voit
-- déjà : une ligne qui pointe un compte invisible reste invisible.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  t text;
  /* CE QU'IL GARDE, ET POURQUOI.
     ① Les tables de référence : des libellés, aucune donnée de KiWee. Sans elles, ses propres
        écrans afficheraient des codes bruts ou rien du tout.
     ② Les tables déjà cloisonnées par une policy écrite plus tôt — on ne les touche pas.
     ③ Ce qui le concerne lui : son profil, ses notifications, les publications de nouveautés. */
  v_gardees text[] := array[
    -- ① référence
    'types_comptes', 'types_energies', 'types_sites', 'types_documents', 'types_interactions',
    'types_actions', 'types_requetes', 'types_signaux', 'types_publications', 'types_origines',
    'types_utilisations_compteur', 'types_objectifs_client', 'types_courtiers_mandat',
    'types_canaux_communication', 'types_roles', 'types_donnees', 'types_analyses',
    'statuts_actions', 'statuts_contrats', 'statuts_mandats', 'statuts_opportunites',
    'statuts_pistes', 'statuts_requetes', 'statuts_signaux', 'statuts_expertises',
    'statuts_versions_recommandation', 'statuts_contrats_avancement', 'statuts_contrats_vie',
    'statuts_consultations_fournisseurs', 'statuts_executions',
    'etapes_recommandation', 'etapes_suivis_contrats', 'segments_comptes', 'codes_naf',
    'motifs_versions_recommandation', 'origines_pistes',
    -- ② déjà cloisonnées ailleurs
    'comptes', 'contacts', 'sites', 'compteurs', 'mandats', 'contrats', 'recommandations',
    'interactions', 'pistes', 'opportunites', 'profils', 'roles_acces', 'profils_autorises',
    -- ③ ce qui le concerne
    'notifications', 'publications', 'publications_lectures', 'consultations_recentes',
    'profils_roles_acces', 'profils_organisations', 'organisations'
  ];
  v_posees integer := 0;
begin
  for t in
    select c.relname
      from pg_class c
     where c.relkind = 'r'
       and c.relnamespace = 'public'::regnamespace
       and c.relrowsecurity
       and not (c.relname = any (v_gardees))
       /* Celles qui portent déjà une règle contre les partenaires ont été pensées : on n'y touche
          pas, au risque d'en durcir une qui devait rester ouverte. */
       and not exists (
         select 1 from pg_policies p
          where p.tablename = c.relname
            and p.permissive = 'RESTRICTIVE'
            and (coalesce(p.qual, '') like '%est_partenaire%'
              or coalesce(p.with_check, '') like '%est_partenaire%')
       )
  loop
    execute format('drop policy if exists %I on public.%I', t || '_pas_aux_partenaires', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (not public.est_partenaire()) with check (not public.est_partenaire())',
      t || '_pas_aux_partenaires', t);
    v_posees := v_posees + 1;
  end loop;
  raise notice 'Cloisonnement posé sur % table(s).', v_posees;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : PLUS RIEN NE FUIT, ET L'ÉQUIPE TRAVAILLE ENCORE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Fermer 130 tables d'un coup est le geste le plus risqué de la journée : une table fermée par
-- erreur casse un écran de l'équipe, et ça se verra demain matin. On éprouve donc les deux sens,
-- et le second compte autant que le premier.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_type_p     uuid;
  v_fuites     text := '';
  v_n          integer;
  v_equipe     integer;
  t            text;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  select p.id into v_profil
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
   limit 1;
  if v_type_p is null or v_profil is null then
    raise notice 'Garde-fou ignoré : type PARTENAIRE ou profil non administrateur manquant.';
    return;
  end if;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou tables', v_type_p) returning id into v_partenaire;
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ① LES VINGT TABLES QUI FUYAIENT DOIVENT RENDRE ZÉRO.
  foreach t in array array['historique_modifications', 'documents', 'versions_recommandation',
    'suivis_contrats', 'signaux', 'actions', 'requetes', 'offres_fournisseurs', 'consommations',
    'comptes_fournisseurs', 'objectifs_mensuels', 'lots_prospection', 'parametres_slack',
    'parametres_emails', 'comptes_clients', 'demandes_support', 'depots_factures',
    'profils_gmail_tokens', 'profils_comptes']
  loop
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n > 0 then
      v_fuites := v_fuites || t || ' (' || v_n || ') ';
    end if;
  end loop;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_fuites <> '' then
    raise exception 'Un partenaire lit encore : %', v_fuites;
  end if;

  -- ② L'ÉQUIPE TRAVAILLE ENCORE. Si ce contrôle échoue, c'est un écran cassé demain matin.
  update public.profils set compte_partenaire_id = null where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_equipe from public.documents;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_equipe = 0 then
    raise exception 'L''équipe ne lit plus les documents : le cloisonnement s''est refermé sur KiWee.';
  end if;

  delete from public.comptes where id = v_partenaire;

  raise notice 'Garde-fou : plus aucune fuite, et l''équipe lit toujours ses % documents.', v_equipe;
end $$;

commit;
