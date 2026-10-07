-- ══ LES RÈGLES DE SÉCURITÉ S'ÉVALUENT UNE FOIS PAR REQUÊTE, PLUS UNE FOIS PAR LIGNE ══
-- William, 07/10/2026 : les listes du Patrimoine « se chargent beaucoup trop lentement ».
--
-- 306 règles (RLS) sur 170 tables appelaient `est_partenaire()` ou `auth.uid()` nus. Postgres les
-- réévaluait pour CHAQUE ligne lue : lire 7 900 compteurs, c'était 7 900 lectures du profil. Écrits
-- `(SELECT est_partenaire())` / `(SELECT auth.uid())`, ils deviennent un « InitPlan » calculé une
-- seule fois par requête (recommandation Supabase « auth_rls_initplan »). La règle est IDENTIQUE :
-- ces fonctions ne dépendent pas de la ligne.
--
-- Vérifié avant application, en transaction annulée : sur les 170 tables, le nombre de lignes
-- visibles par William et par un commercial est strictement le même avant et après. Gain mesuré
-- pour un commercial : liste des mandats 261 → 19 ms, des comptes 276 → 51 ms, 100 compteurs
-- 144 → 16 ms, comptage des documents 464 → 69 ms. Création, modification et suppression testées
-- en utilisateur connecté après application.
--
-- Les tables sont verrouillées d'un coup, dans l'ordre alphabétique, avant toute réécriture : un
-- premier essai, table par table, s'est interbloqué avec l'activité de l'application. Le verrou
-- attend au plus 5 s ; au-delà, rien n'est appliqué et la migration se rejoue.
--
-- Rejouable : une règle déjà réécrite ne correspond plus au motif.
--
-- POUR LES RÈGLES À VENIR : écrire `(SELECT est_partenaire())` et `(SELECT auth.uid())`, jamais
-- l'appel nu.
set local lock_timeout = '5s';
do $$
declare
  r record; nq text; nc text; t text;
  motif text := '(?<!SELECT )(est_partenaire\(\)|auth\.uid\(\))';
begin
  for t in
    select distinct tablename from pg_policies
     where schemaname = 'public' and (coalesce(qual, '') ~ motif or coalesce(with_check, '') ~ motif)
     order by tablename
  loop
    execute format('lock table public.%I in access exclusive mode', t);
  end loop;
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ motif or coalesce(with_check, '') ~ motif)
  loop
    nq := regexp_replace(regexp_replace(r.qual, '(?<!SELECT )est_partenaire\(\)', '(SELECT est_partenaire())', 'g'), '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    nc := regexp_replace(regexp_replace(r.with_check, '(?<!SELECT )est_partenaire\(\)', '(SELECT est_partenaire())', 'g'), '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    execute format('alter policy %I on public.%I', r.policyname, r.tablename)
      || case when nq is not null then format(' using (%s)', nq) else '' end
      || case when nc is not null then format(' with check (%s)', nc) else '' end;
  end loop;
end $$;
