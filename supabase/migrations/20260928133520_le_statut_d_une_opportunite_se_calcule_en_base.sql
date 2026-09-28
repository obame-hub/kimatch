-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE STATUT D'UNE OPPORTUNITÉ SE CALCULE EN BASE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026, sur une opportunité affichée « Convertie » qui restait dans son pipe du
-- jour : « Les statuts des pistes et des opportunités devraient être des valeurs stockées, pour
-- qu'on puisse les réutiliser dans des règles comme celle-ci. »
--
-- ══ CE QUI ÉTAIT FAUX ══
--
-- Le statut affiché était DÉDUIT à l'écran (`statutDerive`, src/lib/data/opportunites.ts), à partir
-- du périmètre, des mandats et des recommandations. La colonne `opportunites.statut_id`, elle,
-- n'était écrite qu'à la création — et jamais ensuite. Deux vérités, donc : l'écran disait
-- « Convertie », la base disait « Nouvelle ».
--
-- Or cinq lecteurs en base se fient à la colonne : le pipe du jour, les cartes du jour, le
-- reporting, la qualité des compteurs, le score de signal d'un contact. Tous voyaient ouverte une
-- opportunité que l'écran montrait convertie.
--
-- ══ CETTE FONCTION EST LA RÈGLE DE L'ÉCRAN, TRANSCRITE ══
--
-- Même ordre, mêmes paliers que `statutDerive` et `prerequisOpportunite`. Deux écarts, voulus :
-- une recommandation ou un mandat SUPPRIMÉS (`actif = false`) ne comptent pas. L'écran les
-- comptait, faute de filtre — une recommandation effacée ne convertit rien.
--
-- Elle est PURE : elle lit, elle ne modifie rien. C'est `recalculer_statut_opportunite` qui écrit.

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
  select id, compte_id, contact_id, signal_id, signal_libelle, qualification_fin
    into o from opportunites where id = p_opp;
  if not found then return null; end if;

  select count(*) into v_recos
    from recommandations r where r.opportunite_id = p_opp and r.actif;

  select count(*) into v_perimetre from opportunites_compteurs where opportunite_id = p_opp;

  /* Un compteur est TRAITÉ quand il est placé dans une recommandation de cette opportunité, ou
     écarté exprès. Écarté reste dans le périmètre : c'est son sort qui diffère. */
  select count(*) into v_restants
    from opportunites_compteurs oc
   where oc.opportunite_id = p_opp
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

  /* 6 · Le mandat se vérifie CONTRE LE PÉRIMÈTRE : un mandat actif du même compte, et chaque
     compteur couvert par au moins un d'entre eux, hors couverture caduque. Un périmètre sans
     compteur n'est pas couvert — il n'y a rien à couvrir. */
  select count(*) into v_mandats
    from mandats m join statuts_mandats sm on sm.id = m.statut_id
   where m.actif and sm.code = 'ACTIF' and m.compte_id = o.compte_id;

  select count(*) into v_non_couverts
    from opportunites_compteurs oc
   where oc.opportunite_id = p_opp
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

comment on function public.fn_statut_opportunite_calcule(uuid) is
  'Le palier d''une opportunite, meme regle que statutDerive (front). Pure : ne modifie rien.';
