-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE DE SUIVI DE CONTRAT REVIENT À SON RESPONSABLE, SANS EXCEPTION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 25/09/2026 : « toutes les tâches liées à des suivis de contrats doivent avoir comme
-- responsable Fabien DUBARRY, sans exception ».
--
-- ══ POURQUOI EN BASE, ET PAS DANS L'ÉCRAN ══
--
-- « Sans exception » ne se tient pas dans un formulaire. Une tâche de suivi naît aussi d'un import,
-- d'une reprise, d'une tâche existante qu'on rattache après coup à un dossier, ou d'un écran qu'on
-- écrira l'an prochain. Une valeur par défaut posée à la saisie couvre le chemin qu'on connaît ;
-- elle laisse passer tous les autres. Le déclencheur, lui, voit chaque écriture.
--
-- IL AGIT AUSSI À L'UPDATE, et c'est la moitié qui manquait : `trg_tache_herite_du_proprietaire` ne
-- se déclenche qu'à l'INSERT. Sans le second temps, il suffisait de changer le responsable après
-- coup — ou de rattacher à un suivi une tâche qui existait déjà — pour sortir de la règle.
--
-- ══ L'IDENTIFIANT VIT DANS UNE FONCTION, PAS DANS LE DÉCLENCHEUR ══
--
-- Le jour où ce ne sera plus Fabien, il y aura UNE ligne à changer, à un endroit dont le nom dit
-- exactement ce qu'il désigne. C'est aussi ce qui rend la règle lisible ailleurs : un écran qui
-- voudra pré-remplir le champ peut appeler la même fonction plutôt que de recopier un UUID.
--
-- ══ VÉRIFIÉ APRÈS APPLICATION, SUR LA PRODUCTION ══
--
--   · 368 tâches de suivi, 368 à Fabien, 0 exception ;
--   · une tentative de réassignation vers quelqu'un d'autre est ramenée à Fabien (essayée puis
--     annulée sur une vraie ligne).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_responsable_des_suivis_contrats()
returns uuid
language sql
stable
set search_path to 'public'
as $fn$
  /* Fabien Dubarry (f.dubarry@kiwee-energie.fr). L'identifiant plutôt que l'email : il ne change
     jamais, là où une adresse se corrige. */
  select 'eae76279-6014-4043-8a35-19bce2429e75'::uuid;
$fn$;

comment on function public.fn_responsable_des_suivis_contrats() is
  'Qui porte les taches des suivis de contrat. Regle posee par William le 25/09/2026 : toutes, sans '
  'exception. Changer de personne = changer cette seule ligne.';

create or replace function public.fn_tache_de_suivi_revient_a_son_responsable()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.suivi_contrat_id is not null then
    new.responsable_profil_id := public.fn_responsable_des_suivis_contrats();
  end if;
  return new;
end;
$fn$;

/* UN DÉCLENCHEUR À PART, et non une branche ajoutée dans `fn_tache_herite_du_proprietaire`.
   Celle-ci ne pose le responsable que s'il est NUL : elle propose un défaut. Ici on impose une
   règle. Mêlées dans la même fonction, les deux intentions finiraient par se contredire — et
   `fn_tache_herite_du_proprietaire` sert à toutes les autres tâches, qu'on ne veut pas toucher. */
drop trigger if exists trg_tache_de_suivi_revient_a_son_responsable on public.actions;
create trigger trg_tache_de_suivi_revient_a_son_responsable
  before insert or update on public.actions
  for each row execute function public.fn_tache_de_suivi_revient_a_son_responsable();

-- ══ LA REPRISE DE L'EXISTANT ══
--
-- 66 tâches sur 368 n'étaient pas à lui : 42 closes sans aucun responsable, 23 ouvertes portées par
-- cinq personnes (Marie 11, Matthieu 3, William 3, Michel 3, Guillaume 3) et 1 close de Thomas.
update public.actions
   set responsable_profil_id = public.fn_responsable_des_suivis_contrats()
 where suivi_contrat_id is not null
   and responsable_profil_id is distinct from public.fn_responsable_des_suivis_contrats();
