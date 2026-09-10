-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTE SE SUPPRIME VRAIMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 10/09/2026, capture d'écran à l'appui : la fenêtre de suppression du compte
-- « S D G I DES E T PRALOGNAN LA VANOISE » annonce 27 enregistrements à détruire, puis refuse —
-- « Impossible de supprimer : d'autres enregistrements y sont encore rattachés. »
--
-- L'APPLICATION PROMETTAIT CE QUE LA BASE INTERDISAIT. Trois refus successifs, découverts en
-- rejouant la suppression dans une transaction annulée. Les voici dans l'ordre où Postgres les
-- oppose.
--
-- ══ ① `contrats.compte_id` INTERDISAIT CE QUE LA FENÊTRE PROMETTAIT ═══════════════════════════
--
-- La fenêtre annonce « 6 contrats » parmi ce qui sera détruit. La clé étrangère, elle, est en
-- `no action` : elle refuse tant qu'un contrat pend au compte. Et c'est une incohérence isolée —
-- `compteurs.compte_id`, `contacts.compte_id`, `mandats.compte_id` et `sites.compte_id` sont TOUS
-- en `cascade`. Le contrat était le seul de sa famille à ne pas suivre son compte.
--
-- On aligne. Le contrat d'un client supprimé n'a pas de vie propre : il ne se rattacherait à rien.
-- La suppression reste tracée par `trg_journaliser_suppression`, et la corbeille sait la rendre.
--
-- (`recommandations.compte_id` reste en `restrict`, et c'est délibéré : une recommandation engage
-- un chiffrage transmis au client. Un compte qui en porte ne se supprime pas d'un clic.)
--
-- ══ ② `signaux.site_id` : UNE COLONNE NOT NULL QU'UNE CLÉ CHERCHAIT À VIDER ═══════════════════
--
-- `signaux.site_id` est `not null`, et sa clé étrangère est en `set null`. Les deux ne peuvent pas
-- être vrais en même temps : à la seconde où un site disparaît, Postgres tente d'écrire `null` dans
-- une colonne qui l'interdit, et rend un 23502. La contrainte n'a jamais pu s'appliquer une seule
-- fois — elle attendait qu'on supprime un site pour se révéler.
--
-- Un signal désigne un site : sans lui il ne signale rien. Il suit donc son site.
--
-- ══ ③ LE GARDE-FOU DES INTERACTIONS SE FIAIT À DES COLONNES QUI ALLAIENT SE VIDER ═════════════
--
-- Celui-ci est le plus retors, et c'est le plus instructif.
--
-- `interactions_contexte_check` exige qu'une interaction pende à AU MOINS UN objet — sans quoi elle
-- n'apparaît sur aucune fiche et devient introuvable. Onze tables portent donc un déclencheur
-- `before delete` qui supprime les interactions dont ELLES SONT LE DERNIER lien.
--
-- LE PIÈGE EST DANS L'ORDRE. Prenons une interaction rattachée à la fois au compte et à l'un de ses
-- contacts, tous deux sur le point de disparaître :
--
--   · le garde-fou du COMPTE passe en premier : il voit `contact_id` rempli, donc un autre
--     rattachement, donc il garde l'interaction ;
--   · la cascade supprime ensuite le CONTACT ; son garde-fou voit `compte_id` encore rempli — la
--     ligne du compte n'est pas encore effacée — donc un autre rattachement, donc il garde ;
--   · puis les deux `set null` s'appliquent, l'interaction se retrouve sans aucun lien, et le
--     `check` refuse tout en bloc.
--
-- CHAQUE GARDE-FOU REGARDE LES COLONNES À L'INSTANT OÙ IL PASSE, ET PENDANT UNE CASCADE CELLES QUI
-- VONT SE VIDER PARAISSENT ENCORE PLEINES. Deux gardiens se renvoient la responsabilité, et
-- personne ne garde.
--
-- LA CORRECTION EST D'UNE LIGNE : après avoir supprimé les interactions dont il est le dernier
-- lien, chaque garde-fou VIDE SA PROPRE COLONNE. Le suivant voit alors la vérité au lieu d'un
-- vestige, et supprime ce qui doit l'être. La responsabilité ne se renvoie plus : elle se transmet.
--
-- On ne lève donc PAS `interactions_contexte_check`. L'invariant est juste — une interaction que
-- rien ne porte est une interaction perdue — c'est sa mise en œuvre qui était aveugle.
--
-- AU PASSAGE, `requete_id` MANQUAIT à la liste des « autres liens » du garde-fou, alors qu'il
-- figure bien dans le `check`. Conséquence : une interaction dont le dernier rattachement était une
-- requête se faisait supprimer comme orpheline alors qu'elle ne l'était pas. Douze colonnes dans la
-- contrainte, onze dans le garde-fou : l'écart se paie en données effacées à tort.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── ① LE CONTRAT SUIT SON COMPTE ────────────────────────────────────────────────────────────────
alter table public.contrats drop constraint contrats_compte_id_fkey;
alter table public.contrats add constraint contrats_compte_id_fkey
  foreign key (compte_id) references public.comptes(id) on delete cascade;

-- ── ② LE SIGNAL SUIT SON SITE ───────────────────────────────────────────────────────────────────
alter table public.signaux drop constraint signaux_site_id_fkey;
alter table public.signaux add constraint signaux_site_id_fkey
  foreign key (site_id) references public.sites(id) on delete cascade;

-- ── ③ CHAQUE GARDE-FOU VIDE SA PROPRE COLONNE AVANT DE PASSER LA MAIN ──────────────────────────
create or replace function public.fn_supprimer_interactions_orphelines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  colonne text := TG_ARGV[0];
  autres  text;
  n       integer;
begin
  -- LES DOUZE CONTEXTES DE `interactions_contexte_check`, MOINS LE MIEN. Cette liste doit rester
  -- identique à celle de la contrainte : `requete_id` y manquait, et des interactions encore
  -- rattachées à une requête partaient comme orphelines.
  select string_agg(format('%I is null', c), ' and ')
    into autres
  from unnest(array[
    'compte_id', 'contact_id', 'site_id', 'signal_id', 'mandat_id', 'recommandation_id',
    'version_recommandation_id', 'action_id', 'opportunite_id', 'suivi_contrat_id', 'piste_id',
    'requete_id'
  ]) as c
  where c <> colonne;

  execute format('delete from public.interactions where %I = $1 and %s', colonne, autres)
  using old.id;

  get diagnostics n = row_count;
  if n > 0 then
    -- Une notice et non un silence : sur une suppression de compte, savoir que 19 interactions sont
    -- parties avec lui explique un écart de compteur qu'on chercherait longtemps.
    raise notice '% interaction(s) sans autre rattachement supprimée(s) avec %.%', n, TG_TABLE_NAME, old.id;
  end if;

  -- ══ ET MAINTENANT JE VIDE MA PROPRE COLONNE ══
  --
  -- C'est la correction du 10/09/2026. Ce que la clé étrangère ferait de toute façon en `set null`
  -- — mais elle le fait APRÈS les cascades, donc trop tard pour les gardes-fous qui passent entre
  -- les deux. En le faisant ici, celui qui vient après moi lit un rattachement disparu comme
  -- disparu, et non comme encore valide.
  --
  -- Ces lignes-là ont forcément un autre contexte : celles qui n'en avaient pas viennent d'être
  -- supprimées juste au-dessus. Le `check` est donc toujours satisfait.
  execute format('update public.interactions set %I = null where %I = $1', colonne, colonne)
  using old.id;

  return old;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON SUPPRIME POUR DE VRAI, PUIS ON ANNULE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que les clés portent bien « cascade » ne prouverait rien : les trois refus venaient de
-- l'INTERACTION entre les règles, pas d'une règle isolée. On joue donc une suppression complète
-- sur le compte le plus rattaché de la base — celui qui traverse le plus de chemins de cascade —
-- et on l'annule par une exception attrapée. Rien n'est perdu, et si un quatrième refus dort
-- quelque part, la migration entière échoue ici plutôt qu'entre les mains de Naoëlle.
--
do $$
declare
  cible     uuid;
  nom_cible text;
begin
  select c.id, c.nom into cible, nom_cible
  from public.comptes c
  join public.contrats k on k.compte_id = c.id
  join public.interactions i on i.compte_id = c.id
  where not exists (select 1 from public.recommandations r where r.compte_id = c.id)
  group by c.id, c.nom
  order by count(distinct k.id) desc, count(distinct i.id) desc
  limit 1;

  if cible is null then
    raise exception 'Garde-fou impossible : aucun compte ne porte à la fois contrats et interactions.';
  end if;

  begin
    delete from public.comptes where id = cible;
    -- Arrivé ici, la suppression a traversé toutes les cascades. On défait tout.
    raise exception 'essai concluant';
  exception
    when others then
      if sqlerrm <> 'essai concluant' then
        raise exception 'La suppression d''un compte échoue encore sur « % » : % (%)',
          nom_cible, sqlerrm, sqlstate;
      end if;
  end;

  raise notice 'Garde-fou : la suppression complète de « % » passe, et a été annulée.', nom_cible;
end $$;

commit;
