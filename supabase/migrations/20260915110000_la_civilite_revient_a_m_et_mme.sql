-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA CIVILITÉ REVIENT À « M. » ET « Mme »
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 15/09/2026 : « corrige Monsieur Madame à M. Mme, c'est mieux et plus compact ».
--
-- Hier (migration 20260914180000) j'ai rangé les civilités en « Monsieur » / « Madame », au motif
-- qu'un rapport ne devait pas compter quatre valeurs pour deux. Le rangement reste, la forme
-- change : c'est « M. » et « Mme » qui font foi.
--
-- ELLE A RAISON SUR LE FOND. Une civilité s'affiche collée au nom — « M. Jean DUPONT » — dans des
-- listes, des cartes et des colonnes de tableau où chaque caractère compte. « Monsieur Jean
-- DUPONT » pousse le nom hors de sa colonne sans rien apprendre. La forme abrégée est celle de
-- l'usage écrit français, et c'est celle qu'attendait déjà l'équipe : William a publié hier une
-- nouveauté intitulée « La civilité s'écrit "M." et "Mme" ».
--
-- ══ CE QUI NE CHANGE PAS ═════════════════════════════════════════════════════════════════════
--
-- Deux valeurs et deux seulement, appliquées à chaque écriture d'où qu'elle vienne. Le nom reste
-- en MAJUSCULES et le prénom en Capitale. Ce qui n'est pas reconnu — « Dr », « Me », « Maître » —
-- se garde tel quel plutôt que de s'effacer.
--
-- ══ CE QUE ÇA TOUCHE ═════════════════════════════════════════════════════════════════════════
--
--     contacts   1 856 civilités, toutes en « Monsieur » / « Madame » depuis hier
--     pistes     3 590 civilités, posées par l'import
--
-- Les pistes n'ont pas de déclencheur : leur civilité vient du script d'import, qui range déjà.
-- On reprend donc les deux tables ici, et le script suivra.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA RÈGLE, MÊME FORME QU'HIER, DEUX VALEURS DE MOINS ───────────────────────────────────────
create or replace function public.fn_formater_identite_contact()
returns trigger
language plpgsql
as $function$
begin
  /* Le nom EN MAJUSCULES : « Dupont », « DUPONT » et « dupont » doivent être la même ligne d'un
     rapport. On ne nullifie pas la chaîne vide — `prenom` et `nom` sont NOT NULL. */
  new.nom := upper(btrim(coalesce(new.nom, '')));

  -- `initcap` remet une majuscule après tout caractère non alphanumérique : « jean-pierre » →
  -- « Jean-Pierre ». Le `lower` d'abord, sans quoi « JEAN » resterait « JEAN ».
  new.prenom := initcap(lower(btrim(coalesce(new.prenom, ''))));

  /* « M. » ET « Mme », et non plus « Monsieur » / « Madame » (Naoëlle, 15/09/2026 : « c'est mieux
     et plus compact »). La civilité s'affiche collée au nom dans des listes et des colonnes de
     tableau ; la forme longue pousse le nom hors de sa colonne sans rien apprendre.

     Ce qu'on ne reconnaît pas se garde tel quel : « Dr », « Me », « Maître » existent, et les
     effacer perdrait une information juste au motif qu'elle sort de la liste. */
  new.civilite := nullif(btrim(new.civilite), '');
  if new.civilite is not null then
    case lower(replace(new.civilite, '.', ''))
      when 'm'            then new.civilite := 'M.';
      when 'mr'           then new.civilite := 'M.';
      when 'monsieur'     then new.civilite := 'M.';
      when 'mme'          then new.civilite := 'Mme';
      when 'mrs'          then new.civilite := 'Mme';
      when 'ms'           then new.civilite := 'Mme';
      when 'madame'       then new.civilite := 'Mme';
      when 'mlle'         then new.civilite := 'Mme';
      when 'mademoiselle' then new.civilite := 'Mme';
      else null;  -- on ne change rien
    end case;
  end if;

  return new;
end;
$function$;

-- ── LES 1 856 CONTACTS PASSENT À LA NOUVELLE FORME ────────────────────────────────────────────
-- Le déclencheur s'applique de lui-même : il suffit de les toucher.
update public.contacts set civilite = civilite
 where civilite in ('Monsieur', 'Madame');

-- ── ET LES 3 590 PISTES, QUI N'ONT PAS DE DÉCLENCHEUR ────────────────────────────────────────
update public.pistes
   set civilite = case civilite when 'Monsieur' then 'M.' when 'Madame' then 'Mme' else civilite end
 where civilite in ('Monsieur', 'Madame');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : DEUX VALEURS, ET LA PROCHAINE SAISIE LES RESPECTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  contacts_hors integer;
  pistes_hors   integer;
  compte_essai  uuid;
  essai         uuid;
  relu          record;
begin
  select count(*)::integer into contacts_hors
    from public.contacts where civilite in ('Monsieur', 'Madame');
  select count(*)::integer into pistes_hors
    from public.pistes where civilite in ('Monsieur', 'Madame');
  if contacts_hors > 0 or pistes_hors > 0 then
    raise exception '% contact(s) et % piste(s) gardent la forme longue.', contacts_hors, pistes_hors;
  end if;

  -- ET LA SUIVANTE. Vérifier le passé ne dit rien de l'avenir.
  select id into compte_essai from public.comptes limit 1;
  insert into public.contacts (compte_id, civilite, prenom, nom)
  values (compte_essai, 'Monsieur', 'jean-pierre', 'de la tour') returning id into essai;

  select * into relu from public.contacts where id = essai;
  if relu.civilite <> 'M.' then
    raise exception 'Une saisie « Monsieur » ressort « % » au lieu de « M. ».', relu.civilite;
  end if;
  if relu.nom <> 'DE LA TOUR' or relu.prenom <> 'Jean-Pierre' then
    raise exception 'Le nom ou le prénom ne sont plus mis en forme : « % / % ».', relu.prenom, relu.nom;
  end if;

  delete from public.contacts where id = essai;
  raise notice 'Garde-fou : « Monsieur » devient « M. », le nom et le prénom gardent leur forme, et % contacts portent une civilité.',
    (select count(*) from public.contacts where civilite is not null);
end $$;

commit;
