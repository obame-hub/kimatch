-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LE COCKPIT EST UN MONITEUR DE TÂCHES : RIEN N'Y ENTRE SANS TÂCHE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 21/09/2026, après avoir relu les cinq seaux un par un : « en gros Cockpit est un
-- endroit permettant de monitorer et guider les commerciaux dans la réalisation de leurs
-- tâches ». Et sa règle, seau par seau :
--
--   1 INBOUND      — tâche auto « Call - Début prospection » à la CRÉATION de la piste Google Ads.
--   2 RAPPEL_HEURE — tâche du jour avec heure, plus les retards. Déjà le cas.
--   3 RAPPEL_JOUR  — tâche du jour sans heure, plus les retards. Déjà le cas.
--   4 OPPORTUNITÉ  — tâche auto à la CRÉATION de l'opportunité. Plus de dormante possible.
--   5 PISTE FROIDE — tâche auto au moment où elle ENTRE dans le pool.
--
-- CE QUI ÉTAIT FAUX AVANT : deux seaux sur cinq exigeaient l'ABSENCE de tâche (les dormantes et
-- les froides) et un troisième n'en demandait aucune (l'inbound). Mesuré ce jour, le pipe
-- contenait 9 lignes dont 9 sans aucune tâche ouverte. Le Cockpit ne pouvait donc pas être le
-- moniteur qu'il prétend être : il affichait du travail qui n'existait nulle part ailleurs.
--
-- ══ UNE GARANTIE À L'ENTRÉE, PLUTÔT QUE CINQ CORRECTIFS ══
--
-- Le déclencheur est posé sur `pipe_du_jour` et non dans les cinq fonctions qui le remplissent.
-- C'est ce qui rend la règle VRAIE PAR CONSTRUCTION : `construire_pipe_du_jour`,
-- `completer_pipe_du_jour`, `completer_pipe_du_jour_depuis_pistes`,
-- `ajouter_au_pipe_depuis_vivier`, `ajouter_au_pipe_depuis_pistes` — et toute porte d'entrée
-- future — passent toutes par le même INSERT. Cinq correctifs auraient divergé au premier ajout.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── LE JOUR COURANT, À PARIS, À MINUIT ──
-- Minuit et non l'heure courante : une tâche sans heure est un « à faire aujourd'hui », et c'est
-- exactement ce que le seau RAPPEL_JOUR reconnaît (`heure = '00:00:00'`). Lui donner l'heure de
-- création la ferait basculer dans RAPPEL_HEURE et promettrait un rendez-vous qui n'existe pas.
create or replace function public.aujourdhui_a_minuit_paris()
returns timestamptz
language sql
stable
set search_path to 'public'
as $function$
  select ((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris';
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LA TÂCHE DE DÉBUT DE PROSPECTION
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Renvoie l'identifiant de la tâche créée, ou NULL si elle ne l'a pas été — soit la cible porte
-- déjà une tâche ouverte, soit elle est close, soit on ne sait pas à qui l'attribuer.
--
-- IDEMPOTENTE PAR CONSTRUCTION : la garde « existe-t-il déjà une tâche ouverte » est relue dans
-- la transaction qui écrit. Sans elle, une piste entrant deux fois dans le pipe (le matin par
-- `construire`, l'après-midi par un ajout manuel) porterait deux fois le même appel à passer.
--
-- NOTE : la garde de cette version ignore le responsable. La migration 20260921140000 la
-- reprend — voir l'explication là-bas. Les deux définitions sont conservées telles qu'elles ont
-- été appliquées, plutôt que réécrites après coup.
create or replace function public.creer_tache_debut_prospection(
  p_cible_type   text,
  p_cible_id     uuid,
  p_responsable  uuid,
  p_date_prevue  timestamptz default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_type    uuid;
  v_statut  uuid;
  v_contact uuid;
  v_compte  uuid;
  v_ouvert  boolean;
  v_action  uuid;
begin
  if p_cible_id is null or p_responsable is null then return null; end if;
  if p_cible_type not in ('PISTE', 'OPPORTUNITE') then return null; end if;

  -- Déjà une tâche ouverte : il n'y a rien à ajouter, la cible est déjà pilotée.
  if exists (
    select 1 from actions a
      join statuts_actions sa on sa.id = a.statut_id
     where a.actif
       and sa.code not in ('TERMINEE', 'ANNULEE')
       and ((p_cible_type = 'PISTE'       and a.piste_id       = p_cible_id)
         or (p_cible_type = 'OPPORTUNITE' and a.opportunite_id = p_cible_id))
  ) then
    return null;
  end if;

  -- Une cible close n'a plus d'appel à passer : lui poser une tâche la ferait ressurgir.
  if p_cible_type = 'PISTE' then
    select p.actif and not coalesce(s.est_cloture, false), p.contact_id, p.compte_id
      into v_ouvert, v_contact, v_compte
      from pistes p left join statuts_pistes s on s.id = p.statut_id
     where p.id = p_cible_id;
  else
    select o.actif and o.date_cloture is null and o.qualification_fin is null, o.contact_id, o.compte_id
      into v_ouvert, v_contact, v_compte
      from opportunites o
     where o.id = p_cible_id;
  end if;
  if not coalesce(v_ouvert, false) then return null; end if;

  select id into v_type   from types_actions   where code = 'APPELER' and coalesce(actif, true) limit 1;
  select id into v_statut from statuts_actions where code = 'A_FAIRE' and coalesce(actif, true) limit 1;
  if v_type is null or v_statut is null then return null; end if;

  insert into actions (
    type_action_id, statut_id, titre, date_prevue,
    responsable_profil_id, proprietaire_id, cree_par_id,
    piste_id, opportunite_id, contact_id, compte_id, commentaire
  ) values (
    v_type, v_statut,
    -- Le libellé est celui de William, au mot près. Il suit la convention déjà en base : 96
    -- tâches portent le titre « Call » sur le type APPELER.
    'Call - Début prospection',
    coalesce(p_date_prevue, aujourdhui_a_minuit_paris()),
    p_responsable, p_responsable, p_responsable,
    case when p_cible_type = 'PISTE'       then p_cible_id end,
    case when p_cible_type = 'OPPORTUNITE' then p_cible_id end,
    v_contact, v_compte,
    'Créée automatiquement par Kimatch : toute cible du plan du jour porte une tâche.'
  )
  returning id into v_action;

  return v_action;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- RÈGLE 1 — UNE PISTE INBOUND NAÎT AVEC SON APPEL À PASSER
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- « Il faudra créer une tâche auto lorsque la piste sera créée automatiquement dans Kimatch avec
-- la mention Google Ads sans facture (Inbound) ou Google Ads avec facture (Inbound). Cette tâche
-- sera à la date du jour de création. »
--
-- 115 pistes portent déjà l'une de ces deux sources. Elles ne sont PAS rattrapées ici : leur
-- tâche naîtra à leur entrée dans le pool, par le déclencheur d'entrée. Fabriquer 115 tâches
-- datées d'aujourd'hui pour des pistes parfois anciennes inventerait un travail à faire.
create or replace function public.fn_piste_inbound_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.source in ('Google Ads avec facture (Inbound)', 'Google Ads sans facture (Inbound)')
     and new.proprietaire_id is not null then
    perform creer_tache_debut_prospection('PISTE', new.id, new.proprietaire_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_piste_inbound_ouvre_sa_tache on public.pistes;
create trigger trg_piste_inbound_ouvre_sa_tache
after insert on public.pistes
for each row execute function public.fn_piste_inbound_ouvre_sa_tache();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- RÈGLE 4 — UNE OPPORTUNITÉ NAÎT AVEC SON APPEL À PASSER
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- « À la création d'une opportunité, il faudra créer une tâche automatique au jour de la
-- création. » Le seau OPPORTUNITE_DORMANTE cesse ainsi d'avoir des candidats neufs : une
-- opportunité ne peut plus naître sans pilote.
--
-- CE DÉCLENCHEUR DÉPASSE LE COCKPIT, et c'est assumé : il vaut pour les opportunités créées par
-- n'importe quel écran — conversion de piste, signal, assistant. C'est la lecture qui rend la
-- règle vraie ; la restreindre au vivier laisserait des dormantes naître ailleurs. Les 83
-- opportunités ouvertes SANS tâche à ce jour ne sont pas rattrapées : elles recevront la leur en
-- entrant dans le pool.
create or replace function public.fn_opportunite_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.proprietaire_id is not null then
    perform creer_tache_debut_prospection('OPPORTUNITE', new.id, new.proprietaire_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_opportunite_ouvre_sa_tache on public.opportunites;
create trigger trg_opportunite_ouvre_sa_tache
after insert on public.opportunites
for each row execute function public.fn_opportunite_ouvre_sa_tache();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- RÈGLE 5, ET LE FILET DE SÉCURITÉ DES QUATRE AUTRES — L'ENTRÉE DANS LE POOL
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- « Lorsque cette dernière est ajoutée au pool du jour, une tâche auto est alors créée au jour du
-- mouvement. »
--
-- Posé sur la table et non dans les fonctions, il vaut aussi pour tout ce que les quatre autres
-- règles auraient laissé passer : une piste froide, une dormante d'avant ce jour, un ajout
-- manuel, une opportunité importée sans propriétaire. La tâche est datée du MOUVEMENT — pas de
-- la création de la cible — parce que c'est aujourd'hui qu'on a décidé de l'appeler.
create or replace function public.fn_entree_pipe_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  perform creer_tache_debut_prospection(new.cible_type, new.cible_id, new.profil_id);
  return null;
end;
$function$;

drop trigger if exists trg_entree_pipe_ouvre_sa_tache on public.pipe_du_jour;
create trigger trg_entree_pipe_ouvre_sa_tache
after insert on public.pipe_du_jour
for each row execute function public.fn_entree_pipe_ouvre_sa_tache();
