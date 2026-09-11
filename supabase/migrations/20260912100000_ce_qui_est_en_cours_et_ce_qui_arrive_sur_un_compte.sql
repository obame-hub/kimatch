-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QUI EST EN COURS SUR UN COMPTE, ET CE QUI LUI ARRIVE
--
-- William, 11/09/2026 : « une fonctionnalité de suivi des mandats en cours de signature […] même
-- chose pour les contrats […] une fonctionnalité de suivi des recommandations ouvertes (montant,
-- prochaine action, clôture prévue) […] monitorer la santé des compteurs de ce compte ».
--
-- Trois fonctions, et une seule lecture chacune. La leçon du 12/09 vaut ici : la fiche compte
-- partait déjà avec 59 requêtes, il n'est pas question d'en ajouter quinze pour trois blocs.
--
-- ══ CE QUE LES DONNÉES PERMETTENT VRAIMENT, ET CE QU'ELLES NE PERMETTENT PAS ══
--
-- Compté avant d'écrire quoi que ce soit, sur les 142 recommandations ouvertes de la base :
--
--     date_souhaitee de la version actuelle     67 sur 87 renseignées
--     date_expiration                            0
--     gain_estime_annuel                         0
--     marge_nette_coeff                          rare avant la clôture
--     une tâche ouverte rattachée                4 sur 142
--
-- IL N'Y A PAS DE « CLÔTURE PRÉVUE » EN BASE. La colonne qui s'en rapproche est `date_souhaitee` —
-- la date à laquelle le commercial attend l'offre du pricing. Ce n'est pas la clôture du dossier,
-- c'est sa prochaine échéance interne, et c'est la seule date réellement tenue. On l'affiche sous
-- son vrai nom plutôt que de baptiser « clôture prévue » quelque chose qui n'en est pas une.
--
-- ── ET « PROCHAINE ACTION » DIT SURTOUT QUAND ELLE MANQUE ──
--
-- Quatre dossiers ouverts sur cent quarante-deux portent une tâche. La colonne serait donc vide à
-- 97 % si on la lisait comme un agenda. Lue dans l'autre sens, elle devient le signal le plus utile
-- du bloc : CENT TRENTE-HUIT DOSSIERS OUVERTS QUE PERSONNE NE PILOTE. Un dossier sans prochaine
-- action n'avance pas — et c'est précisément ce qu'une fiche compte doit faire remonter.
--
-- ══ LA FRISE DES ÉCHÉANCES REND LES MOIS VIDES ══
--
-- `generate_series` produit les vingt-quatre mois, et la jointure à gauche les laisse à zéro. Ne
-- rendre que les mois peuplés ferait une frise à l'axe irrégulier, où deux barres voisines
-- pourraient être séparées de onze mois sans que rien ne le dise — exactement ce qu'une frise doit
-- montrer.
--
-- `sans_suite` reprend la définition de `lister_echeances_a_traiter` : ni opportunité ouverte, ni
-- recommandation non clôturée. C'est ce qui permet de colorer un mois selon qu'il est couvert ou
-- non, et non seulement selon sa proximité.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LES DOSSIERS OUVERTS, AVEC LEUR PROCHAINE ACTION ══
create or replace function public.lister_dossiers_en_cours(p_compte_id uuid)
returns table (
  recommandation_id uuid,
  nom               text,
  colonne_travail   text,
  montant           numeric,
  date_souhaitee    date,
  jours_restants    integer,
  action_titre      text,
  action_echeance   timestamptz,
  action_en_retard  boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.id,
    l.nom,
    l.colonne_travail,
    l.marge_nette_coeff,
    v.date_souhaitee,
    (v.date_souhaitee - (now() at time zone 'Europe/Paris')::date)::integer,
    a.titre,
    a.date_prevue,
    a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris'
  from v_recommandations_liste l
  join recommandations r on r.id = l.id and r.actif
  left join lateral (
    select ver.date_souhaitee
    from versions_recommandation ver
    where ver.recommandation_id = l.id and ver.version_actuelle
    limit 1
  ) v on true
  left join lateral (
    select act.titre, act.date_prevue
    from actions act
    join statuts_actions sa on sa.id = act.statut_id
    where act.recommandation_id = l.id and act.actif
      and sa.code not in ('TERMINEE', 'ANNULEE')
    order by act.date_prevue asc nulls last
    limit 1
  ) a on true
  where l.compte_id = p_compte_id
    and l.colonne_travail <> 'CLOTUREE'
  order by v.date_souhaitee asc nulls last, l.nom;
$$;

comment on function public.lister_dossiers_en_cours is
  'Les recommandations non clôturées d''un compte, avec leur prochaine tâche ouverte. Une ligne sans tâche est un dossier que personne ne pilote — 138 des 142 dossiers ouverts de la base étaient dans ce cas au 12/09/2026.';

-- ══ 2. CE QUI EST PARTI À LA SIGNATURE ══
create or replace function public.compter_signatures_en_cours(p_compte_id uuid)
returns table (
  mandats_n        integer,
  mandats_depuis   date,
  contrats_n       integer,
  contrats_depuis  date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*)::integer from mandats m
      join statuts_mandats s on s.id = m.statut_id
      where m.compte_id = p_compte_id and m.actif and s.code in ('ENVOYE', 'CONSULTE')),
    (select min(m.date_envoi)::date from mandats m
      join statuts_mandats s on s.id = m.statut_id
      where m.compte_id = p_compte_id and m.actif and s.code in ('ENVOYE', 'CONSULTE')),
    (select count(*)::integer from contrats c
      join statuts_contrats_avancement a on a.id = c.statut_avancement_id
      where c.compte_id = p_compte_id and c.actif and a.code in ('ENVOYE', 'CONSULTE', 'DEMANDE', 'RECEPTIONNE')),
    (select min(c.date_envoi_signature)::date from contrats c
      join statuts_contrats_avancement a on a.id = c.statut_avancement_id
      where c.compte_id = p_compte_id and c.actif and a.code in ('ENVOYE', 'CONSULTE', 'DEMANDE', 'RECEPTIONNE'));
$$;

comment on function public.compter_signatures_en_cours is
  'Les mandats et contrats d''un compte partis à la signature et pas encore revenus, avec la date du plus ancien envoi.';

-- ══ 3. QUAND LES CONTRATS TOMBENT ══
create or replace function public.lister_charge_echeances(p_compte_id uuid)
returns table (
  mois       date,
  compteurs  integer,
  mwh        numeric,
  sans_suite integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with mois_glissants as (
    select generate_series(
      date_trunc('month', (now() at time zone 'Europe/Paris')::date),
      date_trunc('month', (now() at time zone 'Europe/Paris')::date) + interval '23 months',
      interval '1 month'
    )::date as mois
  ),
  compteurs_dates as (
    select
      date_trunc('month', v.date_echeance)::date as mois,
      v.consommation_annuelle_mwh,
      not exists (
        select 1 from opportunites_compteurs oc
        join opportunites o on o.id = oc.opportunite_id and o.actif
        where oc.compteur_id = v.id
      ) and not exists (
        select 1 from recommandations_compteurs rc
        join recommandations r on r.id = rc.recommandation_id and r.actif
        join etapes_recommandation e on e.id = r.etape_id and e.code <> 'CLOTUREE'
        where rc.compteur_id = v.id
      ) as sans_suite
    from v_compteurs_liste v
    where v.compte_id = p_compte_id and v.actif and v.date_echeance is not null
  )
  select
    m.mois,
    count(c.mois)::integer,
    coalesce(sum(c.consommation_annuelle_mwh), 0),
    count(*) filter (where c.sans_suite)::integer
  from mois_glissants m
  left join compteurs_dates c on c.mois = m.mois
  group by m.mois
  order by m.mois;
$$;

comment on function public.lister_charge_echeances is
  'Les vingt-quatre prochains mois d''échéances d''un compte : combien de compteurs tombent chaque mois, pour quel volume, et combien n''ont rien de lancé. Les mois sans échéance sont rendus à zéro — la frise doit garder son axe du temps régulier.';

grant execute on function public.lister_dossiers_en_cours(uuid)     to authenticated;
grant execute on function public.compter_signatures_en_cours(uuid)  to authenticated;
grant execute on function public.lister_charge_echeances(uuid)      to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select * from lister_dossiers_en_cours('2a76baa4-8093-4828-91c6-d07fddd897c6');
--   -- CABINET CSJC au 12/09/2026 : 7 dossiers ouverts, AUCUN ne porte de tâche, deux ont dépassé
--   -- leur date souhaitée de 67 jours.
--
--   select to_char(mois,'YYYY-MM'), compteurs, round(mwh), sans_suite
--     from lister_charge_echeances('76c53356-4e82-4dac-8d89-c946c7269792') where compteurs > 0;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
