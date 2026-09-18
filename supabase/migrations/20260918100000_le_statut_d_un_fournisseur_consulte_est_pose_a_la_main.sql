-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE STATUT D'UN FOURNISSEUR CONSULTÉ SE POSE À LA MAIN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 18/09/2026 : « il faut annuler l'automatisation des statuts des fournisseurs dans la
-- version. Lorsqu'une version est créée, tous les fournisseurs sont au statut "À traiter" par
-- défaut. Ce sera à Erwan, le chargé de pricing, de faire évoluer le statut manuellement. »
--
-- ══ CE QUE L'AUTOMATISATION FAISAIT RÉELLEMENT ══
--
-- Elle ne se contentait pas d'être inutile : elle écrivait une contre-vérité, et dans les deux
-- dixièmes de seconde qui suivaient la création de la version.
--
-- L'enchaînement, mesuré sur les créations du 18/09/2026 :
--
--   1. la version crée une offre attendue par fournisseur, au statut EN_ATTENTE — ce qui est juste,
--      rien n'est encore arrivé ;
--   2. `trg_propager_offre_vers_consultation` se déclenche sur cette insertion ;
--   3. `recalculer_statut_consultation` applique sa règle : « au moins une offre en attente →
--      ACCEPTEE » ;
--   4. chaque fournisseur reçoit une ligne « Demande acceptée — Calculé automatiquement ».
--
-- LA RÈGLE CONFOND DEUX CHOSES : « on attend leur offre » et « ils ont accepté de coter ». La
-- première est l'état de départ de toute consultation ; la seconde est une réponse du fournisseur,
-- que personne n'a reçue à cet instant. Le calcul annonçait donc une réponse avant l'envoi.
--
-- ══ CE QU'ON NE RÉPARE PAS, ET POURQUOI ══
--
-- 220 lignes ont été écrites par ce calcul depuis le 01/09/2026, dont 179 sont encore le statut
-- COURANT d'une consultation — 163 « acceptée », 15 « disponible », 1 « refusée ».
--
-- William, mis devant le choix : « laisse ces statuts, Erwan corrigera au fil de l'eau ». Les
-- effacer aurait fait retomber chaque consultation sur son état vrai, mais aurait aussi effacé les
-- cas où quelqu'un a depuis confirmé à la main un statut qui se trouve juste. Le fil de l'eau est
-- plus lent et ne détruit rien.
--
-- ══ « À TRAITER » N'EST PAS ÉCRIT À LA CRÉATION ══
--
-- Le statut existe désormais en référentiel, et l'écran l'affiche comme état par défaut quand une
-- consultation ne porte AUCUNE ligne de suivi. On n'insère donc rien à la création d'une version :
--
--   · un statut que personne n'a posé n'est pas un événement, et cette table est un journal
--     d'événements — « chaque changement ajoute une ligne datée » (réunion du 17/08/2026) ;
--   · quatre lignes par version multipliées par les versions à venir, pour dire « rien ne s'est
--     encore passé », c'est du bruit dans l'historique que l'écran sait produire sans l'écrire.
--
-- Il est en revanche PROPOSÉ dans le menu d'Erwan : y revenir après s'être trompé de statut doit
-- être possible, et ce retour-là est un vrai geste, donc un vrai événement.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

drop trigger if exists trg_propager_offre_vers_consultation on offres_fournisseurs;
drop function if exists propager_offre_vers_consultation();
drop function if exists recalculer_statut_consultation(uuid);

insert into statuts_consultations_fournisseurs (code, libelle, actif, ordre)
values ('A_TRAITER', 'À traiter', true, 5)
on conflict (code) do update set libelle = excluded.libelle, actif = true, ordre = excluded.ordre;
