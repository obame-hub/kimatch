-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DEUX RÉFÉRENTS PARTENAIRE QUI NE SE CONFONDENT PAS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- En ajoutant `comptes.contact_partenaire_id` ce jour, j'ai failli reprendre une colonne qui
-- existait déjà : `comptes_partenaires.contact_referent_id`. Les deux nomment « un contact chez le
-- partenaire », et rien ne disait en quoi elles diffèrent.
--
-- ELLES NE SONT PAS PORTÉES PAR LE MÊME COMPTE, et c'est toute la différence :
--
--     comptes_partenaires.contact_referent_id   porté par LE COMPTE PARTENAIRE
--                                               -> l'interlocuteur habituel de ce partenaire,
--                                                  celui qu'on appelle pour parler du partenariat
--
--     comptes.contact_partenaire_id             porté par LE COMPTE CLIENT apporté
--                                               -> qui suit CE dossier-là chez le partenaire
--
-- Un partenaire a un référent général et peut confier chaque affaire à quelqu'un d'autre : la
-- seconde ne remplace pas la première, elle descend d'un cran. Les fusionner obligerait à choisir
-- entre « on ne sait plus qui suit ce dossier » et « on écrase l'interlocuteur habituel ».
--
-- `comptes_partenaires` est vide (0 ligne au 25/09/2026) — on ne corrige donc aucune donnée, on
-- écrit seulement ce que la prochaine personne aurait dû trouver aujourd'hui.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

comment on column comptes_partenaires.contact_referent_id is
  'L''interlocuteur habituel CHEZ CE PARTENAIRE, pour le partenariat lui-même. À ne pas confondre '
  'avec `comptes.contact_partenaire_id`, qui est porté par un compte CLIENT apporté et désigne qui '
  'suit CE dossier-là. Un partenaire a un référent général et peut confier chaque affaire à '
  'quelqu''un d''autre.';

comment on table comptes_partenaires is
  'Le volet partenariat d''un compte de type PARTENAIRE : nature de l''accord, rémunération, '
  'interlocuteur habituel. Un compte apporté PAR ce partenaire porte, lui, '
  '`apporteur_partenaire_id` et `contact_partenaire_id`.';

-- ══ LE GARDE-FOU : LES DEUX COLONNES EXISTENT ET SONT DOCUMENTÉES ═══════════════════════════
--
-- Une migration de documentation peut se tromper de nom de colonne sans que rien ne le signale :
-- `comment on` échoue si la colonne n'existe pas, mais réussit silencieusement sur la mauvaise.
-- On vérifie donc que les deux portent bien un commentaire, et qu'il parle de l'autre.
do $$
declare
  v_a text;
  v_b text;
begin
  select d.description into v_a
    from pg_description d join pg_attribute a on a.attrelid = d.objoid and a.attnum = d.objsubid
   where d.objoid = 'comptes_partenaires'::regclass and a.attname = 'contact_referent_id';

  select d.description into v_b
    from pg_description d join pg_attribute a on a.attrelid = d.objoid and a.attnum = d.objsubid
   where d.objoid = 'comptes'::regclass and a.attname = 'contact_partenaire_id';

  if v_a is null then
    raise exception 'comptes_partenaires.contact_referent_id n''est toujours pas documentée.';
  end if;
  if v_b is null then
    raise exception 'comptes.contact_partenaire_id n''est pas documentée : la migration 20260925163000 a-t-elle été appliquée ?';
  end if;
  if position('contact_partenaire_id' in v_a) = 0 then
    raise exception 'Le commentaire ne renvoie pas à l''autre colonne : la confusion reste possible.';
  end if;

  raise notice 'Garde-fou : les deux colonnes sont documentées, et chacune renvoie à l''autre.';
end $$;

commit;
