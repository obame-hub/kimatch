-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LE PARC ENTIER REVIENT DANS LE PLAN, ET LE PLAN SE COMPLÈTE DANS LA JOURNÉE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Deux défauts mesurés le 23/09/2026 en repassant le processus au peigne fin.
--
-- ══ B1 · LE SEAU QUI DEVAIT RATTRAPER LES PISTES FROIDES NE S'ACTIVAIT POUR PERSONNE ══
--
-- Il était conditionné à `not v_vivier` : il ne se déclenchait que si le commercial n'avait AUCUNE
-- ligne de vivier. Relevé ce jour :
--
--   Thomas    1 455 pistes sans tâche   169 lignes de vivier   → seau éteint
--   Matthieu  1 345                     469                    → seau éteint
--   Marie       992                     260                    → seau éteint
--   Fabien      893                     463                    → seau éteint
--
-- 4 685 pistes n'avaient AUCUNE chance de revenir, dont 854 déjà travaillées puis oubliées — 539
-- restées à « Nouvelle » depuis 112 jours en moyenne, 313 à « En cours de qualification » depuis
-- 54 jours. L'intention de William est l'inverse : « que tout le parc soit qualifié, ou disqualifié,
-- ou avec une tâche en cours ».
--
-- LE SEAU RESTE LE DERNIER SERVI. Il ne prend que la place que les rappels, les leads entrants et
-- les opportunités dormantes n'ont pas prise — le plafond s'en charge. Personne ne verra une piste
-- froide passer devant un rappel promis.
--
-- ET L'ORDRE N'EST PLUS TIRÉ AU SORT. `random()` échantillonnait le parc : on revoyait la même
-- piste deux fois en trois jours pendant qu'une autre attendait six mois. On sert désormais la plus
-- ancienne d'abord, ce qui BALAYE le parc au lieu de le sonder. Un moyen de joindre suffit,
-- téléphone OU adresse : le sprint sait faire les deux depuis le 22/09.
--
-- ══ A5 · LE PLAN NE SE CONSTRUISAIT QU'UNE FOIS PAR JOUR ══
--
-- `if v_deja > 0 then return v_deja` sortait immédiatement dès qu'une ligne existait. Une tâche
-- créée le matin pour l'après-midi — « je le rappelle à 16 h », le cas le plus courant d'une séance
-- — n'entrait donc JAMAIS dans le plan du jour. Elle attendait le lendemain.
--
-- La fonction COMPLÈTE maintenant : elle ajoute ce qui manque, sans toucher à ce qui est là, et
-- sans jamais dépasser le plafond. Une cible déjà présente ne revient pas, MÊME SORTIE — on ne
-- réimpose pas une fiche qu'on vient d'écarter.
--
-- MESURÉ APRÈS APPLICATION : 3 466 pistes froides redeviennent atteignables chez quatre
-- commerciaux — 1 100 pour Thomas, 895 pour Matthieu, 810 pour Fabien, 661 pour Marie. À soixante
-- par jour, chacun balaye son parc en moins de trois semaines.

create or replace function public.construire_pipe_du_jour()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_moi      uuid := auth.uid();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_plafond  integer;
  v_deja     integer;
  v_rang     integer;
begin
  if v_moi is null then return 0; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  -- Ce qui est déjà là compte dans le plafond, sorti ou non : le plan du jour est une quantité de
  -- travail décidée le matin, pas une file qui se recharge à mesure qu'on la vide.
  select count(*), coalesce(max(rang), 0) into v_deja, v_rang
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  if v_deja >= v_plafond then return v_deja; end if;

  with
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
  rappel_jour as (
    select 3 as seau, t.cible_type, t.cible_id, 'RAPPEL_JOUR'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du < v_jour or t.heure = '00:00:00'
  ),
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
  froides as (
    select 6 as seau, 'PISTE'::text as cible_type, p.id as cible_id,
           'PISTE_FROIDE'::text as source,
           -- La plus ancienne d'abord : on balaye le parc, on ne le sonde pas.
           extract(epoch from coalesce(p.date_derniere_activite, p.date_creation))::double precision as tri
      from pistes p
      left join statuts_pistes sp on sp.id = p.statut_id
     where p.actif
       and p.proprietaire_id = v_moi
       and not coalesce(sp.est_cloture, false)
       -- Un moyen de joindre, quel qu'il soit : le sprint sait appeler ET écrire.
       and coalesce(p.telephone, p.telephone_mobile, p.email) is not null
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
  nouveaux as (
    select * from candidats c
     where not exists (
       select 1 from pipe_du_jour l
        where l.profil_id = v_moi and l.jour = v_jour
          and l.cible_type = c.cible_type and l.cible_id = c.cible_id
     )
  ),
  dedoublonnes as (
    select distinct on (cible_type, cible_id) *
      from nouveaux
     order by cible_type, cible_id, seau, tri nulls last
  ),
  classes as (
    select *, row_number() over (order by seau, tri nulls last, cible_id) as pos
      from dedoublonnes
  )
  insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
  select v_moi, v_jour, c.cible_type, c.cible_id, (v_rang + c.pos)::integer, c.source
    from classes c
   where c.pos <= (v_plafond - v_deja)
      on conflict (profil_id, jour, cible_type, cible_id) do nothing;

  select count(*) into v_deja
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  return v_deja;
end;
$function$;
