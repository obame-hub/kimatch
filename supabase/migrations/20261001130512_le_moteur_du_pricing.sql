-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE MOTEUR DU PRICING — étape 1 : la commande, les offres, les communs, la publication
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026 : « On doit rendre accessible à la navigation toute la machinerie du
-- pricing, jusqu'à l'endroit où seront renseignés (manuellement ou automatiquement) les prix
-- unitaires de chacune de nos offres. » Trois incohérences relevées le même jour, deux à corriger :
--
--   1. LA COMMANDE ÉTAIT LA MÊME POUR TOUS LES FOURNISSEURS d'une version : durées et types de prix
--      portés par la version. William : « on va essayer de changer ça » — la commande devient celle
--      de CHAQUE fournisseur consulté (`optimisations_fournisseurs.durees_mois` / `types_prix`).
--      Les durées restent les mêmes pour tous les compteurs de la version : « une version
--      correspond à un appel d'offres […] il faut que tous les compteurs répondent à la même
--      commande. Autrement le comparatif serait faussé. »
--   3. UN FOURNISSEUR, UNE DURÉE OU UN TYPE AJOUTÉ APRÈS COUP N'AVAIT PAS SON OFFRE. William : « toutes
--      les offres doivent exister sous cette version spécifiquement ». La base les crée désormais
--      elle-même, à chaque changement de commande (`fn_offres_suivent_la_commande`).
--
-- S'y ajoutent deux choses que le tableau du pricing exige :
--   · LES COMMUNS DU COMPTEUR — TQD, accise, CTA, TURPE sont « identiques pour tous » les
--     fournisseurs (PDF de William) : ils se saisissent UNE fois par compteur de la version
--     (`versions_recommandation_compteurs`), jamais offre par offre ;
--   · LA PUBLICATION du comparatif aux commerciaux (`date_publication_comparatif`). La colonne
--     `date_publication`, déjà là et jamais remplie, n'a pas été réemployée : son sens n'a jamais
--     été écrit, et un nom qui dit la chose évite de deviner.

-- ── 1. La commande de chaque fournisseur consulté ──────────────────────────────────────────────
alter table public.optimisations_fournisseurs
  add column if not exists durees_mois integer[] not null default '{}',
  add column if not exists types_prix  text[]    not null default '{}';

comment on column public.optimisations_fournisseurs.durees_mois is
  'Les durees commandees a CE fournisseur (mois). Chaque duree x type a son offre, creee par la base.';
comment on column public.optimisations_fournisseurs.types_prix is
  'Les types de prix commandes a CE fournisseur (Fixe, Indexe...). Voir durees_mois.';

-- Reprise : la commande d'hier était celle de la version, pour tous ses fournisseurs — à laquelle
-- s'ajoutent les durées et types des offres DÉJÀ créées sous ce fournisseur, pour qu'aucune offre
-- existante ne se retrouve hors commande (et ne soit mise en sommeil) au passage.
update public.optimisations_fournisseurs f
   set durees_mois = coalesce((
         select array_agg(distinct x order by x) from (
           select d.duree_mois as x
           from public.optimisations o
           join public.versions_recommandation_durees d on d.version_recommandation_id = o.version_recommandation_id
           where o.id = f.optimisation_id
           union
           select of2.duree_mois from public.offres_fournisseurs of2
           where of2.optimisation_fournisseur_id = f.id and of2.nature_offre = 'PROPOSEE' and of2.duree_mois is not null
         ) u), '{}'),
       types_prix = coalesce((
         select array_agg(distinct x) from (
           select unnest(v.types_prix) as x
           from public.optimisations o
           join public.versions_recommandation v on v.id = o.version_recommandation_id
           where o.id = f.optimisation_id
           union
           select of2.type_prix from public.offres_fournisseurs of2
           where of2.optimisation_fournisseur_id = f.id and of2.nature_offre = 'PROPOSEE' and of2.type_prix is not null
         ) u), '{}')
 where f.durees_mois = '{}' and f.types_prix = '{}';

-- ── 2. Les offres suivent la commande ──────────────────────────────────────────────────────────
-- Une offre par durée × type commandé. Une combinaison retirée de la commande : son offre disparaît
-- si rien n'y a été saisi, et se met en sommeil (actif = false) sinon — un prix déjà relevé ne se
-- jette pas parce qu'on a décoché une case. La recocher la réveille.
create or replace function public.fn_offres_suivent_la_commande(p_optimisation_fournisseur uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  v_gaz boolean;
begin
  select * into f from public.optimisations_fournisseurs where id = p_optimisation_fournisseur;
  if not found then return; end if;
  -- UNE COMMANDE VIDE N'EST PAS UNE COMMANDE : c'est un fournisseur consulté par un écran qui ne la
  -- renseigne pas encore. On ne touche alors à rien, plutôt que de mettre ses offres en sommeil.
  if cardinality(f.durees_mois) = 0 and cardinality(f.types_prix) = 0 then return; end if;

  -- L'offre exige une fiche fournisseur ; un fournisseur consulté qui n'en a pas en reçoit une,
  -- marquée de l'énergie de la recommandation (la fiche doit dire gaz ou électricité).
  select te.code = 'GAZ' into v_gaz
  from public.optimisations o
  join public.versions_recommandation v on v.id = o.version_recommandation_id
  join public.recommandations r on r.id = v.recommandation_id
  left join public.types_energies te on te.id = r.type_energie_id
  where o.id = f.optimisation_id;
  insert into public.comptes_fournisseurs (compte_id, fournit_gaz, fournit_electricite)
  values (f.fournisseur_compte_id, coalesce(v_gaz, false), not coalesce(v_gaz, false))
  on conflict (compte_id) do nothing;

  insert into public.offres_fournisseurs
    (optimisation_id, optimisation_fournisseur_id, compte_fournisseur_id, nom, statut, duree_mois, type_prix, nature_offre)
  select f.optimisation_id, f.id, f.fournisseur_compte_id, d || ' mois — ' || t, 'EN_ATTENTE', d, t, 'PROPOSEE'
  from unnest(f.durees_mois) d cross join unnest(f.types_prix) t
  where not exists (
    select 1 from public.offres_fournisseurs o
    where o.optimisation_fournisseur_id = f.id and o.nature_offre = 'PROPOSEE'
      and o.duree_mois = d and o.type_prix = t
  );

  update public.offres_fournisseurs o
     set actif = (o.duree_mois = any (f.durees_mois) and o.type_prix = any (f.types_prix))
   where o.optimisation_fournisseur_id = f.id and o.nature_offre = 'PROPOSEE'
     and o.actif is distinct from (o.duree_mois = any (f.durees_mois) and o.type_prix = any (f.types_prix));

  delete from public.offres_fournisseurs o
   where o.optimisation_fournisseur_id = f.id and o.nature_offre = 'PROPOSEE' and not o.actif
     and not exists (select 1 from public.offres_fournisseurs_compteurs c where c.offre_fournisseur_id = o.id);
end;
$$;

create or replace function public.fn_trg_offres_suivent_la_commande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_offres_suivent_la_commande(new.id);
  return null;
end;
$$;

revoke all on function public.fn_offres_suivent_la_commande(uuid) from public, anon, authenticated;
revoke all on function public.fn_trg_offres_suivent_la_commande() from public, anon, authenticated;

drop trigger if exists trg_offres_suivent_la_commande on public.optimisations_fournisseurs;
create trigger trg_offres_suivent_la_commande
  after insert or update of durees_mois, types_prix on public.optimisations_fournisseurs
  for each row execute function public.fn_trg_offres_suivent_la_commande();

-- Reprise : les versions EN CONSTRUCTION reçoivent les offres qui leur manquaient. Ni les clôturées,
-- qui restent telles qu'elles ont été vécues, ni les disponibles : leur ajouter une offre en attente
-- réveillerait `garde_fou_version_sans_offre`, qui renverrait en construction les 68 versions déjà
-- passées « Disponible » sans offre au statut DISPONIBLE (mesuré le 01/10/2026).
do $$
declare r record;
begin
  for r in
    select f.id from public.optimisations_fournisseurs f
    join public.optimisations o on o.id = f.optimisation_id
    join public.versions_recommandation v on v.id = o.version_recommandation_id
    join public.statuts_versions_recommandation s on s.id = v.statut_version_id
    where s.code = 'EN_CONSTRUCTION'
  loop
    perform public.fn_offres_suivent_la_commande(r.id);
  end loop;
end $$;

-- ── 3. Les communs du compteur, saisis une fois ────────────────────────────────────────────────
alter table public.versions_recommandation_compteurs
  add column if not exists prix_atrd_mwh        numeric,
  add column if not exists prix_agn_mwh         numeric,
  add column if not exists cta_annuel_ht        numeric,
  add column if not exists prix_turpe_annuel_ht numeric,
  add column if not exists accise_mwh           numeric;

comment on column public.versions_recommandation_compteurs.prix_atrd_mwh is 'Gaz : TQD (terme de quantite distribution), EUR/MWh, commun a toutes les offres.';
comment on column public.versions_recommandation_compteurs.prix_agn_mwh is 'Gaz : accise sur le gaz (AG), EUR/MWh, commune a toutes les offres.';
comment on column public.versions_recommandation_compteurs.cta_annuel_ht is 'Gaz et electricite : CTA, EUR/an, commune a toutes les offres.';
comment on column public.versions_recommandation_compteurs.prix_turpe_annuel_ht is 'Electricite : TURPE du PDL, EUR/an, commun a toutes les offres.';
comment on column public.versions_recommandation_compteurs.accise_mwh is 'Electricite : accise (AE), EUR/MWh, commune a toutes les offres.';

-- ── 4. La publication du comparatif ────────────────────────────────────────────────────────────
alter table public.versions_recommandation
  add column if not exists date_publication_comparatif timestamptz,
  add column if not exists publie_par_id uuid references public.profils(id) on delete set null;

comment on column public.versions_recommandation.date_publication_comparatif is
  'Quand le pricing a publie le comparatif aux commerciaux. NULL : chiffrage en cours, le commercial voit les commandes fournisseurs.';
