-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- TRANSFORMER LE VIVIER CRÉE LES OPPORTUNITÉS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « Je veux une fonction, dans le pool du jour, qui vient remplir
-- aléatoirement avec du vivier transformé (on crée alors automatiquement les opportunités). Je veux
-- une fonction, dans le vivier, permettant d'ajouter spécifiquement un ou plusieurs éléments dans
-- le pool (et donc de créer automatiquement des opportunités pour ces éléments). »
--
-- ══ CE QUE « AUTOMATIQUEMENT » VEUT DIRE ICI, ET CE QU'IL NE VEUT PAS DIRE ══
--
-- La création est automatique dans son EXÉCUTION — personne ne remplit un formulaire par contact —
-- et volontaire dans son DÉCLENCHEMENT : il faut un clic, sur « Compléter » ou sur « Ajouter au
-- pipe ». Aucune opportunité ne naît d'un appel, d'une horloge, d'un traitement de nuit ni du
-- chargement d'une page. `construire_pipe_du_jour` n'en crée aucune, et c'est pour cette raison
-- que le pipe du matin peut être court.
--
-- La distinction n'est pas rhétorique : un pipeline qui se remplit tout seul cesse d'être une
-- mesure de ce que l'équipe a décidé de travailler.
--
-- ══ LE SIGNAL EST OBLIGATOIRE, ET C'EST LE CRITÈRE D'ÉLIGIBILITÉ QUI LE PORTE ══
--
-- Créer une opportunité avec un contact exige `signal_id` OU `signal_libelle` — prérequis posé par
-- Michel le 23/08/2026. Sans lui, la création échoue. On y écrit donc le critère qui a fait entrer
-- le contact au vivier : « Échéance à moins de 18 mois » ou « Sans périmètre connu ». C'est
-- exactement ce qu'un commercial a besoin de lire trois semaines plus tard pour savoir pourquoi ce
-- dossier existe.
--
-- ══ LE PÉRIMÈTRE PART AVEC LA CRÉATION, QUAND IL Y EN A UN ══
--
-- Les compteurs qui ont déclenché l'éligibilité sont rattachés tout de suite : une opportunité née
-- d'une échéance sans son compteur obligerait à refaire à la main le travail que la base venait de
-- faire. Pour un contact « Sans périmètre », il n'y a rien à rattacher, et un périmètre vide est
-- légitime — le palier calculé dira « Nouvelle », ce qui est exact.
--
-- ══ DEUX CLICS RAPIDES NE CRÉENT PAS DEUX OPPORTUNITÉS ══
--
-- `v_vivier_cockpit` exclut déjà les contacts portant une opportunité non close : dès la première
-- création, le contact quitte le vivier. Mais entre la lecture et l'écriture il y a un
-- aller-retour, alors la garde est réécrite ici, dans la même transaction que l'insertion.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ 1. TRANSFORMER DES CONTACTS CHOISIS ══════════════════════════════════════════════════════
--
-- Passe outre le plafond : un choix explicite ne se fait pas refuser par un compteur. C'est la
-- fonction que le vivier appelle en multi-sélection.

create or replace function public.ajouter_au_pipe_depuis_vivier(p_contacts uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_moi     uuid := auth.uid();
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_statut  uuid;
  v_pos     integer;
  v_creees  integer := 0;
  v_ligne   record;
  v_opp     uuid;
begin
  if v_moi is null or p_contacts is null or cardinality(p_contacts) = 0 then return 0; end if;

  select id into v_statut
    from statuts_opportunites
   where code = 'NOUVELLE' and coalesce(actif, true)
   limit 1;

  select coalesce(max(rang), 0) into v_pos
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;

  for v_ligne in
    select v.contact_id, v.compte_id, v.critere
      from v_vivier_cockpit v
     where v.contact_id = any(p_contacts)
       and v.compte_proprietaire_id = v_moi
  loop
    -- La garde, relue dans la transaction qui écrit.
    if exists (
      select 1 from opportunites o
       where o.contact_id = v_ligne.contact_id
         and o.actif and o.date_cloture is null and o.qualification_fin is null
    ) then
      continue;
    end if;

    insert into opportunites (compte_id, contact_id, origine, statut_id, signal_libelle, proprietaire_id)
    values (
      v_ligne.compte_id,
      v_ligne.contact_id,
      'PORTEFEUILLE',
      v_statut,
      case v_ligne.critere
        when 'SANS_PERIMETRE' then 'Sans périmètre connu — décisionnaire identifié'
        else 'Échéance à moins de 18 mois'
      end,
      v_moi
    )
    returning id into v_opp;

    -- Le périmètre qui a déclenché l'éligibilité, s'il existe.
    insert into opportunites_compteurs (opportunite_id, compteur_id)
    select v_opp, e.compteur_id
      from v_echeances_a_traiter e
     where e.responsable_contact_id = v_ligne.contact_id
       and not e.a_opportunite_vivante
       and not e.a_recommandation_ouverte
       and (e.date_echeance is null
            or e.date_echeance <= (now() at time zone 'Europe/Paris')::date + interval '18 months');

    v_pos := v_pos + 1;
    insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
    values (v_moi, v_jour, 'OPPORTUNITE', v_opp, v_pos, 'VIVIER')
        on conflict (profil_id, jour, cible_type, cible_id) do nothing;

    v_creees := v_creees + 1;
  end loop;

  return v_creees;
end;
$$;

comment on function public.ajouter_au_pipe_depuis_vivier is
  'Crée une opportunité par contact choisi du vivier — origine Portefeuille, signal = le critère '
  'd''éligibilité, périmètre = les compteurs qui l''ont déclenchée — et pousse chaque opportunité '
  'dans le pipe du jour avec la source VIVIER. Passe outre le plafond : un choix explicite ne se '
  'fait pas refuser. Rend le nombre d''opportunités créées.';

grant execute on function public.ajouter_au_pipe_depuis_vivier(uuid[]) to authenticated;

-- ══ 2. COMPLÉTER LE PIPE, AU HASARD ══════════════════════════════════════════════════════════
--
-- LE TIRAGE EST AU HASARD PARCE QU'IL A ÉTÉ DEMANDÉ AINSI, et l'arbitrage est ouvert : une
-- échéance à deux mois a la même chance de sortir qu'une à dix-sept, alors que la liste du vivier
-- est, elle, triée par urgence puis par volume. Le jour où l'ordre d'urgence est préféré, c'est le
-- `order by random()` ci-dessous qu'il faut remplacer — rien d'autre.
--
-- `p_combien` nul veut dire « jusqu'au plafond ». On ne dépasse jamais le plafond par ce chemin :
-- c'est l'autre fonction, celle du choix explicite, qui en a le droit.

create or replace function public.completer_pipe_du_jour(p_combien integer default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_moi      uuid := auth.uid();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_plafond  integer;
  v_actives  integer;
  v_place    integer;
  v_contacts uuid[];
begin
  if v_moi is null then return 0; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  select count(*) into v_actives
    from pipe_du_jour
   where profil_id = v_moi and jour = v_jour and sorti_le is null;

  v_place := greatest(v_plafond - v_actives, 0);
  if p_combien is not null then v_place := least(v_place, p_combien); end if;
  if v_place = 0 then return 0; end if;

  select array_agg(contact_id) into v_contacts
    from (
      select v.contact_id
        from v_vivier_cockpit v
       where v.compte_proprietaire_id = v_moi
       order by random()
       limit v_place
    ) tire;

  if v_contacts is null then return 0; end if;

  return ajouter_au_pipe_depuis_vivier(v_contacts);
end;
$$;

comment on function public.completer_pipe_du_jour is
  'Complète le pipe du jour jusqu''au plafond en tirant AU HASARD dans le vivier du conseiller et '
  'en créant les opportunités correspondantes. `p_combien` borne le tirage ; nul veut dire '
  '« jusqu''au plafond ». Ne dépasse jamais le plafond — seul l''ajout explicite depuis le vivier '
  'en a le droit. Rend le nombre d''opportunités créées.';

grant execute on function public.completer_pipe_du_jour(integer) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS APPLICATION
--
--   -- 1. Un contact transformé quitte le vivier — donc le même appel deux fois ne double rien :
--   select count(*) from v_vivier_cockpit where compte_proprietaire_id = auth.uid();
--   select completer_pipe_du_jour(3);
--   select count(*) from v_vivier_cockpit where compte_proprietaire_id = auth.uid();  -- moins 3
--   select completer_pipe_du_jour(3);   -- crée 3 AUTRES, jamais les mêmes
--
--   -- 2. Le signal est renseigné sur chaque opportunité créée — sans quoi la création aurait
--   --    échoué, et c'est le prérequis de Michel du 23/08 :
--   select signal_libelle, count(*) from opportunites
--    where origine = 'PORTEFEUILLE' and proprietaire_id = auth.uid()
--      and date_creation::date = current_date
--    group by 1;
--
--   -- 3. Le périmètre a suivi quand il existait :
--   select o.id, count(oc.compteur_id) from opportunites o
--     left join opportunites_compteurs oc on oc.opportunite_id = o.id
--    where o.date_creation::date = current_date and o.origine = 'PORTEFEUILLE'
--    group by 1;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
