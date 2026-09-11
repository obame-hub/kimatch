-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE « PIPE OUVERT » DEVIENT LE « PIPE EN DÉCISION »
--
-- William, 11/09/2026 : « je voudrais que ça prenne uniquement les recommandations avec en
-- propriétaire l'utilisateur qui affiche le dashboard, et uniquement pour les recommandations au
-- statut "En décision", pas les autres. Ça s'appellerait désormais Pipe en décision. »
--
-- ── CE QUI CHANGE ──
--
-- LE PÉRIMÈTRE. L'indicateur sommait toutes les recommandations non clôturées ; il ne retient plus
-- que celles dont la VERSION ACTUELLE est au statut « En décision » — celles qui sont chez le
-- client et attendent sa réponse. C'est le seul sous-ensemble sur lequel un commercial peut agir
-- aujourd'hui : une étude en construction ne se relance pas, une étude clôturée non plus.
--
-- LE FILTRE PAR PROPRIÉTAIRE ÉTAIT DÉJÀ LÀ (`r.proprietaire_id = auth.uid()`) et ne bouge pas.
--
-- LA MESURE. `versions_recommandation.gain_estime_annuel` cède la place à
-- `recommandations.marge_nette_coeff` — voir ci-dessous, c'est le point important.
--
-- ── POURQUOI LA MESURE CHANGEAIT DE TOUTE FAÇON : L'ANCIENNE ÉTAIT VIDE ──
--
-- Mesuré le 11/09/2026 : `gain_estime_annuel` est NULL sur les 1 565 versions actuelles de la
-- base. SUR TOUTES. L'indicateur « Pipe ouvert » affichait donc 0,00 € à tout le monde depuis sa
-- mise en ligne, et personne ne pouvait s'en apercevoir : un zéro se lit comme « je n'ai rien en
-- cours », pas comme « la colonne lue est vide ».
--
-- Le champ retenu est `marge_nette_coeff`, conformément à la règle posée par William le
-- 10/09/2026 : « partout dans Kimatch où on marque le montant d'une recommandation, c'est le champ
-- marge_nette_coeff qui doit être pris en compte ». C'est aussi celui du montant signé, juste
-- au-dessous dans la même tuile — deux montants voisins mesurés autrement seraient incomparables.
--
-- ⚠️ IL RESTE PEU RENSEIGNÉ SUR LES ÉTUDES OUVERTES. Sur les 30 recommandations « En décision » de
-- la base : 2 portent une `marge_nette_coeff`, 4 une `marge_nette`, 6 un `montant`, 0 un
-- `chiffre_affaires`. Les montants se remplissent à la clôture — c'est ce que l'import Salesforce
-- a fait pour les dossiers gagnés. L'indicateur dira donc la vérité, et cette vérité sera basse
-- tant que les études en cours ne porteront pas de montant. C'est une question de saisie, pas de
-- code : signalé à William le 11/09/2026.
--
-- ── LE DÉCOMPTE ACCOMPAGNE LA SOMME ──
--
-- La fonction rend aussi `nb_en_decision`. La tuile affichait « 12 études en cours » sous le
-- montant, un nombre qui venait des offres DU JOUR — donc d'un autre périmètre que la somme
-- au-dessus. Deux chiffres côte à côte qui ne parlent pas du même ensemble finissent toujours par
-- être lus comme s'ils le faisaient.
--
-- ── UNE VERSION « EN DÉCISION » SUR UNE RECOMMANDATION CLÔTURÉE NE COMPTE PAS ──
--
-- Il y en a 4 dans la base : la recommandation a été clôturée sans que le statut de sa version
-- suive. Ce n'est pas du pipe, c'est une dérive de donnée — d'où le `e.code <> 'CLOTUREE'`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists compter_totaux_offres();

create function compter_totaux_offres()
returns table (
  pipe_en_decision numeric,
  nb_en_decision   integer,
  montant_signe    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
  en_decision as (
    select r.marge_nette_coeff
    from versions_recommandation v
    join statuts_versions_recommandation sv on sv.id = v.statut_version_id
    join recommandations r        on r.id = v.recommandation_id and r.actif
    join etapes_recommandation e  on e.id = r.etape_id
    cross join moi
    where v.version_actuelle
      and sv.code = 'EN_DECISION'
      and r.proprietaire_id = moi.profil_id
      and e.code <> 'CLOTUREE'
  )
  select
    (select coalesce(sum(marge_nette_coeff), 0) from en_decision),
    (select count(*)::integer from en_decision),
    (select coalesce(sum(r.marge_nette_coeff), 0)
     from recommandations r
     cross join moi
     cross join jour j
     where r.actif
       and r.proprietaire_id = moi.profil_id
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture = j.aujourdhui);
$$;

comment on function compter_totaux_offres is
  'Le pipe en décision (mes recommandations dont la version actuelle est « En décision ») et le montant signé du jour. Les deux se mesurent en marge_nette_coeff, le seul montant qui fait foi pour une recommandation.';

grant execute on function compter_totaux_offres() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select * from compter_totaux_offres();
--
--   -- Le décompte doit correspondre à :
--   --   select count(*) from versions_recommandation v
--   --     join statuts_versions_recommandation sv on sv.id = v.statut_version_id
--   --     join recommandations r on r.id = v.recommandation_id and r.actif
--   --     join etapes_recommandation e on e.id = r.etape_id
--   --    where v.version_actuelle and sv.code = 'EN_DECISION'
--   --      and r.proprietaire_id = auth.uid() and e.code <> 'CLOTUREE';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
