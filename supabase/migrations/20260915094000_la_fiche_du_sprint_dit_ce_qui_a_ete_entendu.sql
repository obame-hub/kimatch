-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA FICHE DU SPRINT DIT CE QUI A ÉTÉ ENTENDU LA DERNIÈRE FOIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « la fiche doit être exhaustive mais montrer absolument les infos
-- pertinentes ». La plus pertinente de toutes manquait : ce que le correspondant a dit au dernier
-- appel.
--
-- ══ LA SOURCE EXISTE DÉJÀ, ET ELLE EST DOUBLE ══
--
-- `interactions` porte `resume` (ce que le commercial a noté) ET `resume_ia` (ce que l'IA d'Allo a
-- entendu, écrit par le webhook `api/allo/webhook.ts`). On retient le résumé humain quand il
-- existe, celui d'Allo sinon : une note écrite exprès vaut mieux qu'une transcription automatique,
-- et une transcription automatique vaut infiniment mieux que rien.
--
-- ══ POURQUOI LE CONTACT ET NON L'OBJET ══
--
-- L'historique d'appels s'accroche au CONTACT : c'est à une personne qu'on a parlé, pas à une
-- opportunité. Une opportunité créée ce matin depuis le vivier n'a aucune interaction à elle, alors
-- que son contact peut en porter douze — et ce sont celles-là qu'il faut lire avant de composer.
--
-- ══ IL FAUT UN `DROP`, ET C'EST LA SEULE RAISON ══
--
-- Postgres refuse de changer la liste des colonnes de sortie d'une fonction par un simple
-- `create or replace`. Deux colonnes s'ajoutent, donc la fonction est supprimée puis recréée —
-- rien d'autre ne change dans son corps que ces deux lignes et leur jointure.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.lister_pipe_du_jour();

create function public.lister_pipe_du_jour()
returns table (
  ligne_id          uuid,
  cible_type        text,
  cible_id          uuid,
  source            text,
  rang              integer,
  nom_complet       text,
  fonction          text,
  compte_nom        text,
  segment           text,
  telephone         text,
  telephone_mobile  text,
  heure             text,
  en_retard         boolean,
  compte_id         uuid,
  contact_id        uuid,
  compteurs         integer,
  mwh_annuels       numeric,
  echeance          date,
  nature_echeance   text,
  taches_ouvertes   integer,
  commentaire       text,
  dernier_echange   timestamptz,
  dernier_resume    text
)
language sql
stable
security invoker
set search_path = public
as $$
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
    where a.actif
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and (a.opportunite_id is not null or a.piste_id is not null)
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
  left join prochaine pr    on pr.cible_type = l.cible_type and pr.cible_id = l.cible_id
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
  -- parlé. Le résumé humain passe devant celui d'Allo, et l'un des deux doit exister — une
  -- interaction sans résumé n'a rien à dire avant un appel.
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
$$;

comment on function public.lister_pipe_du_jour is
  'Le pipe du jour du conseiller connecté, trié pour l''affichage : ce dont l''heure n''est pas '
  'encore venue part en fin de pile, puis l''ordre manuel, puis le rang figé. Porte aussi le '
  'dernier échange du contact et son résumé — humain s''il existe, celui d''Allo sinon — pour que '
  'la fiche du sprint dise ce qui a été entendu la dernière fois.';

grant execute on function public.lister_pipe_du_jour() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select nom_complet, dernier_echange::date, left(dernier_resume, 60)
--     from lister_pipe_du_jour() where dernier_resume is not null;
--
--   -- Et la couverture réelle de la source, toutes équipes confondues :
--   select count(*) filter (where coalesce(nullif(trim(resume),''), nullif(trim(resume_ia),'')) is not null)
--          as avec_resume, count(*) as interactions
--     from interactions where actif;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
