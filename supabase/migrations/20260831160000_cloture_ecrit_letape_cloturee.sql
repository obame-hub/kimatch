begin;

-- LA BASE DEVIENT LE SEUL AUTEUR DU STATUT D'UN DOSSIER.
--
-- Trouvé en remettant le bouton « Clôturer » demandé par Michel le 31/08/2026. En fermant un
-- dossier, l'écran inscrivait lui-même l'étape d'arrivée, et il choisissait entre trois étapes qui
-- ne servent à rien :
--
--     ACCEPTEE     ordre 70    0 dossier
--     REFUSEE      ordre 80    0 dossier
--     ABANDONNEE   ordre 90    0 dossier
--
-- Zéro, parce que `recalculer_statut_recommandation` n'écrit QUE les quatre statuts de Michel —
-- Brouillon, Active, À réactiver, Clôturée. Un dossier fermé depuis l'écran atterrissait donc dans
-- une étape qu'aucune liste, aucun filtre et aucune colonne de kanban ne connaît, et le premier
-- recalcul — une version qui bouge, un contrat qui arrive — l'en ressortait aussitôt.
--
-- LES TROIS ISSUES NE SONT PAS DES STATUTS, C'EST LA FINALITÉ. « Clôturée · Acceptée » dit les deux
-- choses séparément, et c'est déjà ce qu'affiche l'en-tête de la fiche. Les mélanger obligeait à
-- choisir entre « où en est le dossier » et « comment il s'est terminé ».
--
-- D'OÙ CE DÉCLENCHEUR. L'écran écrit la finalité, le motif et la date de clôture manuelle — des
-- faits. La base en déduit le statut, comme elle le fait déjà quand une version ou un contrat
-- bouge. Une seule règle, un seul endroit : c'est ce qui garantit que la fiche et la liste ne
-- peuvent plus se contredire.
--
-- PAS DE RÉCURSION. Le déclencheur ne se réarme que sur ces deux colonnes ; le recalcul, lui,
-- n'écrit que `etape_id` et `date_modification`. Il ne peut donc pas se rappeler lui-même.

create or replace function public.propager_cloture_vers_statut()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculer_statut_recommandation(new.id);
  return new;
end;
$$;

drop trigger if exists trg_propager_cloture_vers_statut on recommandations;

create trigger trg_propager_cloture_vers_statut
  after update of date_cloture_manuelle, finalite_cloture
  on recommandations
  for each row
  execute function public.propager_cloture_vers_statut();

-- LES TROIS ÉTAPES MORTES SONT RETIRÉES DE LA CIRCULATION.
--
-- Elles ne sont pas supprimées : une ligne de référence effacée casse toute clé étrangère qui la
-- viserait encore, et rien ne presse. Elles sont désactivées, ce qui les fait disparaître des
-- menus, des filtres et des colonnes sans rien détruire.
update etapes_recommandation
   set actif = false
 where code in ('ACCEPTEE', 'REFUSEE', 'ABANDONNEE')
   and not exists (
     select 1 from recommandations r where r.etape_id = etapes_recommandation.id
   );

commit;
