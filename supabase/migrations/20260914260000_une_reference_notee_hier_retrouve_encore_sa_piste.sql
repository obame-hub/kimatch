-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE RÉFÉRENCE NOTÉE HIER RETROUVE ENCORE SA PISTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Suite immédiate de la renumérotation (migration 20260914250000), et sa condition d'acceptabilité.
--
-- ══ CE QUE LA RENUMÉROTATION VIENT DE CASSER ═════════════════════════════════════════════════
--
-- 5 144 pistes ont changé de référence il y a quelques minutes. `PST-2026-10102` est devenue
-- `PST-2026-3887`, `PST-2026-14255` est devenue `PST-2026-5138`.
--
-- Quelqu'un qui a noté l'ancienne sur un carnet, dans un mail ou dans un compte rendu tape
-- désormais un numéro qui ne désigne plus rien. La recherche répond « aucun résultat », et rien ne
-- lui dit que la piste existe pourtant.
--
-- C'ÉTAIT L'ARGUMENT POUR NE PAS RENUMÉROTER, ce matin, sur les pistes en doublon : « renuméroter
-- change des identifiants que des gens ont pu noter ». Naoëlle a tranché en connaissance de cause ;
-- il reste à faire que sa décision ne coûte rien à personne.
--
-- ══ POURQUOI UNE COLONNE ET PAS UNE RECHERCHE DANS L'HISTORIQUE ══════════════════════════════
--
-- `historique_modifications` porte déjà le lien ancien → nouveau : c'est pour cela qu'on l'a écrit.
-- Mais l'y chercher demanderait, à CHAQUE frappe de la barre de recherche, une jointure sur une
-- table qui grossit de toutes les modifications de tout le CRM. La barre interroge sept familles en
-- parallèle sur chaque lettre tapée ; lui ajouter ça la rendrait lente pour tout le monde, au nom
-- d'un cas qui s'éteindra en quelques semaines.
--
-- Une colonne sur la piste répond en même temps que le reste, sans jointure. L'historique garde la
-- trace complète et détaillée ; la colonne porte juste ce qu'il faut pour retrouver.
--
-- ELLE NE SE REMPLIT QU'UNE FOIS. Si l'on renumérotait à nouveau un jour — ce qu'on espère ne
-- jamais refaire — elle porterait l'avant-dernière et non la première. C'est assumé : le besoin est
-- « ce que les gens ont noté avant aujourd'hui », pas une généalogie complète, qui vit dans
-- l'historique.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.pistes
  add column if not exists reference_precedente text;

comment on column public.pistes.reference_precedente is
  'La référence que la piste portait avant la renumérotation chronologique du 14/09/2026. Sert à '
  'retrouver une piste par un numéro noté avant cette date — la recherche l''interroge comme la '
  'référence courante. L''historique des modifications garde la trace détaillée.';

create index if not exists idx_pistes_reference_precedente
  on public.pistes (reference_precedente) where reference_precedente is not null;

-- ── ON LA REMPLIT DEPUIS LA TRACE QU'ON VIENT D'ÉCRIRE ────────────────────────────────────────
-- C'est le seul endroit où l'ancienne référence existe encore : la colonne a été écrasée.
update public.pistes p
   set reference_precedente = h.ancienne_valeur
  from public.historique_modifications h
 where h.table_nom = 'pistes'
   and h.champ = 'reference'
   and h.origine like 'migration 20260914250000%'
   and h.ligne_id = p.id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UN NUMÉRO NOTÉ HIER DÉSIGNE ENCORE UNE PISTE, ET UNE SEULE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Deux choses à prouver. Que les 5 144 pistes renumérotées portent leur ancien numéro — sinon la
-- moitié des recherches resterait muette. Et qu'un ancien numéro ne désigne qu'UNE piste : s'il en
-- désignait deux, la recherche rendrait deux résultats et on ne saurait pas lequel est le bon.
--
do $$
declare
  remplies   integer;
  attendues  integer;
  ambigus    integer;
  collision  integer;
  exemple    record;
begin
  select count(*)::integer into attendues
    from public.historique_modifications
   where table_nom = 'pistes' and champ = 'reference'
     and origine like 'migration 20260914250000%';

  select count(*)::integer into remplies
    from public.pistes where reference_precedente is not null;

  if remplies <> attendues then
    raise exception '% pistes portent leur ancienne référence, pour % changements tracés.',
      remplies, attendues;
  end if;

  select count(*)::integer into ambigus from (
    select reference_precedente from public.pistes
     where reference_precedente is not null
     group by 1 having count(*) > 1
  ) x;
  if ambigus > 0 then
    raise exception '% ancienne(s) référence(s) désignent plusieurs pistes.', ambigus;
  end if;

  /* ET LE PIÈGE QU'ON N'AURAIT PAS VU : une ANCIENNE référence peut être la NOUVELLE d'une autre
     piste. `PST-2026-5126` est aujourd'hui la piste qui portait `PST-2026-002` — mais c'était
     peut-être déjà le numéro de quelqu'un d'autre hier. La recherche rendrait alors deux pistes
     pour un numéro, et il faut le savoir plutôt que le découvrir. */
  select count(*)::integer into collision
    from public.pistes a
    join public.pistes b on b.reference = a.reference_precedente and b.id <> a.id;

  select reference, reference_precedente into exemple
    from public.pistes where reference_precedente is not null
    order by reference limit 1;

  raise notice 'Garde-fou : % anciennes références retrouvables, toutes sans ambiguïté (ex. % ← %). % numéro(s) servent à deux pistes à des époques différentes — la recherche en rendra deux, c''est connu.',
    remplies, exemple.reference, exemple.reference_precedente, collision;
end $$;

commit;
