-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LE PLAN DU JOUR REND LE LIBELLÉ DE SA TÂCHE, PAS SEULEMENT SON COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026, sur le mode sprint : « la tâche à faire aujourd'hui avec libellé +
-- échéance doit apparaître clairement à cet endroit également ».
--
-- La fonction rendait `taches_ouvertes` — un NOMBRE. « 1 tâche ouverte » ne dit pas quoi faire :
-- c'est la seule information dont on ait besoin avant de décrocher, et le sprint devait ouvrir la
-- fiche pour l'obtenir. On rend donc le titre et l'échéance de la tâche RETENUE, celle-là même qui
-- a fait entrer la ligne dans le plan du jour.
--
-- `drop` PUIS `create` : ajouter une colonne au type de retour d'une fonction table n'est pas un
-- remplacement, Postgres le refuse (« cannot change return type of existing function »).
--
-- NOTE : cette version est immédiatement remplacée par 20260922110000, qui y ajoute l'e-mail du
-- contact. Les deux sont conservées telles qu'elles ont été appliquées — une migration réécrite
-- après coup ne décrit plus l'histoire de la base.

drop function if exists public.lister_pipe_du_jour();

create function public.lister_pipe_du_jour()
returns table(
  ligne_id uuid, cible_type text, cible_id uuid, source text, rang integer,
  nom_complet text, fonction text, compte_nom text, segment text,
  telephone text, telephone_mobile text,
  heure text, en_retard boolean,
  compte_id uuid, contact_id uuid,
  compteurs integer, mwh_annuels numeric, echeance date, nature_echeance text,
  taches_ouvertes integer, commentaire text,
  dernier_echange timestamptz, dernier_resume text,
  tache_titre text, tache_echeance timestamptz
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
     where l.profil_id = moi.pid and l.jour = jour.j and l.sorti_le is null
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
    pr.date_prevue
  from lignes l
  cross join jour
  left join pistes p        on l.cible_type = 'PISTE'       and p.id = l.cible_id and p.actif
  left join statuts_pistes sp on sp.id = p.statut_id
  left join opportunites o  on l.cible_type = 'OPPORTUNITE' and o.id = l.cible_id and o.actif
  left join contacts c      on c.id = o.contact_id
  left join comptes cp      on cp.id = coalesce(o.compte_id, p.compte_id)
  join prochaine pr         on pr.cible_type = l.cible_type and pr.cible_id = l.cible_id
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
  where (l.cible_type = 'PISTE'
          and p.id is not null and not coalesce(sp.est_cloture, false))
     or (l.cible_type = 'OPPORTUNITE'
          and o.id is not null and o.date_cloture is null and o.qualification_fin is null)
  order by
    (pr.date_prevue is not null
      and (pr.date_prevue at time zone 'Europe/Paris')::date = jour.j
      and (pr.date_prevue at time zone 'Europe/Paris')::time > jour.maintenant),
    coalesce(l.ordre_manuel, l.rang),
    l.rang;
$function$;

grant execute on function public.lister_pipe_du_jour() to authenticated;
