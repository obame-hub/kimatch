-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN FIL SANS AUTEUR SE CHERCHE DANS TOUTES LES BOÎTES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Relevé du 20/09/2026, la traduction des fils repris de Salesforce est arrêtée : 982 fils sur
-- 1 082 sont traduits, et les 100 derniers ne bougeront plus jamais.
--
--   · 72 d'entre eux N'ONT AUCUN AUTEUR — ni auteur, ni propriétaire, ni créateur, les trois
--     colonnes sont vides. Or `api/gmail/_fils.ts` cherche « les fils de cette personne », parce
--     qu'un Message-ID ne se trouve que dans la boîte de qui a envoyé le message. Sans personne à
--     qui les rattacher, ils ne sont jamais tentés. Ils ne le seront jamais.
--   · 28 appartiennent à deux personnes et sont retentés À CHAQUE PASSAGE HORAIRE depuis le
--     17/09 sans succès. Gmail ne les trouve pas dans cette boîte-là — ce qui ne dit rien des huit
--     autres, qu'on n'interroge pas.
--
-- ══ CE QUE CETTE TABLE CHANGE ════════════════════════════════════════════════════════════════
--
-- Un fil non traduit se cherche désormais dans CHAQUE boîte connectée, et cette table retient les
-- couples déjà essayés. Elle sert deux fins opposées, et c'est pour ça qu'elle existe :
--
--   · NE JAMAIS REFAIRE DEUX FOIS LA MÊME RECHERCHE. Sans mémoire, chercher ailleurs que chez
--     l'auteur multiplierait par neuf le coût de chaque passage, indéfiniment.
--   · S'ÉTEINDRE. Le jour où chaque fil restant a été cherché dans chaque boîte, il n'y a plus
--     rien d'éligible et la traduction ne coûte plus que deux requêtes par personne et par heure.
--     C'était la promesse de départ ; sans cette table elle n'était pas tenable, puisqu'un fil
--     introuvable revenait éternellement en tête de file et empêchait les suivants de passer.
--
-- ══ POURQUOI PAS UN COMPTEUR DE TENTATIVES SUR `interactions` ════════════════════════════════
--
-- Une colonne « déjà essayé » sur l'interaction aurait été plus simple d'un fichier. Elle n'aurait
-- pas su dire CHEZ QUI, qui est précisément l'information qui manque : neuf boîtes, un seul
-- compteur, on ne saurait pas laquelle il reste à interroger. La clé est le couple, pas le fil.
--
-- Et une colonne de plus sur `interactions` se serait invitée dans l'audit de chaque mise à jour
-- d'échange, pour une donnée qui n'intéresse aucun commercial.
--
-- ══ PERSONNE NE LA LIT ═══════════════════════════════════════════════════════════════════════
--
-- RLS active, aucune politique : c'est de la mécanique de tâche planifiée, écrite et relue par la
-- clé de service seule. Aucun écran n'a à la connaître.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists gmail_fils_cherches (
  fil         text not null,
  profil_id   uuid not null references profils(id) on delete cascade,
  cherche_le  timestamptz not null default clock_timestamp(),
  trouve      boolean not null default false,
  primary key (fil, profil_id)
);

comment on table gmail_fils_cherches is
  'Les couples (Message-ID repris de Salesforce, boîte interrogée) déjà cherchés chez Gmail. '
  'Empêche de refaire une recherche infructueuse, et permet à la traduction de s''arrêter le jour '
  'où chaque fil restant a été cherché dans chaque boîte.';

comment on column gmail_fils_cherches.fil is
  'Le Message-ID RFC tel qu''il est dans interactions.fil_discussion, chevrons compris.';

comment on column gmail_fils_cherches.trouve is
  'Vrai quand la recherche a rendu une conversation. Sert à relire après coup où les fils ont été '
  'retrouvés ; la traduction, elle, ne regarde que la présence de la ligne.';

alter table gmail_fils_cherches enable row level security;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON NE CHERCHE PAS DEUX FOIS LE MÊME FIL DANS LA MÊME BOÎTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- C'est toute la valeur de la table : sans ce rejet, une recherche infructueuse se referait à
-- chaque passage horaire et rien ne s'éteindrait jamais. On vérifie aussi que le MÊME fil reste
-- acceptable dans une AUTRE boîte — l'erreur inverse, une clé trop large, rendrait la table
-- inutile en interdisant justement ce qu'on vient d'ajouter.
--
do $$
declare
  p1 uuid;
  p2 uuid;
  rejete boolean := false;
begin
  select id into p1 from public.profils order by id limit 1;
  select id into p2 from public.profils where id <> p1 order by id limit 1;
  if p1 is null or p2 is null then
    raise notice 'Moins de deux profils en base — garde-fou sauté.';
    return;
  end if;

  insert into public.gmail_fils_cherches (fil, profil_id)
    values ('<garde-fou@kimatch.test>', p1);

  begin
    insert into public.gmail_fils_cherches (fil, profil_id)
      values ('<garde-fou@kimatch.test>', p1);
  exception when unique_violation then
    rejete := true;
  end;

  -- Le même fil dans une autre boîte : doit passer, c'est le cas qu'on vient d'ouvrir.
  insert into public.gmail_fils_cherches (fil, profil_id)
    values ('<garde-fou@kimatch.test>', p2);

  delete from public.gmail_fils_cherches where fil = '<garde-fou@kimatch.test>';

  if not rejete then
    raise exception 'Le même fil peut être cherché deux fois dans la même boîte : la traduction ne s''arrêtera jamais.';
  end if;

  raise notice 'Garde-fou : une recherche ne se refait pas, et les autres boîtes restent ouvertes.';
end $$;

commit;
