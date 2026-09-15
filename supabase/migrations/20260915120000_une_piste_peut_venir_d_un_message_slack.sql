-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE PEUT VENIR D'UN MESSAGE SLACK, ET NE S'Y CRÉER QU'UNE FOIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 15/09/2026 : « quand un lead arrive sur ce canal, il faut une automatisation qui crée
-- une piste sur Kimatch ».
--
-- ══ CE QUI EXISTE AUJOURD'HUI ════════════════════════════════════════════════════════════════
--
-- Le formulaire de kiwee-energie.fr appelle une fonction Supabase `google-sheets-lead`, qui poste
-- dans le canal #leads sous le nom « Kiwee Énergie » et alimente Salesforce par une feuille Google.
-- Kimatch, lui, ne recevait rien : les 77 pistes de cette source y sont arrivées par l'import.
--
-- ══ POURQUOI UNE COLONNE D'IDENTIFIANT, ET NON UN SIMPLE CONTRÔLE DE DOUBLON ════════════════
--
-- Un workflow Slack peut rejouer un message — relance manuelle, nouvelle tentative après une
-- erreur réseau, ou simplement quelqu'un qui reteste. Sans clé, le même lead entrerait deux fois,
-- et on s'en apercevrait en appelant deux fois le même prospect.
--
-- Comparer nom + société + e-mail ne suffirait pas : deux gestionnaires d'un même cabinet peuvent
-- remplir le formulaire à un jour d'intervalle, et ce sont bien deux pistes. Seul l'identifiant du
-- MESSAGE distingue « le même événement rejoué » de « deux événements qui se ressemblent ».
--
-- `source_externe_id` porte donc l'horodatage Slack du message — `1757950861.123456`, unique dans
-- un canal. Même nom que sur `interactions` et `actions`, qui l'utilisent déjà pour les
-- identifiants Salesforce et Allo : une seule convention à retenir.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.pistes
  add column if not exists source_externe_id text;

comment on column public.pistes.source_externe_id is
  'Identifiant de l''événement extérieur qui a créé la piste — l''horodatage du message Slack pour '
  'les leads du formulaire. Rend la création idempotente : rejouer le même message n''écrit rien.';

-- L'unicité EST le mécanisme, pas une précaution : c'est elle qui fait échouer le second passage.
create unique index if not exists idx_pistes_source_externe_id
  on public.pistes (source_externe_id) where source_externe_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE MÊME MESSAGE, DEUX FOIS, NE FAIT QU'UNE PISTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- On ne vérifie pas que la colonne existe — `add column` a réussi ou la migration aurait échoué. On
-- vérifie ce pour quoi elle est faite : qu'une seconde insertion du même message ne passe pas.
--
do $$
declare
  statut   uuid;
  premiere uuid;
  seconde  uuid;
  ts       text := '1757950861.' || (random() * 1000000)::integer::text;
begin
  select id into statut from public.statuts_pistes limit 1;

  insert into public.pistes (societe, statut_id, source_externe_id)
  values ('Garde-fou Slack', statut, ts) returning id into premiere;

  -- Le rejeu : `do nothing` doit ne rien écrire, et non lever une erreur que l'appelant traiterait
  -- comme une panne. C'est exactement ce que fera le point d'entrée.
  insert into public.pistes (societe, statut_id, source_externe_id)
  values ('Garde-fou Slack (rejeu)', statut, ts)
  on conflict (source_externe_id) where source_externe_id is not null do nothing
  returning id into seconde;

  if seconde is not null then
    raise exception 'Le rejeu du même message a créé une seconde piste.';
  end if;
  if (select count(*) from public.pistes where source_externe_id = ts) <> 1 then
    raise exception 'Le message a produit plusieurs pistes.';
  end if;

  delete from public.pistes where id = premiere;
  raise notice 'Garde-fou : un message Slack rejoué ne crée pas de seconde piste.';
end $$;

commit;
