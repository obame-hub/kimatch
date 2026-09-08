-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNE ACTION PEUT VENIR D'AILLEURS, ET LE DIRE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 08/09/2026 : « il faut récupérer l'activité des pistes de Salesforce ».
--
-- ══ CE QUE LA MESURE A MONTRÉ ══
--
-- L'activité TERMINÉE des leads est déjà là : 6 392 tâches Salesforce importées le 01/09/2026 sur
-- 864 pistes, plus 2 550 appels Allo — 8 942 interactions sur 1 126 pistes. Relevé dans Salesforce
-- le 08/09/2026, il n'y a rien de plus à en tirer de ce côté : 927 leads y portent une tâche, et
-- l'écart s'explique.
--
-- CE QUI MANQUE VRAIMENT, ce sont LES 161 TÂCHES ENCORE OUVERTES, réparties sur 160 leads. Elles
-- ont été écartées volontairement de l'import des interactions, et le commentaire du script le
-- disait déjà : « une tâche ouverte est un travail à faire, pas un échange qui a eu lieu. Sa place
-- est dans `actions`, pas dans `interactions`. L'importer comme interaction écrirait dans
-- l'historique quelque chose qui n'est pas encore arrivé. »
--
-- Le raisonnement était juste, et la conséquence est restée : ces 161 travaux à faire ne sont NULLE
-- PART dans Kimatch. Un commercial qui reprend une piste ne voit pas la relance que Salesforce lui
-- rappelle. C'est aussi ce qui explique que 927 leads portent une tâche là-bas pour 864 pistes ici :
-- 63 de ces leads n'ont QUE des tâches ouvertes, donc rien n'a été importé pour eux.
--
-- ══ POURQUOI UNE COLONNE PLUTÔT QU'UN IMPORT DIRECT ══
--
-- `interactions` porte `source_externe_id` depuis l'origine, et c'est ce qui rend ses imports
-- rejouables : `on conflict do nothing` reconnaît une ligne déjà vue. `actions` n'a pas cet
-- équivalent. Sans lui, relancer l'import — ce qui arrivera, ne serait-ce que pour rattraper les
-- tâches créées depuis — créerait 161 doublons de plus à chaque fois, dans la liste de travail des
-- commerciaux.
--
-- ══ L'INDEX EST PARTIEL, ET CE N'EST PAS UN DÉTAIL ══
--
-- `where source_externe_id is not null`. Les actions créées à la main dans Kimatch n'ont pas
-- d'origine externe : un index unique ordinaire les compterait toutes comme la même valeur nulle et
-- refuserait la deuxième. C'est exactement la forme retenue sur `interactions`
-- (`interactions_source_externe_id_idx`), et la raison pour laquelle un `on conflict` sur cette
-- colonne doit répéter la condition :
--
--     on conflict (source_externe_id) where source_externe_id is not null do nothing
--
-- Omise, Postgres répond « there is no unique or exclusion constraint matching the ON CONFLICT
-- specification » — l'erreur qui a fait échouer la relance de l'import Allo le 07/09/2026.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.actions
  add column if not exists source_externe_id text;

comment on column public.actions.source_externe_id is
  'L''identifiant de l''objet d''origine quand l''action vient d''un autre système — l''Id d''une Task '
  'Salesforce, par exemple. Nul pour une action créée dans Kimatch. C''est la clé qui rend les '
  'imports rejouables sans doublon.';

-- Partiel : voir l'explication ci-dessus. Concurrently est impossible dans une transaction, et la
-- table est petite (les actions se comptent en milliers) — le verrou est de l'ordre de la seconde.
create unique index if not exists actions_source_externe_id_idx
  on public.actions (source_externe_id)
  where source_externe_id is not null;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
--
-- On vérifie ce qui compte vraiment : que deux actions SANS origine externe cohabitent, et que deux
-- actions avec la MÊME origine soient refusées. Un index unique posé sans cette vérification aurait
-- pu bloquer la création d'actions à la main, et personne ne l'aurait vu avant le premier
-- commercial qui en crée une deuxième.
do $$
declare
  v_type    uuid;
  v_statut  uuid;
  v_piste   uuid;
  v_a uuid; v_b uuid;
  v_refuse  boolean := false;
begin
  select id into v_type from types_actions limit 1;
  select id into v_statut from statuts_actions limit 1;

  -- UNE ACTION DOIT ÊTRE RATTACHÉE À QUELQUE CHOSE. `actions_contexte_check` exige au moins un lien
  -- parmi neuf — même famille que `interactions_contexte_check`, qui a bloqué un compte sur six
  -- hier. Deux actions de test sans rattachement auraient fait échouer cette migration au premier
  -- insert. On leur donne donc une piste jetable, effacée avec elles.
  insert into pistes (societe) values ('ZZZ TEST INDEX SOURCE EXTERNE') returning id into v_piste;

  insert into actions (type_action_id, statut_id, titre, priorite, piste_id)
  values (v_type, v_statut, 'ZZZ TEST index source externe A', 2, v_piste) returning id into v_a;
  insert into actions (type_action_id, statut_id, titre, priorite, piste_id)
  values (v_type, v_statut, 'ZZZ TEST index source externe B', 2, v_piste) returning id into v_b;

  -- Deux nulles doivent passer. Si l'index n'était pas partiel, la seconde échouerait ici.
  update actions set source_externe_id = '00TZZZTESTUNIQUE' where id = v_a;

  begin
    update actions set source_externe_id = '00TZZZTESTUNIQUE' where id = v_b;
  exception when unique_violation then
    v_refuse := true;
  end;

  delete from actions where id in (v_a, v_b);
  delete from pistes where id = v_piste;
  delete from historiques_entites where entite_id in (v_a, v_b, v_piste);
  delete from historique_modifications where ligne_id in (v_a, v_b, v_piste);

  if not v_refuse then
    raise exception 'L''index n''empêche pas deux actions de porter la même origine externe. Rien n''est appliqué.';
  end if;

  raise notice 'Garde-fou passé : deux actions sans origine cohabitent, deux avec la même origine sont refusées.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--   node scripts/importer-taches-ouvertes-salesforce.cjs <taches-ouvertes.json> --appliquer
--
-- L'export attendu, depuis PowerShell — `sf` ne s'appelle pas depuis Git Bash sur ce poste, son
-- chemin contient un espace :
--
--   sf data query --target-org KiweeOrg --json -q "SELECT Id, WhoId, Subject, Description,
--     ActivityDate, CreatedDate, Priority, TaskSubtype, Owner.Name
--     FROM Task WHERE Who.Type = 'Lead' AND Status != 'Completed'" > taches-ouvertes.json
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
