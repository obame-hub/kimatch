-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LE RATTRAPAGE, ET LUI SEUL
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le déclencheur d'entrée ne vaut que pour ce qui entre APRÈS lui. Les lignes déjà posées dans un
-- pipe ouvert ont été insérées avant, n'ont donc aucune tâche, et le nouveau filtre de lecture
-- les ferait toutes disparaître — l'écran s'afficherait vide alors que le travail est là.
--
-- CE QU'ON RATTRAPE, ET RIEN D'AUTRE : les lignes d'un pipe du jour COURANT et non sorties. Pas
-- les 4 757 pistes ouvertes sans tâche, pas les 83 opportunités dormantes, pas les 115 pistes
-- inbound historiques. Leur tâche naîtra à leur entrée dans le pool, au jour du mouvement, comme
-- le veut la règle 5. Fabriquer aujourd'hui des milliers de tâches datées d'aujourd'hui
-- inventerait une journée de travail que personne n'a décidée.
do $$
declare
  v_ligne record;
  v_creees integer := 0;
begin
  for v_ligne in
    select d.cible_type, d.cible_id, d.profil_id
      from pipe_du_jour d
     where d.jour >= (now() at time zone 'Europe/Paris')::date
       and d.sorti_le is null
  loop
    if creer_tache_debut_prospection(v_ligne.cible_type, v_ligne.cible_id, v_ligne.profil_id) is not null then
      v_creees := v_creees + 1;
    end if;
  end loop;
  raise notice 'Tâches de début de prospection créées pour le pool en cours : %', v_creees;
end $$;
