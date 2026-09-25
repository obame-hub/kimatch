-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES RÔLES D'UN CONTACT SE RECALCULENT DE NOUVEAU
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE J'AI CASSÉ, ET COMMENT ══
--
-- La migration 20260925093000 posait un garde sur `fn_roles_contact` pour qu'un partenaire n'en
-- obtienne pas les rôles d'un contact de KiWee. Le garde était juste. Mais au lieu de l'insérer EN
-- TÊTE du corps existant — ce que la même migration fait correctement pour `fn_deplacer_site` et
-- `fn_rattacher_compteur`, en relisant leur source —, j'ai RÉÉCRIT le corps de mémoire :
--
--     join public.types_roles r on r.id = cc.type_role_id
--
-- `contacts_comptes` n'a pas de colonne `type_role_id`. Elle porte `fonction_sur_compte`,
-- `relation_directe`, `actif`. La jointure n'a jamais existé : je l'ai supposée.
--
-- ══ CE QUE ÇA A COÛTÉ, MESURÉ ══
--
-- La fonction lève `42703 column cc.type_role_id does not exist` à chaque appel. Elle n'est pas
-- seulement lue par l'écran : trois déclencheurs l'atteignent par `fn_recalculer_roles_contact` —
-- `trg_roles_depuis_compteurs`, `trg_roles_depuis_mandats`, `trg_roles_depuis_contrats`.
--
-- Donc depuis le 25/09 09h33, EN PRODUCTION (essayé sur la vraie base, en transaction annulée) :
--
--     update compteurs set responsable_contact_id = …   ->  ECHOUE  42703
--     update mandats   set contact_signataire_id  = …   ->  ECHOUE  42703
--     update contrats  set contact_signataire_id  = …   ->  ECHOUE  42703
--
-- Un commercial qui désignait le responsable d'un compteur ou le signataire d'un mandat recevait
-- une erreur. Aucune donnée n'a été abîmée — la fonction levait au lieu d'écrire, et les rôles
-- stockés sont intacts (2 469 DECISIONNAIRE, 1 077 SIGNATAIRE, 369 ADMINISTRATIF, 45
-- CONSEIL_SYNDICAL, 2 DECISIONNAIRE_POTENTIEL, inchangés, zéro contact modifié depuis) — mais
-- pendant une demi-journée le geste était refusé.
--
-- ══ LA RÉPARATION ══
--
-- On remet le corps du 15/09 mot pour mot : les cinq rôles, trois déduits des faits (compteur
-- responsable, signature de mandat ou de contrat, compteur relais) et deux saisis à la main qui ne
-- se rendent que s'ils sont déjà posés. C'est une logique métier que trois migrations ont accordée
-- avec l'exigence de William du 14/09 — « les contacts sont renseignés en double s'ils sont à la
-- fois signataire et administratif, ce n'est pas possible » — et rien de tout cela ne devait bouger.
--
-- LE GARDE RESTE, écrit cette fois comme il aurait dû l'être : quelques lignes AVANT le corps
-- d'origine, qui n'en changent pas une virgule. Et il ne s'applique qu'à un appel venant d'un
-- partenaire connecté : un déclencheur, une migration ou la clé de service ont `auth.uid()` nul et
-- passent comme avant.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

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

  -- ── LE CORPS D'ORIGINE (migration 20260915090000), INCHANGÉ ──
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
    case when f.relais_cs then 'CONSEIL_SYNDICAL' end,

    -- ── choisis par un humain : ils ne se rendent que s'ils sont déjà là ──
    case when 'ADMINISTRATIF' = any(d.roles)
           and not 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
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

comment on function public.fn_roles_contact(uuid) is
  'Les rôles d''un contact. DECISIONNAIRE, SIGNATAIRE et CONSEIL_SYNDICAL se déduisent des faits '
  '(compteur responsable, signature de mandat ou de contrat, compteur relais). ADMINISTRATIF et '
  'DECISIONNAIRE_POTENTIEL viennent d''une saisie : la fonction ne les rend que s''ils sont déjà '
  'posés, ils sont exclusifs entre eux, et aucun ne survit à un fait contraire. Un partenaire '
  'connecté n''obtient rien sur un contact hors de son périmètre (garde du 25/09/2026).';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES TROIS GESTES REDEVIENNENT POSSIBLES, ET LE CLOISONNEMENT TIENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés. Réparer la fonction en oubliant le garde rouvrirait la fuite ;
-- garder la fuite fermée en laissant la fonction cassée laisserait la panne. On éprouve les deux,
-- et les trois écritures qui échouaient ce matin sont rejouées pour de vrai, puis annulées.
do $$
declare
  v_contact   uuid;
  v_autre     uuid;
  v_compteur  uuid;
  v_mandat    uuid;
  v_contrat   uuid;
  v_roles     text[];
  v_part      uuid;
  v_profil    uuid;
begin
  -- ① LA FONCTION RÉPOND. Avant cette migration : 42703.
  select responsable_contact_id into v_contact
    from compteurs where responsable_contact_id is not null limit 1;
  v_roles := public.fn_roles_contact(v_contact);
  if not ('DECISIONNAIRE' = any(v_roles)) then
    raise exception 'Un contact responsable d''un compteur n''est plus rendu DECISIONNAIRE : la déduction est perdue (rendu : %).', v_roles;
  end if;

  -- ② LES TROIS ÉCRITURES QUI ÉCHOUAIENT. On les fait réellement.
  select id into v_autre from contacts where id <> v_contact limit 1;

  select id into v_compteur from compteurs where responsable_contact_id is not null limit 1;
  update compteurs set responsable_contact_id = v_autre where id = v_compteur;

  select id into v_mandat from mandats where contact_signataire_id is not null limit 1;
  update mandats set contact_signataire_id = v_autre where id = v_mandat;

  select id into v_contrat from contrats where contact_signataire_id is not null limit 1;
  update contrats set contact_signataire_id = v_autre where id = v_contrat;

  raise notice 'Garde-fou 2 : compteur, mandat et contrat acceptent de nouveau un changement de contact.';

  -- ③ LE CLOISONNEMENT TIENT TOUJOURS. Un partenaire ne doit rien obtenir hors de son périmètre.
  select id into v_part from comptes
    where type_compte_id = (select id from types_comptes where code = 'PARTENAIRE') limit 1;
  if v_part is not null then
    select p.id into v_profil
      from profils p
      join profils_roles_acces pra on pra.profil_id = p.id
      join roles_acces r on r.id = pra.role_acces_id
     where p.actif and not r.ouvre_administration limit 1;

    if v_profil is not null then
      update profils set compte_partenaire_id = v_part where id = v_profil;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
      set local role authenticated;

      -- Un contact de KiWee, donc hors du compte partenaire.
      select c.id into v_autre from contacts c
        where c.compte_id is distinct from v_part limit 1;
      v_roles := public.fn_roles_contact(v_autre);

      reset role;
      perform set_config('request.jwt.claims', null, true);

      if cardinality(v_roles) > 0 then
        raise exception 'Un partenaire obtient encore les rôles d''un contact de KiWee : % — la fuite du 24/09 est rouverte.', v_roles;
      end if;
      raise notice 'Garde-fou 3 : un partenaire n''obtient rien sur un contact hors de son périmètre.';
    end if;
  end if;

  -- On annule les écritures d'essai par une levée volontaire, rattrapée juste en dessous.
  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : les trois gestes repassent, le cloisonnement tient, rien n''est écrit.';
end $$;

commit;
