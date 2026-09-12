-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR ÉCARTÉ DU PÉRIMÈTRE SE SOUVIENT DE L'AVOIR ÉTÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE MICHEL A DÉCRIT, APPEL DU 11/09/2026 ═══════════════════════════════════════════════
--
-- Convertir une opportunité, ce n'est pas cocher une case : c'est DÉCOUPER SON PÉRIMÈTRE en
-- autant de recommandations qu'il y aura de contrats.
--
--   « La question c'est : avec ce périmètre-là, j'ai besoin de combien de contrats ? Est-ce que
--   j'ai besoin d'un contrat et ça prend en compte tout le périmètre ? Est-ce que j'ai besoin de
--   deux contrats et ça divise les compteurs ? Est-ce que j'ai besoin d'un contrat pour chaque
--   compteur et ça me fait cinq recommandations ? »
--
-- Le découpage n'est pas un caprice d'outil : il suit la façon dont le client décide. « C'est
-- toujours lié à la décision qui finalise la décision pour générer les contrats. » Deux compteurs
-- se décident ensemble, les trois autres séparément — donc deux recommandations.
--
-- ══ POURQUOI IL FAUT UNE COLONNE, ET NON UN CALCUL ════════════════════════════════════════════
--
-- Le découpage se fait dans un dialogue, et il doit se terminer : chaque compteur du périmètre
-- finit soit DANS une recommandation, soit ÉCARTÉ. Michel : « ah bah finalement j'écarte ce
-- compteur […] en écartant, ça valide le fait que j'ai deux recommandations […] et l'autre qui a
-- été écarté, fin du gain. »
--
-- ÉCARTER EST DONC UNE DÉCISION, PAS UN OUBLI. Et une décision qu'on ne peut pas déduire : un
-- compteur absent de toute recommandation peut aussi bien être un compteur qu'on n'a pas encore
-- traité. Sans cette colonne, les deux cas sont indiscernables, et l'on ne saurait jamais dire si
-- une opportunité est convertie ou à moitié faite.
--
-- ══ CE QUE ÇA CORRIGE AU PASSAGE ══════════════════════════════════════════════════════════════
--
-- `statutDerive` disait jusqu'ici : « une opportunité qui a produit AU MOINS UNE recommandation a
-- abouti, quoi qu'il manque par ailleurs ». Sur un périmètre de quatre compteurs dont deux
-- seulement sont partis en recommandation, Kimatch affichait « Convertie » alors qu'il restait la
-- moitié du travail — et plus rien ne rappelait qu'il en restait.
--
-- Avec cette colonne, la règle devient vérifiable : convertie quand CHAQUE compteur du périmètre
-- est placé ou écarté.
--
-- ══ CE QU'ON N'AJOUTE PAS ═════════════════════════════════════════════════════════════════════
--
-- Aucune contrainte n'oblige à écarter avec un motif. Le motif est utile — « le client ne renégocie
-- pas celui-là » — mais l'exiger ferait renoncer à écarter, et le compteur resterait en suspens :
-- on aurait échangé une information manquante contre une opportunité bloquée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.opportunites_compteurs
  add column if not exists ecarte      boolean not null default false,
  add column if not exists motif_ecart text,
  add column if not exists date_ecart  timestamptz;

comment on column public.opportunites_compteurs.ecarte is
  'Le compteur est sorti du périmètre à la conversion : il n''ira dans aucune recommandation, et '
  'ce n''est pas un oubli. Sans cette colonne, « pas encore traité » et « volontairement laissé de '
  'côté » seraient indiscernables.';
comment on column public.opportunites_compteurs.motif_ecart is
  'Pourquoi il a été écarté, en clair. Facultatif : l''exiger ferait renoncer à écarter.';

-- ── L'ÉCART EST DATÉ PAR LA BASE, PAS PAR L'APPLICATION ───────────────────────────────────────
-- Une date posée côté navigateur suit l'horloge du poste, et l'on a déjà vu des écarts d'une heure
-- sur les dates d'interaction. Ici c'est un fait interne à Kimatch : la base sait quand.
create or replace function public.fn_dater_l_ecart_du_compteur()
returns trigger
language plpgsql
as $function$
begin
  if new.ecarte and not coalesce(old.ecarte, false) then
    new.date_ecart := now();
  elsif not new.ecarte then
    -- Remis dans le périmètre : la date d'écart n'a plus d'objet, et la laisser ferait croire à
    -- un écart encore en vigueur.
    new.date_ecart := null;
    new.motif_ecart := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_dater_l_ecart_du_compteur on public.opportunites_compteurs;
create trigger trg_dater_l_ecart_du_compteur
  before insert or update of ecarte on public.opportunites_compteurs
  for each row execute function public.fn_dater_l_ecart_du_compteur();

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON ÉCARTE POUR DE VRAI, PUIS ON ANNULE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que la colonne existe ne dirait rien du déclencheur, et c'est lui qui porte la règle.
-- On écarte donc un vrai compteur d'un vrai périmètre, on regarde ce que la base a écrit, on le
-- remet, on regarde à nouveau — puis on annule tout.
--
-- La leçon du 09/09 : une contrainte qui se vérifie sur le passé ne dit rien de l'avenir.
--
do $$
declare
  cible   uuid;
  quand   timestamptz;
  motif   text;
begin
  select id into cible from public.opportunites_compteurs limit 1;
  if cible is null then
    raise notice 'Garde-fou sauté : aucun périmètre en base.';
    return;
  end if;

  update public.opportunites_compteurs
     set ecarte = true, motif_ecart = 'essai du garde-fou'
   where id = cible;
  select date_ecart into quand from public.opportunites_compteurs where id = cible;
  if quand is null then
    raise exception 'Écarter un compteur ne date pas l''écart : le déclencheur ne s''applique pas.';
  end if;

  update public.opportunites_compteurs set ecarte = false where id = cible;
  select date_ecart, motif_ecart into quand, motif
    from public.opportunites_compteurs where id = cible;
  if quand is not null or motif is not null then
    raise exception 'Remettre un compteur dans le périmètre laisse une trace d''écart (date=%, motif=%).', quand, motif;
  end if;

  -- On défait l'essai lui-même : le compteur retrouve exactement son état d'avant.
  update public.opportunites_compteurs
     set ecarte = false, motif_ecart = null, date_ecart = null
   where id = cible;

  raise notice 'Garde-fou : écarter date l''écart, le remettre l''efface.';
end $$;

commit;
