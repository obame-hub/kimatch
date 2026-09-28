-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN SUIVI DE CONTRAT N'EXISTE QU'APRÈS VALIDATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 26/09/2026 : « Les suivis de contrats ne doivent apparaître qu'à partir du moment où le
-- contrat est validé, pas quand le contrat est signé et en attente de validation. Donc dans le
-- kanban, les cards apparaissent dès lors qu'un contrat est validé, pas avant. »
--
-- ══ POURQUOI LA SIGNATURE NE SUFFIT PLUS ══
--
-- Le suivi s'ouvrait au statut SIGNE (31/08/2026). Entre la signature et la validation il y a la
-- DEUXIÈME LAME de Fabien : la revérification des dates et des montants repris du contrat. Ouvrir
-- le suivi avant, c'est lui faire préparer un dossier de bienvenue et une résiliation sur des
-- données que personne n'a encore relues — et lui poser trois tâches pour un contrat qui peut
-- encore bouger.
--
-- ══ RIEN N'EST SUPPRIMÉ ══
--
-- 23 suivis portent aujourd'hui un contrat non validé, et 21 d'entre eux ont déjà des tâches faites.
-- Leurs lignes restent en base, intactes : seule la CARTE quitte le kanban. Le jour où le contrat
-- est validé, elle revient avec son étape et ses tâches dans l'état où Fabien les a laissées.
--
-- William a tranché le 26/09 : le gate s'applique SANS EXCEPTION, y compris aux 13 contrats repris
-- de Salesforce qui n'ont pas de date de signature et que personne ne validera. Je lui avais
-- proposé de les épargner, il a choisi la règle unique.

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LA VUE DIT SI LE CONTRAT EST VALIDÉ
--
-- Une colonne, pas un `where` : le kanban et la fiche contrat filtrent dessus, mais la PAGE DE
-- DÉTAIL continue de lire un suivi par son identifiant. Sinon les 23 suivis déjà commencés
-- deviendraient inaccessibles — leur carte disparaît, leur travail reste consultable.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace view public.v_suivis_contrats_liste as
 SELECT s.id, s.reference, s.contrat_id, s.compte_id, s.site_id, s.fournisseur_compte_id,
    s.contact_principal_id, s.recommandation_id, s.responsable_profil_id, s.proprietaire_id,
    s.date_ouverture, s.date_cloture, s.finalite, s.commentaire, s.sante_forcee,
    s.motif_sante_forcee, s.date_creation,
    e.code AS etape, e.libelle AS etape_libelle, e.finalite AS etape_finalite, e.ordre AS etape_ordre,
    cp.nom AS compte_nom, si.libelle AS site_nom, fo.nom AS fournisseur_nom,
    ct.reference AS contrat_reference, ct.date_debut, ct.date_fin, stc.code AS contrat_statut,
    COALESCE((pr.prenom || ' '::text) || pr.nom, ''::text) AS responsable,
    COALESCE((cc.prenom || ' '::text) || cc.nom, ''::text) AS contact_principal_nom,
        CASE WHEN ct.date_fin IS NULL THEN NULL::integer ELSE ct.date_fin - CURRENT_DATE END AS jours_avant_echeance,
    COALESCE(act.ouvertes, 0) AS actions_ouvertes,
    COALESCE(act.en_retard, 0) AS actions_en_retard,
    act.prochaine_action, act.prochaine_echeance, act.prochain_responsable,
    COALESCE(req.ouvertes, 0) AS requetes_ouvertes,
    COALESCE(req.en_retard, 0) AS requetes_en_retard,
        CASE
            WHEN s.sante_forcee IS NOT NULL THEN s.sante_forcee
            WHEN COALESCE(act.retard_max, 0) > 7 OR COALESCE(req.en_retard, 0) > 0 OR ct.date_fin IS NOT NULL AND ct.date_fin < CURRENT_DATE AND e.code <> 'CLOTURE'::text THEN 'A_RISQUE'::text
            WHEN COALESCE(act.en_retard, 0) > 0 OR COALESCE(req.ouvertes, 0) > 0 THEN 'A_SURVEILLER'::text
            WHEN e.code <> 'CLOTURE'::text AND ct.date_fin IS NOT NULL AND ct.date_fin <= (CURRENT_DATE + '1 year'::interval) THEN 'OPPORTUNITE'::text
            ELSE 'SAIN'::text
        END AS sante,
    -- LA COLONNE NOUVELLE, ajoutée en queue pour ne pas déplacer les précédentes.
    (ct.date_validation IS NOT NULL) AS contrat_valide
   FROM suivis_contrats s
     JOIN etapes_suivis_contrats e ON e.id = s.etape_id
     JOIN contrats ct ON ct.id = s.contrat_id
     LEFT JOIN statuts_contrats stc ON stc.id = ct.statut_id
     LEFT JOIN comptes cp ON cp.id = s.compte_id
     LEFT JOIN comptes fo ON fo.id = s.fournisseur_compte_id
     LEFT JOIN LATERAL ( SELECT c1.libelle_site AS libelle FROM compteurs c1 WHERE c1.groupe_site_id = s.site_id LIMIT 1) si ON true
     LEFT JOIN profils pr ON pr.id = s.responsable_profil_id
     LEFT JOIN contacts cc ON cc.id = s.contact_principal_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS ouvertes,
            count(*) FILTER (WHERE a.date_prevue::date < CURRENT_DATE)::integer AS en_retard,
            max(CASE WHEN a.date_prevue::date < CURRENT_DATE THEN CURRENT_DATE - a.date_prevue::date ELSE 0 END) AS retard_max,
            (array_agg(a.titre ORDER BY a.date_prevue))[1] AS prochaine_action,
            (array_agg(a.date_prevue ORDER BY a.date_prevue))[1] AS prochaine_echeance,
            (array_agg(COALESCE((p2.prenom || ' '::text) || p2.nom, ''::text) ORDER BY a.date_prevue))[1] AS prochain_responsable
           FROM actions a LEFT JOIN profils p2 ON p2.id = a.responsable_profil_id
          WHERE a.suivi_contrat_id = s.id AND a.date_realisation IS NULL) act ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS ouvertes,
            count(*) FILTER (WHERE r.date_echeance IS NOT NULL AND r.date_echeance::date < CURRENT_DATE)::integer AS en_retard
           FROM requetes r JOIN statuts_requetes sr ON sr.id = r.statut_id
          WHERE r.contrat_id = s.contrat_id AND r.actif AND (sr.code = ANY (ARRAY['NOUVELLE'::text, 'EN_TRAITEMENT'::text]))) req ON true
  WHERE s.actif;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. PLUS AUCUN SUIVI NE S'OUVRE AVANT LA VALIDATION
--
-- La condition de statut RESTE : un contrat validé mais annulé n'ouvre toujours pas de suivi. On
-- lui ajoute la validation, et le déclencheur écoute désormais `date_validation` — sans quoi il ne
-- se réveillerait jamais au moment qui compte, puisque valider ne change pas le statut.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.propager_contrat_vers_suivi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_suivi  uuid;
begin
  select code into v_statut from public.statuts_contrats where id = new.statut_id;

  if v_statut in ('SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE')
     and new.actif
     and new.date_validation is not null then
    perform public.creer_suivi_contrat(new.id);
  else
    /* Pas de création, mais un suivi qui existe déjà se tient à jour : c'est le cas de
       l'annulation, et celui des 23 suivis ouverts avant cette règle — leur étape continue de
       suivre le contrat même si leur carte ne s'affiche plus. */
    select id into v_suivi from public.suivis_contrats where contrat_id = new.id and actif;
    if found then
      perform public.recalculer_etape_suivi_contrat(v_suivi);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_propager_contrat_vers_suivi on public.contrats;
create trigger trg_propager_contrat_vers_suivi
  after insert or update of statut_id, date_signature, date_debut, date_fin, actif, date_validation
    on public.contrats
  for each row
  execute function public.propager_contrat_vers_suivi();

comment on function public.propager_contrat_vers_suivi() is
  'Ouvre le suivi d''un contrat VALIDÉ (règle de William du 26/09/2026), ou tient à jour celui qui existe déjà.';
