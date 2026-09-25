-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE DE REQUÊTE REVIENT AU SERVICE CLIENT, COMME CELLE D'UN SUIVI
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « les tâches liées aux requêtes doivent être à Fabien, comme pour les
-- suivis de contrat ».
--
-- ══ LA RÈGLE S'ÉLARGIT, ELLE NE SE DOUBLE PAS ══
--
-- `fn_tache_de_suivi_revient_a_son_responsable` faisait déjà exactement ce travail pour
-- `suivi_contrat_id`. Poser un second déclencheur pour `requete_id` aurait donné deux fonctions à
-- faire vivre en parallèle, avec la certitude qu'un jour l'une changerait sans l'autre — et deux
-- déclencheurs BEFORE sur la même table, dont l'ordre d'exécution dépend de leur nom.
--
-- On élargit donc la fonction existante, et on la RENOMME : « de suivi » était devenu faux. Le nom
-- dit maintenant ce qu'elle couvre — le travail du service client, quel que soit l'objet auquel la
-- tâche se rattache.
--
-- ══ CE QUE LA REPRISE A DÉPLACÉ ══
--
-- Sept tâches de requête existaient : six sans aucun responsable, une déjà à Fabien. La reprise n'a
-- donc rien retiré à personne — contrairement à celle des suivis, qui avait pris 23 tâches ouvertes
-- à cinq personnes.
--
-- VÉRIFIÉ APRÈS APPLICATION : 7 tâches de requête sur 7 et 368 tâches de suivi sur 368 sont à lui,
-- et une tâche de requête créée sans responsable lui revient (essayée puis annulée).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_tache_service_client_revient_a_son_responsable()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  /* Les deux objets que le service client porte. Un troisième s'ajouterait ici, sur la même
     ligne, plutôt que dans un déclencheur de plus. */
  if new.suivi_contrat_id is not null or new.requete_id is not null then
    new.responsable_profil_id := public.fn_responsable_des_suivis_contrats();
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_tache_de_suivi_revient_a_son_responsable on public.actions;
drop trigger if exists trg_tache_service_client_revient_a_son_responsable on public.actions;
create trigger trg_tache_service_client_revient_a_son_responsable
  before insert or update on public.actions
  for each row execute function public.fn_tache_service_client_revient_a_son_responsable();

/* L'ancienne fonction n'a plus de déclencheur : la laisser inviterait à la rebrancher un jour, en
   croyant qu'elle est encore la règle. */
drop function if exists public.fn_tache_de_suivi_revient_a_son_responsable();

update public.actions
   set responsable_profil_id = public.fn_responsable_des_suivis_contrats()
 where (suivi_contrat_id is not null or requete_id is not null)
   and responsable_profil_id is distinct from public.fn_responsable_des_suivis_contrats();

comment on function public.fn_tache_service_client_revient_a_son_responsable() is
  'Toute tache rattachee a un suivi de contrat OU a une requete revient au responsable des suivis. '
  'Regle posee par William les 25/09/2026 (suivis, puis requetes).';
