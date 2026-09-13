-- MIGRATION-SANS-TRANSACTION: create index concurrently ne peut pas s'exécuter dans une transaction,
-- et c'est ce qui permet d'indexer 222 000 lignes sans verrouiller la table en pleine journée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GRANDES TABLES CESSENT D'ÊTRE PARCOURUES EN ENTIER
--
-- Audit technique du 13/09/2026, constat BCK-01. C'est, selon toute vraisemblance, le premier
-- consommateur de CPU de l'instance Supabase — celui qui explique que la sonde mesure 1 069 ms
-- là où une machine saine fait 200 à 400 ms.
--
-- ══ CE QUI SE PASSE AUJOURD'HUI ═══════════════════════════════════════════════════════════════
--
-- Les index de ce schéma ont été créés SYSTÉMATIQUEMENT sur les colonnes d'audit —
-- `cree_par_id`, `modifie_par_id`, `proprietaire_id` — qui ne servent pratiquement jamais de
-- filtre. Et ils manquent sur les colonnes que les écrans interrogent réellement.
--
-- ── `interactions`, 80 715 lignes ──
--
--   Index existants : action_id, cree_par_id, modifie_par_id, proprietaire_id,
--                     version_recommandation_id, suivi_contrat_id
--
--   Ce que `src/lib/data/interactions.ts:161-172` demande à chaque ouverture de fiche compte :
--       .eq('compte_id', …)                      AUCUN INDEX
--       .in('site_id', […150])                   AUCUN INDEX
--       .order('date_interaction', desc)         AUCUN INDEX
--
--   Pour un compte de syndic à 1 677 sites, la fiche part en douze requêtes par lots de 150. Soit
--   DOUZE PARCOURS SÉQUENTIELS COMPLETS de 80 715 lignes, chacun suivi d'un tri — près d'un
--   million de lignes lues et triées pour afficher un fil d'activité.
--
-- ── `historique_modifications`, 222 474 lignes ──
--
--   Index existant : modifie_par_id. Et rien d'autre.
--
--   Ce que `src/lib/data/historique.ts:148-153` demande, depuis QUATORZE écrans :
--       .eq('table_nom', …)  .eq('ligne_id', …)
--       .order('date_modification', desc).limit(50)
--
--   Aucune des trois colonnes n'est indexée. Chaque ouverture d'un onglet Historique parcourt
--   222 474 lignes et les trie, pour en afficher cinquante.
--
-- ══ POURQUOI CETTE MIGRATION N'EST PAS DANS UNE TRANSACTION ═══════════════════════════════════
--
-- C'est la seule du dépôt sans `begin; … commit;`, et ce n'est pas un oubli.
--
-- `create index concurrently` NE PEUT PAS s'exécuter dans une transaction — PostgreSQL le refuse
-- avec « CREATE INDEX CONCURRENTLY cannot run inside a transaction block ». En échange, il ne pose
-- AUCUN VERROU d'écriture : l'équipe peut créer des tâches, consigner des appels et modifier des
-- fiches pendant toute la construction. C'est ce qui permet de l'appliquer un jour ouvré.
--
-- Un `create index` ordinaire, lui, verrouille la table en écriture. Sur `historique_modifications`
-- — que CHAQUE modification de CHAQUE fiche alimente par déclencheur — cela bloquerait toute
-- l'application le temps de la construction.
--
-- CONSÉQUENCE À CONNAÎTRE : sans transaction, il n'y a pas de tout-ou-rien. Si l'exécution
-- s'interrompt au milieu, les index déjà créés restent, les suivants manquent. Ce n'est pas grave
-- ici — chaque `create index` est indépendant des autres, et `if not exists` rend le fichier
-- rejouable : on le relance, il reprend où il en était.
--
-- LE PIÈGE, LE VRAI, EST AILLEURS. Si un `create index concurrently` ÉCHOUE en cours de route
-- (annulation, saturation disque, conflit), PostgreSQL laisse en place un index INVALIDE. Il porte
-- le bon nom, donc `if not exists` le croira présent au passage suivant et ne le reconstruira pas
-- — et un index invalide n'accélère rien tout en coûtant à chaque écriture. La vérification en fin
-- de fichier est là pour ça : elle ne se contente pas de compter les index, elle contrôle qu'ils
-- sont VALIDES. Le cas échéant, `drop index` sur celui qui l'est resté, puis relancer.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ════════════════════════════════════════════════════════
--
-- Elle ne supprime aucun index existant, pas même ceux sur les colonnes d'audit qui ne servent à
-- rien. Un index inutile coûte à l'écriture, mais le retirer est une décision à prendre sur
-- mesure, avec `pg_stat_user_indexes` sous les yeux après quelques semaines — pas dans le même
-- fichier que celui qui répare une lenteur.
-- ════════════════════════════════════════════════════════════════════════════════════════════════


-- ══ 1. `interactions` — LE FIL D'ACTIVITÉ D'UNE FICHE ═══════════════════════════════════════════
--
-- La date est DANS l'index, en second, et en ordre décroissant. C'est ce qui fait la différence
-- entre « trouver les lignes du compte » et « trouver les lignes du compte, déjà triées » :
-- PostgreSQL lit alors les premières et s'arrête, au lieu de tout ramener pour trier ensuite.
-- L'ordre `desc` est celui de la requête ; l'inverse obligerait à parcourir l'index à rebours,
-- ce qu'il sait faire mais moins bien.

create index concurrently if not exists idx_interactions_compte_date
  on public.interactions (compte_id, date_interaction desc);

create index concurrently if not exists idx_interactions_site_date
  on public.interactions (site_id, date_interaction desc);


-- ══ 2. `historique_modifications` — L'ONGLET HISTORIQUE DE QUATORZE ÉCRANS ══════════════════════
--
-- Les trois colonnes dans l'ordre exact de la requête : les deux égalités d'abord, la date ensuite.
-- Cet ordre n'est pas indifférent — un index (date, table_nom, ligne_id) serait inutilisable ici,
-- puisqu'on ne connaît pas la date à l'avance.
--
-- C'est l'index qui rapporte le plus de cette migration : 222 474 lignes parcourues et triées
-- deviennent une poignée de lignes lues directement.

create index concurrently if not exists idx_historique_cible
  on public.historique_modifications (table_nom, ligne_id, date_modification desc);


-- ══ 3. `documents` — L'ONGLET FICHIERS ══════════════════════════════════════════════════════════
--
-- `src/lib/data/documents.ts:51` filtre sur `entite_id` seul — le rattachement est polymorphe
-- (entite_type + entite_id), mais deux entités de types différents ne partagent jamais un UUID,
-- c'est ce que dit le commentaire du fichier.
--
-- PAS DE `date_creation` EN SECOND, ICI. Le tri porte sur l'ENSEMBLE du résultat, toutes entités
-- confondues, alors que l'index ne pourrait le pré-trier qu'à l'intérieur de chaque `entite_id`.
-- PostgreSQL devra trier de toute façon : l'ajouter alourdirait l'index sans rien accélérer.

create index concurrently if not exists idx_documents_entite
  on public.documents (entite_id);


-- ══ 4. `actions` — LES TÂCHES RATTACHÉES À UN OBJET ════════════════════════════════════════════
--
-- `src/lib/data/actions.ts:60-66` filtre sur cinq rattachements différents selon l'écran d'où
-- l'on vient, toujours suivis de `.order('date_prevue')`. Deux de ces cinq colonnes sont déjà
-- indexées (`piste_id`, `suivi_contrat_id`), les trois autres non — plus `site_id`, qui sert à la
-- fiche compte.
--
-- La date accompagne chaque colonne pour la même raison qu'au point 1.

create index concurrently if not exists idx_actions_site_date
  on public.actions (site_id, date_prevue);

create index concurrently if not exists idx_actions_recommandation_date
  on public.actions (recommandation_id, date_prevue);

create index concurrently if not exists idx_actions_opportunite_date
  on public.actions (opportunite_id, date_prevue);

create index concurrently if not exists idx_actions_requete_date
  on public.actions (requete_id, date_prevue);


-- ══ 5. `recommandations` — LES DOSSIERS D'UN COMPTE ════════════════════════════════════════════
--
-- `src/lib/data/recommandations.ts:245` : `.eq('compte_id', …).order('date_ouverture', desc)`.
-- La table porte treize index, dont ceux sur `cree_par_id` et `modifie_par_id` — et pas celui-là.

create index concurrently if not exists idx_recommandations_compte_date
  on public.recommandations (compte_id, date_ouverture desc);


-- ══ 6. LA RECHERCHE DE LA PAGE COMPTES ═════════════════════════════════════════════════════════
--
-- Audit, constat BCK-04. `src/pages/Comptes.tsx:102` cherche sur `['nom', 'segment', 'ville']` en
-- `ilike '%mot%'`. Un index trigramme existait sur `comptes.nom` seul.
--
-- POURQUOI UN INDEX SUR UNE SEULE DES TROIS COLONNES NE SERT À RIEN ICI. Les trois conditions sont
-- combinées par OU. PostgreSQL ne peut construire un parcours par index (`BitmapOr`) que si
-- TOUTES les branches en ont un ; s'il en manque une seule, il retombe sur un parcours séquentiel
-- de la table entière — et l'index existant ne sert alors jamais.
--
-- Les deux qui manquaient complètent donc le premier : c'est à trois qu'ils deviennent utiles.

create index concurrently if not exists idx_comptes_ville_trgm
  on public.comptes using gin (ville gin_trgm_ops);

create index concurrently if not exists idx_comptes_segment_trgm
  on public.comptes using gin (segment gin_trgm_ops);


-- ══ 7. RÉANALYSER, SANS QUOI LE PLANIFICATEUR IGNORE CE QU'ON VIENT DE POSER ════════════════════
--
-- Un index neuf ne suffit pas : PostgreSQL choisit ses plans sur des STATISTIQUES, et elles ne se
-- rafraîchissent qu'à l'`analyze` — automatique, mais déclenché par un volume d'écritures qui peut
-- mettre des heures à venir sur une table qu'on ne modifie pas beaucoup.
--
-- La leçon est déjà écrite dans `scripts/reanalyser.cjs`, après l'incident du 07/09/2026 où une
-- insertion massive sans réanalyse avait bloqué toute l'équipe. Elle vaut aussi à l'endroit :
-- poser un index sans réanalyser, c'est le payer à chaque écriture sans en tirer les lectures.

analyze public.interactions;
analyze public.historique_modifications;
analyze public.documents;
analyze public.actions;
analyze public.recommandations;
analyze public.comptes;


-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION APRÈS APPLICATION — À COLLER TELLE QUELLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. LES ONZE INDEX SONT-ILS LÀ, ET SURTOUT SONT-ILS VALIDES ?
--
--    select c.relname as index, i.indisvalid as valide, i.indisready as pret
--      from pg_class c
--      join pg_index i on i.indexrelid = c.oid
--     where c.relname in (
--             'idx_interactions_compte_date', 'idx_interactions_site_date',
--             'idx_historique_cible', 'idx_documents_entite',
--             'idx_actions_site_date', 'idx_actions_recommandation_date',
--             'idx_actions_opportunite_date', 'idx_actions_requete_date',
--             'idx_recommandations_compte_date',
--             'idx_comptes_ville_trgm', 'idx_comptes_segment_trgm')
--     order by 1;
--
--    ATTENDU : onze lignes, `valide` et `pret` à `true` PARTOUT.
--    Une ligne à `valide = false` est un index construit à moitié : il ne sert à rien et coûte à
--    chaque écriture. `drop index <son nom>;` puis relancer cette migration.
--    Une ligne manquante : relancer la migration, elle reprendra où elle s'est arrêtée.
--
-- 2. L'HISTORIQUE EST-IL RÉELLEMENT SERVI PAR L'INDEX ?
--
--    explain (analyze, buffers)
--    select * from public.v_historique_modifications
--     where table_nom = 'comptes'
--       and ligne_id = (select id from public.comptes order by nom limit 1)
--     order by date_modification desc
--     limit 50;
--
--    ATTENDU : « Index Scan using idx_historique_cible ». Un « Seq Scan » signifie que l'index
--    n'est pas pris — vérifier alors le point 1, puis relancer `analyze`.
--
-- 3. LA MESURE QUI TRANCHE LA QUESTION DE L'ABONNEMENT
--
--    `npm run sonde` une fois par jour, à heure fixe, en pleine activité, PENDANT UNE SEMAINE.
--    C'est la médiane qui décide, jamais une mesure isolée :
--
--       sous 500 ms        le plan Small convient, la question est close
--       500 à 1 500 ms     traiter BCK-02 et BCK-04 avant de rouvrir le sujet
--       plus de 1 500 ms   le calcul ne suffit pas — et ce serait `Large`, pas `Medium`,
--                          qui est partagé comme Small et ne changerait rien
--
--    Point de comparaison : 1 069 ms et 962 ms les 10/09 et 11/09, AVANT cette migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
