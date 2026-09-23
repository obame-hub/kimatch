-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE SANS RESPONSABLE N'EST À PERSONNE, DONC PERSONNE NE LA FAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026 : « toutes les tâches doivent avoir le propriétaire de l'enregistrement
-- comme responsable ».
--
-- ══ CE QUE J'AVAIS ANNONCÉ, ET CE QUI EST VRAI ══
--
-- J'ai présenté ces 267 tâches comme un trou du COCKPIT : elles ne feraient jamais entrer leur
-- fiche dans le plan du jour. C'était faux, et la vérification le dit sans appel — AUCUNE n'est
-- attachée à une piste ou à une opportunité. 253 le sont à un compte, 8 à un contact, 5 à une
-- requête, 8 à un suivi de contrat. Le plan du jour ne lit que les deux premières ; il n'a jamais
-- pu les voir, et il n'était pas en cause.
--
-- ELLES RESTENT PERDUES POUR AUTANT. « Ma journée » filtre sur le responsable : ces 267 tâches
-- datées — de novembre 2025 à janvier 2029 — ne s'affichaient nulle part, pour personne. Elles ont
-- été créées, elles sont datées, et elles n'existaient pour aucun écran.
--
-- ══ LE RATTRAPAGE, PUIS LA PORTE FERMÉE ══
--
-- On les rend au propriétaire de leur enregistrement : 253 par le compte, 8 par le contact. Six
-- restent sans personne à qui les rendre — leur compte n'a pas de propriétaire non plus, et
-- inventer un responsable serait pire que de laisser le trou visible.
--
-- Le déclencheur ferme ensuite la porte : toute tâche écrite sans responsable en reçoit un, pris
-- sur l'enregistrement auquel elle s'accroche. Le faire en base et non dans l'application est ce
-- qui le rend vrai pour les imports Salesforce, les scripts et les points d'entrée serveur — c'est
-- précisément par là que les 267 sont arrivées.
--
-- NOTE DE FIDÉLITÉ : la version appliquée portait en tête une instruction sans effet
-- (`update ... where false`), écrite par erreur puis neutralisée dans le même envoi. Elle n'a rien
-- modifié et n'est pas reprise ici ; le reste est identique, mot pour mot.

-- ── 1 · Le rattrapage ──
update actions a
   set responsable_profil_id = coalesce(
         (select c.proprietaire_id  from comptes  c  where c.id  = a.compte_id),
         (select ct.proprietaire_id from contacts ct where ct.id = a.contact_id)
       ),
       date_modification = now()
 where a.actif
   and a.responsable_profil_id is null
   and a.date_prevue is not null
   and exists (select 1 from statuts_actions sa
                where sa.id = a.statut_id and sa.code not in ('TERMINEE', 'ANNULEE'))
   and coalesce(
         (select c.proprietaire_id  from comptes  c  where c.id  = a.compte_id),
         (select ct.proprietaire_id from contacts ct where ct.id = a.contact_id)
       ) is not null;

-- ── 2 · La porte ──
create or replace function public.fn_tache_herite_du_proprietaire()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.responsable_profil_id is null then
    new.responsable_profil_id := coalesce(
      (select p.proprietaire_id  from pistes        p  where p.id  = new.piste_id),
      (select o.proprietaire_id  from opportunites  o  where o.id  = new.opportunite_id),
      (select c.proprietaire_id  from comptes       c  where c.id  = new.compte_id),
      (select ct.proprietaire_id from contacts      ct where ct.id = new.contact_id),
      new.proprietaire_id,
      new.cree_par_id
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_tache_herite_du_proprietaire on public.actions;
create trigger trg_tache_herite_du_proprietaire
  before insert on public.actions
  for each row execute function public.fn_tache_herite_du_proprietaire();
