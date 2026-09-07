-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA FILE DES APPELS NON RATTACHÉS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 07/09/2026 : « importe tout, avec la file des non rattachés. » Puis : « fais la table et
-- l'écran des appels non rattachés. »
--
-- ══ POURQUOI UNE TABLE À PART, ET NON DES `interactions` SANS RATTACHEMENT ══
--
-- C'est la base qui a tranché, en refusant l'import : `interactions_contexte_check` exige qu'une
-- interaction soit liée à AU MOINS UN objet — compte, contact, site, signal, mandat, recommandation,
-- version, tâche, opportunité, suivi de contrat ou piste.
--
-- C'est la bonne règle, et c'est la leçon que la reprise des appels Salesforce avait laissée en
-- commentaire : « une consignation qui n'apparaît sur aucune fiche ne consigne rien. » La desserrer
-- pour faire entrer 3 895 appels invisibles aurait cassé la garantie pour les 74 000 autres.
--
-- Cette table est donc une SALLE D'ATTENTE, pas un second historique. Une ligne n'y reste que le
-- temps qu'on sache à qui elle appartient ; le rattachement la transforme en interaction et la
-- retire d'ici.
--
-- ══ CE QU'IL Y A DEDANS, MESURÉ LE 07/09/2026 ══
--
--   3 895 appels sur 1 439 numéros distincts, soit 2,7 appels par numéro.
--     Le plus appelé l'a été 86 fois : +33622593272, Alain ZANIOLO — et le compte
--     « SARL ALSOZA 2008 ALAIN ZANIOLO » EXISTE dans Kimatch. Seul son portable manquait.
--
-- C'est tout l'intérêt d'une file triée par nombre d'appels : un seul rattachement récupère 86
-- appels d'un coup, et tous les suivants. À 1 500 appels par mois, chaque geste continue de payer.
--
-- ══ CE QUE L'IA D'ALLO DEVINE, GARDÉ COMME INDICE ET JAMAIS COMME FAIT ══
--
-- Allo extrait de la conversation le nom, la fonction et la société du correspondant. Sur les
-- orphelins, un appel sur cinq en porte, et une valeur sur quatre est un bouche-trou (« NOT
-- AVAILABLE », « NULL », « / »). Ces colonnes servent donc à PROPOSER un rattachement, pas à en
-- créer un : elles sont nommées `*_devinee` pour que personne ne s'y trompe en lisant une requête.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.appels_non_rattaches (
  id uuid primary key default gen_random_uuid(),
  -- L'IDENTIFIANT ALLO, UNIQUE : c'est ce qui rend l'import rejouable sans doublon. Contrainte en
  -- base et non seulement dans le script, pour que deux exécutions simultanées ne passent pas.
  source_externe_id text not null unique,
  /** Le numéro en E.164 : la clé du rattachement, et le tri de la file. */
  numero text,
  date_appel timestamptz not null,
  sens text,
  duree_secondes integer,
  resultat text,
  decroche_par text,
  auteur_profil_id uuid references public.profils(id) on delete set null,
  resume_ia text,
  transcription text,
  enregistrement_url text,
  -- Devinés par l'IA d'Allo depuis la conversation. Des indices, jamais des faits.
  societe_devinee text,
  personne_devinee text,
  fonction_devinee text,
  date_creation timestamptz not null default now(),
  constraint appels_non_rattaches_sens_check
    check (sens is null or sens in ('ENTRANT', 'SORTANT', 'INTERNE'))
);

comment on table public.appels_non_rattaches is
  'Salle d''attente des appels Allo dont le numéro ne correspond à aucune fiche. Une ligne y reste '
  'le temps qu''on sache à qui elle appartient : le rattachement la transforme en interaction et la '
  'retire d''ici. Séparée de `interactions`, qui exige par contrainte un objet de rattachement.';

create index if not exists idx_appels_non_rattaches_numero on public.appels_non_rattaches (numero);
create index if not exists idx_appels_non_rattaches_date on public.appels_non_rattaches (date_appel desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────────
--
-- Ces appels concernent des prospects que TOUTE l'équipe démarche : les cacher par propriétaire
-- ferait que personne ne verrait ceux de ses collègues, et la file ne se viderait jamais. Lecture
-- ouverte aux personnes connectées, comme les interactions.
--
-- L'ÉCRITURE, ELLE, EST FERMÉE. Rien dans l'application n'insère ici : seul le script d'import, qui
-- passe par la clé de service. Une politique d'insertion ouverte serait une porte sans usage.
alter table public.appels_non_rattaches enable row level security;

drop policy if exists lecture_par_les_connectes on public.appels_non_rattaches;
create policy lecture_par_les_connectes on public.appels_non_rattaches
  for select to authenticated using (true);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA FILE, GROUPÉE PAR NUMÉRO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- TRIÉE PAR NOMBRE D'APPELS, ET C'EST LA DÉCISION QUI COMPTE. Mesuré : 986 numéros n'ont été appelés
-- qu'UNE fois — 44 % des numéros pour 15 % des appels. Une file triée par date ferait tomber d'abord
-- sur ceux-là, et on abandonnerait avant d'atteindre celui qui en porte 86.
--
-- LA SOCIÉTÉ PROPOSÉE est celle qu'Allo a devinée le plus souvent sur ce numéro : une seule
-- extraction peut être fantaisiste, la même répétée sur dix appels l'est rarement.
create or replace view public.v_file_appels as
with devinees as (
  select numero, societe_devinee, count(*) as n
  from appels_non_rattaches
  where numero is not null and coalesce(societe_devinee, '') <> ''
  group by numero, societe_devinee
),
societe_dominante as (
  select distinct on (numero) numero, societe_devinee, n
  from devinees order by numero, n desc, societe_devinee
),
personnes as (
  select distinct on (a.numero) a.numero, a.personne_devinee, a.fonction_devinee
  from appels_non_rattaches a
  where a.numero is not null and coalesce(a.personne_devinee, '') <> ''
  order by a.numero, a.date_appel desc
)
select a.numero,
       count(*)                                              as nb_appels,
       min(a.date_appel)                                     as premier_appel,
       max(a.date_appel)                                     as dernier_appel,
       count(a.resume_ia)                                    as nb_resumes,
       count(a.enregistrement_url)                           as nb_enregistrements,
       sum(coalesce(a.duree_secondes, 0))                    as duree_totale_secondes,
       count(*) filter (where a.resultat = 'Décroché')        as nb_decroches,
       -- Qui a appelé ce numéro : c'est souvent la personne qui saura de qui il s'agit.
       string_agg(distinct a.decroche_par, ', ')
         filter (where a.decroche_par is not null)           as commerciaux,
       sd.societe_devinee                                    as societe_proposee,
       sd.n                                                  as societe_proposee_occurrences,
       p.personne_devinee                                    as personne_proposee,
       p.fonction_devinee                                    as fonction_proposee,
       -- Le dernier résumé sert d'aperçu : c'est le plus récent état du dossier.
       (array_agg(a.resume_ia order by a.date_appel desc)
          filter (where a.resume_ia is not null))[1]         as dernier_resume,
       -- ══ LA SOCIÉTÉ DEVINÉE CORRESPOND-ELLE À UN COMPTE EXISTANT ? ══
       -- Rapprochement sur le nom EXACT seulement. Une première version acceptait n'importe quelle
       -- inclusion de chaîne et appariait « Dalkia » au compte « LK », parce que « LK » est contenu
       -- dans « DaLKia ». Un rapprochement approximatif sans garde-fou produit surtout du bruit, et
       -- le bruit se lit comme un résultat : ici, une proposition fausse ferait rattacher 86 appels
       -- au mauvais client.
       (select k.id from comptes k
         where k.actif = true and upper(trim(k.nom)) = upper(trim(sd.societe_devinee))
         limit 1)                                            as compte_propose_id,
       (select k.nom from comptes k
         where k.actif = true and upper(trim(k.nom)) = upper(trim(sd.societe_devinee))
         limit 1)                                            as compte_propose_nom
from appels_non_rattaches a
left join societe_dominante sd on sd.numero = a.numero
left join personnes p on p.numero = a.numero
where a.numero is not null
group by a.numero, sd.societe_devinee, sd.n, p.personne_devinee, p.fonction_devinee;

comment on view public.v_file_appels is
  'La file des appels non rattachés, un numéro par ligne, avec de quoi décider : combien d''appels, '
  'qui les a passés, le dernier résumé, et la société devinée par l''IA d''Allo quand elle '
  'correspond exactement à un compte existant.';

grant select on public.v_file_appels to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RATTACHER UN NUMÉRO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- UN GESTE, TOUS LES APPELS DU NUMÉRO. C'est le cœur de l'affaire : 2,7 appels par numéro en
-- moyenne, 86 pour le plus appelé. Rattacher appel par appel serait un travail sans fin.
--
-- ET LE NUMÉRO REJOINT LA FICHE. Sans cela, les appels SUIVANTS de ce même numéro retomberaient dans
-- la file, et on rattacherait le même prospect chaque semaine. C'est ce qui transforme le geste en
-- correction durable.
create or replace function public.fn_rattacher_appels(
  p_numero text,
  p_contact_id uuid default null,
  p_compte_id uuid default null,
  p_piste_id uuid default null
)
returns table (appels_rattaches integer, numero_ajoute_a_la_fiche boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n_appels integer;
  type_appel uuid;
  ajoute boolean := false;
  compte_effectif uuid := p_compte_id;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  if p_contact_id is null and p_compte_id is null and p_piste_id is null then
    raise exception 'Précisez un contact, un compte ou une piste.';
  end if;

  select id into type_appel from types_interactions where code = 'APPEL';
  if type_appel is null then
    raise exception 'Le type d''interaction APPEL est absent de types_interactions.';
  end if;

  -- Le compte se déduit du contact quand il n'est pas donné : un appel rattaché à quelqu'un
  -- appartient aussi à sa société, et l'omettre le ferait disparaître de la fiche du compte.
  if compte_effectif is null and p_contact_id is not null then
    select compte_id into compte_effectif from contacts where id = p_contact_id;
  end if;

  insert into interactions (
    type_interaction_id, auteur_profil_id, proprietaire_id, cree_par_id,
    contact_id, compte_id, piste_id,
    date_interaction, sens, objet, resume_ia, transcription, enregistrement_url,
    duree_appel_secondes, duree_minutes, appel_manque, messagerie_vocale,
    numero_correspondant, decroche_par, resultat, source_externe_id
  )
  select type_appel, a.auteur_profil_id, a.auteur_profil_id, auth.uid(),
         p_contact_id, compte_effectif, p_piste_id,
         a.date_appel, a.sens,
         coalesce(left(a.resume_ia, 200), 'Appel ' || lower(coalesce(a.sens, 'sortant'))),
         a.resume_ia, a.transcription, a.enregistrement_url,
         a.duree_secondes,
         case when a.duree_secondes is null then null else round(a.duree_secondes / 60.0) end,
         a.resultat is distinct from 'Décroché',
         a.resultat = 'Messagerie',
         a.numero, a.decroche_par, a.resultat, a.source_externe_id
  from appels_non_rattaches a
  where a.numero = p_numero
    -- Un appel déjà consigné ne se recopie pas : la clé est l'identifiant Allo.
    and not exists (select 1 from interactions i where i.source_externe_id = a.source_externe_id);

  get diagnostics n_appels = row_count;

  -- ── LE NUMÉRO REJOINT LA FICHE, s'il n'y est pas déjà ──
  if p_contact_id is not null then
    update contacts
       set telephone_mobile = coalesce(nullif(trim(telephone_mobile), ''), p_numero)
     where id = p_contact_id
       and coalesce(nullif(trim(telephone), ''), '') <> p_numero
       and coalesce(nullif(trim(telephone_mobile), ''), '') <> p_numero;
    ajoute := found;
  elsif p_piste_id is not null then
    update pistes set telephone = coalesce(nullif(trim(telephone), ''), p_numero)
     where id = p_piste_id and coalesce(nullif(trim(telephone), ''), '') <> p_numero;
    ajoute := found;
  elsif compte_effectif is not null then
    update comptes set telephone = coalesce(nullif(trim(telephone), ''), p_numero)
     where id = compte_effectif and coalesce(nullif(trim(telephone), ''), '') <> p_numero;
    ajoute := found;
  end if;

  -- La salle d'attente se vide de ce numéro : il a trouvé sa fiche.
  delete from appels_non_rattaches where numero = p_numero;

  return query select n_appels, ajoute;
end;
$$;

comment on function public.fn_rattacher_appels(text, uuid, uuid, uuid) is
  'Transforme en interactions tous les appels en attente d''un numéro, ajoute ce numéro à la fiche '
  'pour que les appels suivants tombent directement au bon endroit, et vide la file d''autant.';

grant execute on function public.fn_rattacher_appels(text, uuid, uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ÉCARTER UN NUMÉRO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Tous les numéros ne méritent pas une fiche : un appelant masqué (« + », 59 appels), un faux
-- numéro, un démarcheur. Sans moyen de les écarter, la file garderait un fond permanent qu'on
-- réexaminerait chaque semaine — et une file qu'on n'arrive jamais à vider, on cesse de l'ouvrir.
create or replace function public.fn_ecarter_appels(p_numero text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Non authentifié.'; end if;
  delete from appels_non_rattaches where numero = p_numero;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.fn_ecarter_appels(text) is
  'Retire de la file les appels d''un numéro sans créer d''interaction : appelant masqué, faux '
  'numéro, démarcheur. Les appels restent chez Allo, une réimportation les ramènerait.';

grant execute on function public.fn_ecarter_appels(text) to authenticated;

-- ── GARDE-FOU ─────────────────────────────────────────────────────────────────────────────────
do $$
declare n_politiques integer;
begin
  select count(*) into n_politiques from pg_policies where tablename = 'appels_non_rattaches';
  -- Une table sous RLS sans politique est invisible, y compris pour son créateur : c'est le piège
  -- le plus fréquent de ce projet.
  if n_politiques < 1 then
    raise exception 'Aucune politique RLS sur appels_non_rattaches : la table serait invisible. Rien n''est appliqué.';
  end if;

  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_file_appels') then
    raise exception 'La vue v_file_appels n''a pas été créée. Rien n''est appliqué.';
  end if;

  raise notice 'File des appels non rattachés en place. Lancez ensuite : node scripts/importer-appels-allo.cjs --ecrire';
end $$;

commit;
