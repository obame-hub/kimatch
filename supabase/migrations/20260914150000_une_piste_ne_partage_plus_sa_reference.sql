-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE NE PARTAGE PLUS SA RÉFÉRENCE AVEC DIX AUTRES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Trouvé le 14/09/2026 en posant les références des mandats : la reprise a buté sur une contrainte
-- d'unicité, et le coupable était `lpad(numero, 3, '0')`.
--
--     lpad('107',  3, '0')  →  '107'
--     lpad('1070', 3, '0')  →  '107'    ⚠  lpad NE COMPLÈTE PAS SEULEMENT : IL TRONQUE
--
-- Passé 999, chaque référence perdait ses chiffres de poids fort. Relevé en production :
--
--     pistes         5 136 références,  998 distinctes   →  4 138 doublons
--     opportunites     110 références,  110 distinctes   →  aucun  (séquence à 115)
--     requetes         883 références,  883 distinctes   →  aucun  (874 viennent de Salesforce)
--
-- Le détail des pistes :
--
--       584 références ne désignent qu'une piste          → on n'y touche pas
--       413 références désignent ONZE pistes chacune      → 4 543 pistes
--         1 référence  en désigne neuf                    →     9 pistes
--
-- `PST-2026-107` ne désigne donc rien aujourd'hui : c'est onze pistes à la fois.
--
-- La fonction est réparée par la migration 20260914140000 (celle des mandats) — elle sert aux six
-- objets, on ne la corrige qu'une fois. Ici on répare le passé qu'elle a laissé.
--
-- ══ POURQUOI RENUMÉROTER LES ONZE, ET PAS DIX SUR ONZE ═══════════════════════════════════════
--
-- On pourrait garder la plus ancienne de chaque groupe et ne renuméroter que les dix autres : 413
-- références de plus seraient préservées. On ne le fait pas.
--
-- Une référence ambiguë rend fausse toute note qui la cite — et personne ne peut savoir laquelle
-- des onze pistes son auteur avait sous les yeux. En désigner une d'office ferait que la note a
-- l'air juste tout en pointant peut-être la mauvaise piste. En les renumérotant toutes, l'ancienne
-- référence ne correspond plus à rien : celui qui la cherche ne la trouve pas, et va regarder.
-- Ne rien trouver est désagréable ; trouver la mauvaise piste sans le savoir est pire.
--
-- Les 584 références déjà uniques, elles, désignent bien ce qu'elles prétendent désigner. On les
-- laisse : elles sont notées quelque part, et elles sont justes.
--
-- ══ ET L'INDEX QUI MANQUAIT DEPUIS TOUJOURS ══════════════════════════════════════════════════
--
-- `mandats` avait `mandats_reference_key` — c'est elle qui a fait échouer ma reprise et révélé
-- tout ceci. Aucune autre table n'en avait. Le défaut a donc pu tourner des mois sur les pistes
-- sans que rien ne proteste. On pose l'index manquant : la prochaine fois, ça casse tout de suite.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LES PISTES AMBIGUËS REÇOIVENT DES NUMÉROS NEUFS, DANS L'ORDRE DU TEMPS ────────────────────
-- Les nouveaux numéros partent au-dessus de la séquence : aucun ne peut heurter les 584 gardées,
-- qui sont toutes sous 1 000.
with ambigues as (
  select reference from public.pistes
   where reference is not null
   group by reference having count(*) > 1
),
a_renumeroter as (
  select p.id,
         row_number() over (order by p.date_creation, p.id) as rang
    from public.pistes p
    join ambigues a on a.reference = p.reference
)
update public.pistes p
   -- La séquence se lit en sous-requête scalaire et non dans le `from` : l'y joindre ferait tenter
   -- un verrou de ligne sur la séquence, que PostgreSQL refuse.
   set reference = 'PST-2026-'
     || ((select last_value from public.seq_reference_piste) + r.rang)::text
  from a_renumeroter r
 where r.id = p.id;

-- La séquence repart après le dernier numéro distribué, sinon le prochain doublon serait immédiat.
select setval(
  'public.seq_reference_piste',
  greatest(
    (select last_value from public.seq_reference_piste),
    (select max(substring(reference from '[0-9]+$')::bigint) from public.pistes where reference is not null)
  )
);

-- ── CE QUI AURAIT ÉVITÉ TOUT CELA ─────────────────────────────────────────────────────────────
create unique index if not exists idx_pistes_reference_unique
  on public.pistes (reference) where reference is not null;

-- Les cinq autres porteurs de référence n'ont pas de doublon aujourd'hui, mais rien ne les en
-- protégeait non plus. On ferme la porte partout pendant qu'elle est ouverte.
create unique index if not exists idx_opportunites_reference_unique
  on public.opportunites (reference) where reference is not null;
create unique index if not exists idx_requetes_reference_unique
  on public.requetes (reference) where reference is not null;
create unique index if not exists idx_listes_reference_unique
  on public.listes (reference) where reference is not null;
create unique index if not exists idx_remunerations_reference_unique
  on public.remunerations (reference) where reference is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : PLUS AUCUN DOUBLON, ET LA PISTE SUIVANTE N'EN CRÉE PAS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  total      integer;
  distinctes integer;
  gardees    integer;
  essai      uuid;
  ref        text;
  compte     uuid;
  statut     uuid;
begin
  select count(*)::integer, count(distinct reference)::integer into total, distinctes
    from public.pistes where reference is not null;
  if total <> distinctes then
    raise exception 'Il reste % doublon(s) de référence sur les pistes.', total - distinctes;
  end if;

  -- Les 584 justes devaient survivre : les renuméroter toutes aurait été une autre décision.
  select count(*)::integer into gardees
    from public.pistes where reference ~ '^PST-2026-[0-9]{3}$';
  if gardees <> 584 then
    raise exception 'On attendait 584 références courtes préservées, il y en a %.', gardees;
  end if;

  -- ET LA SUIVANTE. Vérifier le passé ne dit rien de l'avenir : on crée une vraie piste.
  select id into compte from public.comptes limit 1;
  select id into statut from public.statuts_pistes limit 1;
  insert into public.pistes (compte_id, statut_id) values (compte, statut)
    returning id, reference into essai, ref;
  if ref is null or ref !~ '^PST-[0-9]{4}-[0-9]{4,}$' then
    raise exception 'Une piste neuve reçoit « % » : la référence est encore tronquée.',
      coalesce(ref, 'rien');
  end if;
  delete from public.pistes where id = essai;

  raise notice 'Garde-fou : % pistes, % références toutes distinctes, 584 anciennes préservées, et une piste neuve reçoit « % ».',
    (select count(*) from public.pistes), distinctes, ref;
end $$;

commit;
