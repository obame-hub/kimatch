-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE APPELÉE SE SOUVIENT DE SON PREMIER APPEL
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Relevé le 23/09/2026 : `pistes.date_premier_appel` est LU par quatre écrans — le chemin de la
-- piste, la liste du vivier, la colonne « appelée » du cockpit — et ÉCRIT par personne. Aucun
-- fichier de `src/` ni de `api/` ne le renseigne.
--
-- ══ CE QUE ÇA COÛTE ══
--
-- Le seau « leads entrants » du plan du jour retient les pistes Google Ads dont `date_premier_appel`
-- est vide. Comme rien ne le remplit jamais, 78 pistes revenaient dans le plan TOUS LES JOURS, y
-- compris celles appelées dix fois. Le seau censé garantir qu'un lead entrant est traité vite
-- garantissait en réalité qu'on le retraite indéfiniment.
--
-- Et le chemin de la piste, sur sa fiche, montrait une étape « premier appel » qui ne se colorait
-- jamais — même quand l'appel était dans l'historique, juste en dessous.
--
-- ══ POURQUOI EN BASE, ET SUR `interactions` ══
--
-- L'appel arrive par trois portes : le sprint, la carte d'appel d'Allô, et le webhook qui consigne
-- les appels passés depuis l'application d'Allô sans passer par Kimatch. Les trois écrivent dans
-- `interactions` — c'est le seul endroit par lequel ils passent tous. Le poser côté application
-- aurait manqué la troisième porte, qui est justement celle qu'on ne contrôle pas.
--
-- ON N'ÉCRASE JAMAIS UNE DATE EXISTANTE : c'est le PREMIER appel, pas le dernier. Et
-- `date_premier_email` suit la même règle pour la même raison — le chemin de la piste lit les deux.
--
-- MESURÉ APRÈS APPLICATION : 78 pistes entrantes en boucle → 57, soit 21 qui tournaient alors
-- qu'elles avaient déjà été appelées. 1 197 pistes retrouvent leur date de premier appel, 576
-- celle de leur premier mail.

create or replace function public.fn_piste_date_premier_contact()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_code text;
begin
  if new.piste_id is null or not coalesce(new.actif, true) then return null; end if;

  select code into v_code from types_interactions where id = new.type_interaction_id;
  if v_code is null then return null; end if;

  if v_code = 'APPEL' then
    update pistes
       set date_premier_appel = new.date_interaction,
           date_modification  = now()
     where id = new.piste_id and date_premier_appel is null;
  elsif v_code = 'EMAIL' and coalesce(new.sens, 'SORTANT') = 'SORTANT' then
    update pistes
       set date_premier_email = new.date_interaction,
           date_modification  = now()
     where id = new.piste_id and date_premier_email is null;
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_piste_date_premier_contact on public.interactions;
create trigger trg_piste_date_premier_contact
  after insert on public.interactions
  for each row execute function public.fn_piste_date_premier_contact();

-- ── LE RATTRAPAGE : les appels et les mails déjà consignés font foi ──
-- Sans lui, les pistes entrantes continueraient de tourner jusqu'à ce qu'on les rappelle une fois
-- de plus — alors que leur premier appel est en base depuis des mois.
update pistes p
   set date_premier_appel = x.premier, date_modification = now()
  from (
    select i.piste_id, min(i.date_interaction) premier
      from interactions i
      join types_interactions t on t.id = i.type_interaction_id
     where i.actif and i.piste_id is not null and t.code = 'APPEL'
     group by i.piste_id
  ) x
 where p.id = x.piste_id and p.date_premier_appel is null;

update pistes p
   set date_premier_email = x.premier, date_modification = now()
  from (
    select i.piste_id, min(i.date_interaction) premier
      from interactions i
      join types_interactions t on t.id = i.type_interaction_id
     where i.actif and i.piste_id is not null and t.code = 'EMAIL'
       and coalesce(i.sens, 'SORTANT') = 'SORTANT'
     group by i.piste_id
  ) x
 where p.id = x.piste_id and p.date_premier_email is null;
