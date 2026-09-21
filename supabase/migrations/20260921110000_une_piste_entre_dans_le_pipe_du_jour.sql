-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE ENTRE DANS LE PIPE DU JOUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 21/09/2026 : « sur pipe du jour, deux fonctionnalités doivent être phares : compléter
-- mon pipe avec des pistes, compléter mon pipe avec mon vivier. Ainsi, Cockpit viendra récupérer
-- principalement des pistes (ou créer des opportunités) afin de les remonter dans le pipe du jour. »
--
-- ══ LE PIPE SAVAIT DÉJÀ PORTER UNE PISTE — PERSONNE NE POUVAIT L'Y METTRE ══
--
-- `pipe_du_jour.cible_type` accepte 'PISTE' depuis l'origine, `lister_pipe_du_jour` sait la rendre,
-- et la source `PISTE_FROIDE` existe. Seule la porte d'entrée manquait : `ajouter_au_pipe_depuis_vivier`
-- prend des CONTACTS et crée une opportunité pour chacun. Or une piste n'a pas de contact — c'est
-- sa définition : elle vit avant lui. Sur les 4 750 pistes de la base, 15 seulement en portent un.
--
-- ══ ELLE N'EN CRÉE PAS NON PLUS ══
--
-- Créer un contact, un compte et une opportunité pour pouvoir passer un appel reviendrait à
-- qualifier la piste AVANT de lui avoir parlé — et à salir le portefeuille de 4 750 comptes vides
-- si la séance ne donne rien. Une piste entre donc telle quelle, et c'est l'appel qui décidera de
-- la convertir. C'est exactement ce que la colonne `cible_type` prévoyait.
--
-- ══ « AJOUT_MANUEL » PARCE QUE C'EST CE QUI S'EST PASSÉ ══
--
-- `PISTE_FROIDE` est la source des pistes que la construction automatique tire d'elle-même. Ici
-- quelqu'un a coché des lignes : le dire autrement rendrait le pipe impossible à relire.
--
-- ══ LE PLAFOND EST RESPECTÉ, ET IL EST DIT ══
--
-- Le pipe s'arrête au plafond du profil, soixante par défaut. La fonction rend le nombre de lignes
-- RÉELLEMENT ajoutées, ce qui permet à l'écran d'annoncer « 12 ajoutées sur 20 demandées » plutôt
-- que de laisser croire à un oubli.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.ajouter_au_pipe_depuis_pistes(p_pistes uuid[])
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_moi     uuid := auth.uid();
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_plafond integer;
  v_actives integer;
  v_place   integer;
  v_pos     integer;
  v_ajouts  integer := 0;
  v_piste   record;
begin
  if v_moi is null or p_pistes is null or cardinality(p_pistes) = 0 then return 0; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  select count(*) into v_actives
    from pipe_du_jour
   where profil_id = v_moi and jour = v_jour and sorti_le is null;

  v_place := greatest(v_plafond - v_actives, 0);
  if v_place = 0 then return 0; end if;

  select coalesce(max(rang), 0) into v_pos
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;

  for v_piste in
    select p.id
      from pistes p
      left join statuts_pistes s on s.id = p.statut_id
     where p.id = any(p_pistes)
       -- ON NE TRAVAILLE QUE SES PROPRES PISTES : le Cockpit est un plan de travail personnel, et
       -- remonter la piste d'un collègue dans son pipe la lui volerait sans le lui dire.
       and p.proprietaire_id = v_moi
       -- UNE PISTE CLOSE N'A PLUS RIEN À DONNER : convertie, elle a son opportunité ; disqualifiée,
       -- la décision a été prise.
       and coalesce(s.est_cloture, false) = false
     order by p.date_premier_appel asc nulls first, p.date_creation asc
     limit v_place
  loop
    v_pos := v_pos + 1;
    insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
    values (v_moi, v_jour, 'PISTE', v_piste.id, v_pos, 'AJOUT_MANUEL')
        on conflict (profil_id, jour, cible_type, cible_id) do nothing;
    -- `found` suit le dernier ordre : sans le `on conflict`, une piste déjà dans le pipe aurait
    -- été comptée comme ajoutée et le message aurait menti.
    if found then v_ajouts := v_ajouts + 1; end if;
  end loop;

  return v_ajouts;
end;
$function$;

comment on function public.ajouter_au_pipe_depuis_pistes(uuid[]) is
  'Fait entrer des pistes telles quelles dans le pipe du jour, sans créer ni contact ni opportunité. Respecte le plafond du profil et rend le nombre de lignes réellement ajoutées. Voir la migration du 21/09/2026.';
