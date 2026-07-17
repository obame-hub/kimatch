# Migrations proposées — suite au retour de William (16/07/2026)

Ces 3 scripts répondent aux points 1, 2 et 4 du message de William. Le point 3 (offres structurées par version) n'est pas inclus — jugé moins urgent, peut suivre après stabilisation du MVP.

**Aucun de ces scripts n'a été exécuté sur Supabase.** À relire par William et Michel avant de lancer quoi que ce soit — c'est une base de données partagée.

## 01_statuts_reference_tables.sql
Remplace les champs texte libre `statut` de `contrats`, `signaux`, `mandats`, `actions` par de vraies tables de référence (`statuts_contrats`, `statuts_signaux`, `statuts_mandats`, `statuts_actions`), avec ordre, couleur et icône — même pattern que `statuts_versions_recommandation` qui existe déjà. Non destructif : ajoute une colonne `statut_id` à côté de l'ancienne colonne texte, la remplit automatiquement. La suppression des anciennes colonnes texte est laissée en commentaire, à faire seulement une fois que tous les écrans auront basculé sur `statut_id`.

## 02_consommations_serie_temporelle.sql
Ajoute une table `consommations` (compteur_id, période, poste tarifaire, valeur) en série temporelle mensuelle. Peut rester vide au MVP — c'est une fondation pour permettre un jour la détection d'anomalie de consommation (signal technique) et l'anticipation par KiMatch, impossible avec juste un instantané agrégé.

## 03_interactions.sql
Crée le domaine "Interactions" (appels, emails, réunions, notes) déjà décrit au chapitre 44 du document officiel KiWee OS mais absent des 35 tables actuelles. Inclut une table de référence `types_interactions` pour rester cohérent avec le pattern des autres domaines.
