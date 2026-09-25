-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE CHOIX « MEMBRE CS » REVIENT DANS LE CORPS RÉPARÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI S'EST PASSÉ, DANS L'ORDRE ══
--
--   25/09 09h00  20260925090000  CONSEIL_SYNDICAL devient « le fait OU le choix » — sans quoi un
--                                sélecteur filtré sur ce rôle ne proposerait que des gens DÉJÀ
--                                relais d'un autre compteur, et le premier membre du conseil
--                                syndical d'un cabinet ne pourrait jamais être désigné.
--   25/09 09h33  20260925093000  un garde partenaire est posé, en réécrivant le corps de mémoire.
--                                Le corps réécrit référençait une colonne inexistante : la fonction
--                                levait à chaque appel.
--   25/09 14h30  20260925143000  réparation — « on remet le corps du 15/09 mot pour mot ».
--
-- La réparation était la bonne décision : elle a rendu leur geste aux commerciaux. Mais « le corps
-- du 15/09 » est ANTÉRIEUR au mien, et il l'a donc effacé au passage. Vérifié en base : la
-- fonction ne portait plus le choix.
--
-- ══ CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE TOUCHE PAS ══
--
-- Elle repart de la définition RÉELLE lue en base ce jour — et non d'une version de mémoire, ce qui
-- est exactement l'erreur qui a coûté une demi-journée — et n'y change qu'UNE LIGNE : le `case` du
-- conseil syndical retrouve son « ou le choix ».
--
-- LE GARDE PARTENAIRE N'EST PAS TOUCHÉ. Il reste en tête, mot pour mot, et la fonction garde le
-- `plpgsql` que la réparation lui a donné.
--
-- Aucune reprise de données : on ajoute une seconde raison d'être CS, on n'en retire aucune.
--
-- VÉRIFIÉ APRÈS APPLICATION, sur la vraie base : 45 CONSEIL_SYNDICAL (inchangé), 369
-- ADMINISTRATIF (inchangé), et les trois écritures que la fonction cassée refusait — responsable
-- d'un compteur, signataire d'un mandat, signataire d'un contrat — passent de nouveau, essayées
-- puis annulées.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_roles_contact(p_contact_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_roles text[];
begin
  -- ── LE GARDE, ET RIEN D'AUTRE ──
  --
  -- Cette fonction est `security definer` : elle lit `contacts` sans que les policies s'appliquent.
  -- Un partenaire en obtenait donc les rôles de n'importe quel contact de KiWee (mesuré le
  -- 24/09/2026 : elle rendait ["DECISIONNAIRE"] sur un contact qui ne le regardait pas).
  --
  -- `est_partenaire()` est faux pour l'équipe et pour les chemins internes, où `auth.uid()` est nul.
  if auth.uid() is not null and public.est_partenaire() then
    if not exists (
      select 1
        from public.contacts c
       where c.id = p_contact_id
         and c.compte_id in (select public.comptes_du_partenaire())
    ) then
      return array[]::text[];
    end if;
  end if;

  -- ── LE CORPS D'ORIGINE (migration 20260915090000) ──
  with dit as (
    select coalesce((select c.roles from contacts c where c.id = p_contact_id), '{}'::text[]) as roles
  ),
  faits as (
    select
      exists (select 1 from compteurs m where m.responsable_contact_id      = p_contact_id) as porte_compteur,
      exists (select 1 from mandats  x where x.contact_signataire_id        = p_contact_id) as signe_mandat,
      exists (select 1 from contrats y where y.contact_signataire_id        = p_contact_id) as signe_contrat,
      exists (select 1 from compteurs m where m.contact_conseil_syndical_id = p_contact_id) as relais_cs
  )
  select array_remove(array[
    -- ── déduits des faits ──
    case when f.porte_compteur then 'DECISIONNAIRE' end,
    case when f.signe_mandat or f.signe_contrat then 'SIGNATAIRE' end,

    -- ── CONSEIL_SYNDICAL : le fait OU le choix (25/09/2026) ──
    -- La SEULE ligne que cette migration change par rapport au corps réparé. Sans le choix, aucun
    -- premier membre du conseil syndical ne peut jamais être désigné sur un compte.
    case when f.relais_cs or 'CONSEIL_SYNDICAL' = any(d.roles) then 'CONSEIL_SYNDICAL' end,

    -- ── choisis par un humain : ils ne se rendent que s'ils sont déjà là ──
    case when 'ADMINISTRATIF' = any(d.roles)
           and not 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
           and not 'CONSEIL_SYNDICAL' = any(d.roles)
           and not f.porte_compteur
           and not f.signe_mandat
           and not f.signe_contrat
           and not f.relais_cs
         then 'ADMINISTRATIF' end,

    case when 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
           and not f.porte_compteur
         then 'DECISIONNAIRE_POTENTIEL' end
  ], null)
  into v_roles
  from dit d cross join faits f;

  return coalesce(v_roles, array[]::text[]);
end $fn$;
