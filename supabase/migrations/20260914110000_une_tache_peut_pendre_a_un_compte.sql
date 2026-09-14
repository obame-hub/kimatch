-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE PEUT PENDRE À UN COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI MANQUAIT, ET LE CHIFFRE QUI L'A MONTRÉ ════════════════════════════════════════════
--
-- `actions` sait se rattacher à neuf objets — contact, mandat, recommandation, version,
-- opportunité, piste, suivi de contrat, requête, signal — mais pas au COMPTE.
--
-- Relevé du 14/09/2026 sur les tâches Salesforce encore ouvertes qu'il reste à reprendre :
-- **258 sur 270 pendent à un compte**, et à rien d'autre. Sans cette colonne, on les importerait
-- détachées : une tâche qui n'apparaît sur aucune fiche est une tâche que personne ne fera.
--
-- ══ POURQUOI PAS PAR LE CONTACT ══════════════════════════════════════════════════════════════
--
-- On pourrait rattacher au contact du compte, et se dire que la tâche remonterait par là. Deux
-- raisons de ne pas le faire :
--
-- · `Task.WhoId` n'est renseigné que sur 5 des 270 — le rattachement au contact n'existe pas dans
--   la source, il faudrait l'inventer en choisissant un contact au hasard parmi ceux du compte ;
-- · et ce serait faux. « Rappeler première semaine 2028, engagé gaz et élec jusqu'au 31/12 » est
--   une affaire de CLIENT, pas de personne. La rattacher à quelqu'un la ferait disparaître le jour
--   où cette personne quitte le syndic.
--
-- ══ LE RÉGIME DE SUPPRESSION ═════════════════════════════════════════════════════════════════
--
-- `cascade`, comme les huit autres rattachements d'`actions`. Une tâche sur un compte supprimé
-- n'aurait plus de sujet : on ne rappelle pas un client qui n'existe plus. Et c'est cohérent avec
-- ce qui a été aligné le 10/09 — le contrat, le compteur, le contact et le mandat suivent tous
-- leur compte.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.actions
  add column if not exists compte_id uuid references public.comptes(id) on delete cascade;

comment on column public.actions.compte_id is
  'Le client concerné, quand la tâche ne vise ni une personne ni un dossier précis — « rappeler en '
  '2028 », « contrôler la facture ». 258 des 270 tâches Salesforce reprises le 14/09/2026 n''ont '
  'que ce rattachement.';

-- La fiche compte listera ses tâches ouvertes : sans index, chaque affichage parcourt la table.
create index if not exists idx_actions_compte_id on public.actions (compte_id)
  where compte_id is not null;

-- ── LA RÈGLE DE RATTACHEMENT DOIT CONNAÎTRE LE NOUVEAU LIEN ───────────────────────────────────
--
-- `actions_contexte_check` exige qu'une tâche pende à au moins un objet — même invariant que pour
-- les interactions, et même raison : une tâche que rien ne porte n'apparaît sur aucune fiche.
--
-- AJOUTER LA COLONNE NE SUFFIT DONC PAS. Le garde-fou de cette migration l'a montré sur-le-champ :
-- une tâche rattachée au seul compte était refusée par la contrainte, et l'import des 258 tâches
-- de compte aurait échoué à la première ligne.
--
-- ET `contact_id` N'Y FIGURAIT PAS NON PLUS. La colonne existe sur `actions` depuis l'origine, mais
-- la règle ne la compte pas : une tâche rattachée à une seule personne est refusée aujourd'hui.
-- Personne ne l'a rencontré parce que les écrans posent toujours un autre lien en même temps —
-- c'est exactement le défaut trouvé le 10/09 sur les interactions, où `requete_id` manquait à la
-- liste du garde-fou. Une liste tenue à la main s'écarte de la colonne qu'on ajoute.
alter table public.actions drop constraint actions_contexte_check;
alter table public.actions add constraint actions_contexte_check check (
  compte_id is not null
  or contact_id is not null
  or site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or opportunite_id is not null
  or piste_id is not null
  or suivi_contrat_id is not null
  or requete_id is not null
);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UNE TÂCHE DE COMPTE SE CRÉE, ET SUIT SON COMPTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que la colonne existe ne dirait rien du `cascade`, qui est le seul endroit où l'on peut
-- se tromper — et un `set null` sur une colonne obligatoire ailleurs a déjà rendu la suppression
-- d'un compte impossible le 10/09. On crée donc une vraie tâche sur un vrai compte, on supprime le
-- compte, on regarde ce qu'il advient de la tâche, puis on annule tout.
--
do $$
declare
  compte_essai uuid;
  tache_essai  uuid;
  reste        integer;
  type_autre   uuid;
  statut_afaire uuid;
begin
  select id into compte_essai from public.comptes
   where not exists (select 1 from public.recommandations r where r.compte_id = comptes.id)
   limit 1;
  if compte_essai is null then
    raise exception 'Garde-fou impossible : aucun compte sans recommandation (la suppression y est interdite).';
  end if;

  select id into type_autre   from public.types_actions   where code = 'AUTRE'   limit 1;
  select id into statut_afaire from public.statuts_actions where code = 'A_FAIRE' limit 1;

  insert into public.actions (titre, compte_id, type_action_id, statut_id)
  values ('essai du garde-fou', compte_essai, type_autre, statut_afaire)
  returning id into tache_essai;

  begin
    delete from public.comptes where id = compte_essai;
    select count(*)::integer into reste from public.actions where id = tache_essai;
    if reste <> 0 then
      raise exception 'La tâche survit à la suppression de son compte : le lien n''est pas en cascade.';
    end if;
    -- Tout s'est bien passé : on défait la suppression du compte.
    raise exception 'essai concluant';
  exception
    when others then
      if sqlerrm <> 'essai concluant' then
        raise exception 'Le garde-fou a échoué : % (%)', sqlerrm, sqlstate;
      end if;
  end;

  -- La sous-transaction a été annulée : le compte est revenu, et la tâche d'essai avec lui.
  delete from public.actions where id = tache_essai;

  -- ET UNE TÂCHE RATTACHÉE À UNE SEULE PERSONNE, qui était refusée jusqu'ici.
  declare contact_essai uuid;
  begin
    select id into contact_essai from public.contacts limit 1;
    if contact_essai is not null then
      insert into public.actions (titre, contact_id, type_action_id, statut_id)
      values ('essai du garde-fou — contact seul', contact_essai, type_autre, statut_afaire)
      returning id into tache_essai;
      delete from public.actions where id = tache_essai;
    end if;
  end;

  raise notice 'Garde-fou : une tâche de compte suit son compte, et une tâche de contact seul est acceptée.';
end $$;

commit;
