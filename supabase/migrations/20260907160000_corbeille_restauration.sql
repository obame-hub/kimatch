-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNE CORBEILLE : VOIR QUI A SUPPRIMÉ QUOI, ET LE REMETTRE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « mets en place une corbeille visible pour les admin et super admin où on
-- aurait la possibilité de récupérer les données et de vider la corbeille si besoin, et aussi il
-- faut qu'on voie qui a supprimé quoi et quand. »
--
-- ══ ELLE REPOSE SUR LE JOURNAL, PAS SUR UNE TABLE À PART ══
--
-- La migration 20260907120000 pose un déclencheur AFTER DELETE qui écrit dans `historiques_entites`
-- la LIGNE ENTIÈRE supprimée, en jsonb, avec son auteur et un `correlation_id` partagé par tout ce
-- qu'un même clic a emporté. Ce journal EST la corbeille : il contient déjà tout ce qu'il faut pour
-- remettre les lignes en place.
--
-- Une seconde table qui recopierait la même chose divergerait au premier oubli. Et une colonne
-- `supprime_le` sur chaque table — la « corbeille douce » classique — aurait demandé de reprendre
-- les 44 tables, toutes les requêtes de lecture et toutes les politiques RLS pour filtrer les lignes
-- effacées. Le journal fait le même travail sans toucher au reste.
--
-- ══ CE QU'ELLE NE PEUT PAS FAIRE, ET IL FAUT LE SAVOIR ══
--
-- Elle ne remonte pas dans le passé. Les suppressions d'avant l'application de 20260907120000 n'ont
-- laissé aucune trace : le compte « ALAIN - CHEZ GILLES (BAR DE L'ADOUR) » perdu par Guillaume le
-- 07/09 est irrécupérable, et la corbeille sera vide au premier jour. Elle protège à partir de
-- maintenant, pas avant.
--
-- ══ L'ORDRE DE REMISE EN PLACE : PAR ESSAIS SUCCESSIFS, PAS PAR UNE LISTE ══
--
-- Réinsérer un site avant son compte échoue : la clé étrangère refuse. Il faudrait donc remettre les
-- lignes dans l'ordre des dépendances — compte, puis contacts et sites, puis compteurs et contrats,
-- puis leurs enfants.
--
-- Cet ordre N'EST PAS ÉCRIT ICI, volontairement. Une liste de trente tables tenue à la main devient
-- fausse à la première migration qui en ajoute une, et son échec serait silencieux : une
-- restauration partielle, sans que personne sache ce qui manque.
--
-- À la place, la fonction insère tout ce qu'elle peut, garde de côté ce qui a échoué sur une clé
-- étrangère, et recommence. Chaque passe remet au moins une couche de la hiérarchie, donc le nombre
-- de passes est borné par sa profondeur. Quand une passe n'avance plus, c'est qu'il manque vraiment
-- quelque chose en dehors de cette suppression — et là on refuse tout, en disant quoi.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Le contrôle d'accès, écrit une fois ───────────────────────────────────────────────────────
create or replace function public.fn_est_administrateur()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from profils_roles_acces pra
    join roles_acces ra on ra.id = pra.role_acces_id
    where pra.profil_id = auth.uid()
      and ra.code in ('ADMIN', 'SUPER_ADMIN')
      and ra.actif = true
  );
$$;

comment on function public.fn_est_administrateur() is
  'Vrai si l''utilisateur courant est ADMIN ou SUPER_ADMIN. Sert de barrière à la corbeille : la '
  'restauration réinsère des lignes en contournant RLS, elle ne peut pas être ouverte à tous.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CORBEILLE : UNE LIGNE PAR GESTE DE SUPPRESSION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Un clic sur « Supprimer » d'un compte a pu emporter 672 lignes. La corbeille en montre UNE, avec
-- son objet principal, son auteur, sa date et ce qu'elle contient — sinon 672 entrées noieraient les
-- autres suppressions de la journée.
--
-- L'OBJET PRINCIPAL est celui du plus haut rang de la hiérarchie présent dans le geste : si un
-- compte est là, c'est lui ; sinon le site ; sinon le compteur… C'est ce qu'on cherche quand on
-- ouvre la corbeille — « qui a supprimé le compte MEMPHIS ? » et non « qui a supprimé cette ligne
-- de contrats_compteurs ? ».
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
gestes as (
  select h.correlation_id,
         min(h.date_modification)                     as supprime_le,
         (array_agg(h.auteur_profil_id) filter (where h.auteur_profil_id is not null))[1] as auteur_id,
         count(*)                                     as nb_lignes,
         count(distinct h.entite_type)                as nb_tables
  from historiques_entites h
  where h.operation = 'DELETE' and h.correlation_id is not null
  group by h.correlation_id
),
principal as (
  select distinct on (h.correlation_id)
         h.correlation_id,
         h.entite_type,
         h.entite_id,
         coalesce(r.libelle_type, h.entite_type)      as libelle_type,
         -- LE NOM DE L'OBJET, cherché là où chaque table le range. `reference` couvre les contrats
         -- et les mandats, `numero_pdl` les compteurs, `nom` le reste.
         coalesce(
           -- LE PRÉNOM D'ABORD SUR LES PERSONNES. Une table qui porte un `prenom` désigne quelqu'un,
           -- et « SCHROTTER » seul ne dit pas de qui il s'agit — Christian et Arnaud SCHROTTER sont
           -- tous deux rattachés au même compte.
           nullif(trim(coalesce(h.ancienne_valeur ->> 'prenom', '') || ' '
                       || coalesce(h.ancienne_valeur ->> 'nom', '')), ''),
           nullif(h.ancienne_valeur ->> 'nom', ''),
           nullif(h.ancienne_valeur ->> 'reference', ''),
           nullif(h.ancienne_valeur ->> 'numero_pdl', ''),
           nullif(h.ancienne_valeur ->> 'objet', ''),
           nullif(h.ancienne_valeur ->> 'titre', '')
         )                                            as nom
  from historiques_entites h
  left join rangs r on r.entite_type = h.entite_type
  where h.operation = 'DELETE' and h.correlation_id is not null
  order by h.correlation_id, coalesce(r.rang, 99), h.date_modification
),
detail as (
  select h.correlation_id,
         string_agg(distinct h.entite_type, ', ' order by h.entite_type) as tables_touchees
  from historiques_entites h
  where h.operation = 'DELETE' and h.correlation_id is not null
  group by h.correlation_id
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

comment on view public.v_corbeille is
  'Une ligne par geste de suppression : son objet principal, qui l''a fait, quand, et combien de '
  'lignes il a emportées. S''appuie sur les DELETE de historiques_entites.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LE DÉTAIL D'UN GESTE : ce qu'on lit avant de décider de restaurer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
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
       -- LA LIGNE EXISTE-T-ELLE DÉJÀ ? Une restauration déjà faite, ou un identifiant réutilisé,
       -- se voit ici plutôt qu'à l'échec de l'insertion.
       h.ancienne_valeur
from historiques_entites h
where h.operation = 'DELETE' and h.correlation_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RESTAURER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_restaurer_suppression(p_correlation_id uuid)
returns table (entite_type text, lignes_remises integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  restantes  bigint;
  avant      bigint;
  passe      integer := 0;
  ligne      record;
  detail     text;
begin
  if not fn_est_administrateur() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  -- Les lignes à remettre, dans une table temporaire : on y raye ce qui passe, et ce qui reste à la
  -- fin est exactement ce qui n'a pas pu revenir.
  create temporary table a_remettre on commit drop as
  select h.entite_type, h.entite_id, h.ancienne_valeur
  from historiques_entites h
  where h.correlation_id = p_correlation_id and h.operation = 'DELETE';

  select count(*) into restantes from a_remettre;
  if restantes = 0 then
    raise exception 'Rien à restaurer sous cet identifiant.';
  end if;

  create temporary table remises (entite_type text, n integer) on commit drop;

  -- ── LES PASSES ──
  -- Chaque passe remet au moins la couche la plus haute encore manquante ; le compte revient avant
  -- ses sites, les sites avant leurs compteurs. 12 passes couvrent une hiérarchie de 12 niveaux, là
  -- où la plus profonde de Kimatch en compte 6.
  loop
    passe := passe + 1;
    exit when passe > 12;
    avant := restantes;

    -- UN INSTANTANÉ AVANT LA PASSE, et non un parcours direct de `a_remettre`.
    -- `for ... in select * from a_remettre` ouvre un curseur sur la table ; en supprimer des lignes
    -- pendant la boucle rend le parcours indéfini, et une ligne pouvait être sautée sans que rien
    -- ne le signale — donc une restauration silencieusement incomplète.
    for ligne in
      select a.entite_type, a.entite_id, a.ancienne_valeur
      from a_remettre a
      -- Ordre stable : la même suppression se restaure de la même façon deux fois de suite, ce qui
      -- rend le comportement reproductible quand il faut comprendre un échec.
      order by a.entite_type, a.entite_id
    loop
      begin
        execute format(
          'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) '
          'on conflict (id) do nothing',
          ligne.entite_type, ligne.entite_type)
        using ligne.ancienne_valeur;

        delete from a_remettre a
         where a.entite_type = ligne.entite_type and a.entite_id = ligne.entite_id;
        insert into remises values (ligne.entite_type, 1);
      exception
        -- LA CLÉ ÉTRANGÈRE MANQUANTE N'EST PAS UNE ERREUR : c'est « pas encore ». On la garde pour
        -- la passe suivante, quand son parent sera revenu.
        when foreign_key_violation then null;
      end;
    end loop;

    select count(*) into restantes from a_remettre;
    exit when restantes = 0;

    -- Une passe qui n'avance plus n'avancera jamais : ce qui reste dépend de quelque chose qui
    -- n'est pas dans cette suppression.
    if restantes = avant then
      select string_agg(format('%s (%s lignes)', t.entite_type, t.n), ', ')
        into detail
      from (select a.entite_type, count(*) as n from a_remettre a group by a.entite_type) t;

      raise exception
        'Restauration impossible : % ligne(s) dépendent d''un enregistrement qui n''existe plus — %. '
        'Restaurez d''abord la suppression qui l''a emporté.', restantes, detail;
    end if;
  end loop;

  if restantes > 0 then
    raise exception 'Restauration incomplète après % passes : % ligne(s) restantes.', passe - 1, restantes;
  end if;

  -- LE GESTE SORT DE LA CORBEILLE. Le laisser y figurer proposerait de restaurer une deuxième fois
  -- des lignes déjà revenues, ce qui ne ferait rien mais ferait douter.
  delete from historiques_entites
   where correlation_id = p_correlation_id and operation = 'DELETE';

  return query
    select r.entite_type, sum(r.n)::integer from remises r group by r.entite_type order by 1;
end;
$$;

comment on function public.fn_restaurer_suppression(uuid) is
  'Remet en place toutes les lignes d''un geste de suppression, par passes successives pour '
  'respecter les clés étrangères sans dépendre d''une liste de tables tenue à la main. '
  'Réservé aux administrateurs. Tout ou rien.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- VIDER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vider est DÉFINITIF : c'est la seule opération de Kimatch qui détruit sans recours, puisqu'elle
-- efface justement le filet. D'où deux formes explicites plutôt qu'un bouton unique :
--   · un geste précis, par son identifiant ;
--   · tout ce qui est plus vieux qu'une date, pour une purge de routine.
-- Aucune des deux ne peut vider la corbeille entière par accident : `p_avant` est obligatoire.
create or replace function public.fn_vider_corbeille(
  p_correlation_id uuid default null,
  p_avant timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  if not fn_est_administrateur() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_correlation_id is null and p_avant is null then
    raise exception 'Précisez un geste à supprimer, ou une date avant laquelle purger.';
  end if;

  delete from historiques_entites h
   where h.operation = 'DELETE'
     and h.correlation_id is not null
     and (p_correlation_id is null or h.correlation_id = p_correlation_id)
     and (p_avant is null or h.date_modification < p_avant);

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.fn_vider_corbeille(uuid, timestamptz) is
  'Efface définitivement des entrées de la corbeille. Réservé aux administrateurs. Exige soit un '
  'geste précis, soit une date : sans argument elle refuse, pour qu''on ne vide pas tout par accident.';

-- ── Qui peut appeler quoi ─────────────────────────────────────────────────────────────────────
-- Les fonctions vérifient elles-mêmes le rôle : le GRANT ouvre l'appel, la fonction décide. Les
-- vues restent protégées par les politiques RLS de `historiques_entites`.
grant execute on function public.fn_est_administrateur() to authenticated;
grant execute on function public.fn_restaurer_suppression(uuid) to authenticated;
grant execute on function public.fn_vider_corbeille(uuid, timestamptz) to authenticated;
grant select on public.v_corbeille, public.v_corbeille_detail to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GARDE-FOU : on supprime un compte pour de vrai, on le restaure, et on vérifie qu'il est revenu
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une corbeille qui ne restaure pas est pire qu'aucune corbeille : on cesse de faire attention en
-- croyant avoir un filet. Le test crée donc un compte jetable AVEC un contact dessous — pour
-- éprouver l'ordre des passes, qui est le seul endroit vraiment délicat — le supprime, le restaure,
-- et annule tout si l'un des deux ne revient pas.
do $$
declare
  type_test  uuid;
  id_compte  uuid;
  id_contact uuid;
  correl     uuid;
  n_compte   integer;
  n_contact  integer;
begin
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'comptes' and t.tgname = 'trg_journaliser_suppression') then
    raise exception 'Le journal des suppressions n''est pas posé : appliquez 20260907120000 d''abord.';
  end if;

  select id into type_test from types_comptes limit 1;

  insert into comptes (nom, type_compte_id)
  values ('ZZZ TEST CORBEILLE — À SUPPRIMER', type_test) returning id into id_compte;
  insert into contacts (nom, prenom, compte_id)
  values ('TEST', 'Corbeille', id_compte) returning id into id_contact;

  delete from comptes where id = id_compte;

  select correlation_id into correl
  from historiques_entites
  where entite_id = id_compte and operation = 'DELETE';

  if correl is null then
    raise exception 'La suppression n''a pas été journalisée : rien n''est appliqué.';
  end if;

  -- On appelle le corps de la restauration sans la barrière de rôle : cette migration s'exécute
  -- hors session utilisateur, `auth.uid()` y est nul.
  perform 1;
  declare
    ligne record;
    restantes bigint;
    avant bigint;
    passe integer := 0;
  begin
    create temporary table t_remettre on commit drop as
    select h.entite_type, h.entite_id, h.ancienne_valeur
    from historiques_entites h where h.correlation_id = correl and h.operation = 'DELETE';

    select count(*) into restantes from t_remettre;
    loop
      passe := passe + 1;
      exit when passe > 12 or restantes = 0;
      avant := restantes;
      for ligne in
        select x.entite_type, x.entite_id, x.ancienne_valeur
        from t_remettre x order by x.entite_type, x.entite_id
      loop
        begin
          execute format(
            'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) '
            'on conflict (id) do nothing', ligne.entite_type, ligne.entite_type)
          using ligne.ancienne_valeur;
          delete from t_remettre x
           where x.entite_type = ligne.entite_type and x.entite_id = ligne.entite_id;
        exception when foreign_key_violation then null;
        end;
      end loop;
      select count(*) into restantes from t_remettre;
      exit when restantes = avant;
    end loop;
  end;

  select count(*) into n_compte  from comptes  where id = id_compte;
  select count(*) into n_contact from contacts where id = id_contact;

  if n_compte <> 1 or n_contact <> 1 then
    raise exception
      'La restauration n''a pas fonctionné (compte : %, contact : %). Rien n''est appliqué.',
      n_compte, n_contact;
  end if;

  -- Le test a servi : on efface le compte de test ET sa trace, pour ne pas laisser un faux
  -- enregistrement dans la corbeille du premier jour.
  delete from comptes where id = id_compte;
  delete from historiques_entites where correlation_id in (correl)
     or entite_id in (id_compte, id_contact);

  raise notice 'Garde-fou passé : un compte et son contact ont été supprimés puis restaurés.';
end $$;

commit;
