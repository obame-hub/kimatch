-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA VUE D'ENSEMBLE DU SERVICE CLIENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « pour les rôles service client, comme celui de l'utilisateur Fabien
-- DUBARRY, il faut proposer une vue d'ensemble différente […] ces réformes de vue d'ensemble
-- doivent uniquement être visibles pour les utilisateurs avec le rôle "Service client" ».
--
-- ══ UN RÉGLAGE, PAS UNE COMPARAISON SUR LE NOM ══
--
-- `roles_acces` porte déjà `ouvre_administration`, `voit_tous_les_comptes`, `supprime_tout`,
-- `recoit_le_support` — et la migration du 24/09/2026 qui a créé la première dit pourquoi :
-- `code = 'ADMIN'` rendait le droit non réglable, un rôle créé dans la page Rôles ne pouvait pas
-- l'obtenir, et le retirer exigeait un redéploiement.
--
-- Le même raisonnement vaut ici. Écrire `roleCode === 'SERVICE_CLIENT'` dans l'écran marcherait
-- aujourd'hui, où Fabien est seul à porter ce rôle ; cela cesserait le jour où l'on crée
-- « Service client Nord » ou l'on renomme celui-ci.

alter table public.roles_acces
  add column if not exists vue_service_client boolean not null default false;

comment on column public.roles_acces.vue_service_client is
  'Ce role voit la vue d''ensemble du service client (charge large, requetes, fidelisation) au lieu '
  'de celle des commerciaux. Reglable, comme ouvre_administration : jamais compare au code.';

update public.roles_acces set vue_service_client = true where code = 'SERVICE_CLIENT';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA CHARGE À VENIR, SUR UNE FENÊTRE CHOISIE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- La fonction existante couvre trente jours, ce qui suffit aux commerciaux — « on ne cale pas un
-- appel de relance à trois semaines ». Le service client, lui, regarde jusqu'à M+6 : les échéances
-- de contrat se préparent des mois à l'avance.
--
-- ON NE TOUCHE PAS À `compter_charge_a_venir` : elle sert le tableau de bord de tout le monde, et
-- son horizon de trente jours est un choix, pas une limite technique. Une seconde fonction, avec
-- son paramètre, laisse les deux usages indépendants.

create or replace function public.compter_charge_a_venir_sur(p_jours integer default 30)
returns table(jour date, taches integer)
language sql
stable
set search_path to 'public'
as $fn$
  with moi as (select auth.uid() as profil_id),
  depart as (select (now() at time zone 'Europe/Paris')::date + 1 as premier)
  select d::date, count(a.id)::integer
  from depart
  /* Borné à 400 jours : au-delà, la fenêtre ne dit plus rien d'utile et la requête grossit pour
     rien. M+6 en demande environ 185. */
  cross join generate_series(depart.premier, depart.premier + least(greatest(p_jours, 1), 400), interval '1 day') d
  left join actions a
    on (a.date_prevue at time zone 'Europe/Paris')::date = d::date
   and a.actif
   and a.responsable_profil_id = (select profil_id from moi)
   and exists (select 1 from statuts_actions sa
               where sa.id = a.statut_id and sa.code not in ('TERMINEE', 'ANNULEE'))
  group by d::date
  order by d::date;
$fn$;
