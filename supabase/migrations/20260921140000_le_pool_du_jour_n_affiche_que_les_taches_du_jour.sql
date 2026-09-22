-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE COMPTE POUR MOI SI ELLE M'EST ASSIGNÉE, OU SI ELLE NE L'EST À PERSONNE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- La garde posée une heure plus tôt cherchait « une tâche ouverte », sans regarder à qui. Elle
-- ouvrait un trou : une opportunité portant la tâche d'un collègue n'aurait reçu aucune tâche à
-- mon entrée dans MON pipe, et la ligne aurait disparu du pool sans que je comprenne pourquoi.
--
-- LA NUANCE « OU PERSONNE » N'EST PAS THÉORIQUE : 276 des 762 tâches ouvertes (36 %) n'ont aucun
-- responsable. Les ignorer ferait naître un doublon sur chacune d'elles.
--
-- La même règle vaut des deux côtés — à l'écriture ici, à la lecture dans `lister_pipe_du_jour`.
-- Deux définitions divergentes feraient créer une tâche qui ne serait jamais lue.
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

  if exists (
    select 1 from actions a
      join statuts_actions sa on sa.id = a.statut_id
     where a.actif
       and sa.code not in ('TERMINEE', 'ANNULEE')
       and (a.responsable_profil_id = p_responsable or a.responsable_profil_id is null)
       and ((p_cible_type = 'PISTE'       and a.piste_id       = p_cible_id)
         or (p_cible_type = 'OPPORTUNITE' and a.opportunite_id = p_cible_id))
  ) then
    return null;
  end if;

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
-- LE POOL DU JOUR N'AFFICHE QUE CE QUI EST À FAIRE AUJOURD'HUI
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 21/09/2026 : « il faudrait me confirmer que ne s'affiche dans le pool du jour que les
-- enregistrements (piste/opportunité) avec une tâche ouverte prévue pour le jour en question ».
-- La réponse était non. Elle devient oui, et par deux verrous complémentaires : la garantie à
-- l'entrée (migration précédente) et ce filtre à la lecture.
--
-- DEUX CORRECTIONS DANS LE MÊME MOUVEMENT, sur le calcul de `prochaine` :
--
--   · IL N'AVAIT AUCUNE BORNE DE DATE. `min(date_prevue)` balayait toutes les tâches ouvertes,
--     y compris celles du mois prochain — l'heure affichée pouvait donc être celle d'un
--     rendez-vous lointain, et `en_retard` se calculait contre cette date-là.
--   · IL NE REGARDAIT PAS LE RESPONSABLE. Le pipe est personnel ; la tâche d'un collègue n'y a
--     rien à faire. `construire_pipe_du_jour` filtrait déjà sur le responsable, la lecture non :
--     les deux disaient donc deux choses différentes du même pipe.
--
-- « Aujourd'hui OU EN RETARD » et non « aujourd'hui » seul : c'est la demande explicite de
-- William sur les seaux 2 et 3. Un rappel oublié hier est le premier travail du jour, pas un
-- dossier à faire disparaître.
--
-- LA JOINTURE DEVIENT INTERNE (`join` et non `left join`) : c'est elle, et elle seule, qui porte
-- le filtre. Une cible sans tâche du jour ne sort plus de la requête.
create or replace function public.lister_pipe_du_jour()
returns table(
  ligne_id uuid, cible_type text, cible_id uuid, source text, rang integer,
  nom_complet text, fonction text, compte_nom text, segment text,
  telephone text, telephone_mobile text, heure text, en_retard boolean,
  compte_id uuid, contact_id uuid, compteurs integer, mwh_annuels numeric,
  echeance date, nature_echeance text, taches_ouvertes integer, commentaire text,
  dernier_echange timestamp with time zone, dernier_resume text
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
  prochaine as (
    select
      case when a.opportunite_id is not null then 'OPPORTUNITE' else 'PISTE' end as cible_type,
      coalesce(a.opportunite_id, a.piste_id) as cible_id,
      min(a.date_prevue) as date_prevue,
      count(*)::integer  as ouvertes
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
    group by 1, 2
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
    dit.resume
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
  -- LE DERNIER ÉCHANGE, pris sur le contact et non sur l'objet : c'est à une personne qu'on a
  -- parlé. Le résumé humain passe devant celui d'Allo.
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

comment on function public.lister_pipe_du_jour() is
  'Le plan du jour : uniquement les cibles portant une tâche ouverte, à moi ou à personne, prévue aujourd''hui ou en retard (William, 21/09/2026).';
