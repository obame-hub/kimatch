-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNE FAMILLE DE PLUS DANS LES NOUVEAUTÉS : LES CONNEXIONS API
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « bien différencier les fix de bug, les fonctionnalités, les connexions API
-- et le reste. »
--
-- Les cinq types posés le 05/09 couvrent trois de ces quatre familles :
--
--   fix de bug ........... CORRECTION
--   fonctionnalité ....... NOUVEAUTE
--   le reste ............. AMELIORATION, MAINTENANCE, ANNONCE
--   connexion API ........ manquant
--
-- ── POURQUOI CETTE FAMILLE MÉRITE LA SIENNE ──
--
-- Une connexion à un service extérieur ne se lit pas comme une fonctionnalité maison. Elle apporte
-- des données que KiWee ne saisit pas — les appels et leurs résumés depuis Allo, les scores
-- Ellisphere, les consommations Enedis, les signatures DocuSign — et elle peut tomber sans que
-- personne n'ait rien changé dans Kimatch. Quand un commercial ne voit plus ses appels, savoir que
-- c'est une intégration et non un écran lui dit tout de suite à qui demander.
--
-- Rangée juste après MAINTENANCE (ordre 15) : c'est de la plomberie visible, pas une nouveauté
-- d'usage. Couleur cyan, distincte des cinq autres.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

insert into types_publications (code, libelle, ordre, couleur, actif)
values ('INTEGRATION', 'Connexion API', 15, '#0891B2', true)
on conflict (code) do update
  set libelle = excluded.libelle,
      ordre   = excluded.ordre,
      couleur = excluded.couleur,
      actif   = true;

-- GARDE-FOU : les quatre familles doivent être couvertes après cette migration. Si l'un des codes
-- attendus manque, c'est que la table de référence a dérivé et que le script de publication
-- refusera des textes — mieux vaut le savoir ici.
do $$
declare
  manquants text;
begin
  select string_agg(c, ', ') into manquants
  from (values ('CORRECTION'), ('NOUVEAUTE'), ('INTEGRATION'), ('AMELIORATION')) as attendus(c)
  where not exists (select 1 from types_publications t where t.code = attendus.c and t.actif = true);

  if manquants is not null then
    raise exception 'Types de publication manquants : %. Rien n''est appliqué.', manquants;
  end if;

  raise notice 'Les quatre familles de nouveautés sont en place.';
end $$;

commit;
