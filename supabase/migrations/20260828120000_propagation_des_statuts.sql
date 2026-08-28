-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA PROPAGATION DES STATUTS ENTRE OBJETS
--
-- Naoëlle, 28/08/2026 : « il faut que chacun des statuts corresponde et fasse bouger le statut de
-- l'autre objet, comme dans le tableau ; je ne veux pas qu'on ait des erreurs dessus encore et
-- encore. »
--
-- La chaîne du document de Michel :
--
--     CONSULTATION  ──▶  OFFRE  ──▶  VERSION  ──▶  RECOMMANDATION
--
-- ══ EN BASE, PAS DANS L'APPLICATION ══
--
-- Ces statuts sont écrits depuis au moins quatre endroits : les écrans, les migrations, le webhook
-- DocuSign, et demain l'agent de suggestions. Une propagation codée dans l'application ne tient que
-- sur les chemins qu'on a pensés — et chaque chemin oublié produit exactement le désordre qu'on
-- corrige : un statut vrai d'un côté, faux de l'autre, sans que personne sache lequel croire.
-- Ici la règle s'applique quelle que soit l'origine de l'écriture, et ne se contourne pas.
--
-- ══ CE QUI EST AUTOMATIQUE, ET CE QUI RESTE HUMAIN ══
--
--   AUTOMATIQUE   consultation → offre        (les trois correspondances du document)
--   AUTOMATIQUE   version → recommandation    (les quatre règles, entièrement déductibles)
--   GARDE-FOU     offre → version             uniquement dans le sens restrictif, voir plus bas
--   HUMAIN        version → Disponible        « le comparatif doit avoir été vérifié et finalisé »
--   HUMAIN        version → En décision       « version présentée au client »
--
-- Vérifier un comparatif et présenter au client sont des actes, pas des états : aucune donnée ne
-- permet de les déduire, et les deviner ferait avancer un dossier que personne n'a fait avancer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. CONSULTATION ──▶ OFFRE
--
-- Le document :
--   Demande envoyée  → création ou passage de l'offre à En attente
--   Demande acceptée → offre Disponible
--   Demande refusée  → offre Indisponible
--
-- Le déclencheur porte sur `suivis_consultations_fournisseurs`, la table des ÉVÉNEMENTS : c'est
-- l'arrivée d'un événement qui fait bouger l'offre, et c'est là que la vue du Pricing lit l'état.
--
-- IL NE CRÉE PAS D'OFFRE. « Création ou passage à En attente » : créer une offre demanderait de
-- décider d'une durée et d'un type de prix, que l'événement ne porte pas — on fabriquerait une offre
-- à 0 mois. Les offres existantes sont mises à jour ; l'absence d'offre reste l'absence d'offre, et
-- la colonne « À demander » du Pricing la montre déjà comme telle.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.propager_consultation_vers_offre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text;
  v_statut text;
begin
  select code into v_code
    from public.statuts_consultations_fournisseurs
   where id = new.statut_id;

  v_statut := case v_code
    when 'ENVOYEE'  then 'EN_ATTENTE'
    when 'ACCEPTEE' then 'DISPONIBLE'
    when 'REFUSEE'  then 'INDISPONIBLE'
    else null
  end;

  -- Un code inconnu ne touche à rien : mieux vaut ne pas propager que propager de travers.
  if v_statut is null then
    return new;
  end if;

  update public.offres_fournisseurs
     set statut = v_statut,
         date_modification = now()
   where optimisation_fournisseur_id = new.optimisation_fournisseur_id
     and actif
     and statut is distinct from v_statut;

  return new;
end;
$$;

drop trigger if exists trg_propager_consultation_vers_offre on public.suivis_consultations_fournisseurs;
create trigger trg_propager_consultation_vers_offre
  after insert or update of statut_id on public.suivis_consultations_fournisseurs
  for each row execute function public.propager_consultation_vers_offre();


-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. OFFRE ──▶ VERSION, dans le sens restrictif seulement
--
-- Le document est explicite dans les deux sens :
--
--   « La présence d'une offre disponible ne doit pas faire passer automatiquement la version à
--     Disponible : le comparatif doit également avoir été vérifié et finalisé. »
--   « Si toutes les offres sont Indisponibles, la version reste En construction. »
--
-- On n'avance donc jamais une version, mais on la RAMÈNE en construction quand elle prétend être
-- prête alors qu'il n'y a plus rien à comparer. Sans ce garde-fou on présenterait un comparatif vide,
-- et c'est le genre d'erreur qu'on ne voit qu'en réunion client.
--
-- « En décision » n'est pas ramené en arrière : la version a déjà été présentée, ce fait ne
-- s'annule pas parce qu'une offre a changé de statut après coup.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.garde_fou_version_sans_offre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_optimisation uuid;
  v_version      uuid;
  v_reste_dispo  boolean;
  v_construction uuid;
begin
  v_optimisation := coalesce(new.optimisation_id, old.optimisation_id);
  if v_optimisation is null then
    return coalesce(new, old);
  end if;

  select op.version_recommandation_id into v_version
    from public.optimisations op
   where op.id = v_optimisation;
  if v_version is null then
    return coalesce(new, old);
  end if;

  -- Reste-t-il une offre exploitable sur TOUTE la version, et non sur la seule optimisation touchée ?
  -- Une version peut porter plusieurs optimisations : juger sur une seule la ramènerait en
  -- construction alors qu'une autre a des offres.
  select exists (
    select 1
      from public.offres_fournisseurs o
      join public.optimisations op2 on op2.id = o.optimisation_id
     where op2.version_recommandation_id = v_version
       and o.actif
       and o.statut = 'DISPONIBLE'
  ) into v_reste_dispo;

  if v_reste_dispo then
    return coalesce(new, old);
  end if;

  select id into v_construction
    from public.statuts_versions_recommandation
   where code = 'EN_CONSTRUCTION';

  update public.versions_recommandation v
     set statut_version_id = v_construction,
         date_modification = now()
    from public.statuts_versions_recommandation s
   where v.id = v_version
     and s.id = v.statut_version_id
     and s.code = 'DISPONIBLE'
     and v_construction is not null;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_garde_fou_version_sans_offre on public.offres_fournisseurs;
create trigger trg_garde_fou_version_sans_offre
  after insert or update of statut, actif or delete on public.offres_fournisseurs
  for each row execute function public.garde_fou_version_sans_offre();


-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. VERSION ──▶ RECOMMANDATION
--
-- Les quatre règles de Michel, entièrement déductibles — donc entièrement automatiques :
--
--   Aucune version                                              → Brouillon
--   Dernière version En construction, Disponible ou En décision → Active
--   Dernière version Clôturée, mais recommandation non terminée → À réactiver
--   Résultat gagné, perdu ou abandonné                          → Clôturée
--
-- LE STATUT DU DOSSIER N'EST PLUS SAISISSABLE À LA MAIN, et c'est le sens de sa remarque : « je
-- m'embrouille avec les recommandations et les versions ». Deux endroits où dire la même chose, c'est
-- un endroit de trop — et c'est celui qui se trompe qu'on lit.
--
-- « Recommandation terminée » se lit sur `finalite_cloture` : c'est la décision du commercial, elle
-- ne se déduit pas d'une version. Un dossier peut d'ailleurs avoir une version acceptée sans être
-- terminé — Michel l'a dit : « un client peut accepter mais ne pas forcément clôturer la
-- recommandation. » C'est exactement ce que « À réactiver » désigne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.recalculer_statut_recommandation(p_recommandation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut_derniere text;
  v_finalite        text;
  v_code_cible      text;
  v_etape           uuid;
begin
  if p_recommandation is null then
    return;
  end if;

  select r.finalite_cloture into v_finalite
    from public.recommandations r
   where r.id = p_recommandation;

  -- La dernière version : celle que l'application désigne comme courante, à défaut le plus grand
  -- numéro. `version_actuelle` primant, l'écran et ce calcul ne peuvent pas se contredire.
  select s.code into v_statut_derniere
    from public.versions_recommandation v
    left join public.statuts_versions_recommandation s on s.id = v.statut_version_id
   where v.recommandation_id = p_recommandation
   order by v.version_actuelle desc nulls last, v.numero_version desc nulls last
   limit 1;

  v_code_cible := case
    when v_statut_derniere is null then 'BROUILLON'
    when v_statut_derniere in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
    when v_finalite is not null then 'CLOTUREE'
    else 'A_REACTIVER'
  end;

  select id into v_etape from public.etapes_recommandation where code = v_code_cible;
  if v_etape is null then
    return;
  end if;

  update public.recommandations
     set etape_id = v_etape,
         date_modification = now()
   where id = p_recommandation
     and etape_id is distinct from v_etape;
end;
$$;

create or replace function public.propager_version_vers_recommandation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculer_statut_recommandation(coalesce(new.recommandation_id, old.recommandation_id));
  -- Une version déplacée d'un dossier à l'autre en laisse deux à recalculer.
  if tg_op = 'UPDATE' and new.recommandation_id is distinct from old.recommandation_id then
    perform public.recalculer_statut_recommandation(old.recommandation_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_propager_version_vers_recommandation on public.versions_recommandation;
create trigger trg_propager_version_vers_recommandation
  after insert
     or update of statut_version_id, version_actuelle, numero_version, recommandation_id
     or delete
  on public.versions_recommandation
  for each row execute function public.propager_version_vers_recommandation();

-- ── ET QUAND LA FINALITÉ DU DOSSIER CHANGE ──
--
-- Clôturer un dossier fait passer « À réactiver » à « Clôturée » sans qu'aucune version ne bouge.
-- Sans ce second déclencheur, le dossier resterait à réactiver jusqu'à la prochaine modification de
-- version — soit peut-être jamais.
--
-- La garde `when` évite la récursion : la fonction écrit `etape_id`, ce qui redéclenche l'UPDATE.
create or replace function public.propager_finalite_vers_statut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculer_statut_recommandation(new.id);
  return new;
end;
$$;

drop trigger if exists trg_propager_finalite_vers_statut on public.recommandations;
create trigger trg_propager_finalite_vers_statut
  after update of finalite_cloture on public.recommandations
  for each row
  when (new.finalite_cloture is distinct from old.finalite_cloture)
  execute function public.propager_finalite_vers_statut();

commit;
