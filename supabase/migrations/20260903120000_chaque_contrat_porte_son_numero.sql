-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CHAQUE CONTRAT PORTE SON NUMÉRO
--
-- Naoëlle, 03/09/2026 : « il faut donner un numéro généré à nos contrats pour les retrouver
-- facilement. »
--
-- LE CONSTAT QUI L'AMÈNE : sur la fiche du contrat GAZ EUROPEEN de CABINET MOLINIER, il n'y a rien
-- à dire au téléphone. `reference_fournisseur` est nulle, `id_salesforce` aussi — c'est le cas de
-- tous les contrats nés dans Kimatch. On ne peut désigner ce contrat que par « celui de GAZ
-- EUROPEEN sur le Fontenay », ce qui cesse d'être unique dès le deuxième.
--
-- ══ LA COLONNE EXISTE DÉJÀ, ET ELLE EST VIDE ══
--
-- `contrats.reference` est là depuis l'origine, nulle sur les 1 603 lignes — posée pour un usage
-- jamais écrit. On la remplit plutôt que d'en créer une treizième : `reference_fournisseur` (1 587
-- lignes) porte la référence DU FOURNISSEUR, `id_salesforce` (1 484) celle de l'ancien outil.
-- Aucune des deux n'est la nôtre, et aucune des deux n'existe sur un contrat créé ici.
--
-- ══ LE FORMAT : CT-00001 ══
--
-- Court, unique, dictable au téléphone sans épeler. Cinq chiffres tiennent 99 999 contrats — le
-- portefeuille en compte 1 603 après huit ans.
--
-- PAS D'ANNÉE DANS LE NUMÉRO. « CT-2026-0001 » obligerait à savoir l'année pour retrouver un
-- contrat, alors que c'est justement ce qu'on cherche quand on ne sait plus. Et une numérotation
-- qui repart à zéro chaque janvier crée deux contrats « 0001 » qu'un moteur de recherche ne
-- départage pas.
--
-- L'ORDRE SUIT LA DATE DE CRÉATION, y compris pour la reprise : le numéro raconte alors quelque
-- chose — les petits numéros sont les vieux dossiers. Trier par référence revient à trier par
-- ancienneté, ce qui est le tri qu'on veut la plupart du temps.
--
-- ══ LA SÉQUENCE PLUTÔT QU'UN MAX(+1) ══
--
-- Deux contrats créés dans la même seconde par deux commerciaux prendraient le même `max + 1`.
-- Une séquence Postgres ne rend jamais deux fois la même valeur, même sous concurrence, et
-- l'unicité est en plus garantie par un index — une contrainte vaut mieux qu'une intention.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create sequence if not exists public.contrats_numero_seq as bigint start with 1;

-- ══ 1. LES 1 603 CONTRATS EXISTANTS, DANS L'ORDRE DE LEUR CRÉATION ══
--
-- `date_creation` d'abord, `id` pour départager ceux de la même milliseconde (la reprise Salesforce
-- en a inséré par lots) : sans ce second critère, l'ordre serait celui du disque, donc au hasard.
with numerotes as (
  select id, row_number() over (order by date_creation nulls last, id) as n
    from public.contrats
   where reference is null
)
update public.contrats c
   set reference = 'CT-' || lpad(numerotes.n::text, 5, '0')
  from numerotes
 where numerotes.id = c.id;

-- La séquence reprend après le dernier attribué, sinon le prochain contrat créé réutiliserait
-- CT-00001.
select setval('public.contrats_numero_seq', coalesce((
  select max(substring(reference from 4)::bigint) from public.contrats where reference like 'CT-%'
), 0) + 1, false);

-- ══ 2. LES CONTRATS À VENIR SE NUMÉROTENT SEULS ══
--
-- Un défaut de colonne plutôt qu'un déclencheur : c'est le mécanisme le plus simple qui fasse le
-- travail, et il ne peut pas être contourné par un `insert` qui oublierait la colonne. Un import
-- qui apporterait sa propre référence la garde — le défaut ne s'applique qu'à l'absence.
alter table public.contrats
  alter column reference set default 'CT-' || lpad(nextval('public.contrats_numero_seq')::text, 5, '0');

-- ══ 3. DEUX CONTRATS NE PEUVENT PAS PORTER LE MÊME NUMÉRO ══
--
-- Index UNIQUE et non contrainte de colonne : il laisse passer plusieurs `null`, ce qui autorise
-- une ligne créée par un chemin qui ne passerait pas par le défaut, sans casser l'unicité de ce
-- qui est numéroté.
create unique index if not exists contrats_reference_unique
  on public.contrats (reference)
  where reference is not null;

comment on column public.contrats.reference is
  'Le numéro du contrat chez KiWee, au format CT-00001. Attribué automatiquement à la création, unique, indépendant de `reference_fournisseur` (celle du fournisseur) et d''`id_salesforce` (celle de l''ancien outil). Demandé par Naoëlle le 03/09/2026 pour pouvoir désigner un contrat au téléphone.';

-- ── Les garde-fous ──
do $$
declare
  v_sans integer;
  v_doublons integer;
  v_premier text;
  v_dernier text;
begin
  select count(*) into v_sans from public.contrats where reference is null;
  if v_sans > 0 then
    raise exception '% contrats sont restés sans numéro', v_sans;
  end if;

  select count(*) into v_doublons from (
    select reference from public.contrats group by reference having count(*) > 1
  ) t;
  if v_doublons > 0 then
    raise exception '% numéros sont attribués deux fois', v_doublons;
  end if;

  select min(reference), max(reference) into v_premier, v_dernier from public.contrats;
  raise notice 'Contrats numérotés de % à %', v_premier, v_dernier;
end;
$$;

commit;
