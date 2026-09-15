-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MONTANT SIGNÉ SE LIT SUR LA PÉRIODE QU'ON CHOISIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « dans la card "Montant signé", ajoute des filtres Jour / Mois / Trimestre /
-- Année. En fonction, joue avec les dates de clôture des recommandations acceptées pour sortir à
-- chaque fois le montant adapté. Ne touche pas à la valeur du pipe en décision situé en dessous. »
--
-- ══ DES PÉRIODES EN COURS, PAS GLISSANTES ══
--
-- « Ce mois-ci » compte du 1er du mois à aujourd'hui, pas les trente derniers jours. C'est la lecture
-- d'un commercial : les objectifs se tiennent au mois et au trimestre, et un chiffre glissant ne se
-- compare à aucun d'eux. Le 1er du mois, la tuile repart donc de zéro — c'est voulu, et c'est ce qui
-- lui donne son sens.
--
-- CHAQUE PÉRIODE CONTIENT LA PRÉCÉDENTE : le jour est dans le mois, le mois dans le trimestre. Les
-- quatre montants ne s'additionnent pas, ils se regardent l'un après l'autre — d'où un choix unique
-- et non des cases à cocher.
--
-- Mesuré le 15/09/2026, tous propriétaires confondus : 7 264 € le jour · 14 737,81 € le mois ·
-- 88 532,50 € le trimestre · 709 901,90 € l'année. Les quatre filtres ont donc chacun quelque chose
-- à montrer, et aucune recommandation acceptée n'est sans date de clôture.
--
-- ══ LE PIPE NE BOUGE PAS, ET C'EST ÉCRIT ICI POUR QU'ON NE L'OUBLIE PAS ══
--
-- La consigne est explicite. Le pipe en décision est un ENCOURS : il vaut ce qu'il vaut au moment où
-- on le regarde, et le découper par période n'aurait pas de sens — une étude partie chez le client
-- en juin et toujours en décision aujourd'hui appartient au pipe d'aujourd'hui, pas à celui de juin.
-- Les deux premières colonnes rendues ignorent donc `p_periode`, quelle que soit sa valeur.
--
-- ══ LA SIGNATURE CHANGE, DONC L'ANCIENNE FONCTION PART ══
--
-- Ajouter un paramètre à valeur par défaut À CÔTÉ de la version sans argument rendrait
-- `compter_totaux_offres()` ambigu — Postgres ne saurait pas laquelle appeler et refuserait. On
-- remplace donc, plutôt que de surcharger. Le défaut `'JOUR'` garde le comportement d'avant pour
-- tout appel qui ne préciserait rien.
--
-- ══ UNE PÉRIODE INCONNUE EST UNE ERREUR, PAS UN REPLI SILENCIEUX ══
--
-- Retomber sur « jour » devant une valeur inattendue afficherait un montant juste sous un libellé
-- faux : l'écran dirait « cette année » en montrant la journée. Et laisser la fenêtre valoir NULL
-- rendrait zéro sans rien dire, ce qui se lit « je n'ai rien signé ». L'appel échoue donc, et la
-- tuile le dit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

drop function if exists public.compter_totaux_offres();

create or replace function public.compter_totaux_offres(p_periode text default 'JOUR')
returns table(pipe_en_decision numeric, nb_en_decision integer, montant_signe numeric)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_periode text := upper(coalesce(p_periode, ''));
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_depuis date;
begin
  if v_periode not in ('JOUR', 'MOIS', 'TRIMESTRE', 'ANNEE') then
    raise exception 'Période inconnue : « % ». Attendu : JOUR, MOIS, TRIMESTRE ou ANNEE.', p_periode;
  end if;

  -- `date_trunc` rend un timestamp, d'où le retour explicite en `date` : `date_cloture` EST une
  -- date, et comparer une date à un timestamp ferait porter la conversion au moteur à chaque ligne.
  v_depuis := case v_periode
                when 'JOUR'      then v_aujourdhui
                when 'MOIS'      then date_trunc('month',   v_aujourdhui)::date
                when 'TRIMESTRE' then date_trunc('quarter', v_aujourdhui)::date
                when 'ANNEE'     then date_trunc('year',    v_aujourdhui)::date
              end;

  return query
  with moi as (select auth.uid() as profil_id),
  en_decision as (
    select l.marge_nette_coeff
    from v_recommandations_liste l
    join recommandations r on r.id = l.id and r.actif
    cross join moi
    where l.colonne_travail = 'EN_DECISION'
      and l.proprietaire_id = moi.profil_id
  )
  select
    (select coalesce(sum(marge_nette_coeff), 0) from en_decision),
    (select count(*)::integer from en_decision),
    (select coalesce(sum(r.marge_nette_coeff), 0)
     from recommandations r
     cross join moi
     where r.actif
       and r.proprietaire_id = moi.profil_id
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture >= v_depuis
       -- LA BORNE HAUTE EST AUJOURD'HUI, et non l'infini : une clôture datée de la semaine
       -- prochaine — cela arrive, la date se saisit à la main — gonflerait le mois en cours d'un
       -- montant pas encore acquis. Le montant signé est un fait, pas une prévision.
       and r.date_cloture <= v_aujourdhui);
end;
$$;

comment on function public.compter_totaux_offres(text) is
  'Les deux montants de la tuile Argent du tableau de bord. `p_periode` (JOUR, MOIS, TRIMESTRE, ANNEE) ne s''applique qu''au montant signé ; le pipe en décision est un encours et ignore la période.';

grant execute on function public.compter_totaux_offres(text) to authenticated;
