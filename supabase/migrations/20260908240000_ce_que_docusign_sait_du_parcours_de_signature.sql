-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QUE DOCUSIGN SAIT DU PARCOURS DE SIGNATURE, ET QUE KIMATCH JETAIT
--
-- William, 08/09/2026, en validant la refonte du volet mandat : « oui il faut que le webhook aille
-- chercher ces infos et les remonte. »
--
-- Le nouveau chemin de conversion affiche, sous chaque jalon, la date, l'heure et un contexte :
--
--   Brouillon   date de création        16:38
--   Envoyé      date d'envoi            09:14
--   Consulté    première ouverture      18:02 · ouvert 3 fois
--   Actif       date de signature       10:26 · signature du mandat
--   Refusé      date de refus           08:50 · <motif>
--
-- Trois de ces valeurs n'existaient nulle part. Le statut « Consulté », créé ce matin même
-- (migration 20260908230000), n'avait pas d'horodatage : la colonne du rail serait restée vide au
-- moment exact où elle devient intéressante.
--
-- ── POURQUOI TROIS COLONNES PLUTÔT QU'UNE TABLE D'ÉVÉNEMENTS ──
--
-- DocuSign garde l'historique complet de l'enveloppe et sait le rendre à la demande. Le recopier
-- ligne à ligne chez nous créerait une seconde source de vérité à tenir synchronisée, pour un
-- affichage qui ne montre que trois valeurs. On stocke donc le RÉSUMÉ dont le rail a besoin, et
-- l'enveloppe reste consultable chez DocuSign par le lien déjà présent sur la fiche.
--
-- ── CE QUE CHAQUE COLONNE VAUT QUAND ELLE EST NULLE ──
--
-- `date_consultation` nulle : le destinataire n'a pas encore ouvert l'enveloppe — ou elle a été
-- signée avant que ce suivi n'existe. Le jalon affiche alors la date d'envoi comme repère et rien
-- d'autre ; on n'invente pas une consultation qu'on n'a pas observée.
--
-- `nb_ouvertures` nul : DocuSign n'a pas répondu sur ce point. La ligne de contexte se réduit à
-- l'heure, sans « ouvert N fois ». C'est un renseignement de confort, jamais une condition.
--
-- `motif_refus` nul : refus sans motif saisi, ou pas de refus. Le jalon « Refusé » se suffit.
--
-- LES 1 380 MANDATS DÉJÀ SIGNÉS GARDENT LEURS TROIS COLONNES VIDES. Aucun rattrapage n'est prévu :
-- l'information existe chez DocuSign mais seulement pour les 26 enveloppes passées par Kimatch, et
-- aller la chercher pour peupler un affichage rétrospectif coûterait 26 appels pour trois lignes
-- d'horodatage que personne ne relira.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table mandats
  add column if not exists date_consultation timestamptz,
  add column if not exists nb_ouvertures integer,
  add column if not exists motif_refus text;

comment on column mandats.date_consultation is
  'Première ouverture de l''enveloppe par le destinataire (événement DocuSign « delivered »). Nulle tant que personne n''a ouvert.';
comment on column mandats.nb_ouvertures is
  'Nombre de consultations relevées dans la piste d''audit DocuSign. Nul si DocuSign ne l''a pas fourni — jamais 0 par défaut, l''absence et le zéro ne disent pas la même chose.';
comment on column mandats.motif_refus is
  'Motif saisi par le signataire au moment du refus, tel que DocuSign le renvoie.';

-- ── « À préparer » devient « Brouillon » ──
--
-- Choix de William le 08/09/2026, en alignant le référentiel sur la maquette. Le code ne change
-- PAS : `A_PREPARER` reste l'identifiant du statut, et il est lu par le wizard de création, le
-- webhook et la frise. Renommer le code obligerait à reprendre ces trois chemins pour un gain nul —
-- ce que l'équipe lit, c'est le libellé.
update statuts_mandats set libelle = 'Brouillon' where code = 'A_PREPARER';

do $$
declare n_brouillon int;
begin
  select count(*) into n_brouillon from statuts_mandats where code = 'A_PREPARER' and libelle = 'Brouillon';
  if n_brouillon <> 1 then
    raise exception 'Le statut A_PREPARER est introuvable ou dupliqué : % ligne(s).', n_brouillon;
  end if;
  raise notice 'Trois colonnes de parcours ajoutées ; « À préparer » devient « Brouillon ».';
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Les trois colonnes existent, vides.
--   select count(*) filter (where date_consultation is not null) as consultes,
--          count(*) filter (where nb_ouvertures is not null)     as avec_compteur,
--          count(*) filter (where motif_refus is not null)       as avec_motif
--   from mandats;
--
--   -- Le chemin, dans l'ordre : Brouillon, Envoyé, Consulté, Actif, Expiré, Refusé, Annulé.
--   select code, libelle, ordre from statuts_mandats order by ordre;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
