-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES CHIFFRES DU SERVICE CLIENT, ET UN DÉLAI QUI REPART DE ZÉRO
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026, sur le délai moyen de résolution : « calcule-le à partir d'aujourd'hui, je
-- ne veux pas prendre en compte les antécédents ».
--
-- ══ POURQUOI UNE DATE EN DUR, ET NON « LES N DERNIERS MOIS » ══
--
-- Une fenêtre glissante de douze mois rattraperait l'ancien monde à chaque exécution : au 25/09,
-- elle couvre 645 requêtes reprises de Salesforce, résolues selon une organisation qui n'existe
-- plus. Une date de départ FIXE, elle, ne recule jamais : ce qui entre dans la moyenne est ce qui a
-- été résolu depuis que la mesure existe, et rien d'autre.
--
-- ══ CE QUE ÇA DONNE LES PREMIERS JOURS ══
--
-- Aucune requête n'a été résolue le 25/09 — la dernière remonte au 22. La moyenne est donc NULLE au
-- départ, et l'écran affiche « — » plutôt qu'un zéro : « 0 jour de délai moyen » se lirait comme
-- une performance parfaite là où il n'y a simplement rien à mesurer.
--
-- `resolutions_comptees` accompagne la moyenne : une moyenne sur deux dossiers et une moyenne sur
-- soixante ne se lisent pas de la même façon, et l'écran le dit.
--
-- ══ LES AUTRES CHIFFRES ══
--
-- Mesurés le jour de l'écriture : 1 requête créée aujourd'hui, 1 tâche de requête en retard,
-- 3 contrats validés aujourd'hui, 9 tâches de suivi en retard, 132 contrats en attente
-- d'activation.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.chiffres_service_client()
returns jsonb
language sql
stable
set search_path to 'public'
as $fn$
  with aujourdhui as (select (now() at time zone 'Europe/Paris')::date as j),
  ouvertes as (
    select a.* from actions a
    where a.actif
      and exists (select 1 from statuts_actions s where s.id = a.statut_id and s.code not in ('TERMINEE','ANNULEE'))
  )
  select jsonb_build_object(
    'requetes_du_jour',
      (select count(*) from requetes r, aujourdhui
        where r.actif and (r.date_creation at time zone 'Europe/Paris')::date = aujourdhui.j),
    'taches_requetes_en_retard',
      (select count(*) from ouvertes a, aujourdhui
        where a.requete_id is not null and (a.date_prevue at time zone 'Europe/Paris')::date < aujourdhui.j),
    /* ── LE DÉLAI NE COMPTE QUE CE QUI A ÉTÉ RÉSOLU DEPUIS LE 25/09/2026 ──
       La date est fixe et ne recule pas : voir l'en-tête. `null` tant que rien n'a été résolu
       depuis — l'écran affiche alors « — », jamais « 0 ». */
    'jours_moyens_resolution',
      (select round(avg(extract(epoch from (r.date_resolution - r.date_creation)) / 86400)::numeric, 1)
         from requetes r
        where r.actif and r.date_resolution is not null
          and (r.date_resolution at time zone 'Europe/Paris')::date >= date '2026-09-25'),
    'resolutions_comptees',
      (select count(*) from requetes r
        where r.actif and r.date_resolution is not null
          and (r.date_resolution at time zone 'Europe/Paris')::date >= date '2026-09-25'),
    'contrats_valides_du_jour',
      (select count(*) from contrats c, aujourdhui
        where (c.date_validation at time zone 'Europe/Paris')::date = aujourdhui.j),
    'taches_suivis_en_retard',
      (select count(*) from ouvertes a, aujourdhui
        where a.suivi_contrat_id is not null and (a.date_prevue at time zone 'Europe/Paris')::date < aujourdhui.j),
    /* « En attente d'activation » = toute étape ANTÉRIEURE à « Contrat actif », l'ordre faisant
       foi : ajouter une étape avant celle-ci la compterait sans rien changer ici. */
    'contrats_en_attente_activation',
      (select count(*) from suivis_contrats s
         join etapes_suivis_contrats e on e.id = s.etape_id
        where e.ordre < (select ordre from etapes_suivis_contrats where code = 'CONTRAT_ACTIF')
          and s.date_cloture is null)
  );
$fn$;

comment on function public.chiffres_service_client() is
  'Les chiffres de la vue d''ensemble du service client. Le delai moyen de resolution ne compte que '
  'les requetes resolues a partir du 25/09/2026 : date fixe, decidee par William, pour que la mesure '
  'ne traine pas les 645 requetes reprises de Salesforce.';
