-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE SCORE DE QUALITÉ D'UN COMPTE, COMPTEUR PAR COMPTEUR
--
-- Naoëlle, 02/09/2026 : « on va enlever toute la page que tu as créée, mais on va mettre cette
-- notion à la place de la card valeur du compte sur la fiche du compte, à côté du score Ellipro. Et
-- du coup quand on clique dessus on verra tous les compteurs concernés. »
--
-- ══ LE BARÈME, MOT POUR MOT ══
--
-- « Échéance dépassée et sans échéance, on les regroupe ensemble. » Par compteur :
--
--     Contrat + responsable                                      100
--     Contrat + sans responsable                                  70
--     Sans contrat + échéance future + responsable                80
--     Sans contrat + échéance future + sans responsable           50
--     Sans contrat + échéance absente/dépassée + responsable      30
--     Sans contrat + échéance absente/dépassée + sans responsable   0
--
-- « Le score qualité du Compte correspond ensuite à la moyenne des scores de tous ses compteurs. »
--
-- UN COMPTE NEUF VAUT ZÉRO, et c'est sa demande explicite : « quand on créera un compte, ce score
-- sera à zéro car il n'aura rien, ni compteur ni contact ». La moyenne d'un ensemble vide n'existe
-- pas mathématiquement — `avg()` rend NULL — donc le zéro est posé par un `coalesce`. Ce n'est pas
-- une commodité d'affichage : un compte sans compteur est exactement le cas où il n'y a rien de
-- vérifié, et 0 le dit mieux qu'un tiret.
--
-- ══ « CONTRAT » VEUT DIRE CONTRAT EN COURS, ET C'EST UNE DÉCISION ══
--
-- Mesuré le 02/09/2026 sur les 7 914 compteurs actifs : 1 454 portent un contrat actif, mais
-- seulement 1 033 un contrat qui n'est pas encore terminé. Les 421 autres ont un contrat fini.
--
-- Les compter comme « Contrat » leur donnerait 100 ou 70 — la note des compteurs les mieux tenus —
-- alors qu'un contrat terminé ne dit RIEN de qui les fournit aujourd'hui, et que leur échéance est
-- par définition passée. Ce sont précisément les compteurs à rappeler en premier. Le barème vise
-- l'état « on sait qui fournit et on sait qui appeler » : un contrat mort ne le démontre pas.
--
-- La même prudence est déjà écrite dans `echeance.ts` pour la nature d'une échéance : « la preuve
-- doit être vivante ; un contrat terminé ne prouve rien sur l'échéance à venir ».
--
-- ══ CE QUI DISPARAÎT ══
--
-- `v_qualite_donnees_compte`, écrite hier pour l'écran « Qualité des données » que Naoëlle retire.
-- Elle comptait des ANOMALIES par compte ; ce score note un ÉTAT par compteur. Garder les deux
-- laisserait deux façons de mesurer la même chose, et c'est ainsi qu'un écran finit par contredire
-- l'autre. La vue par compteur ci-dessous rend en plus le détail que la page ne donnait pas : le
-- clic sur le score doit montrer « tous les compteurs concernés ».
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop view if exists public.v_qualite_donnees_compte;

-- ══ 1. UN COMPTEUR, SES TROIS FAITS, SON SCORE ══
create or replace view public.v_qualite_compteur
with (security_invoker = true) as
select
  cm.id                        as compteur_id,
  cm.numero_point,
  cm.site_id,
  s.nom                        as site_nom,
  s.compte_id,
  te.code                      as type_energie,
  cm.consommation_annuelle_mwh,
  cm.date_echeance,
  cm.responsable_contact_id,
  coalesce(ct.prenom || ' ' || ct.nom, '') as responsable_nom,
  -- ── Les trois faits qui décident du score ──
  -- Un contrat ENCORE EN COURS : sans date de fin, ou dont la fin n'est pas passée.
  exists (
    select 1 from public.contrats_compteurs cc
      join public.contrats c on c.id = cc.contrat_id
     where cc.compteur_id = cm.id
       and c.actif
       and (c.date_fin is null or c.date_fin >= current_date)
  )                                                              as a_contrat,
  -- « Échéance dépassée et sans échéance » sont un seul cas : ni l'une ni l'autre ne dit quand
  -- relancer. Seule une échéance à venir informe.
  (cm.date_echeance is not null and cm.date_echeance >= current_date) as echeance_future,
  (cm.responsable_contact_id is not null)                        as a_responsable,
  -- ── Le barème de Naoëlle, dans son ordre ──
  case
    when exists (
      select 1 from public.contrats_compteurs cc
        join public.contrats c on c.id = cc.contrat_id
       where cc.compteur_id = cm.id and c.actif
         and (c.date_fin is null or c.date_fin >= current_date)
    ) then
      case when cm.responsable_contact_id is not null then 100 else 70 end
    when cm.date_echeance is not null and cm.date_echeance >= current_date then
      case when cm.responsable_contact_id is not null then 80 else 50 end
    else
      case when cm.responsable_contact_id is not null then 30 else 0 end
  end                                                            as score
from public.compteurs cm
join public.sites s on s.id = cm.site_id
left join public.types_energies te on te.id = cm.type_energie_id
left join public.contacts ct on ct.id = cm.responsable_contact_id
where cm.actif;

comment on view public.v_qualite_compteur is
  'Le score de qualité d''un compteur (0 à 100) et les trois faits qui le décident. Barème de Naoëlle du 02/09/2026. « Contrat » signifie contrat encore en cours.';

-- ══ 2. LE COMPTE : LA MOYENNE DE SES COMPTEURS ══
create or replace view public.v_qualite_compte
with (security_invoker = true) as
select
  cp.id                                        as compte_id,
  cp.nom                                       as compte_nom,
  count(q.compteur_id)                         as nb_compteurs,
  -- Un compte sans compteur vaut 0 : `avg()` d'un ensemble vide est NULL, et le zéro est la
  -- réponse voulue — rien n'est vérifié, donc rien n'est acquis.
  coalesce(round(avg(q.score)), 0)::integer    as score,
  -- Le détail, pour que la fiche puisse dire ce qui manque sans relire tous les compteurs.
  count(*) filter (where q.compteur_id is not null and not q.a_contrat)     as sans_contrat,
  count(*) filter (where q.compteur_id is not null and not q.echeance_future) as echeance_a_revoir,
  count(*) filter (where q.compteur_id is not null and not q.a_responsable) as sans_responsable,
  count(*) filter (where q.score = 100)                                    as parfaits
from public.comptes cp
left join public.v_qualite_compteur q on q.compte_id = cp.id
where cp.actif
group by cp.id, cp.nom;

comment on view public.v_qualite_compte is
  'Score de qualité d''un compte = moyenne des scores de ses compteurs actifs, 0 s''il n''en a aucun.';

-- ── Le garde-fou : le barème doit rendre exactement les six valeurs prévues ──
do $$
declare
  v_hors_bareme integer;
  v_moyenne numeric;
  v_sans_compteur integer;
begin
  select count(*) into v_hors_bareme
    from public.v_qualite_compteur where score not in (0, 30, 50, 70, 80, 100);
  if v_hors_bareme > 0 then
    raise exception 'Le barème rend % scores hors des six valeurs prévues', v_hors_bareme;
  end if;

  -- Un compteur avec contrat en cours ne peut pas valoir moins de 70 : si ça arrive, l'ordre des
  -- branches du CASE a été inversé et le contrat ne prime plus.
  if exists (select 1 from public.v_qualite_compteur where a_contrat and score < 70) then
    raise exception 'Un compteur sous contrat en cours score moins de 70 : l''ordre du barème est faux';
  end if;

  select round(avg(score), 1) into v_moyenne from public.v_qualite_compte;
  select count(*) into v_sans_compteur from public.v_qualite_compte where nb_compteurs = 0;
  raise notice 'Score qualité moyen des comptes : % · comptes sans aucun compteur (score 0) : %',
    v_moyenne, v_sans_compteur;
end;
$$;

commit;
