-- Soixante-dix-neuf cles etrangeres sans index.
--
-- CE QUE L'AUDIT DU 28/08/2026 A MESURE. Sur les tables de plus de 500 lignes, 79 colonnes
-- portent une contrainte de cle etrangere sans qu'aucun index ne les couvre. Postgres n'en cree
-- pas tout seul : il indexe la cle PRIMAIRE, jamais celle qui pointe vers elle.
--
-- CE QUE CA COUTE, CONCRETEMENT. La fiche compte emet 60 requetes vers 38 tables et sa derniere
-- reponse arrive a 28,6 secondes — mesure sur CABINET MOLINIER (40 sites, 44 compteurs, 39
-- dossiers). Chaque « donne-moi les compteurs de ce site », « les suivis de cette consultation »,
-- « les signaux de ce contrat » balaie la table entiere faute d'index. L'ecran Pricing lit
-- `suivis_consultations_fournisseurs` par `optimisation_fournisseur_id` a chaque chargement :
-- 5 417 lignes parcourues pour en trouver trois.
--
-- Et ce n'est pas seulement la lecture : SUPPRIMER une ligne parente oblige Postgres a verifier
-- qu'aucun enfant n'y fait reference, donc a balayer la table enfant. C'est une partie de la
-- lenteur ressentie a la suppression d'un compte.
--
-- POURQUOI TOUTES, ET PAS SEULEMENT LES PLUS CHAUDES. Trier aurait demande de deviner quelles
-- jointures comptent, et de se tromper sur les prochaines. Le cout est faible et connu : ces
-- tables voient peu d'ecritures — 21 recommandations creees en aout — et chaque index pese
-- quelques centaines de kilo-octets. Le cout d'un index manquant, lui, se paie a chaque
-- affichage.
--
-- `if not exists` partout : la migration se rejoue sans rien casser.

begin;

create index if not exists idx_comptes_apporteur_partenaire_id on public.comptes (apporteur_partenaire_id);
create index if not exists idx_comptes_cree_par_id on public.comptes (cree_par_id);
create index if not exists idx_comptes_modifie_par_id on public.comptes (modifie_par_id);
create index if not exists idx_comptes_proprietaire_id on public.comptes (proprietaire_id);
create index if not exists idx_comptes_type_compte_id on public.comptes (type_compte_id);
create index if not exists idx_compteurs_contact_conseil_syndical_id on public.compteurs (contact_conseil_syndical_id);
create index if not exists idx_compteurs_cree_par_id on public.compteurs (cree_par_id);
create index if not exists idx_compteurs_fournisseur_actuel_compte_id on public.compteurs (fournisseur_actuel_compte_id);
create index if not exists idx_compteurs_modifie_par_id on public.compteurs (modifie_par_id);
create index if not exists idx_compteurs_proprietaire_id on public.compteurs (proprietaire_id);
create index if not exists idx_compteurs_responsable_contact_id on public.compteurs (responsable_contact_id);
create index if not exists idx_contacts_compte_id on public.contacts (compte_id);
create index if not exists idx_contacts_cree_par_id on public.contacts (cree_par_id);
create index if not exists idx_contacts_modifie_par_id on public.contacts (modifie_par_id);
create index if not exists idx_contacts_proprietaire_id on public.contacts (proprietaire_id);
create index if not exists idx_contrats_compte_id on public.contrats (compte_id);
create index if not exists idx_contrats_contact_signataire_id on public.contrats (contact_signataire_id);
create index if not exists idx_contrats_cree_par_id on public.contrats (cree_par_id);
create index if not exists idx_contrats_fournisseur_compte_id on public.contrats (fournisseur_compte_id);
create index if not exists idx_contrats_interlocuteur_pricing_contact_id on public.contrats (interlocuteur_pricing_contact_id);
create index if not exists idx_contrats_modifie_par_id on public.contrats (modifie_par_id);
create index if not exists idx_contrats_proprietaire_id on public.contrats (proprietaire_id);
create index if not exists idx_contrats_statut_avancement_id on public.contrats (statut_avancement_id);
create index if not exists idx_contrats_statut_id on public.contrats (statut_id);
create index if not exists idx_contrats_statut_vie_id on public.contrats (statut_vie_id);
create index if not exists idx_contrats_type_energie_id on public.contrats (type_energie_id);
create index if not exists idx_contrats_valide_par_id on public.contrats (valide_par_id);
create index if not exists idx_contrats_version_recommandation_id on public.contrats (version_recommandation_id);
create index if not exists idx_documents_auteur_profil_id on public.documents (auteur_profil_id);
create index if not exists idx_documents_cree_par_id on public.documents (cree_par_id);
create index if not exists idx_documents_modifie_par_id on public.documents (modifie_par_id);
create index if not exists idx_documents_proprietaire_id on public.documents (proprietaire_id);
create index if not exists idx_documents_type_document_id on public.documents (type_document_id);
create index if not exists idx_historique_modifications_modifie_par_id on public.historique_modifications (modifie_par_id);
create index if not exists idx_interactions_action_id on public.interactions (action_id);
create index if not exists idx_interactions_cree_par_id on public.interactions (cree_par_id);
create index if not exists idx_interactions_modifie_par_id on public.interactions (modifie_par_id);
create index if not exists idx_interactions_proprietaire_id on public.interactions (proprietaire_id);
create index if not exists idx_interactions_version_recommandation_id on public.interactions (version_recommandation_id);
create index if not exists idx_mandats_contact_signataire_id on public.mandats (contact_signataire_id);
create index if not exists idx_mandats_cree_par_id on public.mandats (cree_par_id);
create index if not exists idx_mandats_modifie_par_id on public.mandats (modifie_par_id);
create index if not exists idx_mandats_proprietaire_id on public.mandats (proprietaire_id);
create index if not exists idx_mandats_statut_id on public.mandats (statut_id);
create index if not exists idx_mandats_courtiers_type_courtier_id on public.mandats_courtiers (type_courtier_id);
create index if not exists idx_optimisations_fournisseurs_fournisseur_compte_id on public.optimisations_fournisseurs (fournisseur_compte_id);
create index if not exists idx_profils_comptes_compte_id on public.profils_comptes (compte_id);
create index if not exists idx_profils_comptes_type_role_id on public.profils_comptes (type_role_id);
create index if not exists idx_proprietaires_en_attente_compte_id on public.proprietaires_en_attente (compte_id);
create index if not exists idx_recommandations_contact_signataire_id on public.recommandations (contact_signataire_id);
create index if not exists idx_recommandations_cree_par_id on public.recommandations (cree_par_id);
create index if not exists idx_recommandations_etape_id on public.recommandations (etape_id);
create index if not exists idx_recommandations_fournisseur_compte_id on public.recommandations (fournisseur_compte_id);
create index if not exists idx_recommandations_modifie_par_id on public.recommandations (modifie_par_id);
create index if not exists idx_recommandations_origine_id on public.recommandations (origine_id);
create index if not exists idx_recommandations_proprietaire_id on public.recommandations (proprietaire_id);
create index if not exists idx_recommandations_responsable_profil_id on public.recommandations (responsable_profil_id);
create index if not exists idx_recommandations_signal_id on public.recommandations (signal_id);
create index if not exists idx_recommandations_type_energie_id on public.recommandations (type_energie_id);
create index if not exists idx_recommandations_compteurs_compteur_id on public.recommandations_compteurs (compteur_id);
create index if not exists idx_signaux_contrat_id on public.signaux (contrat_id);
create index if not exists idx_signaux_cree_par_id on public.signaux (cree_par_id);
create index if not exists idx_signaux_modifie_par_id on public.signaux (modifie_par_id);
create index if not exists idx_signaux_proprietaire_id on public.signaux (proprietaire_id);
create index if not exists idx_signaux_recommandation_id on public.signaux (recommandation_id);
create index if not exists idx_signaux_responsable_profil_id on public.signaux (responsable_profil_id);
create index if not exists idx_signaux_statut_id on public.signaux (statut_id);
create index if not exists idx_signaux_type_signal_id on public.signaux (type_signal_id);
create index if not exists idx_sites_cree_par_id on public.sites (cree_par_id);
create index if not exists idx_sites_modifie_par_id on public.sites (modifie_par_id);
create index if not exists idx_sites_proprietaire_id on public.sites (proprietaire_id);
create index if not exists idx_sites_type_site_id on public.sites (type_site_id);
create index if not exists idx_suivis_consultations_fournisseurs_auteur_profil_id on public.suivis_consultations_fournisseurs (auteur_profil_id);
create index if not exists idx_suivis_consultations_fournisseurs_optimisation_fournisseur_id on public.suivis_consultations_fournisseurs (optimisation_fournisseur_id);
create index if not exists idx_suivis_consultations_fournisseurs_statut_id on public.suivis_consultations_fournisseurs (statut_id);
create index if not exists idx_versions_recommandation_contact_id on public.versions_recommandation (contact_id);
create index if not exists idx_versions_recommandation_motif_version_id on public.versions_recommandation (motif_version_id);
create index if not exists idx_versions_recommandation_compteurs_compteur_id on public.versions_recommandation_compteurs (compteur_id);
create index if not exists idx_versions_recommandation_durees_compteur_id on public.versions_recommandation_durees (compteur_id);

commit;
