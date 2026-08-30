begin;

-- SUPPRESSION DU COMPTE « COMPTE TEST » ET DE CE QUI EN DÉPEND.
--
-- Créé le 29/08/2024. Aucun doute possible sur sa nature : il s'appelle COMPTE TEST, ses deux
-- sites s'appellent « SITE TEST » et « sdc compte test », et ses deux compteurs portent les
-- numéros de point 1234567891234 et 12345678912345 — sans une seule consommation relevée.
--
-- CE QUI N'EST PAS SUPPRIMÉ, ET POURQUOI.
--
-- Le compte KIWEE ENERGIE FRANCE et tout ce qui s'y rattache reste en place : c'est le compte de
-- test de l'équipe, décision de Naoëlle du 30/08/2026. Cela couvre les sites « TEST ELEC » et
-- « TEST TEST TEST TEST », les deux recommandations correspondantes et leurs tâches.
--
-- Restent également en place, faute de certitude :
--   - « SITE TEST CIRCUIT KIMATCH » (compte CORNILLEAU) et « TEST CLAUDE - Entrepot Nord »
--     (compte AMETIS) : manifestement des essais, mais posés sur de VRAIS comptes clients ;
--   - l'échange dont l'objet est « test » sur CABINET LVS, et les courriels contenant le mot
--     « test » sur CABINET IMMOBILIER RIVET-LENOBLE et DL GESTION, qui sont de vrais courriels
--     commerciaux (« proposition de test – accompagnement énergie copropriétés ») ;
--   - les treize échanges « Essai appel … » : ce sont de vraies notes de prospection
--     (« Essai appel ligne directe - NRP »), pas des données de test.
--
-- Le mandat supprimé porte une date de signature (29/10/2024) mais aucun identifiant d'enveloppe
-- DocuSign et aucune référence : personne ne l'a jamais signé, la date a été posée à la main
-- pendant un essai. Il est marqué « Expiré ».

do $$
declare
  v_compte uuid := '0ca4696d-aaf3-4658-9581-35ebbc364798';
  v_sites uuid[];
  v_recos uuid[];
begin
  -- Garde-fou : si l'identifiant ne désigne plus « COMPTE TEST », on ne touche à rien.
  if not exists (select 1 from comptes where id = v_compte and nom = 'COMPTE TEST') then
    raise exception 'Le compte % n''est pas COMPTE TEST — suppression annulée.', v_compte;
  end if;

  select array_agg(id) into v_sites from sites where compte_id = v_compte;
  select array_agg(id) into v_recos from recommandations where compte_id = v_compte;

  delete from optimisations_fournisseurs where optimisation_id in (
    select id from optimisations where version_recommandation_id in (
      select id from versions_recommandation where recommandation_id = any(coalesce(v_recos, '{}'))));
  delete from optimisations where version_recommandation_id in (
    select id from versions_recommandation where recommandation_id = any(coalesce(v_recos, '{}')));
  delete from versions_recommandation where recommandation_id = any(coalesce(v_recos, '{}'));

  delete from interactions where compte_id = v_compte;
  -- `actions` ne porte pas de compte : elle passe par le site ou par la recommandation.
  delete from actions
   where site_id = any(coalesce(v_sites, '{}'))
      or recommandation_id = any(coalesce(v_recos, '{}'));
  -- `documents` désigne son objet par un couple (type d'entité, identifiant) : on vise donc
  -- l'identifiant du compte, de ses sites et de ses recommandations, sans nommer de colonne
  -- de rattachement qui n'existe pas.
  delete from documents
   where entite_id = v_compte
      or entite_id = any(coalesce(v_sites, '{}'))
      or entite_id = any(coalesce(v_recos, '{}'));
  delete from signaux where site_id = any(coalesce(v_sites, '{}'));
  delete from mandats where compte_id = v_compte;
  delete from recommandations where compte_id = v_compte;
  delete from consommations where compteur_id in (
    select id from compteurs where site_id = any(coalesce(v_sites, '{}')));
  delete from compteurs where site_id = any(coalesce(v_sites, '{}'));
  delete from contacts_comptes where compte_id = v_compte;
  delete from profils_comptes where compte_id = v_compte;
  delete from contacts where compte_id = v_compte;
  delete from sites where compte_id = v_compte;
  delete from comptes where id = v_compte;
end $$;

commit;
