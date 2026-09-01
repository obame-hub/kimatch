-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE INTERACTION PEUT SE RATTACHER À UNE PISTE
--
-- Suite immédiate de 20260901210000, qui a fait entrer les 5 131 leads Salesforce comme pistes. Il
-- reste à leur rendre leur historique : 6 600 activités leur sont rattachées dans l'org —
-- 3 577 appels, 1 264 e-mails, 1 759 tâches.
--
-- SANS CETTE COLONNE, CES APPELS N'ONT NULLE PART OÙ ATTERRIR. `interactions` porte dix contextes
-- possibles — compte, contact, site, signal, mandat, recommandation, version, action, opportunité,
-- suivi de contrat — et pas la piste. Une piste n'est ni un compte ni un contact : c'est un prospect
-- qu'on n'a pas encore qualifié, et c'est précisément la population que ces appels concernent.
--
-- ══ ET LA CONTRAINTE DE CONTEXTE DOIT SUIVRE ══
--
-- `interactions_contexte_check` exige qu'AU MOINS un contexte soit renseigné. Ajouter la colonne
-- sans toucher à la contrainte donnerait une colonne inutilisable : une interaction rattachée à la
-- seule piste serait refusée à l'insertion, parce que ses dix autres contextes sont nuls.
--
-- C'EST EXACTEMENT LE PIÈGE DU 31/08 sur `actions_contexte_check` : la colonne avait été ajoutée,
-- pas la contrainte, et les tâches créées depuis une opportunité étaient rejetées par la base. Ni le
-- build, ni les types, ni le lint ne l'avaient vu — seul un essai fonctionnel, annulé ensuite. On ne
-- refait pas la même erreur deux fois : la contrainte est reprise dans la même transaction.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.interactions
  add column if not exists piste_id uuid references public.pistes(id) on delete set null;

comment on column public.interactions.piste_id is
  'La piste concernée, quand l''échange a eu lieu avant toute qualification en compte ou contact.';

-- L'index sert le flux d'actualité de la fiche piste, qui lit toutes les interactions d'une piste
-- par date : sans lui, chaque ouverture de fiche balaierait la table entière.
create index if not exists interactions_piste_idx
  on public.interactions (piste_id, date_interaction desc) where piste_id is not null;

alter table public.interactions drop constraint if exists interactions_contexte_check;
alter table public.interactions add constraint interactions_contexte_check check (
  compte_id is not null
  or contact_id is not null
  or site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or action_id is not null
  or opportunite_id is not null
  or suivi_contrat_id is not null
  or piste_id is not null
);

-- ── Le garde-fou : la contrainte doit VRAIMENT accepter une interaction sur la seule piste ──
-- Vérifier que la colonne existe ne prouve rien ; c'est l'insertion qui prouve. On l'essaie pour de
-- bon, puis on la retire — l'essai vit et meurt dans cette transaction.
do $$
declare
  v_piste uuid;
  v_type uuid;
  v_essai uuid;
begin
  select id into v_piste from public.pistes limit 1;
  select id into v_type from public.types_interactions where code = 'APPEL';
  if v_piste is null or v_type is null then
    raise notice 'Essai fonctionnel impossible : aucune piste ou aucun type APPEL';
    return;
  end if;

  insert into public.interactions (type_interaction_id, date_interaction, objet, piste_id)
  values (v_type, now(), 'Essai de contrainte — annulé dans la même transaction', v_piste)
  returning id into v_essai;

  delete from public.interactions where id = v_essai;
  raise notice 'Essai fonctionnel réussi : une interaction sur la seule piste est acceptée';
end;
$$;

commit;
