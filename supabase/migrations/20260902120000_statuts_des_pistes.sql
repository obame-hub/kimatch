-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES PISTES REÇOIVENT LEURS STATUTS
--
-- Naoëlle, 02/09/2026 : « pour les pistes, il faudrait leur mettre leur statut. Vérifie si la table
-- existe en base, sinon les statuts sont Nouvelle, En cours de qualification, Clôturée en (Convertie,
-- Disqualifiée), et mettre un commentaire pour Disqualifiée. »
--
-- VÉRIFIÉ : LA TABLE N'EXISTAIT PAS. `pistes.statut_id` existe depuis l'origine, sans clé étrangère
-- et NULLE sur les 5 136 lignes — une colonne posée pour un référentiel qui n'a jamais été écrit.
-- L'écran n'affichait donc aucun statut, et la seule information d'état vivait dans
-- `statut_salesforce`, une chaîne reprise telle quelle de l'import des leads.
--
-- ══ LES QUATRE STATUTS, ET LE MOTIF DE LA CLÔTURE ══
--
--     NOUVELLE          10   Nouvelle                      est_cloture = false
--     EN_QUALIFICATION  20   En cours de qualification      est_cloture = false
--     CONVERTIE         30   Convertie                      est_cloture = true
--     DISQUALIFIEE      40   Disqualifiée                   est_cloture = true
--
-- DEUX FINS, PAS UNE ÉTAPE « CLÔTURÉE ». Elle écrit « clôturée en (convertie, disqualifiée) » : la
-- clôture n'est pas un état de plus, c'est la propriété commune de deux issues opposées. Le modèle
-- suit donc `statuts_requetes`, écrit hier sur la même forme : quatre lignes, dont deux portent
-- `est_cloture`. Une cinquième ligne « Clôturée » aurait obligé à lire deux champs pour savoir ce qui
-- s'est passé, et aurait permis d'être clôturé sans être ni converti ni disqualifié.
--
-- LE MOTIF DE DISQUALIFICATION EXISTE DÉJÀ : `pistes.motif_disqualification`, ajoutée le 01/09 pour
-- recevoir `Motifs_des_pistes_disqualifiees__c` de Salesforce. On ne crée pas une seconde colonne
-- pour la même chose ; c'est celle-là que l'écran remplira.
--
-- ══ LE RATTRAPAGE, DEPUIS CE QUE SALESFORCE DISAIT ══
--
--     Nouvelle                      4 463  → NOUVELLE
--     En cours de qualification       374  → EN_QUALIFICATION
--     Disqualifiée                    294  → DISQUALIFIEE
--     (sans statut Salesforce)          5  → CONVERTIE si elle porte une opportunité, NOUVELLE sinon
--
-- Les cinq sans statut sont les pistes nées dans Kimatch avant l'import des leads ; une seule est
-- convertie, et c'est `opportunite_id` qui le prouve — pas une supposition.
--
-- CE QUE LE RATTRAPAGE NE TOUCHE PAS : `actif`. Les 294 disqualifiées ont été importées inactives, et
-- elles le restent. Les deux champs ne disent pas la même chose — le statut dit CE QUI S'EST PASSÉ,
-- `actif` dit si la ligne est sur le plan de travail. Les remettre actives d'autorité ferait
-- réapparaître 294 pistes mortes dans les lots des commerciaux du jour au lendemain.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.statuts_pistes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  /** Vrai sur les deux issues : la piste a quitté le plan de travail, quelle qu'en soit la raison. */
  est_cloture boolean not null default false,
  couleur text,
  actif boolean not null default true,
  date_creation timestamptz not null default now()
);

comment on table public.statuts_pistes is
  'Statuts d''une piste. Deux issues portent est_cloture : Convertie et Disqualifiée — la clôture est une propriété, pas une étape.';

insert into public.statuts_pistes (code, libelle, ordre, est_cloture)
values
  ('NOUVELLE',         'Nouvelle',                  10, false),
  ('EN_QUALIFICATION', 'En cours de qualification', 20, false),
  ('CONVERTIE',        'Convertie',                 30, true),
  ('DISQUALIFIEE',     'Disqualifiée',              40, true)
on conflict (code) do nothing;

-- La clé étrangère que la colonne n'avait pas : sans elle, rien n'empêche d'écrire un identifiant
-- qui ne désigne aucun statut, et l'écran afficherait un statut vide sans qu'on sache pourquoi.
alter table public.pistes
  drop constraint if exists pistes_statut_id_fkey;
alter table public.pistes
  add constraint pistes_statut_id_fkey
  foreign key (statut_id) references public.statuts_pistes(id);

-- ══ LE RATTRAPAGE ══
update public.pistes p
   set statut_id = st.id
  from public.statuts_pistes st
 where p.statut_id is null
   and st.code = case p.statut_salesforce
                   when 'Nouvelle'                  then 'NOUVELLE'
                   when 'En cours de qualification' then 'EN_QUALIFICATION'
                   when 'Disqualifiée'              then 'DISQUALIFIEE'
                   -- Sans statut Salesforce : l'opportunité prouve la conversion, rien d'autre ne le
                   -- ferait. Les autres repartent de « Nouvelle », l'état de départ.
                   else case when p.opportunite_id is not null then 'CONVERTIE' else 'NOUVELLE' end
                 end;

-- ══ LE STATUT SUIT LA CONVERSION, AUTOMATIQUEMENT ══
--
-- Sans ce déclencheur, convertir une piste depuis l'écran écrirait `opportunite_id` et laisserait le
-- statut sur « En cours de qualification » : la piste s'afficherait comme à travailler alors qu'elle
-- a produit son opportunité. C'est le défaut exact des recommandations rouvertes qui gardaient leur
-- finalité — un état déduit d'un fait doit être écrit par le même geste que le fait.
create or replace function public.piste_convertie_ecrit_son_statut()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_statut uuid;
begin
  if new.opportunite_id is not null and (old.opportunite_id is null or old.opportunite_id is distinct from new.opportunite_id) then
    select id into v_statut from public.statuts_pistes where code = 'CONVERTIE';
    if v_statut is not null then
      new.statut_id := v_statut;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_piste_convertie_statut on public.pistes;
create trigger trg_piste_convertie_statut
  before update of opportunite_id on public.pistes
  for each row execute function public.piste_convertie_ecrit_son_statut();

-- ══ LA SÉCURITÉ ══
-- Une table créée par migration naît sous RLS sans aucune politique : sans les deux lignes qui
-- suivent, le référentiel serait invisible et l'écran n'afficherait aucun statut du tout.
alter table public.statuts_pistes enable row level security;

drop policy if exists statuts_pistes_lecture on public.statuts_pistes;
create policy statuts_pistes_lecture on public.statuts_pistes
  for select to authenticated using (true);

-- ── Le garde-fou ──
do $$
declare
  v_sans_statut integer;
  v_politiques integer;
begin
  select count(*) into v_politiques from pg_policies where tablename = 'statuts_pistes';
  if v_politiques = 0 then
    raise exception 'statuts_pistes est sous RLS sans politique : le referentiel serait invisible';
  end if;

  select count(*) into v_sans_statut from public.pistes where statut_id is null;
  if v_sans_statut > 0 then
    raise exception 'Il reste % pistes sans statut apres le rattrapage', v_sans_statut;
  end if;

  -- L'essai fonctionnel du declencheur : ecrire une opportunite doit poser CONVERTIE. On le fait
  -- pour de bon sur une piste reelle, puis on annule — verifier que le trigger existe ne prouve rien.
  declare
    v_piste uuid;
    v_avant uuid;
    v_apres text;
    v_opp uuid;
  begin
    select id, statut_id into v_piste, v_avant from public.pistes where opportunite_id is null limit 1;
    select id into v_opp from public.opportunites limit 1;
    if v_piste is not null and v_opp is not null then
      update public.pistes set opportunite_id = v_opp where id = v_piste;
      select st.code into v_apres from public.pistes p join public.statuts_pistes st on st.id = p.statut_id where p.id = v_piste;
      if v_apres <> 'CONVERTIE' then
        raise exception 'Le declencheur n a pas pose CONVERTIE mais %', v_apres;
      end if;
      update public.pistes set opportunite_id = null, statut_id = v_avant where id = v_piste;
      raise notice 'Essai du declencheur reussi, puis annule';
    end if;
  end;
end;
$$;

commit;
