-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE OPPORTUNITÉ NÉE D'UNE PISTE PART DE SON PÉRIMÈTRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 : « Une opportunité passe directement en Couverture mandat à partir du moment
-- où elle est créée avec des compteurs liés. Autrement elle reste En qualification. »
--
-- LA CONVERSION EST LE SIGNAL POSITIF. La règle générale exigeait un signal saisi et un contact avant
-- de sortir de « Nouvelle » ; pour une opportunité née d'une piste, c'était décrire à tort comme
-- toute neuve une affaire dont on vient de raccrocher. Le périmètre décide seul : des compteurs, et
-- il reste le mandat à obtenir ; aucun, et il reste à les rattacher.
--
-- MÊME RÈGLE QU'À L'ÉCRAN (`statutDerive`, src/lib/statutOpportunite.ts) — les deux sont confrontées
-- sur toute la production par scripts/.essai-statut-opportunite.mts.
--
-- Au passage, le périmètre ne compte que les lignes qui portent vraiment un compteur, comme l'écran.

create or replace function public.fn_statut_opportunite_calcule(p_opp uuid)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  o              record;
  v_recos        integer;
  v_perimetre    integer;
  v_restants     integer;
  v_sites        integer;
  v_signal       boolean;
  v_contact      boolean;
  v_compte       boolean;
  v_a_perimetre  boolean;
  v_mandats      integer;
  v_non_couverts integer;
begin
  select id, compte_id, contact_id, signal_id, signal_libelle, qualification_fin, origine
    into o from opportunites where id = p_opp;
  if not found then return null; end if;

  select count(*) into v_recos
    from recommandations r where r.opportunite_id = p_opp and r.actif;

  select count(*) into v_perimetre
    from opportunites_compteurs where opportunite_id = p_opp and compteur_id is not null;

  select count(*) into v_restants
    from opportunites_compteurs oc
   where oc.opportunite_id = p_opp
     and oc.compteur_id is not null
     and not coalesce(oc.ecarte, false)
     and not exists (
       select 1 from recommandations_compteurs rc
         join recommandations r on r.id = rc.recommandation_id
        where r.opportunite_id = p_opp and r.actif and rc.compteur_id = oc.compteur_id
     );

  -- 1 · Convertie quand tout le périmètre est placé, et pas avant (Michel, 11/09/2026).
  if v_recos > 0 and v_restants = 0 then return 'CONVERTIE'; end if;
  -- 2 · Conversion commencée, pas finie.
  if v_recos > 0 then return 'PRETE_A_CONVERTIR'; end if;
  -- 3 · Une qualification de fin autre que Convertie ferme le dossier.
  if o.qualification_fin is not null and o.qualification_fin <> 'CONVERTIE' then return 'ABANDONNEE'; end if;

  if o.origine = 'PISTE' then
    -- 4 bis · Née d'une piste : pas de « Nouvelle », le périmètre décide seul.
    if v_perimetre = 0 then return 'EN_QUALIFICATION'; end if;
  else
    v_signal  := o.signal_id is not null or coalesce(btrim(o.signal_libelle), '') <> '';
    v_contact := o.contact_id is not null;
    -- 4 · Ni signal ni contact : elle vient d'arriver.
    if not v_signal or not v_contact then return 'NOUVELLE'; end if;

    v_compte := o.compte_id is not null;
    select count(*) into v_sites from opportunites_sites where opportunite_id = p_opp;
    v_a_perimetre := v_sites + v_perimetre > 0;
    -- 5 · Compte ou périmètre manquant.
    if not v_compte or not v_a_perimetre then
      return case when not v_compte and not v_a_perimetre then 'NOUVELLE' else 'EN_QUALIFICATION' end;
    end if;
  end if;

  /* 6 · Le mandat se vérifie CONTRE LE PÉRIMÈTRE : un mandat actif du même compte, et chaque
     compteur couvert par au moins un d'entre eux, hors couverture caduque. */
  select count(*) into v_mandats
    from mandats m join statuts_mandats sm on sm.id = m.statut_id
   where m.actif and sm.code = 'ACTIF' and m.compte_id = o.compte_id;

  select count(*) into v_non_couverts
    from opportunites_compteurs oc
   where oc.opportunite_id = p_opp
     and oc.compteur_id is not null
     and not exists (
       select 1 from mandats_compteurs mc
         join mandats m on m.id = mc.mandat_id
         join statuts_mandats sm on sm.id = m.statut_id
        where mc.compteur_id = oc.compteur_id and mc.caduc_depuis is null
          and m.actif and sm.code = 'ACTIF' and m.compte_id = o.compte_id
     );

  if not (v_perimetre > 0 and v_non_couverts = 0 and v_mandats > 0) then
    return 'COUVERTURE_MANDAT';
  end if;

  -- 7 · Données et conditions réunies.
  return 'PRETE_A_CONVERTIR';
end;
$$;

-- L'origine détermine désormais le palier : le déclencheur l'écoute aussi.
drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.opportunites;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or update of compte_id, contact_id, signal_id, signal_libelle, qualification_fin, actif, origine
  on public.opportunites
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

-- La reprise : chaque opportunité reçoit son palier selon la règle du jour.
select public.recalculer_statut_opportunite(o.id) from opportunites o where o.actif;
