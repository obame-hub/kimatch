-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES CARTES DU JOUR NE MONTRENT QUE CE QUI EST DÛ AUJOURD'HUI
--
-- William, 10/09/2026, après avoir vu la première version : « tu dois afficher uniquement mes
-- enregistrements ou mes tâches mais qui ont une échéance soit en retard, soit égale à aujourd'hui.
-- Cette page représente ce qu'un commercial doit faire dans la journée […] il est donc inutile de
-- lui montrer les actions de demain. »
--
-- J'avais retenu l'autre lecture de « à aujourd'hui » — l'état du jour plutôt que l'échéance du
-- jour. C'était le mauvais choix : la question de cette page n'est pas « combien de travail
-- m'attend » mais « que dois-je faire maintenant ». Une carte qui annonce 85 appels alors que 12
-- sont réellement à passer aujourd'hui ne hiérarchise plus rien.
--
-- ── LE FILTRE EST POSÉ UNE SEULE FOIS, DANS `ouvertes` ──
--
-- Les cinq cartes en héritent : les trois types de tâche, les pistes et les opportunités. Le poser
-- carte par carte aurait laissé la porte ouverte à un oubli le jour où l'on en ajoute une sixième.
--
-- ── L'HEURE DE PARIS, ET C'EST TOUT SAUF UN DÉTAIL ──
--
-- La base tourne en UTC : `current_date + 1` y vaut le 11/09 à 00:00 UTC, soit le 11/09 à 02:00 à
-- Paris. Une tâche prévue demain matin à 1 h serait donc comptée comme « due aujourd'hui » — et
-- pire, la frontière se déplacerait deux fois par an avec l'heure d'été.
--
-- On calcule donc minuit à PARIS, puis on le reconvertit en instant absolu :
--     (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris'
-- Le 10/09/2026 à 15 h 17, cela donne bien le 10/09 à 22:00 UTC — minuit à Paris.
--
-- ── UNE TÂCHE SANS ÉCHÉANCE NE COMPTE PAS ──
--
-- La comparaison `<` écarte les valeurs nulles, et c'est le bon comportement : une tâche sans date
-- n'est ni en retard ni due aujourd'hui, elle n'a simplement pas de terme. Trois lignes sont dans
-- ce cas au 10/09/2026. Les faire apparaître dans un décompte du jour reviendrait à inventer une
-- urgence que personne n'a fixée.
--
-- ── CE QUE CHACUN VOIT MAINTENANT (10/09/2026) ──
--
--   Matthieu Bruere   12 appels · 47 pistes
--   Fabien Dubarry    12 mails
--   Thomas Le Guen     7 appels ·  8 pistes
--   Marie Thonnard                 4 pistes
--   William Goupil    zéro partout — il n'a aucune tâche à son nom
--
-- Les trois mesures « Opportunités à suivre » tombent à zéro pour tout le monde : les 15 tâches
-- d'opportunité ouvertes ont toutes une échéance entre le 13/09 et le 04/10. C'est exact, et c'est
-- justement ce que ce filtre doit produire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists compter_cartes_du_jour();

create or replace function compter_cartes_du_jour()
returns table (
  appels                 integer,
  mails                  integer,
  livrables              integer,
  pistes_a_prospecter    integer,
  perimetre_a_detecter   integer,
  mandat_a_recuperer     integer,
  recommandation_a_creer integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  -- Les tâches encore ouvertes ET dues : en retard, ou tombant aujourd'hui à Paris.
  ouvertes as (
    select a.responsable_profil_id, a.piste_id, a.opportunite_id, ta.code as type_code
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    left join types_actions ta on ta.id = a.type_action_id
    where a.actif
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                            at time zone 'Europe/Paris'
  ),
  mes_taches as (
    select o.* from ouvertes o, moi where o.responsable_profil_id = moi.profil_id
  ),
  -- Une piste compte UNE fois, quel que soit le nombre de tâches dues qu'elle porte : c'est un
  -- dossier à traiter aujourd'hui, pas une charge de travail.
  mes_pistes as (
    select distinct pi.id
    from ouvertes o
    join pistes pi on pi.id = o.piste_id and pi.actif
    cross join moi
    where pi.proprietaire_id = moi.profil_id
  ),
  mes_opportunites as (
    select distinct op.id, so.code as statut
    from ouvertes o
    join opportunites op on op.id = o.opportunite_id and op.actif
    join statuts_opportunites so on so.id = op.statut_id
    cross join moi
    where op.proprietaire_id = moi.profil_id
      and so.code in ('NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR')
  )
  select
    (select count(*) from mes_taches where type_code = 'APPELER')::integer,
    (select count(*) from mes_taches where type_code = 'ENVOYER_EMAIL')::integer,
    (select count(*) from mes_taches where type_code = 'LIVRABLE')::integer,
    (select count(*) from mes_pistes)::integer,
    (select count(*) from mes_opportunites
      where statut in ('NOUVELLE', 'EN_QUALIFICATION'))::integer,
    (select count(*) from mes_opportunites where statut = 'COUVERTURE_MANDAT')::integer,
    (select count(*) from mes_opportunites where statut = 'PRETE_A_CONVERTIR')::integer;
$$;

comment on function compter_cartes_du_jour is
  'Les sept nombres de la première ligne du tableau de bord, POUR L''APPELANT et POUR AUJOURD''HUI : ses tâches ouvertes dont l''échéance est passée ou tombe aujourd''hui (heure de Paris), par type ; ses pistes et opportunités portant une telle tâche. Une tâche est à moi par responsable_profil_id, un dossier par proprietaire_id.';

grant execute on function compter_cartes_du_jour() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- La frontière tombe bien à minuit à Paris, pas à minuit UTC :
--   select (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
--            at time zone 'Europe/Paris' as fin_du_jour_paris;
--
--   -- Depuis l'application, connecté : select * from compter_cartes_du_jour();
-- ════════════════════════════════════════════════════════════════════════════════════════════════
