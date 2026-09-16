-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE COCKPIT TIENT LA PROSPECTION DANS UNE PILE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 14 et 15/09/2026 : centraliser la prospection dans un écran unique, avec un pipe de
-- SOIXANTE actions figé le matin, et un vivier illimité d'où l'on tire de quoi le compléter.
--
-- ══ UNE TABLE, ET ELLE NE STOCKE QUE LA DÉCISION ══
--
-- `pipe_du_jour` ne porte AUCUNE copie de la donnée : ni nom, ni société, ni numéro, ni statut.
-- Seulement qui, dans quel ordre, et pourquoi. La lecture joint la donnée vivante.
--
-- Conséquence directe : IL N'Y A RIEN À SYNCHRONISER. Une piste renommée est renommée dans la
-- pile ; une piste disqualifiée par un collègue disparaît à la lecture suivante, sans traitement
-- de purge, parce que la jointure ne la ramène plus.
--
-- ══ POURQUOI UNE TABLE ET NON UNE VUE, PUISQUE LA DONNÉE EST DÉJÀ SUR PLACE ══
--
-- Quatre raisons, dont trois rédhibitoires :
--
--   1. le seau de complétion tire AU HASARD — une vue rebattrait les cartes à chaque
--      rafraîchissement de la page, et l'ordre ne serait jamais deux fois le même ;
--   2. une vue se réalimente par construction, donc le pipe ne se viderait jamais, et l'effet
--      voulu — une journée qui descend et se termine — disparaîtrait ;
--   3. le glisser-déposer n'aurait aucune ligne où se persister ;
--   4. « tu as traité 28 fiches aujourd'hui » se lit dans `sorti_le`, qu'une vue n'a pas.
--
-- ══ LA LIGNE SORT, ELLE NE S'EFFACE PAS ══
--
-- `sorti_le` et `motif_sortie` plutôt qu'un `delete`. Une ligne qui disparaît sans trace, c'est un
-- conseiller qui se demande le lendemain s'il l'a appelée — et c'est la seule façon de savoir,
-- dans trois mois, pourquoi trois cents pistes n'ont jamais été travaillées.
--
-- ══ DEUX TYPES DE CIBLE, JAMAIS UN CONTACT ══
--
-- Une action de prospection est toujours rattachée à une piste ou à une opportunité. Ce n'est pas
-- un contrôle à écrire, c'est le type de la ligne : `cible_type` n'accepte rien d'autre. Un
-- contact du vivier devient une opportunité AVANT d'entrer (voir `ajouter_au_pipe_depuis_vivier`).
--
-- ══ CE QUE LA CONSTRUCTION DU MATIN NE FAIT PAS ══
--
-- Elle ne crée aucune opportunité. Transformer du vivier est un geste humain — un bouton — et pas
-- un effet de bord du chargement d'une page. Le pipe du matin peut donc être COURT, et c'est
-- normal : l'écran affiche « 43 sur 60 » et propose de compléter. Les pistes froides, elles,
-- n'ont besoin de personne pour entrer : une piste est déjà un objet de travail. Mais elles
-- n'entrent que si le vivier de ce conseiller est vide, parce que le portefeuille passe avant le
-- froid (William, 15/09/2026).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LE PLAFOND, PAR CONSEILLER ════════════════════════════════════════════════════════════

alter table profils
  add column if not exists plafond_pipe_du_jour integer not null default 60;

comment on column profils.plafond_pipe_du_jour is
  'Nombre maximum d''actions dans le pipe du jour du Cockpit. 60 par défaut (William, 15/09/2026). '
  'Les leads entrants arrivés en cours de journée et les ajouts explicites depuis le vivier '
  'passent outre ce plafond.';

-- ══ 2. LA PILE ═══════════════════════════════════════════════════════════════════════════════

create table if not exists pipe_du_jour (
  id            uuid primary key default gen_random_uuid(),
  profil_id     uuid not null references profils(id) on delete cascade,
  jour          date not null,
  cible_type    text not null check (cible_type in ('PISTE', 'OPPORTUNITE')),
  cible_id      uuid not null,
  rang          integer not null,
  ordre_manuel  integer,
  source        text not null check (source in (
                  'INBOUND', 'RAPPEL_HEURE', 'RAPPEL_JOUR',
                  'OPPORTUNITE_DORMANTE', 'VIVIER', 'PISTE_FROIDE',
                  'INBOUND_LIVE', 'AJOUT_MANUEL'
                )),
  ajoute_le     timestamptz not null default now(),
  sorti_le      timestamptz,
  motif_sortie  text check (motif_sortie in ('APPELE', 'REPORTE', 'ECARTE', 'PURGE')),
  constraint pipe_du_jour_une_cible_par_jour unique (profil_id, jour, cible_type, cible_id)
);

comment on table pipe_du_jour is
  'Le snapshot du pipe de prospection d''un conseiller pour une journée. Ne contient que la '
  'décision — qui, dans quel ordre, pourquoi — jamais une copie de la donnée. Une ligne sortie '
  'garde sa trace (sorti_le, motif_sortie) au lieu d''être supprimée.';

-- `rang` ET NON `position` : `position` est un mot réservé de Postgres, refusé dans la liste de
-- colonnes d'un `returns table` — la migration a échoué là-dessus au premier essai, le 15/09/2026.
comment on column pipe_du_jour.rang is
  'L''ordre figé, calculé une seule fois à la construction. Il ne bouge plus de la journée : '
  'c''est lui qui fait que rafraîchir la page ne rebat pas les cartes.';

comment on column pipe_du_jour.ordre_manuel is
  'L''ordre imposé par le conseiller au glisser-déposer. Quand il existe, il passe devant '
  '`rang`. Nul tant que personne n''a réordonné.';

comment on column pipe_du_jour.source is
  'Pourquoi cette ligne est là. VIVIER désigne une opportunité créée le matin même depuis le '
  'vivier : la ligne est bien une opportunité, la source dit d''où venait le travail.';

create index if not exists idx_pipe_du_jour_ma_journee
  on pipe_du_jour (profil_id, jour) where sorti_le is null;

create index if not exists idx_pipe_du_jour_cible
  on pipe_du_jour (cible_type, cible_id);

-- ══ 3. CHACUN NE VOIT QUE SA JOURNÉE ═════════════════════════════════════════════════════════

alter table pipe_du_jour enable row level security;

drop policy if exists ma_pile_lecture   on pipe_du_jour;
drop policy if exists ma_pile_ecriture  on pipe_du_jour;
drop policy if exists ma_pile_maj       on pipe_du_jour;
drop policy if exists ma_pile_purge     on pipe_du_jour;

create policy ma_pile_lecture on pipe_du_jour
  for select to authenticated using (profil_id = auth.uid());

create policy ma_pile_ecriture on pipe_du_jour
  for insert to authenticated with check (profil_id = auth.uid());

create policy ma_pile_maj on pipe_du_jour
  for update to authenticated using (profil_id = auth.uid()) with check (profil_id = auth.uid());

create policy ma_pile_purge on pipe_du_jour
  for delete to authenticated using (profil_id = auth.uid());

-- ══ 4. LE VIVIER ═════════════════════════════════════════════════════════════════════════════
--
-- Des CONTACTS, et eux seuls : ce sont les seules lignes du Cockpit qui n'ont pas encore d'objet
-- de travail, et le vivier existe pour leur en donner un.
--
-- QUI ENTRE : décisionnaires, signataires, décisionnaires potentiels. Pas les administratifs — ils
-- ne contractualisent pas — ni les conseils syndicaux, dont l'aide en base dit déjà « représente
-- les copropriétaires, ne contractualise pas ».
--
-- DEUX CRITÈRES, ET UN SEUL PAR LIGNE :
--   ECHEANCE_18_MOIS   au moins un compteur dont l'échéance est vide, dépassée, ou à moins de
--                      18 mois, et sur lequel rien n'est lancé
--   SANS_PERIMETRE     aucun compteur du tout. On le croit décisionnaire et on ne sait rien de ce
--                      qu'il consomme
--
-- La vue ne filtre PAS par propriétaire, comme `v_echeances_a_traiter` : c'est l'appelant qui le
-- fait. Le propriétaire d'un contact du vivier, c'est celui du COMPTE — le porteur du portefeuille
-- — et sûrement pas `contacts.proprietaire_id`, qui vaut « celui qui a saisi la fiche » et que
-- rien ne propage (voir le déclencheur d'historique 20260828190000).

create or replace view v_vivier_cockpit as
with borne as (
  select (now() at time zone 'Europe/Paris')::date                        as aujourdhui,
         (now() at time zone 'Europe/Paris')::date + interval '18 months' as limite
),
joignables as (
  select
    c.id                                        as contact_id,
    c.compte_id,
    cp.nom                                      as compte_nom,
    cp.segment                                  as compte_segment,
    cp.proprietaire_id                          as compte_proprietaire_id,
    trim(concat_ws(' ', c.civilite, c.prenom, c.nom)) as nom_complet,
    c.fonction,
    c.roles,
    coalesce(c.telephone, c.telephone_mobile)   as telephone,
    c.telephone_mobile
  from contacts c
  join comptes cp       on cp.id = c.compte_id and cp.actif
  join types_comptes tc on tc.id = cp.type_compte_id
  where c.actif
    and tc.code = 'CLIENT'
    and c.roles && array['DECISIONNAIRE', 'SIGNATAIRE', 'DECISIONNAIRE_POTENTIEL']::text[]
    and coalesce(c.telephone, c.telephone_mobile) is not null
    and not exists (
      select 1 from opportunites o
       where o.contact_id = c.id
         and o.actif
         and o.date_cloture is null
         and o.qualification_fin is null
    )
),
perimetre as (
  select
    j.contact_id,
    (select count(*) from compteurs m
      where m.responsable_contact_id = j.contact_id and m.actif)          as compteurs_total,
    q.compteurs_qualifiants,
    q.mwh,
    q.echeance_min,
    q.sans_echeance
  from joignables j
  left join lateral (
    select
      count(*)::integer                                  as compteurs_qualifiants,
      sum(e.consommation_annuelle_mwh)                   as mwh,
      min(e.date_echeance)                               as echeance_min,
      count(*) filter (where e.date_echeance is null)::integer as sans_echeance
    from v_echeances_a_traiter e, borne b
    where e.responsable_contact_id = j.contact_id
      and not e.a_opportunite_vivante
      and not e.a_recommandation_ouverte
      and (e.date_echeance is null or e.date_echeance <= b.limite)
  ) q on true
)
select
  j.contact_id,
  j.compte_id,
  j.compte_nom,
  j.compte_segment,
  j.compte_proprietaire_id,
  j.nom_complet,
  j.fonction,
  j.roles,
  j.telephone,
  j.telephone_mobile,
  coalesce(p.compteurs_total, 0)        as compteurs_total,
  coalesce(p.compteurs_qualifiants, 0)  as compteurs_qualifiants,
  p.mwh                                 as mwh_annuels,
  p.echeance_min,
  coalesce(p.sans_echeance, 0)          as compteurs_sans_echeance,
  case
    when coalesce(p.compteurs_total, 0) = 0 then 'SANS_PERIMETRE'
    else 'ECHEANCE_18_MOIS'
  end                                   as critere,
  (p.echeance_min is not null and p.echeance_min < b.aujourdhui) as echeance_depassee
from joignables j
join perimetre p on p.contact_id = j.contact_id
cross join borne b
-- Un contact dont tous les compteurs tombent au-delà de 18 mois ne relève d'aucun critère :
-- il a un périmètre, et ce périmètre n'a rien d'urgent. Il n'entre pas.
where coalesce(p.compteurs_total, 0) = 0
   or coalesce(p.compteurs_qualifiants, 0) > 0;

comment on view v_vivier_cockpit is
  'Les contacts prospectables sans objet de travail : décisionnaires, signataires ou '
  'décisionnaires potentiels d''un compte Consommateur, joignables, sans opportunité non close, '
  'et portant soit un compteur à échéance vide/dépassée/sous 18 mois, soit aucun compteur du '
  'tout. Ne filtre pas par propriétaire — l''appelant le fait sur compte_proprietaire_id.';

grant select on v_vivier_cockpit to authenticated;

-- ══ 5. CONSTRUIRE LE PIPE DU MATIN ═══════════════════════════════════════════════════════════
--
-- Idempotente : si un snapshot existe déjà pour aujourd'hui, elle rend son effectif et ne touche
-- à rien. C'est ce qui fait qu'ouvrir la page deux fois ne rebat pas les cartes.
--
-- L'APPARTENANCE SE LIT EN DEUX ENDROITS, ET CE N'EST PAS UNE INCOHÉRENCE :
--   pour un rappel, c'est le RESPONSABLE DE LA TÂCHE (`actions.responsable_profil_id`), comme dans
--   `lister_taches_du_jour` — celui qui doit agir est celui à qui la tâche est confiée ;
--   pour tout le reste, c'est le propriétaire de l'objet de travail.
--
-- LE TRI INTERNE DE CHAQUE SEAU est une échelle propre au seau (`tri`, en secondes d'époque, ou
-- un tirage pour le froid). Comparer deux seaux entre eux n'aurait aucun sens : c'est `seau` qui
-- les ordonne.

create or replace function public.construire_pipe_du_jour()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_moi      uuid := auth.uid();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_plafond  integer;
  v_deja     integer;
  v_vivier   boolean;
begin
  if v_moi is null then return 0; end if;

  select count(*) into v_deja
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  if v_deja > 0 then return v_deja; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  -- Reste-t-il du vivier ? Les pistes froides n'entrent que s'il est vide.
  select exists (
    select 1 from v_vivier_cockpit v where v.compte_proprietaire_id = v_moi
  ) into v_vivier;

  with

  -- ── 1 · LES LEADS ENTRANTS QUE PERSONNE N'A ENCORE APPELÉS ──
  -- Priorité absolue, les plus anciens d'abord : entre un lead reçu ce matin et un d'hier, c'est
  -- celui d'hier qui refroidit et qui risque de ne jamais être appelé.
  inbound as (
    select 1 as seau, 'PISTE'::text as cible_type, p.id as cible_id, 'INBOUND'::text as source,
           extract(epoch from p.date_creation)::double precision as tri
      from pistes p
      left join statuts_pistes sp on sp.id = p.statut_id
     where p.actif
       and p.proprietaire_id = v_moi
       and not coalesce(sp.est_cloture, false)
       and p.source in ('Google Ads avec facture (Inbound)', 'Google Ads sans facture (Inbound)')
       and p.date_premier_appel is null
  ),

  -- ── 2 et 3 · LES RAPPELS ──
  -- Toutes les tâches comptent, tous types confondus, dès qu'elles pendent à un objet éligible :
  -- c'est ce qui fait du Cockpit l'écran unique de la prospection et non un écran d'appels de plus.
  -- La borne haute est celle de `lister_taches_du_jour` : tout ce qui est dû avant demain.
  taches as (
    select
      a.date_prevue,
      (a.date_prevue at time zone 'Europe/Paris')::time  as heure,
      (a.date_prevue at time zone 'Europe/Paris')::date  as jour_du,
      case when a.opportunite_id is not null then 'OPPORTUNITE' else 'PISTE' end as cible_type,
      coalesce(a.opportunite_id, a.piste_id)             as cible_id
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    left join opportunites o on o.id = a.opportunite_id
    left join pistes pi      on pi.id = a.piste_id
    left join statuts_pistes sp on sp.id = pi.statut_id
    where a.actif
      and a.responsable_profil_id = v_moi
      -- Même condition que `lister_taches_du_jour` : on exclut les deux statuts fermés plutôt que
      -- d'énumérer les ouverts, pour qu'un statut ajouté demain compte comme ouvert.
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                            at time zone 'Europe/Paris'
      and (a.opportunite_id is not null or a.piste_id is not null)
      and (a.opportunite_id is null
           or (o.actif and o.date_cloture is null and o.qualification_fin is null))
      and (a.piste_id is null
           or (pi.actif and not coalesce(sp.est_cloture, false)))
  ),
  rappel_heure as (
    select 2 as seau, t.cible_type, t.cible_id, 'RAPPEL_HEURE'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du = v_jour and t.heure <> '00:00:00'
  ),
  -- Une tâche en retard portant l'heure d'hier n'a plus d'heure utile aujourd'hui : elle rejoint
  -- le seau sans heure plutôt que de réclamer un créneau qui n'existe plus.
  rappel_jour as (
    select 3 as seau, t.cible_type, t.cible_id, 'RAPPEL_JOUR'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du < v_jour or t.heure = '00:00:00'
  ),

  -- ── 4a · LES OPPORTUNITÉS OUVERTES QUE PERSONNE NE POUSSE ──
  -- Un dossier déjà qualifié sans aucune tâche ouverte : rien n'est plus près de l'argent, et son
  -- existence signale une discipline qui a fui — chaque appel devrait finir par la tâche suivante.
  -- Les plus anciennement modifiées d'abord : les plus oubliées.
  dormantes as (
    select 4 as seau, 'OPPORTUNITE'::text as cible_type, o.id as cible_id,
           'OPPORTUNITE_DORMANTE'::text as source,
           extract(epoch from o.date_modification)::double precision as tri
      from opportunites o
     where o.actif
       and o.proprietaire_id = v_moi
       and o.date_cloture is null
       and o.qualification_fin is null
       and not exists (
         select 1 from actions a
           join statuts_actions sa on sa.id = a.statut_id
          where a.opportunite_id = o.id
            and a.actif
            and sa.code not in ('TERMINEE', 'ANNULEE')
       )
  ),

  -- ── 4c · LE FROID, EN DERNIER, ET SEULEMENT QUAND LE VIVIER EST VIDE ──
  -- Tiré au sort : par date de création, les plus anciennes remonteraient chaque matin et ne
  -- seraient jamais faites.
  froides as (
    select 6 as seau, 'PISTE'::text as cible_type, p.id as cible_id,
           'PISTE_FROIDE'::text as source, random() as tri
      from pistes p
      left join statuts_pistes sp on sp.id = p.statut_id
     where not v_vivier
       and p.actif
       and p.proprietaire_id = v_moi
       and not coalesce(sp.est_cloture, false)
       and coalesce(p.telephone, p.telephone_mobile) is not null
       and not exists (
         select 1 from actions a
           join statuts_actions sa on sa.id = a.statut_id
          where a.piste_id = p.id
            and a.actif
            and sa.code not in ('TERMINEE', 'ANNULEE')
       )
  ),

  candidats as (
    select * from inbound
    union all select * from rappel_heure
    union all select * from rappel_jour
    union all select * from dormantes
    union all select * from froides
  ),
  -- Une même cible peut tomber dans deux seaux — un lead entrant qui porte déjà un rappel. Elle
  -- garde le seau le plus prioritaire, et n'apparaît qu'une fois.
  dedoublonnes as (
    select distinct on (cible_type, cible_id) *
      from candidats
     order by cible_type, cible_id, seau, tri nulls last
  ),
  classes as (
    select *, row_number() over (order by seau, tri nulls last, cible_id) as pos
      from dedoublonnes
  )
  insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
  select v_moi, v_jour, c.cible_type, c.cible_id, c.pos::integer, c.source
    from classes c
   where c.pos <= v_plafond
      on conflict (profil_id, jour, cible_type, cible_id) do nothing;

  select count(*) into v_deja
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  return v_deja;
end;
$$;

comment on function public.construire_pipe_du_jour is
  'Construit le pipe du jour du conseiller connecté, une fois par jour, dans l''ordre des seaux : '
  'leads entrants jamais appelés, rappels à l''heure, rappels sans heure et en retard, '
  'opportunités ouvertes sans tâche, puis pistes froides tirées au sort — ces dernières seulement '
  'si le vivier est vide. Idempotente : un snapshot existant est rendu tel quel. Ne crée aucune '
  'opportunité : transformer du vivier est un geste humain.';

grant execute on function public.construire_pipe_du_jour() to authenticated;

-- ══ 6. LIRE LE PIPE ══════════════════════════════════════════════════════════════════════════
--
-- L'ordre d'affichage se recalcule à chaque lecture PAR-DESSUS `position`, qui reste figé :
--   1. l'ordre manuel du conseiller quand il existe ;
--   2. sinon `position` ;
--   3. et par-dessus tout, ce dont L'HEURE N'EST PAS ENCORE VENUE part en fin de pile, trié par
--      heure croissante — inutile de proposer à 10 h un contact à rappeler à 17 h.
--
-- UNE TÂCHE À MINUIT N'A PAS D'HEURE. C'est la convention de toute l'application depuis le
-- 08/09/2026 : minuit ne veut pas dire « à minuit », il veut dire « pas d'heure ». Une fiche sans
-- heure ne part donc jamais en fin de pile.

create or replace function public.lister_pipe_du_jour()
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
  commentaire       text
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
  -- La prochaine échéance de tâche portée par la cible, qui donne l'heure affichée.
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
    case when l.cible_type = 'PISTE' then p.commentaire else o.commentaire end
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
  -- LA PURGE EST UNE JOINTURE, PAS UN TRAITEMENT : une piste disqualifiée ou une opportunité
  -- close pendant la session ne remonte plus, sans que personne ait à nettoyer la table.
  where (l.cible_type = 'PISTE'
          and p.id is not null and not coalesce(sp.est_cloture, false))
     or (l.cible_type = 'OPPORTUNITE'
          and o.id is not null and o.date_cloture is null and o.qualification_fin is null)
  order by
    -- Ce dont l'heure n'est pas encore venue attend la fin de la pile.
    (pr.date_prevue is not null
      and (pr.date_prevue at time zone 'Europe/Paris')::date = jour.j
      and (pr.date_prevue at time zone 'Europe/Paris')::time > jour.maintenant),
    coalesce(l.ordre_manuel, l.rang),
    l.rang;
$$;

comment on function public.lister_pipe_du_jour is
  'Le pipe du jour du conseiller connecté, trié pour l''affichage : ce dont l''heure n''est pas '
  'encore venue part en fin de pile, puis l''ordre manuel, puis la position figée. Joint la donnée '
  'vivante, si bien qu''une cible disqualifiée ou close disparaît sans traitement de purge.';

grant execute on function public.lister_pipe_du_jour() to authenticated;

-- ══ 7. LES GESTES ════════════════════════════════════════════════════════════════════════════

create or replace function public.sortir_du_pipe(p_ligne_id uuid, p_motif text)
returns void
language sql
security invoker
set search_path = public
as $$
  update pipe_du_jour
     set sorti_le = now(), motif_sortie = p_motif
   where id = p_ligne_id
     and profil_id = auth.uid()
     and sorti_le is null;
$$;

comment on function public.sortir_du_pipe is
  'Marque une ligne du pipe comme sortie, avec son motif (APPELE, REPORTE, ECARTE, PURGE). '
  'La ligne n''est jamais supprimée : c''est elle qui permettra de dire « 28 fiches traitées ».';

grant execute on function public.sortir_du_pipe(uuid, text) to authenticated;

-- Le glisser-déposer : on reçoit l'ordre voulu, on écrit `ordre_manuel` dans cet ordre.
create or replace function public.reordonner_pipe(p_lignes uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update pipe_du_jour l
     set ordre_manuel = r.rang
    from (select id, row_number() over () as rang
            from unnest(p_lignes) as id) r
   where l.id = r.id
     and l.profil_id = auth.uid();
$$;

comment on function public.reordonner_pipe is
  'Écrit l''ordre imposé au glisser-déposer. Le tableau reçu est l''ordre voulu, du premier au '
  'dernier ; `ordre_manuel` suit ce rang et passe devant la position figée.';

grant execute on function public.reordonner_pipe(uuid[]) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS APPLICATION
--
--   -- 1. Construire, puis reconstruire : le second appel ne doit RIEN ajouter.
--   select construire_pipe_du_jour();
--   select construire_pipe_du_jour();   -- le même nombre
--
--   -- 2. Aucune piste froide tant qu'il reste du vivier :
--   select source, count(*) from pipe_du_jour
--    where profil_id = auth.uid() and jour = current_date group by 1;
--   select count(*) from v_vivier_cockpit where compte_proprietaire_id = auth.uid();
--   -- PISTE_FROIDE ne doit apparaître que si le second compte vaut 0.
--
--   -- 3. Le pipe se lit, et une cible close n'y est plus :
--   select position, source, nom_complet, heure from lister_pipe_du_jour();
-- ════════════════════════════════════════════════════════════════════════════════════════════════
