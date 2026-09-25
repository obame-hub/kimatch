-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ÊTRE MEMBRE DU CONSEIL SYNDICAL SE CHOISIT, ÇA NE SE DÉDUIT PLUS SEULEMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « un contact "Membre CS" c'est important notamment pour rendre éligible
-- dans l'affiliation CS à un compteur de ne proposer que des Membres CS et non pas des contacts
-- classiques, et inversement pour le responsable. »
--
-- ── LA RÈGLE DU 14/09 SE MORDAIT LA QUEUE ────────────────────────────────────────────────────
--
-- Depuis `fn_roles_contact`, CONSEIL_SYNDICAL n'était posé que sur un FAIT : « un compteur le
-- désigne relais ». C'était juste tant que personne ne demandait de FILTRER sur ce rôle — mais un
-- sélecteur de relais qui n'accepterait que les membres du conseil syndical ne proposerait alors
-- jamais que des gens DÉJÀ relais d'un autre compteur. Le premier membre du conseil syndical d'un
-- cabinet ne pourrait jamais être désigné.
--
-- ── CE QUI CHANGE, ET CE QUI NE CHANGE PAS ───────────────────────────────────────────────────
--
-- CONSEIL_SYNDICAL rejoint ADMINISTRATIF et DECISIONNAIRE_POTENTIEL : un choix humain, qui « se
-- rend s'il est déjà là ». Le fait continue de le poser — les 435 compteurs qui désignent un relais
-- gardent donc exactement les mêmes contacts marqués conseil syndical, sans aucune reprise de
-- données. Vérifié le jour même : 45 contacts CS avant, 45 après. On AJOUTE une seconde raison
-- d'être CS ; on n'en retire aucune.
--
-- Il ne s'efface jamais tout seul, contrairement à DECISIONNAIRE_POTENTIEL : celui-là annonce un
-- fait à venir et meurt quand le fait arrive, alors qu'appartenir à un conseil syndical est un état
-- qui ne cesse pas parce qu'on a retiré un compteur.
--
-- ADMINISTRATIF LUI CÈDE LA PLACE, comme il cède déjà devant tout le reste : les deux disent des
-- choses incompatibles sur la même personne, et cumuler les deux la ferait apparaître dans deux
-- bandes de l'onglet Contacts — le défaut même que la règle du 14/09 a supprimé.

create or replace function public.fn_roles_contact(p_contact_id uuid)
returns text[]
language sql
stable security definer
set search_path to 'public'
as $function$
  with dit as (
    select coalesce((select c.roles from contacts c where c.id = p_contact_id), '{}'::text[]) as roles
  ),
  faits as (
    select
      exists (select 1 from compteurs m where m.responsable_contact_id     = p_contact_id) as porte_compteur,
      exists (select 1 from mandats  x where x.contact_signataire_id       = p_contact_id) as signe_mandat,
      exists (select 1 from contrats y where y.contact_signataire_id       = p_contact_id) as signe_contrat,
      exists (select 1 from compteurs m where m.contact_conseil_syndical_id = p_contact_id) as relais_cs
  )
  select array_remove(array[
    -- ── déduits des faits ──
    case when f.porte_compteur then 'DECISIONNAIRE' end,
    case when f.signe_mandat or f.signe_contrat then 'SIGNATAIRE' end,

    -- ── CONSEIL_SYNDICAL : le fait OU le choix ──
    -- Le fait, comme avant : un compteur le désigne relais. Le choix, depuis le 25/09/2026 : sans
    -- lui, aucun premier membre du conseil syndical ne pourrait jamais être désigné.
    case when f.relais_cs or 'CONSEIL_SYNDICAL' = any(d.roles) then 'CONSEIL_SYNDICAL' end,

    -- ── choisis par un humain : ils ne se rendent que s'ils sont déjà là ──
    -- ADMINISTRATIF ne survit à aucun fait contraire, NI au potentiel qui le remplace, NI au
    -- conseil syndical qui le contredit.
    case when 'ADMINISTRATIF' = any(d.roles)
           and not 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
           and not 'CONSEIL_SYNDICAL' = any(d.roles)
           and not f.porte_compteur
           and not f.signe_mandat
           and not f.signe_contrat
           and not f.relais_cs
         then 'ADMINISTRATIF' end,

    -- DECISIONNAIRE_POTENTIEL s'efface le jour où un compteur le rend vrai : la personne est
    -- alors DECISIONNAIRE, et annoncer un potentiel réalisé n'a plus de sens.
    case when 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
           and not f.porte_compteur
         then 'DECISIONNAIRE_POTENTIEL' end
  ], null)
  from dit d cross join faits f;
$function$;
