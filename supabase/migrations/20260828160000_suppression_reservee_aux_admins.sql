-- La suppression n'etait bornee nulle part.
--
-- CE QUE L'AUDIT DU 28/08/2026 A MESURE : 113 tables portaient une politique unique,
-- `authenticated_all`, en ALL avec `USING (true) WITH CHECK (true)`. Lire, ecrire ET SUPPRIMER
-- etaient donc ouverts a tout utilisateur connecte, sur toute table. La lecture ouverte est une
-- decision assumee du 14/08 (« tous les commerciaux voient tous les comptes »). La suppression
-- ouverte, elle, n'a jamais ete decidee : personne ne l'a choisie, elle est arrivee avec la
-- politique fourre-tout.
--
-- CE QUE CETTE MIGRATION FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS.
--
-- Elle ajoute une politique RESTRICTIVE de suppression sur 96 tables. Restrictive veut dire
-- qu'elle se combine en ET avec `authenticated_all` : la lecture, l'insertion et la mise a jour
-- ne bougent pas d'un pouce, seule la suppression exige desormais un role ADMIN ou SUPER_ADMIN.
-- Rien n'est supprime, rien n'est renomme, et la manoeuvre s'annule en supprimant la politique.
--
-- ELLE EPARGNE 17 TABLES, ET C'EST LE POINT IMPORTANT. Le premier jet de l'audit affirmait
-- qu'« aucun ecran ne supprime de contrat ni de mandat » : c'etait faux. En cherchant les
-- `.delete()` du code, on en trouve sur 25 tables — comptes, contacts, compteurs, sites,
-- contrats, mandats, recommandations, versions, offres, signaux, documents, interactions,
-- taches... Ces ecrans fonctionnent aujourd'hui pour un conseiller. Les proteger ici aurait
-- casse son travail des lundi, avec pour seul symptome le message « Suppression refusee par la
-- base » que `useSuppression` sait deja afficher.
--
-- RESTE DONC UNE QUESTION OUVERTE, qui n'est pas technique : un conseiller doit-il pouvoir
-- supprimer un compte, un contrat ou un mandat ? Aujourd'hui il le peut, sans confirmation de
-- role, et cette migration ne change pas cela. Elle ferme les 96 tables ou la suppression
-- n'a jamais servi a personne — referentiels de statuts, tables de reprise, sous-systeme de
-- calcul jamais utilise — et laisse le reste tel quel jusqu'a arbitrage.

begin;

drop policy if exists suppression_reservee_aux_admins on public.algorithmes_parametres;
create policy suppression_reservee_aux_admins on public.algorithmes_parametres
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.algorithmes_resultats;
create policy suppression_reservee_aux_admins on public.algorithmes_resultats
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.analyses;
create policy suppression_reservee_aux_admins on public.analyses
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.coefficients_turpe;
create policy suppression_reservee_aux_admins on public.coefficients_turpe
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.composantes_tarifaires;
create policy suppression_reservee_aux_admins on public.composantes_tarifaires
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.composants_expertise;
create policy suppression_reservee_aux_admins on public.composants_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.comptes_clients;
create policy suppression_reservee_aux_admins on public.comptes_clients
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.comptes_fournisseurs;
create policy suppression_reservee_aux_admins on public.comptes_fournisseurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.comptes_partenaires;
create policy suppression_reservee_aux_admins on public.comptes_partenaires
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.compteurs_electricite;
create policy suppression_reservee_aux_admins on public.compteurs_electricite
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.compteurs_gaz;
create policy suppression_reservee_aux_admins on public.compteurs_gaz
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.contacts_sites;
create policy suppression_reservee_aux_admins on public.contacts_sites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.contrats_compteurs;
create policy suppression_reservee_aux_admins on public.contrats_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.decisions_algorithmes;
create policy suppression_reservee_aux_admins on public.decisions_algorithmes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.demandes_support;
create policy suppression_reservee_aux_admins on public.demandes_support
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.domaines_expertise;
create policy suppression_reservee_aux_admins on public.domaines_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.eligibility_rules;
create policy suppression_reservee_aux_admins on public.eligibility_rules
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.etapes_recommandation;
create policy suppression_reservee_aux_admins on public.etapes_recommandation
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.evenements_metier;
create policy suppression_reservee_aux_admins on public.evenements_metier
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.executions_calculs;
create policy suppression_reservee_aux_admins on public.executions_calculs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.executions_composants_expertise;
create policy suppression_reservee_aux_admins on public.executions_composants_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.executions_domaines_expertise;
create policy suppression_reservee_aux_admins on public.executions_domaines_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.executions_regles_expertise;
create policy suppression_reservee_aux_admins on public.executions_regles_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.expertises;
create policy suppression_reservee_aux_admins on public.expertises
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.formules_tarifaires_turpe;
create policy suppression_reservee_aux_admins on public.formules_tarifaires_turpe
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.historiques_entites;
create policy suppression_reservee_aux_admins on public.historiques_entites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.issues_interactions;
create policy suppression_reservee_aux_admins on public.issues_interactions
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.listes;
create policy suppression_reservee_aux_admins on public.listes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.mandats_compteurs;
create policy suppression_reservee_aux_admins on public.mandats_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.mandats_courtiers;
create policy suppression_reservee_aux_admins on public.mandats_courtiers
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.mapping_rules;
create policy suppression_reservee_aux_admins on public.mapping_rules
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.moteurs_calcul;
create policy suppression_reservee_aux_admins on public.moteurs_calcul
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.motifs_versions_recommandation;
create policy suppression_reservee_aux_admins on public.motifs_versions_recommandation
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.objectifs_mensuels;
create policy suppression_reservee_aux_admins on public.objectifs_mensuels
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.offres_compteurs_electricite;
create policy suppression_reservee_aux_admins on public.offres_compteurs_electricite
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.offres_compteurs_gaz;
create policy suppression_reservee_aux_admins on public.offres_compteurs_gaz
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.offres_fournisseurs_compteurs;
create policy suppression_reservee_aux_admins on public.offres_fournisseurs_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.opportunites;
create policy suppression_reservee_aux_admins on public.opportunites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.opportunites_compteurs;
create policy suppression_reservee_aux_admins on public.opportunites_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.opportunites_sites;
create policy suppression_reservee_aux_admins on public.opportunites_sites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.optimisations;
create policy suppression_reservee_aux_admins on public.optimisations
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.optimisations_fournisseurs;
create policy suppression_reservee_aux_admins on public.optimisations_fournisseurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.parametres_algorithmes;
create policy suppression_reservee_aux_admins on public.parametres_algorithmes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.parametres_emails;
create policy suppression_reservee_aux_admins on public.parametres_emails
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.partages_etude_client;
create policy suppression_reservee_aux_admins on public.partages_etude_client
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.pistes;
create policy suppression_reservee_aux_admins on public.pistes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.postes_tarifaires;
create policy suppression_reservee_aux_admins on public.postes_tarifaires
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.proprietaires_en_attente;
create policy suppression_reservee_aux_admins on public.proprietaires_en_attente
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.recommandations_compteurs;
create policy suppression_reservee_aux_admins on public.recommandations_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.recommandations_mandats;
create policy suppression_reservee_aux_admins on public.recommandations_mandats
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.recommandations_sites;
create policy suppression_reservee_aux_admins on public.recommandations_sites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.regles_expertise;
create policy suppression_reservee_aux_admins on public.regles_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.remunerations;
create policy suppression_reservee_aux_admins on public.remunerations
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.requetes;
create policy suppression_reservee_aux_admins on public.requetes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.resultats_algorithmes;
create policy suppression_reservee_aux_admins on public.resultats_algorithmes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.segments_comptes;
create policy suppression_reservee_aux_admins on public.segments_comptes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.sessions_expertise;
create policy suppression_reservee_aux_admins on public.sessions_expertise
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_actions;
create policy suppression_reservee_aux_admins on public.statuts_actions
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_consultations_fournisseurs;
create policy suppression_reservee_aux_admins on public.statuts_consultations_fournisseurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_contrats;
create policy suppression_reservee_aux_admins on public.statuts_contrats
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_contrats_avancement;
create policy suppression_reservee_aux_admins on public.statuts_contrats_avancement
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_contrats_vie;
create policy suppression_reservee_aux_admins on public.statuts_contrats_vie
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_executions;
create policy suppression_reservee_aux_admins on public.statuts_executions
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_expertises;
create policy suppression_reservee_aux_admins on public.statuts_expertises
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_mandats;
create policy suppression_reservee_aux_admins on public.statuts_mandats
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_opportunites;
create policy suppression_reservee_aux_admins on public.statuts_opportunites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_requetes;
create policy suppression_reservee_aux_admins on public.statuts_requetes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_signaux;
create policy suppression_reservee_aux_admins on public.statuts_signaux
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.statuts_versions_recommandation;
create policy suppression_reservee_aux_admins on public.statuts_versions_recommandation
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.suivis_consultations_fournisseurs;
create policy suppression_reservee_aux_admins on public.suivis_consultations_fournisseurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.traitements_evenements;
create policy suppression_reservee_aux_admins on public.traitements_evenements
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_actions;
create policy suppression_reservee_aux_admins on public.types_actions
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_analyses;
create policy suppression_reservee_aux_admins on public.types_analyses
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_calculs;
create policy suppression_reservee_aux_admins on public.types_calculs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_canaux_communication;
create policy suppression_reservee_aux_admins on public.types_canaux_communication
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_composantes_turpe;
create policy suppression_reservee_aux_admins on public.types_composantes_turpe
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_comptes;
create policy suppression_reservee_aux_admins on public.types_comptes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_courtiers_mandat;
create policy suppression_reservee_aux_admins on public.types_courtiers_mandat
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_documents;
create policy suppression_reservee_aux_admins on public.types_documents
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_donnees;
create policy suppression_reservee_aux_admins on public.types_donnees
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_energies;
create policy suppression_reservee_aux_admins on public.types_energies
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_evenements_metier;
create policy suppression_reservee_aux_admins on public.types_evenements_metier
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_formules_tarifaires;
create policy suppression_reservee_aux_admins on public.types_formules_tarifaires
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_interactions;
create policy suppression_reservee_aux_admins on public.types_interactions
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_objectifs_client;
create policy suppression_reservee_aux_admins on public.types_objectifs_client
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_optimisations;
create policy suppression_reservee_aux_admins on public.types_optimisations
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_origines;
create policy suppression_reservee_aux_admins on public.types_origines
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_parametres_calcul;
create policy suppression_reservee_aux_admins on public.types_parametres_calcul
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_requetes;
create policy suppression_reservee_aux_admins on public.types_requetes
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_resultats_calcul;
create policy suppression_reservee_aux_admins on public.types_resultats_calcul
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_signaux;
create policy suppression_reservee_aux_admins on public.types_signaux
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_sites;
create policy suppression_reservee_aux_admins on public.types_sites
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.types_utilisations_compteur;
create policy suppression_reservee_aux_admins on public.types_utilisations_compteur
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.versions_recommandation_compteurs;
create policy suppression_reservee_aux_admins on public.versions_recommandation_compteurs
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.versions_recommandation_durees;
create policy suppression_reservee_aux_admins on public.versions_recommandation_durees
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

drop policy if exists suppression_reservee_aux_admins on public.versions_turpe;
create policy suppression_reservee_aux_admins on public.versions_turpe
  as restrictive for delete to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

commit;
