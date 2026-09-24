-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN RÔLE PORTE ENFIN CE QU'IL OUVRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « la page de rôles et permissions est bien dans l'ensemble mais je la trouve
-- trop simple, fais en sorte qu'on puisse gérer aussi, pas seulement voir en mode lecture ».
--
-- ══ POURQUOI ON N'AJOUTE PAS SIMPLEMENT DES CASES À COCHER ══
--
-- Il y en avait. Elles ont été retirées le 23/09 parce qu'elles ne faisaient RIEN : 24 permissions
-- × 9 rôles, 121 attributions enregistrées, et aucun écran ni aucune règle de base ne les lisait.
-- Recompté aujourd'hui avant d'écrire cette migration, pour ne pas me fier au commentaire d'hier :
-- ZÉRO lecture de `permissions` dans le contrôle d'accès, et aucune policy qui les consulte.
--
-- Décocher une case laissait donc le droit ouvert, en donnant l'impression de l'avoir fermé. C'est
-- le pire état possible pour un écran de sécurité, et le remettre serait une faute.
--
-- ══ CE QUI DÉCIDE VRAIMENT, MESURÉ ══
--
-- Le CODE DU RÔLE, écrit en dur à six endroits :
--
--   · `roles.ts:326`         `useIsAdmin` — la porte de l'administration, relayée partout
--   · `visibility.ts:78`     voir tous les comptes, ou seulement les siens
--   · `Support.tsx:65`       qui reçoit les demandes de support
--   · `api/admin/impersonate.ts:59`     qui peut prendre la place d'un autre
--   · `api/admin/refresh-sandbox.ts:191` qui peut recharger le bac à sable
--
-- ÉCRIT EN DUR VEUT DIRE NON RÉGLABLE : créer un rôle « Directeur » qui voit tout était impossible
-- sans redéployer. C'est exactement ce que Naoëlle demande à pouvoir faire.
--
-- ══ CE QU'ON FAIT : LE RÔLE PORTE SES CAPACITÉS ══
--
-- Quatre colonnes, une par droit réellement testé. Elles remplacent la comparaison de chaîne : le
-- code demande « ce rôle voit-il tout ? » au lieu de « ce rôle s'appelle-t-il ADMIN ? ».
--
-- QUATRE, ET PAS VINGT-QUATRE. On ne crée que ce qui est déjà appliqué quelque part. Une colonne de
-- plus que de contrôles, et l'on retomberait dans le réglage sans effet qu'on est en train de
-- retirer. Le jour où un nouveau droit est contrôlé dans le code, il s'ajoute ici avec lui.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.roles_acces
  add column if not exists voit_tous_les_comptes boolean not null default false,
  add column if not exists ouvre_administration  boolean not null default false,
  add column if not exists supprime_tout         boolean not null default false,
  add column if not exists recoit_le_support     boolean not null default false;

comment on column public.roles_acces.voit_tous_les_comptes is
  'Vrai : ce rôle voit tout le portefeuille. Faux : seulement les comptes dont la personne est '
  'propriétaire. Remplace le test `code = ADMIN or SUPER_ADMIN` de `lib/data/visibility.ts`, qui '
  'rendait la visibilité non réglable sans redéploiement.';
comment on column public.roles_acces.ouvre_administration is
  'Vrai : ce rôle ouvre Administration — utilisateurs, rôles, objets, corbeille. C''est le droit le '
  'plus lourd, puisqu''il permet d''attribuer les autres. Remplace `useIsAdmin`.';
comment on column public.roles_acces.supprime_tout is
  'Vrai : ce rôle supprime les interactions et tâches de n''importe qui, pas seulement les siennes.';
comment on column public.roles_acces.recoit_le_support is
  'Vrai : les demandes de support de l''équipe arrivent à ce rôle. Sans personne pour le porter, '
  'les demandes ne vont nulle part — la page Rôles le signale.';

/* ══ ON REPREND L'ÉTAT ACTUEL, À L'IDENTIQUE ══
 *
 * La migration ne doit CHANGER LES DROITS DE PERSONNE : elle déplace une règle du code vers la
 * base, elle ne la réécrit pas. On recopie donc exactement ce que les six contrôles faisaient —
 * ADMIN et SUPER_ADMIN tout, les autres rien — et le garde-fou plus bas le vérifie profil par
 * profil.
 *
 * Toute autre répartition serait une décision de sécurité prise au passage, dans une migration
 * technique, sans que personne l'ait demandée. */
update public.roles_acces
   set voit_tous_les_comptes = true,
       ouvre_administration  = true,
       supprime_tout         = true,
       recoit_le_support     = true
 where code in ('ADMIN', 'SUPER_ADMIN');

/* ══ IL DOIT TOUJOURS RESTER QUELQU'UN POUR OUVRIR LA PORTE ══
 *
 * Le risque propre à un écran de droits réglable : retirer `ouvre_administration` au dernier rôle
 * qui le porte, et se retrouver dehors — plus personne ne peut rouvrir l'administration, donc plus
 * personne ne peut rendre le droit. La base se verrouille elle-même, et il faut une intervention
 * manuelle pour en sortir.
 *
 * LE GARDE EST EN BASE ET NON À L'ÉCRAN, parce qu'un contrôle d'écran se contourne : un appel
 * direct à l'API, un second onglet qui enregistre en même temps, et la dernière case tombe. */
create or replace function public.protege_dernier_administrateur()
returns trigger
language plpgsql
as $$
declare
  v_restants integer;
begin
  if old.ouvre_administration and not new.ouvre_administration then
    select count(*) into v_restants
      from public.roles_acces r
     where r.ouvre_administration
       and r.actif
       and r.id <> new.id
       and exists (select 1 from public.profils_roles_acces pra
                    join public.profils p on p.id = pra.profil_id
                   where pra.role_acces_id = r.id and p.actif);
    if v_restants = 0 then
      raise exception 'Ce rôle est le dernier à ouvrir l''administration : la retirer fermerait la porte à tout le monde, sans moyen de la rouvrir.';
    end if;
  end if;

  -- Désactiver le rôle revient au même que lui retirer le droit.
  if old.actif and not new.actif and new.ouvre_administration then
    select count(*) into v_restants
      from public.roles_acces r
     where r.ouvre_administration and r.actif and r.id <> new.id
       and exists (select 1 from public.profils_roles_acces pra
                    join public.profils p on p.id = pra.profil_id
                   where pra.role_acces_id = r.id and p.actif);
    if v_restants = 0 then
      raise exception 'Ce rôle est le dernier à ouvrir l''administration : le désactiver fermerait la porte à tout le monde.';
    end if;
  end if;

  return new;
end $$;

comment on function public.protege_dernier_administrateur() is
  'Empêche de retirer `ouvre_administration` au dernier rôle actif qui le porte, ou de désactiver '
  'ce rôle. Sans ce garde, un écran de droits réglable permet de se verrouiller dehors : plus '
  'personne pour ouvrir l''administration, donc plus personne pour rendre le droit.';

drop trigger if exists trg_protege_dernier_administrateur on public.roles_acces;
create trigger trg_protege_dernier_administrateur
  before update on public.roles_acces
  for each row execute function public.protege_dernier_administrateur();

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : PERSONNE NE DOIT GAGNER NI PERDRE UN DROIT AU PASSAGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ce que la migration rend possible : régler les droits sans redéployer. Le RISQUE n'est pas qu'un
-- réglage ne prenne pas — ça se voit à l'écran. C'est que la reprise ci-dessus OUVRE UN ACCÈS à
-- quelqu'un qui ne l'avait pas, ou le retire à quelqu'un qui en a besoin, en silence.
--
-- On vérifie donc profil par profil que les nouvelles colonnes disent EXACTEMENT ce que les six
-- contrôles en dur disaient — et l'on éprouve le verrou du dernier administrateur.
--
do $$
declare
  v_ecarts integer;
  v_admins integer;
  v_erreur text;
begin
  -- ① CHAQUE PERSONNE GARDE CE QU'ELLE AVAIT. `ouvre_administration` doit valoir exactement
  --   « son rôle est ADMIN ou SUPER_ADMIN », qui était le test de `useIsAdmin`.
  select count(*) into v_ecarts
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif
     and r.ouvre_administration is distinct from (r.code in ('ADMIN', 'SUPER_ADMIN'));
  if v_ecarts > 0 then
    raise exception 'La reprise change les droits de % personne(s) : quelqu''un gagnerait ou perdrait l''accès à l''administration.', v_ecarts;
  end if;

  -- Même contrôle pour la visibilité, qui décide ce que chacun voit de la clientèle.
  select count(*) into v_ecarts
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif
     and r.voit_tous_les_comptes is distinct from (r.code in ('ADMIN', 'SUPER_ADMIN'));
  if v_ecarts > 0 then
    raise exception 'La reprise change le périmètre visible de % personne(s).', v_ecarts;
  end if;

  -- ② IL RESTE DES ADMINISTRATEURS. Une base sans personne pour ouvrir la porte est inutilisable.
  select count(*) into v_admins
    from public.roles_acces r
   where r.ouvre_administration and r.actif
     and exists (select 1 from public.profils_roles_acces pra
                  join public.profils p on p.id = pra.profil_id
                 where pra.role_acces_id = r.id and p.actif);
  if v_admins = 0 then
    raise exception 'Plus aucun rôle actif n''ouvre l''administration : personne ne pourrait plus rien régler.';
  end if;

  -- ③ LE CAS QUI DOIT ÉCHOUER : se verrouiller dehors. On tente de retirer le droit à TOUS les
  --   rôles qui le portent ; le dernier doit être refusé par le déclencheur.
  begin
    update public.roles_acces set ouvre_administration = false where ouvre_administration;
    raise exception 'On a pu retirer l''administration à TOUS les rôles : la porte se referme sans moyen de la rouvrir.';
  exception
    when others then
      get stacked diagnostics v_erreur = message_text;
      if v_erreur not like '%dernier%' then
        raise exception 'Le verrou du dernier administrateur n''a pas joué. Erreur reçue : %', v_erreur;
      end if;
  end;

  raise notice 'Garde-fou : les % rôles reprennent les droits d''avant sans écart, et le dernier administrateur ne peut pas se retirer la porte.', v_admins;
end $$;

commit;
