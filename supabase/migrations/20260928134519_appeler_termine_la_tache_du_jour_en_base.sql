-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- APPELER TERMINE LA TÂCHE DU JOUR — EN BASE, PAS À L'ÉCRAN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 : « on a fait des tests ce matin avec des appels Allô mais la tâche restait
-- ouverte ». Deux appels ce jour-là sur la piste de Thomas, et sa tâche du 25/09 toujours « À faire ».
--
-- ══ POURQUOI ÇA ÉCHOUAIT, ET SANS RIEN DIRE ══
--
-- Le sprint fermait la tâche lui-même, à partir d'une SECONDE requête — le détail de la fiche —
-- lancée à l'arrivée sur la fiche. Cliquer « Appeler » avant qu'elle ait répondu, typiquement juste
-- après « Passer », ne fermait rien : le code sortait en silence, et un `.catch(() => {})` avalait
-- les autres échecs. Personne ne pouvait le voir.
--
-- ══ CE QUI CHANGE ══
--
-- La base retrouve elle-même, au moment du clic, les tâches qui ont fait entrer la fiche au plan
-- du jour, et les termine. Elle ne dépend de rien de chargé à l'écran, et si elle échoue, elle le
-- dit — l'écran affiche l'erreur au lieu de l'avaler.
--
-- TOUTES LES TÂCHES DUES AUJOURD'HUI OU EN RETARD, et non la seule plus ancienne : William, sur le
-- pipe coupé en deux, « les tâches à faire ce jour ou en retard ont été complétées ». En laisser une
-- ouverte garderait la fiche dans « à contacter » juste après l'avoir appelée.
--
-- ══ « CONTACTÉ » S'ÉCRIT SUR LA LIGNE DU PLAN ══
--
-- La liste du bas (« vient d'être contacté ») ne peut pas se déduire de la seule date de fin d'une
-- tâche : une fiche close ferme aussi ses tâches, sans avoir été appelée. `contacte_le` dit ce que
-- le sprint a fait, et rien d'autre.

alter table public.pipe_du_jour add column if not exists contacte_le timestamptz;

comment on column public.pipe_du_jour.contacte_le is
  'Pose par le sprint au clic sur Appeler. Fait passer la ligne dans la liste du bas du pipe du jour.';

create or replace function public.sprint_terminer_taches_du_jour(p_ligne_id uuid, p_contacte boolean default true)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_moi      uuid := auth.uid();
  l          record;
  v_terminee uuid;
  v_fin      timestamptz;
  v_n        integer;
begin
  -- La même règle que la table elle-même : le pipe est personnel, et fermé aux partenaires.
  if v_moi is null or public.est_partenaire() then
    raise exception 'Action réservée aux utilisateurs de Kimatch.';
  end if;

  select * into l from pipe_du_jour where id = p_ligne_id and profil_id = v_moi;
  if not found then
    raise exception 'Cette fiche n''est pas dans votre plan du jour.';
  end if;

  select id into v_terminee from statuts_actions where code = 'TERMINEE' limit 1;
  -- La fin du jour À PARIS : « aujourd'hui » n'est pas le même jour en UTC après 22 h.
  v_fin := (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris';

  /* EXACTEMENT les tâches que `lister_pipe_du_jour` retient pour cette fiche : ouvertes, à moi ou
     à personne, dues aujourd'hui ou avant. Pas une de plus — la relance posée pour jeudi reste. */
  update actions a
     set statut_id = v_terminee
    from statuts_actions sa
   where sa.id = a.statut_id
     and sa.code not in ('TERMINEE', 'ANNULEE')
     and a.actif
     and (a.responsable_profil_id = v_moi or a.responsable_profil_id is null)
     and a.date_prevue is not null
     and a.date_prevue < v_fin
     and ((l.cible_type = 'PISTE'       and a.piste_id       = l.cible_id)
       or (l.cible_type = 'OPPORTUNITE' and a.opportunite_id = l.cible_id));
  get diagnostics v_n = row_count;

  -- Le premier appel fait foi : rappeler le second numéro ne déplace pas l'heure du contact.
  if p_contacte then
    update pipe_du_jour set contacte_le = coalesce(contacte_le, now()) where id = p_ligne_id;
  end if;

  return json_build_object(
    'taches_terminees', v_n,
    'contacte_le', (select contacte_le from pipe_du_jour where id = p_ligne_id)
  );
end;
$$;

comment on function public.sprint_terminer_taches_du_jour(uuid, boolean) is
  'Termine les taches du jour d''une fiche du plan, et la marque contactee si p_contacte. Appelee au clic sur Appeler, et avant de poser une nouvelle tache.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- LA LISTE DU PLAN : QUATRE COLONNES DE PLUS, DEUX ÉTATS
--
-- `ville` et `code_postal` : William, « la ville + code postal doit s'afficher à côté du nom du
-- compte ». Pris ENSEMBLE à une seule source — celle de la piste si elle en porte, sinon celle du
-- compte — pour ne jamais accoler la ville de l'une au code postal de l'autre.
--
-- `etat` : À CONTACTER tant qu'une tâche due aujourd'hui ou en retard reste ouverte ; CONTACTÉ une
-- fois le sprint passé et ces tâches fermées. Une fiche rappelée pour 16 h redevient donc « à
-- contacter » — c'est exact, il reste un appel à passer aujourd'hui.
--
-- Le type de retour change : la fonction doit être supprimée puis recréée.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

drop function if exists public.lister_pipe_du_jour();

create function public.lister_pipe_du_jour()
returns table(
  ligne_id uuid, cible_type text, cible_id uuid, source text, rang integer,
  nom_complet text, fonction text, compte_nom text, segment text,
  telephone text, telephone_mobile text, email text,
  heure text, en_retard boolean, compte_id uuid, contact_id uuid,
  compteurs integer, mwh_annuels numeric, echeance date, nature_echeance text,
  taches_ouvertes integer, commentaire text, dernier_echange timestamptz, dernier_resume text,
  tache_titre text, tache_echeance timestamptz,
  ville text, code_postal text, contacte_le timestamptz, etat text
)
language sql
stable
set search_path to 'public'
as $function$
  with moi as (select auth.uid() as pid),
  jour as (select (now() at time zone 'Europe/Paris')::date as j,
                  (now() at time zone 'Europe/Paris')::time as maintenant),
  lignes as (
    select l.* from pipe_du_jour l, moi, jour
     where l.profil_id = moi.pid and l.jour = jour.j
       and (l.sorti_le is null or l.contacte_le is not null)
  ),
  recevables as (
    select
      case when a.opportunite_id is not null then 'OPPORTUNITE' else 'PISTE' end as cible_type,
      coalesce(a.opportunite_id, a.piste_id) as cible_id,
      a.date_prevue,
      a.titre
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    cross join moi
    cross join jour
    where a.actif
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and (a.opportunite_id is not null or a.piste_id is not null)
      and (a.responsable_profil_id = moi.pid or a.responsable_profil_id is null)
      and a.date_prevue is not null
      and (a.date_prevue at time zone 'Europe/Paris')::date <= jour.j
  ),
  prochaine as (
    select distinct on (cible_type, cible_id)
           cible_type, cible_id, date_prevue, titre,
           count(*) over (partition by cible_type, cible_id)::integer as ouvertes
      from recevables
     order by cible_type, cible_id, date_prevue
  )
  select
    l.id,
    l.cible_type,
    l.cible_id,
    l.source,
    l.rang,
    case when l.cible_type = 'PISTE'
         then nullif(trim(concat_ws(' ', p.civilite, p.prenom, p.nom)), '')
         else nullif(trim(concat_ws(' ', c.civilite, c.prenom, c.nom)), '')
    end,
    case when l.cible_type = 'PISTE' then p.fonction else c.fonction end,
    case when l.cible_type = 'PISTE' then p.societe  else cp.nom end,
    case when l.cible_type = 'PISTE' then p.segment  else cp.segment end,
    case when l.cible_type = 'PISTE' then coalesce(p.telephone, p.telephone_mobile)
         else coalesce(c.telephone, c.telephone_mobile) end,
    case when l.cible_type = 'PISTE' then p.telephone_mobile else c.telephone_mobile end,
    nullif(btrim(case when l.cible_type = 'PISTE' then p.email else c.email end), ''),
    case when pr.date_prevue is null then null
         when (pr.date_prevue at time zone 'Europe/Paris')::time = '00:00:00' then null
         else to_char(pr.date_prevue at time zone 'Europe/Paris', 'HH24:MI')
    end,
    coalesce((pr.date_prevue at time zone 'Europe/Paris')::date < jour.j, false),
    case when l.cible_type = 'PISTE' then p.compte_id else o.compte_id end,
    case when l.cible_type = 'PISTE' then p.contact_id else o.contact_id end,
    coalesce(per.compteurs, 0),
    per.mwh,
    per.echeance,
    per.nature,
    coalesce(pr.ouvertes, 0),
    case when l.cible_type = 'PISTE' then p.commentaire else o.commentaire end,
    dit.quand,
    dit.resume,
    pr.titre,
    pr.date_prevue,
    lieu.ville,
    lieu.code_postal,
    l.contacte_le,
    case when pr.cible_id is not null and l.sorti_le is null then 'A_CONTACTER' else 'CONTACTE' end
  from lignes l
  cross join jour
  left join pistes p        on l.cible_type = 'PISTE'       and p.id = l.cible_id
  left join opportunites o  on l.cible_type = 'OPPORTUNITE' and o.id = l.cible_id
  left join contacts c      on c.id = o.contact_id
  left join comptes cp      on cp.id = coalesce(o.compte_id, p.compte_id)
  left join prochaine pr    on pr.cible_type = l.cible_type and pr.cible_id = l.cible_id
  left join lateral (
    select case when coalesce(nullif(btrim(p.ville), ''), nullif(btrim(p.code_postal::text), '')) is not null
                then nullif(btrim(p.ville), '')       else nullif(btrim(cp.ville), '') end as ville,
           case when coalesce(nullif(btrim(p.ville), ''), nullif(btrim(p.code_postal::text), '')) is not null
                then nullif(btrim(p.code_postal::text), '') else nullif(btrim(cp.code_postal::text), '') end as code_postal
  ) lieu on true
  left join lateral (
    select count(*)::integer as compteurs,
           sum(e.consommation_annuelle_mwh) as mwh,
           min(e.date_echeance) as echeance,
           min(e.nature_echeance) as nature
      from opportunites_compteurs oc
      join v_echeances_a_traiter e on e.compteur_id = oc.compteur_id
     where oc.opportunite_id = o.id
  ) per on l.cible_type = 'OPPORTUNITE'
  left join lateral (
    select i.date_interaction as quand,
           coalesce(nullif(trim(i.resume), ''), nullif(trim(i.resume_ia), '')) as resume
      from interactions i
     where i.actif
       and i.contact_id = case when l.cible_type = 'PISTE' then p.contact_id else o.contact_id end
       and coalesce(nullif(trim(i.resume), ''), nullif(trim(i.resume_ia), '')) is not null
     order by i.date_interaction desc
     limit 1
  ) dit on true
  where
    -- Une ligne n'apparaît que si elle a quelque chose à dire : une tâche à faire, ou un contact passé.
    ((pr.cible_id is not null and l.sorti_le is null) or l.contacte_le is not null)
    -- Et JAMAIS si la fiche est close : LA définition, partagée avec tout le reste.
    and ((l.cible_type = 'PISTE'
            and p.id is not null
            and public.fn_piste_ligne_ouverte(p.actif, p.statut_id))
      or (l.cible_type = 'OPPORTUNITE'
            and o.id is not null
            and public.fn_opportunite_ligne_ouverte(o.actif, o.date_cloture, o.qualification_fin, o.statut_id)))
  order by
    (pr.cible_id is null or l.sorti_le is not null),
    (pr.date_prevue is not null
      and (pr.date_prevue at time zone 'Europe/Paris')::date = jour.j
      and (pr.date_prevue at time zone 'Europe/Paris')::time > jour.maintenant),
    coalesce(l.ordre_manuel, l.rang),
    l.rang;
$function$;

comment on function public.lister_pipe_du_jour() is
  'Le plan du jour de l''utilisateur connecte : a contacter (tache due ouverte) puis contacte (passe par le sprint). Jamais une fiche close.';
