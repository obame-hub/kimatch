-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CORBEILLE SE REFERME SUR LES ADMINISTRATEURS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle demandait « une corbeille visible pour les admin et super admin ». L'écran l'est : il vit
-- dans la page Administration. Les DONNÉES, elles, ne l'étaient pas.
--
-- ══ CE QUE J'AI TROUVÉ EN VÉRIFIANT MON PROPRE TRAVAIL ══
--
-- `historiques_entites` porte une politique `authenticated_all` en `ALL` avec `using (true)` :
-- N'IMPORTE QUEL UTILISATEUR CONNECTÉ peut lire toute la table. Elle était inoffensive tant que la
-- table était vide — c'était le cas jusqu'à ce matin, et c'est justement ce que j'y ai constaté en
-- cherchant la trace du compte de Guillaume.
--
-- La migration 20260907120000 l'a remplie. Elle contient maintenant la LIGNE ENTIÈRE de chaque
-- enregistrement supprimé : coordonnées de contacts, prix de contrats, marges. Et les rôles de
-- Kimatch comprennent PARTENAIRE, FOURNISSEUR et CLIENT — le jour où l'un d'eux se connecte, il lit
-- l'historique des suppressions de tout le portefeuille.
--
-- C'est moi qui ai transformé une politique laxiste et sans conséquence en fuite de données. À moi
-- de la refermer, dans la même journée.
--
-- ══ DEUX BARRIÈRES, PAS UNE ══
--
-- LES VUES filtrent sur le rôle. C'est la barrière lisible : quelqu'un qui relit `v_corbeille` voit
-- immédiatement à qui elle s'adresse.
--
-- LA TABLE restreint la lecture. C'est la barrière qui compte : sans elle, il suffirait d'appeler
-- `historiques_entites` directement via l'API pour contourner les vues. Une protection posée
-- seulement sur la vue protège la vue, pas la donnée.
--
-- ── CE QUI RESTE OUVERT, ET POURQUOI ──
--
-- L'ÉCRITURE reste permise à tout utilisateur connecté. Le déclencheur de journalisation est en
-- `security definer` et n'en a pas besoin, mais l'historique métier peut être alimenté depuis
-- l'application, et fermer une porte que personne n'a demandé de fermer casserait sans prévenir.
--
-- LA SUPPRESSION garde sa politique existante, `suppression_reservee_aux_admins`, déjà correcte.
--
-- Vérifié avant d'écrire : aucun écran ni aucune fonction serveur ne lit `historiques_entites` —
-- seule la recopie vers la sandbox y touche, et elle passe par la clé de service, hors RLS.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Une seule définition du « est-il administrateur ? » ───────────────────────────────────────
--
-- `has_role_acces` existait déjà et sert à la politique de suppression. `fn_est_administrateur`
-- délègue désormais au lieu de refaire la même jointure : deux définitions du même contrôle
-- d'accès, c'est une occasion d'en corriger une seule.
create or replace function public.fn_est_administrateur()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']);
$$;

comment on function public.fn_est_administrateur() is
  'Vrai si l''utilisateur courant est ADMIN ou SUPER_ADMIN. Délègue à has_role_acces pour qu''il '
  'n''existe qu''une définition du contrôle d''accès.';

-- ── Les vues ne montrent rien à qui n'est pas administrateur ──────────────────────────────────
--
-- `create or replace view` n'accepte que des colonnes identiques, en même ordre : on n'ajoute
-- qu'une clause `where`, la liste ne change pas.
create or replace view public.v_corbeille as
with rangs(entite_type, rang, libelle_type) as (values
  ('comptes',                 1, 'Compte'),
  ('sites',                   2, 'Site'),
  ('recommandations',         3, 'Recommandation'),
  ('mandats',                 4, 'Mandat'),
  ('contrats',                5, 'Contrat'),
  ('compteurs',               6, 'Compteur'),
  ('contacts',                7, 'Contact'),
  ('opportunites',            8, 'Opportunité'),
  ('versions_recommandation', 9, 'Version de cotation'),
  ('offres_fournisseurs',    10, 'Offre fournisseur'),
  ('pistes',                 11, 'Piste'),
  ('requetes',               12, 'Requête'),
  ('signaux',                13, 'Signal'),
  ('interactions',           14, 'Interaction'),
  ('documents',              15, 'Document'),
  ('actions',                16, 'Tâche')
),
journal as (
  select h.*
  from historiques_entites h
  where h.operation = 'DELETE'
    and h.correlation_id is not null
    -- LA BARRIÈRE, ÉVALUÉE UNE FOIS : `fn_est_administrateur()` est `stable`, donc Postgres ne
    -- l'appelle pas par ligne.
    and public.fn_est_administrateur()
),
gestes as (
  select j.correlation_id,
         min(j.date_modification)                     as supprime_le,
         (array_agg(j.auteur_profil_id) filter (where j.auteur_profil_id is not null))[1] as auteur_id,
         count(*)                                     as nb_lignes,
         count(distinct j.entite_type)                as nb_tables
  from journal j
  group by j.correlation_id
),
principal as (
  select distinct on (j.correlation_id)
         j.correlation_id,
         j.entite_type,
         j.entite_id,
         coalesce(r.libelle_type, j.entite_type)      as libelle_type,
         coalesce(
           -- LE PRÉNOM D'ABORD SUR LES PERSONNES : « SCHROTTER » seul ne dit pas de qui il s'agit
           -- quand Christian et Arnaud sont tous deux rattachés au même compte.
           nullif(trim(coalesce(j.ancienne_valeur ->> 'prenom', '') || ' '
                       || coalesce(j.ancienne_valeur ->> 'nom', '')), ''),
           nullif(j.ancienne_valeur ->> 'nom', ''),
           nullif(j.ancienne_valeur ->> 'reference', ''),
           nullif(j.ancienne_valeur ->> 'numero_pdl', ''),
           nullif(j.ancienne_valeur ->> 'objet', ''),
           nullif(j.ancienne_valeur ->> 'titre', '')
         )                                            as nom
  from journal j
  left join rangs r on r.entite_type = j.entite_type
  order by j.correlation_id, coalesce(r.rang, 99), j.date_modification
),
detail as (
  select j.correlation_id,
         string_agg(distinct j.entite_type, ', ' order by j.entite_type) as tables_touchees
  from journal j
  group by j.correlation_id
)
select g.correlation_id,
       g.supprime_le,
       g.auteur_id,
       trim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')) as auteur_nom,
       pr.entite_type,
       pr.entite_id,
       pr.libelle_type,
       pr.nom,
       g.nb_lignes,
       g.nb_tables,
       d.tables_touchees
from gestes g
join principal pr on pr.correlation_id = g.correlation_id
join detail d     on d.correlation_id = g.correlation_id
left join profils p on p.id = g.auteur_id;

create or replace view public.v_corbeille_detail as
select h.correlation_id,
       h.entite_type,
       h.entite_id,
       h.date_modification,
       coalesce(
         nullif(trim(coalesce(h.ancienne_valeur ->> 'prenom', '') || ' '
                     || coalesce(h.ancienne_valeur ->> 'nom', '')), ''),
         nullif(h.ancienne_valeur ->> 'nom', ''),
         nullif(h.ancienne_valeur ->> 'reference', ''),
         nullif(h.ancienne_valeur ->> 'numero_pdl', ''),
         nullif(h.ancienne_valeur ->> 'objet', ''),
         nullif(h.ancienne_valeur ->> 'titre', '')
       ) as nom,
       h.ancienne_valeur
from historiques_entites h
where h.operation = 'DELETE'
  and h.correlation_id is not null
  and public.fn_est_administrateur();

-- ── La table elle-même : lecture réservée ─────────────────────────────────────────────────────
drop policy if exists authenticated_all on public.historiques_entites;

create policy lecture_reservee_aux_admins on public.historiques_entites
  for select to authenticated
  using (public.has_role_acces(auth.uid(), array['SUPER_ADMIN', 'ADMIN']));

-- L'écriture reste ouverte : l'historique métier peut être alimenté depuis l'application, et
-- refermer une porte que personne n'a demandé de fermer casserait sans prévenir.
create policy ecriture_par_les_connectes on public.historiques_entites
  for insert to authenticated
  with check (true);

create policy modification_par_les_connectes on public.historiques_entites
  for update to authenticated
  using (true) with check (true);

-- ── GARDE-FOU : les politiques attendues sont bien là, et la lecture n'est plus ouverte ────────
do $$
declare
  lecture_ouverte integer;
  attendues integer;
begin
  -- Aucune politique de lecture ne doit plus accepter tout le monde.
  select count(*) into lecture_ouverte
  from pg_policies
  where tablename = 'historiques_entites'
    and cmd in ('SELECT', 'ALL')
    and coalesce(qual, 'true') = 'true';

  if lecture_ouverte > 0 then
    raise exception
      '% politique(s) de lecture acceptent encore tout le monde sur historiques_entites. Rien n''est appliqué.',
      lecture_ouverte;
  end if;

  select count(*) into attendues
  from pg_policies
  where tablename = 'historiques_entites'
    and policyname in ('lecture_reservee_aux_admins', 'suppression_reservee_aux_admins');

  if attendues <> 2 then
    raise exception
      'Les deux politiques réservées aux administrateurs ne sont pas en place (% trouvée(s)). Rien n''est appliqué.',
      attendues;
  end if;

  raise notice 'Corbeille refermée : lecture réservée aux administrateurs, écriture inchangée.';
end $$;

commit;
