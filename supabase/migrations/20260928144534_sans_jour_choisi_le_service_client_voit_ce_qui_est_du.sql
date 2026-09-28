-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SANS JOUR CHOISI, LE SERVICE CLIENT VOIT CE QUI EST DÛ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 : « Sur la vue d'ensemble de Fabien, si aucune date n'a été sélectionnée dans
-- le suivi de charge, il faut que ce soit les tâches du jour et celles en retard qui s'affichent, pas
-- les tâches futures. »
--
-- Sans jour choisi, les deux tableaux montraient TOUTES les tâches ouvertes. Mesuré ce jour sur la
-- vue de Fabien : 17 tâches de fidélisation dues aujourd'hui ou en retard, noyées parmi 260 futures.
-- Le futur a déjà sa place — la charge à venir, où l'on clique un jour pour le voir.
--
-- ══ LES TÂCHES SANS DATE RESTENT ══
--
-- Elles ne sont ni du jour ni en retard, mais aucun jour de la charge ne les porte non plus : les
-- retirer d'ici les rendait invisibles sur toute la vue d'ensemble. Une tâche sans échéance est à
-- faire dès que possible — elle reste donc dans ce qui est dû. (Une seule ce jour, sur une requête.)
--
-- ══ DEUX ANCIENNES VERSIONS S'EFFACENT ══
--
-- `taches_ouvertes_des_requetes()` et `taches_ouvertes_des_suivis()` SANS paramètre survivaient à la
-- migration du 25/09 qui leur avait ajouté le jour : elles listaient les tâches de TOUT LE MONDE,
-- sans filtre sur l'utilisateur. Plus rien ne les appelait.

drop function if exists public.taches_ouvertes_des_requetes();
drop function if exists public.taches_ouvertes_des_suivis();

create or replace function public.taches_ouvertes_des_requetes(p_jour date default null)
returns table(id uuid, titre text, echeance timestamptz, en_retard boolean, requete_id uuid,
              requete_reference text, requete_objet text, compte_id uuid, compte_nom text,
              contact_id uuid, contact_nom text)
language sql
stable
set search_path to 'public'
as $function$
  select
    a.id, a.titre, a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date,
    r.id, r.reference, r.objet,
    cp.id, cp.nom,
    ct.id, trim(concat_ws(' ', ct.prenom, ct.nom))
  from actions a
  join requetes r  on r.id = a.requete_id
  left join comptes  cp on cp.id = coalesce(a.compte_id, r.compte_id)
  left join contacts ct on ct.id = coalesce(a.contact_id, r.contact_id)
  where a.actif
    and a.responsable_profil_id = auth.uid()
    and exists (select 1 from statuts_actions s where s.id = a.statut_id and s.code not in ('TERMINEE','ANNULEE'))
    and case
          -- Un jour choisi dans la charge : ce jour-là, et lui seul.
          when p_jour is not null then (a.date_prevue at time zone 'Europe/Paris')::date = p_jour
          -- Aucun jour : ce qui est dû — aujourd'hui, en retard, ou sans échéance.
          else a.date_prevue is null
            or (a.date_prevue at time zone 'Europe/Paris')::date <= (now() at time zone 'Europe/Paris')::date
        end
  order by a.date_prevue asc nulls last;
$function$;

create or replace function public.taches_ouvertes_des_suivis(p_jour date default null)
returns table(id uuid, titre text, echeance timestamptz, en_retard boolean, suivi_id uuid,
              contrat_id uuid, contrat_reference text, compte_nom text, contact_id uuid,
              contact_nom text, etape_libelle text, etape_ordre integer)
language sql
stable
set search_path to 'public'
as $function$
  select
    a.id, a.titre, a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::date < (now() at time zone 'Europe/Paris')::date,
    s.id, c.id, c.reference,
    cp.nom,
    ct.id, trim(concat_ws(' ', ct.prenom, ct.nom)),
    e.libelle, e.ordre
  from actions a
  join suivis_contrats s on s.id = a.suivi_contrat_id
  left join contrats c  on c.id = s.contrat_id
  left join comptes  cp on cp.id = s.compte_id
  left join contacts ct on ct.id = coalesce(a.contact_id, s.contact_principal_id)
  left join etapes_suivis_contrats e on e.id = s.etape_id
  where a.actif
    and a.responsable_profil_id = auth.uid()
    and exists (select 1 from statuts_actions s2 where s2.id = a.statut_id and s2.code not in ('TERMINEE','ANNULEE'))
    and case
          when p_jour is not null then (a.date_prevue at time zone 'Europe/Paris')::date = p_jour
          else a.date_prevue is null
            or (a.date_prevue at time zone 'Europe/Paris')::date <= (now() at time zone 'Europe/Paris')::date
        end
  order by a.date_prevue asc nulls last;
$function$;

-- Réservées aux utilisateurs connectés : elles lisent `auth.uid()`, un anonyme n'y a rien à faire.
revoke execute on function public.taches_ouvertes_des_requetes(date) from public, anon;
grant  execute on function public.taches_ouvertes_des_requetes(date) to authenticated;
revoke execute on function public.taches_ouvertes_des_suivis(date)   from public, anon;
grant  execute on function public.taches_ouvertes_des_suivis(date)   to authenticated;
