-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MONTANT DE L'AFFAIRE FAIT FOI PARTOUT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 24/09/2026, à la question « le héros doit-il passer sur `montant`, ou Slack reprendre
-- `marge_nette_coeff` ? » : « quel est le champ dans recommandation qui apparaît dans un encadré
-- vert ? c'est celui-là que je veux partout. »
--
-- L'encadré vert de la fiche recommandation, c'est « Montant de l'affaire » — `recommandations.
-- montant`, le chiffre saisi par le commercial, celui qu'il modifie d'un clic dans le héros. C'est
-- donc lui qui doit alimenter la tuile du tableau de bord, comme il alimente déjà la félicitation
-- Slack depuis ce matin.
--
-- ══ CE QUE ÇA CHANGE À L'ÉCRAN, ET IL FAUT LE SAVOIR ══
--
-- Mesuré le 24/09/2026 sur les 282 recommandations acceptées depuis le 1er janvier :
--     somme de `marge_nette_coeff` ... 763 576,15 €   (ce qu'affichait la tuile)
--     somme de `montant` ............. 442 845,33 €   (ce qu'elle affichera)
--
-- L'écart n'est pas une erreur : les deux colonnes ne disent pas la même chose. `marge_nette_coeff`
-- est la marge nette pondérée, `montant` est le montant de l'affaire. William veut le second.
--
-- 18 DES 282 N'ONT AUCUN MONTANT et compteront donc pour zéro. C'est le même trou que celui signalé
-- dans le héros de la fiche — la saisie n'était pas demandée avant le 18/09/2026 — et il se comble
-- dossier par dossier, en cliquant sur l'encadré vert.
--
-- ══ LE PIPE SUIT, PAR COHÉRENCE ══
--
-- « Partout » vaut aussi pour lui. Le changement est invisible aujourd'hui : AUCUNE version ne porte
-- le statut `EN_DECISION` (statuts réellement employés au 24/09 : CLOTUREE 1 524, DISPONIBLE 44,
-- EN_CONSTRUCTION 38, et 188 sans version). La tuile « Pipe en décision » affiche donc 0,00 € à tout
-- le monde, quelle que soit la colonne sommée. C'est signalé à William séparément : le filtre est
-- juste, c'est la donnée qu'il cherche qui n'existe pas.

create or replace function compter_totaux_offres(p_periode text default 'JOUR', p_portee text default 'MOI')
returns table(pipe_en_decision numeric, nb_en_decision integer, montant_signe numeric)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_periode text := upper(coalesce(p_periode, ''));
  v_portee  text := upper(coalesce(p_portee, 'MOI'));
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_depuis date;
begin
  if v_periode not in ('JOUR', 'MOIS', 'TRIMESTRE', 'ANNEE') then
    raise exception 'Période inconnue : « % ». Attendu : JOUR, MOIS, TRIMESTRE ou ANNEE.', p_periode;
  end if;
  if v_portee not in ('MOI', 'GLOBAL') then
    raise exception 'Portée inconnue : « % ». Attendu : MOI ou GLOBAL.', p_portee;
  end if;

  v_depuis := case v_periode
                when 'JOUR'      then v_aujourdhui
                when 'MOIS'      then date_trunc('month',   v_aujourdhui)::date
                when 'TRIMESTRE' then date_trunc('quarter', v_aujourdhui)::date
                when 'ANNEE'     then date_trunc('year',    v_aujourdhui)::date
              end;

  return query
  with moi as (select auth.uid() as profil_id),
  en_decision as (
    -- `r.montant` et non plus `l.marge_nette_coeff` : le montant de l'affaire, celui de l'encadré vert.
    select r.montant
    from v_recommandations_liste l
    join recommandations r on r.id = l.id and r.actif
    cross join moi
    where l.colonne_travail = 'EN_DECISION'
      and l.proprietaire_id = moi.profil_id
  )
  select
    (select coalesce(sum(montant), 0) from en_decision),
    (select count(*)::integer from en_decision),
    (select coalesce(sum(r.montant), 0)
     from recommandations r
     cross join moi
     where r.actif
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture >= v_depuis
       and r.date_cloture <= v_aujourdhui
       -- En GLOBAL on ne filtre plus sur le propriétaire : « TOUTES les recommandations acceptées ».
       and (v_portee = 'GLOBAL' or r.proprietaire_id = moi.profil_id));
end;
$$;
