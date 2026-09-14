-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN MANDAT PORTE UNE RÉFÉRENCE, COMME LES AUTRES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : « il faut que les mandats aient des références. »
--
-- ══ CE QUE J'AI TROUVÉ EN SORTANT LA LISTE DES RATTACHEMENTS CROISÉS ═════════════════════════
--
-- Le tableau destiné à William affichait « — » dans la colonne Mandat, sur les 39 lignes. Relevé :
-- **1 483 mandats en base, ZÉRO référence.** La colonne existe depuis l'origine et n'a jamais été
-- remplie.
--
-- Conséquence pratique : un mandat ne se désigne que par le nom de son client. Deux mandats du même
-- syndic sont indiscernables à l'oral comme à l'écrit, et la recherche globale, qui interroge
-- pourtant `mandats.reference`, ne pouvait rien trouver.
--
-- ══ ON ÉTEND LA MÉCANIQUE EXISTANTE, ON N'EN CRÉE PAS UNE SECONDE ════════════════════════════
--
-- `fn_reference_chaine` pose déjà les références de cinq objets — OPP-2026-008, PST-2026-393 — avec
-- une séquence chacun. Écrire une variante pour les mandats donnerait deux formats à maintenir et
-- deux endroits où corriger le jour où le format change. On ajoute donc une ligne au `case`.
--
-- `MDT`, et non `MAN` : trois lettres qui ne se lisent pas comme un mot français, sur le modèle de
-- `PST` pour les pistes.
--
-- ══ LA REPRISE DES 1 483 EXISTANTS, ET SON SEUL VRAI CHOIX ═══════════════════════════════════
--
-- L'ANNÉE EST CELLE DU MANDAT, PAS CELLE D'AUJOURD'HUI. Les mandats s'étalent d'octobre 2024 à
-- aujourd'hui : 8 avant 2025, 870 en 2025, 605 en 2026. Les numéroter tous en « 2026 » parce que
-- c'est le jour où l'on exécute cette migration effacerait l'information la plus utile de la
-- référence — quand le mandat a été signé.
--
-- L'ordre est chronologique : le plus ancien prend le numéro 1. Une référence dont l'ordre suit le
-- temps se compare d'un coup d'œil ; un ordre arbitraire en ferait un simple identifiant de plus.
--
-- Le numéro, lui, est GLOBAL et ne se remet pas à zéro chaque année — c'est le comportement des
-- cinq autres objets (`nextval` sur une séquence unique), et deux mandats ne peuvent donc jamais
-- porter le même numéro même si l'on se trompe d'année.
--
-- ══ ET EN CHEMIN, UN DÉFAUT QUI TOURNE DEPUIS L'ORIGINE ══════════════════════════════════════
--
-- La reprise a échoué du premier coup sur `mandats_reference_key` — une contrainte d'unicité qui
-- existait déjà. En cherchant le doublon, j'ai trouvé ceci :
--
--     lpad('7',    3, '0')  →  '007'    ce qu'on attend
--     lpad('107',  3, '0')  →  '107'    ce qu'on attend
--     lpad('1070', 3, '0')  →  '107'    ⚠
--     lpad('12345',3, '0')  →  '123'    ⚠
--
-- `lpad` NE FAIT PAS QUE COMPLÉTER : IL TRONQUE. Passé 999, la référence perd ses chiffres de
-- poids faible, et dix objets consécutifs reçoivent la même.
--
-- Ce n'est pas théorique. Relevé du 14/09/2026 :
--
--     pistes          5 136 références,  998 distinctes  →  4 138 DOUBLONS
--     opportunites      110 références,  110 distinctes  →  aucun
--     requetes          883 références,  883 distinctes  →  aucun
--
-- `PST-2026-107` désigne aujourd'hui ONZE pistes différentes. Les opportunités et les requêtes sont
-- intactes parce qu'elles n'ont pas encore passé le millier — elles y viendront.
--
-- On remplace donc le `lpad` par un remplissage qui ne coupe jamais : trois chiffres au minimum,
-- davantage si le nombre l'exige. `MDT-2026-1484` est plus laid que `MDT-2026-107`, et infiniment
-- plus utile puisqu'il ne désigne qu'un seul mandat.
--
-- LA RÉPARATION DES 4 138 PISTES N'EST PAS DANS CETTE MIGRATION. Renuméroter 5 136 identifiants
-- déjà affichés est une décision qui appartient à Naoëlle, pas un effet de bord d'une demande sur
-- les mandats. Le défaut est arrêté pour l'avenir ; le passé attend son feu vert.
--
-- ══ ET UN INDEX UNIQUE, PARCE QU'UNE RÉFÉRENCE QUI SE RÉPÈTE NE SERT À RIEN ═══════════════════
--
-- Une séquence ne produit pas de doublon, mais rien n'empêche quelqu'un d'écrire une référence à la
-- main — le déclencheur respecte d'ailleurs une valeur déjà fournie. `mandats_reference_key` existe
-- déjà et suffit : on n'en ajoute pas une seconde.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA SÉQUENCE, DU MÊME MOULE QUE LES CINQ AUTRES ────────────────────────────────────────────
create sequence if not exists public.seq_reference_mandat;

-- ── LE MANDAT REJOINT LA CHAÎNE ───────────────────────────────────────────────────────────────
create or replace function public.fn_reference_chaine()
returns trigger
language plpgsql
as $function$
declare
  prefixe text;
  sequence_nom text;
  numero text;
begin
  if new.reference is not null and btrim(new.reference) <> '' then
    return new;
  end if;

  case TG_TABLE_NAME
    when 'opportunites'  then prefixe := 'OPP'; sequence_nom := 'seq_reference_opportunite';
    when 'pistes'        then prefixe := 'PST'; sequence_nom := 'seq_reference_piste';
    when 'listes'        then prefixe := 'LST'; sequence_nom := 'seq_reference_liste';
    when 'requetes'      then prefixe := 'REQ'; sequence_nom := 'seq_reference_requete';
    when 'remunerations' then prefixe := 'REM'; sequence_nom := 'seq_reference_remuneration';
    -- Ajouté le 14/09/2026 : 1 483 mandats vivaient sans référence.
    when 'mandats'       then prefixe := 'MDT'; sequence_nom := 'seq_reference_mandat';
    else return new;
  end case;

  -- `greatest(3, length(...))` : trois chiffres au minimum, et JAMAIS de troncature. `lpad(x, 3)`
  -- coupait tout ce qui dépassait 999 — d'où 4 138 pistes partageant 998 références.
  numero := nextval('public.' || sequence_nom)::text;
  new.reference := prefixe || '-' || to_char(now(), 'YYYY') || '-'
    || lpad(numero, greatest(3, length(numero)), '0');
  return new;
end;
$function$;

drop trigger if exists trg_reference_chaine on public.mandats;
create trigger trg_reference_chaine
  before insert on public.mandats
  for each row execute function public.fn_reference_chaine();

-- ── LA REPRISE : CHRONOLOGIQUE, ET CHACUN DANS SON ANNÉE ──────────────────────────────────────
with numerotes as (
  select id,
         to_char(date_creation, 'YYYY') as annee,
         row_number() over (order by date_creation, id) as rang
  from public.mandats
  where reference is null
)
update public.mandats m
   set reference = 'MDT-' || n.annee || '-' || lpad(n.rang::text, greatest(3, length(n.rang::text)), '0')
  from numerotes n
 where n.id = m.id;

-- La séquence reprend APRÈS le dernier numéro attribué : sans cela, le prochain mandat créé
-- porterait le numéro 1 et heurterait l'index unique posé juste en dessous.
select setval('public.seq_reference_mandat', greatest((select count(*) from public.mandats), 1));

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UN MANDAT NEUF REÇOIT SA RÉFÉRENCE, ET ELLE NE HEURTE RIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que les 1 483 sont remplis ne dirait rien du 1 484e. C'est la leçon écrite le 09/09 :
-- une contrainte qui se vérifie sur le passé ne dit rien de l'avenir. On crée donc un vrai mandat,
-- on regarde ce que la base lui donne, et on l'efface.
--
do $$
declare
  compte_essai uuid;
  essai        uuid;
  ref          text;
  restants     integer;
  distinctes   integer;
  total        integer;
  reprise      bigint;
  ref_neuf     text;
begin
  select count(*)::integer into restants from public.mandats where reference is null;
  if restants <> 0 then
    raise exception 'La reprise a laissé % mandat(s) sans référence.', restants;
  end if;

  -- Deux mandats qui partagent une référence, c'est le défaut qu'on est en train de corriger : on
  -- refuse de l'introduire ici au moment même où on le répare ailleurs.
  select count(*)::integer, count(distinct reference)::integer into total, distinctes
    from public.mandats;
  if distinctes <> total then
    raise exception 'La reprise a produit % références pour % mandats : % doublon(s).',
      distinctes, total, total - distinctes;
  end if;

  select id into compte_essai from public.comptes limit 1;
  insert into public.mandats (compte_id) values (compte_essai) returning id, reference into essai, ref;

  if ref is null or ref !~ '^MDT-[0-9]{4}-[0-9]{3,}$' then
    raise exception 'Un mandat neuf reçoit « % » : le déclencheur ne s''applique pas.', coalesce(ref, 'rien');
  end if;

  ref_neuf := ref;
  delete from public.mandats where id = essai;

  -- ── ET LA PREUVE QUE LE MILLIER NE COUPE PLUS ───────────────────────────────────────────────
  -- Vérifier que le 1 484e mandat s'appelle « MDT-2026-1484 » ne dirait rien du 10 000e. On pousse
  -- donc la séquence jusqu'au seuil qui cassait, on regarde, puis on la remet où elle était.
  reprise := (select last_value from public.seq_reference_mandat);
  perform setval('public.seq_reference_mandat', 9999);
  insert into public.mandats (compte_id) values (compte_essai) returning id, reference into essai, ref;
  if right(ref, 5) <> '10000' then
    raise exception 'Passé 9 999, un mandat reçoit « % » : la référence est encore tronquée.', ref;
  end if;
  delete from public.mandats where id = essai;
  perform setval('public.seq_reference_mandat', reprise);

  raise notice 'Garde-fou : % mandats repris et tous distincts ; un mandat neuf reçoit « % », et le 10 000e « % » sans rien perdre.',
    (select count(*) from public.mandats), ref_neuf, ref;
end $$;

commit;
