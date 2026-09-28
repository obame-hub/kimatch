-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE STATUT D'UNE OPPORTUNITÉ NE BLOQUE PLUS LES CRÉATIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Découvert le 28/09/2026 vers 16 h 30, en testant la règle « née d'une piste » : le déclencheur posé
-- à 13 h 41 (`une_fiche_close_l_est_partout_et_ferme_ses_taches`) PLANTAIT SUR TOUTE INSERTION dans
-- les tables qu'il surveille — rattacher un compteur ou un site à une opportunité, créer une
-- recommandation, créer un mandat, rattacher un compteur à un mandat.
--
--   ERROR: record "v_ancien" is not assigned yet
--
-- La condition « création, OU l'opportunité a changé » lisait l'ancienne version de la ligne dans la
-- même expression — et une ligne qu'on vient de créer n'en a pas. PL/pgSQL n'arrête pas l'évaluation
-- au premier terme vrai : il a évalué le second, et échoué. Les tests de ce matin n'avaient rejoué
-- que des modifications, jamais une création.
--
-- ══ LA RÈGLE D'ÉCRITURE ══
--
-- On ne lit OLD que lorsque l'opération en a un (modification, suppression), NEW que lorsqu'elle en a
-- un (création, modification) — chaque lecture sous son propre `if`, jamais deux dans la même
-- condition.

create or replace function public.fn_statut_opportunite_suit_ses_faits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  case tg_table_name
    when 'opportunites' then
      perform public.recalculer_statut_opportunite(new.id);

    when 'opportunites_compteurs', 'opportunites_sites', 'recommandations' then
      if tg_op in ('UPDATE', 'DELETE') then
        perform public.recalculer_statut_opportunite(old.opportunite_id);
      end if;
      if tg_op = 'INSERT' then
        perform public.recalculer_statut_opportunite(new.opportunite_id);
      elsif tg_op = 'UPDATE' then
        if new.opportunite_id is distinct from old.opportunite_id then
          perform public.recalculer_statut_opportunite(new.opportunite_id);
        end if;
      end if;

    when 'recommandations_compteurs' then
      if tg_op in ('UPDATE', 'DELETE') then
        perform public.recalculer_statut_opportunite(
          (select opportunite_id from recommandations where id = old.recommandation_id));
      end if;
      if tg_op in ('INSERT', 'UPDATE') then
        perform public.recalculer_statut_opportunite(
          (select opportunite_id from recommandations where id = new.recommandation_id));
      end if;

    when 'mandats' then
      if tg_op in ('UPDATE', 'DELETE') then
        perform public.recalculer_statut_opportunites_du_compte(old.compte_id);
      end if;
      if tg_op = 'INSERT' then
        perform public.recalculer_statut_opportunites_du_compte(new.compte_id);
      elsif tg_op = 'UPDATE' then
        if new.compte_id is distinct from old.compte_id then
          perform public.recalculer_statut_opportunites_du_compte(new.compte_id);
        end if;
      end if;

    when 'mandats_compteurs' then
      if tg_op in ('UPDATE', 'DELETE') then
        perform public.recalculer_statut_opportunites_du_compte(
          (select compte_id from mandats where id = old.mandat_id));
      end if;
      if tg_op in ('INSERT', 'UPDATE') then
        perform public.recalculer_statut_opportunites_du_compte(
          (select compte_id from mandats where id = new.mandat_id));
      end if;
  end case;

  return null;
end;
$$;

-- `create or replace` garde les droits ; on les réaffirme pour qu'aucune lecture de ce fichier ne
-- laisse de doute : c'est un rouage, appelable par personne.
revoke execute on function public.fn_statut_opportunite_suit_ses_faits() from public, anon, authenticated;
