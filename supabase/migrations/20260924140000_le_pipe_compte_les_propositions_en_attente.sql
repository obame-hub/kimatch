-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHAQUE TUILE RETROUVE SA COLONNE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 24/09/2026, après avoir vu les noms de colonne au survol :
--   « Le champ montant que tu dois récupérer dans les rapports de montant signé sur la vue
--     d'ensemble, c'est le champ `recommandations.marge_nette_coeff`.
--     Concernant le montant qui doit être utilisé pour calculer le pipe, c'est le champ
--     `recommandations.montant`. Dans vue d'ensemble, le pipe représente le cumul de tous les
--     `recommandations.montant` pour toutes les recommandations au statut "Proposée". »
--
-- Les deux tuiles échangent donc leur colonne. `montant_signe` revient à `marge_nette_coeff` — le
-- basculement de ce matin (migration 20260924120000) est annulé, c'était une erreur de ma lecture
-- de « l'encadré vert » : il y en a deux sur la fiche, et je n'avais pas retenu le bon.
--
-- ══ « AU STATUT PROPOSÉE » SE LIT SUR LA VERSION, PAS SUR LA RECOMMANDATION ══
--
-- Il n'existe pas d'étape « Proposée » dans `etapes_recommandation`. Le jalon du chemin porte ce
-- nom et se franchit autrement : une VERSION reçoit une `date_presentation_client`, écrite par
-- « Envoyer au client ». C'est cela, être proposée.
--
-- ══ ET LES DOSSIERS CLOS EN SORTENT — C'EST UNE INTERPRÉTATION, ELLE EST ASSUMÉE ══
--
-- 541 recommandations ont été proposées un jour, pour 829 898,88 €. Mais 478 d'entre elles sont
-- closes : signées, perdues ou abandonnées. Un pipe est une ESPÉRANCE ; y laisser des affaires
-- déjà jouées ferait espérer deux fois ce qui est encaissé une fois, et ne redescendrait jamais.
--
-- Restent 63 dossiers proposés et encore ouverts, pour 46 855,11 € (45 portent un montant, 18 non
-- et comptent donc pour zéro — même trou que partout, il se comble depuis l'encadré vert du héros).
--
-- LE PIPE RESTE PERSONNEL. La portée Moi/Global du 24/09 ne concerne que le montant signé ; William
-- avait posé le pipe comme une espérance personnelle le 11/09 et ne demande pas de le changer.
--
-- CE QUE ÇA RÉPARE AU PASSAGE : le pipe filtrait sur `colonne_travail = 'EN_DECISION'`, une valeur
-- qu'AUCUNE version ne porte (statuts réellement employés : CLOTUREE 1 524, DISPONIBLE 44,
-- EN_CONSTRUCTION 38). La tuile affichait donc 0,00 € à tout le monde depuis sa mise en service.

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
  proposees as (
    -- « Au statut Proposée » : une version est partie chez le client. Le dossier doit encore être
    -- ouvert — voir l'en-tête.
    select r.montant
    from recommandations r
    left join etapes_recommandation e on e.id = r.etape_id
    cross join moi
    where r.actif
      and r.proprietaire_id = moi.profil_id
      and r.finalite_cloture is null
      and coalesce(e.code, '') <> 'CLOTUREE'
      and exists (
        select 1 from versions_recommandation v
        where v.recommandation_id = r.id
          and v.date_presentation_client is not null
      )
  )
  select
    (select coalesce(sum(montant), 0) from proposees),
    (select count(*)::integer from proposees),
    -- Le montant signé revient à `marge_nette_coeff`, sur demande expresse du 24/09.
    (select coalesce(sum(r.marge_nette_coeff), 0)
     from recommandations r
     cross join moi
     where r.actif
       and r.finalite_cloture = 'ACCEPTEE'
       and r.date_cloture >= v_depuis
       and r.date_cloture <= v_aujourdhui
       and (v_portee = 'GLOBAL' or r.proprietaire_id = moi.profil_id));
end;
$$;
