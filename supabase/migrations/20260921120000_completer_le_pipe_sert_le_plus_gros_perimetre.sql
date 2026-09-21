-- ════════════════════════════════════════════════════════════════════════════════════════════
-- COMPLÉTER LE PIPE : LA PLACE LIBRE SE CALCULE, LE CHOIX SE PRIORISE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 21/09/2026 : « quand je clique sur un des 2 boutons, Kimatch calcule le nombre
-- d'enregistrements manquants dans le pipe afin d'atteindre la limite et vient compléter
-- arbitrairement avec des pistes ou le vivier. Pour le vivier, choisis prioritairement les
-- contacts avec un maximum de périmètre. Pour les pistes, choisis prioritairement les contacts
-- avec une liste de copropriété non vide. »
--
-- CE QUI CHANGE : `completer_pipe_du_jour` tirait `order by random()`. La place libre était donc
-- bien calculée, mais dépensée au hasard — un contact à un seul compteur pouvait prendre le
-- dernier créneau devant un syndic à quarante. Le hasard n'est acceptable que pour départager
-- des égaux, pas pour décider.
-- ════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.completer_pipe_du_jour(p_combien integer default null)
returns integer
language plpgsql
set search_path to 'public'
as $function$
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
       -- LE PLUS DE PÉRIMÈTRE D'ABORD. Trois clés, de la plus décisive à la plus fine :
       --   1. les compteurs QUALIFIANTS — ceux qui rendent le contact éligible, donc ce que
       --      l'appel a réellement à traiter ;
       --   2. le volume, parce qu'à nombre égal de compteurs, quarante GWh ne pèsent pas comme
       --      quarante MWh ;
       --   3. le parc total, qui départage un contact dont le reste du périmètre suivra.
       -- Le hasard reste en dernier ressort : il départage les strictement égaux sans jamais
       -- présenter deux matins de suite le même contact en tête.
       order by coalesce(v.compteurs_qualifiants, 0) desc,
                coalesce(v.mwh_annuels, 0)          desc,
                coalesce(v.compteurs_total, 0)      desc,
                random()
       limit v_place
    ) tire;

  if v_contacts is null then return 0; end if;

  return ajouter_au_pipe_depuis_vivier(v_contacts);
end;
$function$;

comment on function public.completer_pipe_du_jour(integer) is
  'Remplit le pipe du jour jusqu''au plafond depuis le vivier, en servant d''abord le plus de périmètre (William, 21/09/2026).';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LE MÊME GESTE, DEPUIS LES PISTES
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- Il n'existait pas : « Compléter avec mes pistes » se contentait d'ouvrir l'onglet, à charge
-- pour le conseiller de cocher à la main. Les deux boutons doivent faire le même geste.
--
-- LA PRIORITÉ EST LA LISTE DE COPROPRIÉTÉS, et elle discrimine vraiment : 3 603 pistes actives
-- sur 4 882 en portent une. Une piste qui nomme ses copropriétés donne de quoi ouvrir l'appel ;
-- une piste sans liste oblige à tout demander.
create or replace function public.completer_pipe_du_jour_depuis_pistes(p_combien integer default null)
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
  v_pistes  uuid[];
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

  select array_agg(id) into v_pistes
    from (
      select p.id
        from pistes p
        left join statuts_pistes s on s.id = p.statut_id
       where p.proprietaire_id = v_moi
         and coalesce(p.actif, true)
         and coalesce(s.est_cloture, false) = false
         -- Déjà dans le pipe d'aujourd'hui : l'y remettre ne ferait que consommer une place
         -- pour rien, puisque l'insertion finale l'ignorerait.
         and not exists (
           select 1 from pipe_du_jour d
            where d.profil_id = v_moi and d.jour = v_jour
              and d.cible_type = 'PISTE' and d.cible_id = p.id
         )
       order by (nullif(btrim(p.liste_coproprietes), '') is not null) desc,
                coalesce(p.nombre_coproprietes, 0) desc,
                -- À valeur égale, la jamais appelée passe devant : c'est déjà l'ordre de la liste
                -- « Mes pistes », et deux ordres différents pour un même gisement se
                -- contrediraient sous les yeux du conseiller.
                p.date_premier_appel asc nulls first,
                p.date_creation asc
       limit v_place
    ) tire;

  if v_pistes is null then return 0; end if;

  return ajouter_au_pipe_depuis_pistes(v_pistes);
end;
$function$;

comment on function public.completer_pipe_du_jour_depuis_pistes(integer) is
  'Remplit le pipe du jour jusqu''au plafond depuis ses propres pistes, en servant d''abord celles qui portent une liste de copropriétés (William, 21/09/2026).';

revoke all on function public.completer_pipe_du_jour_depuis_pistes(integer) from public;
grant execute on function public.completer_pipe_du_jour_depuis_pistes(integer) to authenticated;
