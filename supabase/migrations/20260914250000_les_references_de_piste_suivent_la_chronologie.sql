-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES RÉFÉRENCES DE PISTE SUIVENT ENFIN LA CHRONOLOGIE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : « oui renumérote les références dans l'ordre chronologique ».
--
-- ══ POURQUOI ELLES SONT FAUSSES ══════════════════════════════════════════════════════════════
--
-- Les références PST ont été attribuées ce matin (migration 20260914150000) dans l'ordre de
-- `date_creation` — qui valait alors le 01/09/2026 pour les 5 139 pistes reprises. Un tri sur une
-- colonne où tout le monde porte la même seconde rend un ordre arbitraire : `PST-2026-14243` peut
-- désigner une piste plus ancienne que `PST-2026-10102`.
--
-- Et 454 références annoncent 2026 pour des pistes créées en 2025 : l'année venait de `now()` au
-- moment de l'attribution, pas de la piste.
--
-- Depuis la bascule du 14/09 (migration 20260914240000), `date_creation` dit vrai. On peut donc
-- renuméroter pour de bon.
--
-- ══ LE FORMAT, IDENTIQUE À CELUI DES MANDATS ═════════════════════════════════════════════════
--
--     PST-2025-001 … PST-2025-454     puis     PST-2026-455 … PST-2026-5145
--
-- L'ANNÉE EST CELLE DE LA PISTE, le numéro est GLOBAL et ne se remet pas à zéro. C'est exactement
-- ce qui a été décidé pour les mandats le matin même, et pour la même raison : deux objets ne
-- peuvent jamais porter le même numéro, même si l'on se trompe d'année.
--
-- ══ DEUX PASSES, PARCE QU'UN INDEX UNIQUE NE SE PERMUTE PAS ══════════════════════════════════
--
-- `idx_pistes_reference_unique` est vérifié LIGNE PAR LIGNE, pas en fin d'instruction. Renuméroter
-- est une permutation : en cours de route, une piste recevrait une référence encore portée par une
-- autre, et la base refuserait — alors que l'état final est parfaitement unique.
--
-- On passe donc d'abord par une valeur temporaire tirée de l'identifiant, unique par construction,
-- puis on écrit la vraie. C'est le prix d'un index qui fait son travail.
--
-- ══ L'HISTORIQUE GARDE LE LIEN ANCIEN → NOUVEAU, ET C'EST TOUT CE QUI COMPTE ═════════════════
--
-- Quelqu'un qui a noté `PST-2026-107` doit pouvoir retrouver sa piste. `fn_audit_trace` écrirait
-- DEUX lignes par piste — l'ancienne vers la temporaire, puis la temporaire vers la nouvelle — et
-- la première serait du bruit, la seconde mensongère (elle dirait que la référence venait de
-- `TMP-…`). On le coupe le temps des deux passes, et on écrit nous-mêmes UNE ligne par piste :
-- l'ancienne référence, la nouvelle, et le nom de cette migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── CE QU'ELLES VALAIENT AVANT, MIS DE CÔTÉ LE TEMPS DE L'OPÉRATION ───────────────────────────
create temporary table avant_renumerotation on commit drop as
  select id, reference as ancienne from public.pistes where reference is not null;

-- ── LE NOUVEAU NUMÉRO, DANS L'ORDRE DU TEMPS ──────────────────────────────────────────────────
create temporary table apres_renumerotation on commit drop as
  select id,
         'PST-' || to_char(date_creation, 'YYYY') || '-'
           || lpad(
                row_number() over (order by date_creation, id)::text,
                -- `greatest(3, length(...))` : trois chiffres au minimum et JAMAIS de troncature.
                -- C'est la leçon du matin — `lpad(x, 3)` coupait ce qui dépassait 999 et avait
                -- donné 4 138 pistes partageant 998 références.
                greatest(3, length(row_number() over (order by date_creation, id)::text)),
                '0')
           as nouvelle
    from public.pistes;

/* L'AUDIT SE TAIT PENDANT LA MÉCANIQUE. Il écrirait deux lignes par piste, dont une qui affirmerait
   que la référence venait de `TMP-…`. On écrit nous-mêmes la seule qui soit vraie, plus bas. */
alter table public.pistes disable trigger trg_audit_trace;

-- Passe 1 : une valeur temporaire unique par construction, pour libérer toutes les anciennes.
update public.pistes set reference = 'TMP-' || id::text;

-- Passe 2 : la vraie.
update public.pistes p set reference = a.nouvelle
  from apres_renumerotation a where a.id = p.id;

alter table public.pistes enable trigger trg_audit_trace;

-- ── LA TRACE : UNE LIGNE PAR PISTE, DE L'ANCIENNE VERS LA NOUVELLE ────────────────────────────
insert into public.historique_modifications
  (table_nom, ligne_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_id, origine)
select 'pistes', v.id, 'reference', v.ancienne, a.nouvelle, null,
       coalesce(nullif(current_setting('kimatch.origine', true), ''), 'migration')
  from avant_renumerotation v
  join apres_renumerotation a on a.id = v.id
 where v.ancienne is distinct from a.nouvelle;

-- La séquence repart après le dernier numéro attribué, sinon la prochaine piste heurterait l'index.
select setval('public.seq_reference_piste', (select count(*) from public.pistes));

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : L'ORDRE DES RÉFÉRENCES EST CELUI DU TEMPS, ET LA PISTE SUIVANTE LE RESPECTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Compter les références ne prouverait rien : elles étaient déjà 5 145 et déjà distinctes. Ce qu'on
-- veut savoir, c'est qu'elles sont désormais DANS L'ORDRE — donc on compare le rang de la référence
-- au rang de la date, ligne à ligne, et le moindre écart arrête tout.
--
do $$
declare
  total       integer;
  distinctes  integer;
  desordre    integer;
  annee_fausse integer;
  traces      integer;
  essai       uuid;
  ref_neuve   text;
  statut      uuid;
  compte      uuid;
begin
  select count(*)::integer, count(distinct reference)::integer into total, distinctes
    from public.pistes;
  if total <> distinctes then
    raise exception '% références pour % pistes : il y a des doublons.', distinctes, total;
  end if;

  -- L'ANNÉE DE LA RÉFÉRENCE EST CELLE DE LA PISTE. 454 l'annonçaient à tort avant cette migration.
  select count(*)::integer into annee_fausse
    from public.pistes
   where substring(reference from 5 for 4) <> to_char(date_creation, 'YYYY');
  if annee_fausse > 0 then
    raise exception '% référence(s) annoncent une année qui n''est pas celle de la piste.', annee_fausse;
  end if;

  -- LE CŒUR DU SUJET : rang par référence = rang par date.
  select count(*)::integer into desordre from (
    select row_number() over (order by date_creation, id) as par_date,
           row_number() over (order by substring(reference from '[0-9]+$')::bigint) as par_reference
      from public.pistes
  ) x where par_date <> par_reference;
  if desordre > 0 then
    raise exception '% piste(s) dont la référence ne suit pas la chronologie.', desordre;
  end if;

  select count(*)::integer into traces
    from public.historique_modifications
   where table_nom = 'pistes' and champ = 'reference'
     and origine = coalesce(nullif(current_setting('kimatch.origine', true), ''), 'migration');
  if traces = 0 then
    raise exception 'Aucune trace du changement : personne ne pourra retrouver une référence notée.';
  end if;

  -- ET LA SUIVANTE. Vérifier le passé ne dit rien de l'avenir : on crée une vraie piste.
  select id into compte from public.comptes limit 1;
  select id into statut from public.statuts_pistes limit 1;
  insert into public.pistes (compte_id, statut_id) values (compte, statut)
    returning reference into ref_neuve;
  if ref_neuve is null or substring(ref_neuve from '[0-9]+$')::bigint <= total then
    raise exception 'Une piste neuve reçoit « % », qui ne vient pas après les % existantes.',
      coalesce(ref_neuve, 'rien'), total;
  end if;
  delete from public.pistes where reference = ref_neuve;

  raise notice 'Garde-fou : % références dans l''ordre du temps, % traces écrites, et la suivante reçoit « % ».',
    total, traces, ref_neuve;
end $$;

commit;
