-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONTACT PEUT ÊTRE DÉCISIONNAIRE POTENTIEL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « Il faut créer un nouveau rôle dans l'objet contact "Décisionnaire
-- potentiel". Ce sont tous les contacts que le commercial identifie comme un potentiel
-- décisionnaire mais pour lequel nous ne disposons actuellement d'aucun périmètre. C'est un choix
-- du commercial et donc un bouton de "conversion" sur chaque card contact ADMINISTRATIF. »
--
-- ══ POURQUOI CE RÔLE NE PEUT PAS ÊTRE UN SIMPLE `UPDATE` ══
--
-- `fn_roles_contact` (migration 20260914154155) ne complète pas `contacts.roles` : elle le
-- RECONSTRUIT DE ZÉRO, et les déclencheurs la rappellent à chaque écriture sur `compteurs`,
-- `mandats` et `contrats`. Un rôle posé à la main disparaîtrait donc au premier compteur réaffecté
-- sur le compte — sans erreur, sans trace, et le commercial conclurait que le bouton ne marche pas.
--
-- Le seul rôle qui survit à ce recalcul est ADMINISTRATIF, par une clause qui SE RELIT ELLE-MÊME :
-- elle ne le rend que s'il est déjà dans `roles`. DECISIONNAIRE_POTENTIEL reprend exactement ce
-- motif. C'est la seule façon de faire coexister un choix humain avec une colonne calculée.
--
-- ══ IL NE SURVIT PAS AU FAIT QU'IL ANNONÇAIT ══
--
-- Le jour où un compteur désigne ce contact responsable, il devient DECISIONNAIRE pour de vrai et
-- le « potentiel » s'efface. Un potentiel réalisé n'a plus à être annoncé, et laisser les deux
-- ferait apparaître le contact dans deux bandes de l'onglet Contacts.
--
-- UNE SIGNATURE NE LE TUE PAS, et c'est délibéré. Devenir signataire d'un mandat ne donne aucun
-- périmètre : la personne reste quelqu'un dont on pense qu'il décide, sans pouvoir le prouver.
-- Seul le compteur prouve.
--
-- ══ IL PREND LA PLACE D'ADMINISTRATIF, IL NE S'Y AJOUTE PAS ══
--
-- William, 14/09/2026 : « Les contacts sont renseignés en double s'ils sont à la fois signataire et
-- administratif. Ce n'est pas possible. » C'est cette phrase qui a produit la migration du 14/09 et
-- ramené 598 incohérences à zéro. Cumuler ADMINISTRATIF et DECISIONNAIRE_POTENTIEL rouvrirait le
-- double affichage qu'elle vient de fermer.
--
-- La clause ADMINISTRATIF gagne donc une condition de plus : elle s'efface devant le potentiel.
-- L'exclusivité est ainsi tenue PAR LA BASE et non par l'écran — écrire les deux, par un bouton
-- pressé deux fois ou par un script, ne peut pas produire un contact dans deux bandes.
--
-- ══ LA CONTRAINTE D'ABORD, LA FONCTION ENSUITE ══
--
-- `contacts_roles_valides` n'autorise que quatre valeurs. Sans l'élargir, la fonction rendrait une
-- valeur que la table refuse, et c'est la mise à jour finale de cette migration qui échouerait.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. LA LISTE DES RÔLES VALIDES S'ÉLARGIT ══════════════════════════════════════════════════

alter table contacts
  drop constraint if exists contacts_roles_valides;

alter table contacts
  add constraint contacts_roles_valides check (
    roles <@ array[
      'DECISIONNAIRE',
      'SIGNATAIRE',
      'ADMINISTRATIF',
      'DECISIONNAIRE_POTENTIEL',
      'CONSEIL_SYNDICAL'
    ]::text[]
  );

comment on column contacts.roles is
  'Rôles d''un contact, choix multiple parmi DECISIONNAIRE, SIGNATAIRE, ADMINISTRATIF, '
  'DECISIONNAIRE_POTENTIEL, CONSEIL_SYNDICAL. Distinct de `fonction`, qui est l''intitulé de '
  'poste en texte libre. Trois rôles se déduisent des faits ; ADMINISTRATIF et '
  'DECISIONNAIRE_POTENTIEL sont des choix humains, exclusifs entre eux, et aucun des deux ne '
  'survit à un fait contraire (voir fn_roles_contact).';

-- ══ 2. LA DÉDUCTION ACCUEILLE LE CINQUIÈME RÔLE ══════════════════════════════════════════════

create or replace function public.fn_roles_contact(p_contact_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
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
    case when f.relais_cs then 'CONSEIL_SYNDICAL' end,

    -- ── choisis par un humain : ils ne se rendent que s'ils sont déjà là ──
    -- ADMINISTRATIF ne survit à aucun fait contraire, NI au potentiel qui le remplace.
    case when 'ADMINISTRATIF' = any(d.roles)
           and not 'DECISIONNAIRE_POTENTIEL' = any(d.roles)
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
$$;

comment on function public.fn_roles_contact(uuid) is
  'Les rôles d''un contact. DECISIONNAIRE, SIGNATAIRE et CONSEIL_SYNDICAL se déduisent des faits '
  '(compteur responsable, signature de mandat ou de contrat, compteur relais). ADMINISTRATIF et '
  'DECISIONNAIRE_POTENTIEL viennent d''une saisie : la fonction ne les rend que s''ils sont déjà '
  'posés, ils sont exclusifs entre eux, et aucun ne survit à un fait contraire.';

-- ══ 3. REMISE À PLAT, DONT ON ANNONCE LE VOLUME ══════════════════════════════════════════════
--
-- Aucun contact ne porte encore DECISIONNAIRE_POTENTIEL, et la réécriture ci-dessus est
-- logiquement identique à la précédente sur les quatre autres rôles : cette mise à jour ne doit
-- donc toucher PERSONNE.
--
-- Elle est écrite quand même, et elle DIT combien de lignes elle a touchées. Si ce nombre n'est
-- pas zéro, ce ne sont pas mes cas : ce sont des rôles saisis à la main depuis le 14/09 qui
-- contredisent déjà les faits, et le réalignement est exactement ce qu'il faut leur faire. Le
-- relever évite de découvrir dans trois semaines qu'une écriture a changé des données sans qu'on
-- l'ait su.

do $$
declare touchees int;
begin
  with remises as (
    update contacts c
       set roles = fn_roles_contact(c.id)
     where c.roles is distinct from fn_roles_contact(c.id)
    returning 1
  )
  select count(*) into touchees from remises;

  raise notice 'Rôles réalignés sur les faits : % contact(s). Zéro était attendu.', touchees;
end $$;

-- L'exclusivité annoncée doit être vraie après coup, sans quoi l'onglet Contacts affichera des
-- doublons. Celle-là bloque, parce qu'elle porte sur l'invariant que cette migration introduit.

do $$
declare doubles int;
begin
  select count(*) into doubles
    from contacts c
   where 'ADMINISTRATIF' = any(c.roles)
     and 'DECISIONNAIRE_POTENTIEL' = any(c.roles);

  if doubles > 0 then
    raise exception 'ARRÊT : % contact(s) portent à la fois ADMINISTRATIF et DECISIONNAIRE_POTENTIEL.', doubles;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS APPLICATION
--
--   -- 1. Les effectifs sont inchangés (relevé du 14/09 : DECISIONNAIRE 2463, SIGNATAIRE 1061,
--   --    ADMINISTRATIF 369, CONSEIL_SYNDICAL 45) :
--   select unnest(roles) role, count(*) from contacts group by 1 order by 2 desc;
--
--   -- 2. Le nouveau rôle s'écrit, et survit à un recalcul provoqué :
--   --    update contacts set roles = array['DECISIONNAIRE_POTENTIEL'] where id = '<un administratif>';
--   --    select fn_roles_contact('<le même id>');   -- doit rendre {DECISIONNAIRE_POTENTIEL}
--
--   -- 3. Il s'efface devant le fait qu'il annonçait :
--   --    rattacher un compteur à ce contact, puis
--   --    select roles from contacts where id = '<le même id>';   -- doit rendre {DECISIONNAIRE}
-- ════════════════════════════════════════════════════════════════════════════════════════════════
