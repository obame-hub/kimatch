-- Le dessin colore la pastille du type : une réclamation n'a pas le même poids qu'une demande, et
-- c'est ce qu'on voit en premier. La teinte est écrite ici plutôt que devinée à l'affichage : un
-- écran qui compare des libellés se trompe dès qu'on renomme un type dans la table de référence.

create or replace function public.fn_notifier_nouvelle_requete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_destinataire uuid;
  v_compte text;
  v_type text;
  v_code text;
begin
  v_destinataire := public.fn_responsable_des_suivis_contrats();
  if v_destinataire is null then return new; end if;

  /* On ne se prévient pas soi-même de ce qu'on vient de taper. `auth.uid()` est nul pour un import
     ou une migration, et la notification part alors normalement. */
  if auth.uid() is not null and auth.uid() = v_destinataire then return new; end if;

  select c.nom into v_compte from comptes c where c.id = new.compte_id;
  select t.libelle, t.code into v_type, v_code from types_requetes t where t.id = new.type_requete_id;

  insert into public.notifications (
    destinataire_profil_id, titre, message, lien, entite_type, entite_id, categorie, cree_par_id, donnees
  ) values (
    v_destinataire,
    'Nouvelle requête',
    concat_ws(' · ', nullif(new.objet, ''), v_compte, v_type),
    '/requetes/' || new.id,
    'requete',
    new.id,
    'nouvelle_requete',
    auth.uid(),
    jsonb_strip_nulls(jsonb_build_object(
      /* LE SUJET EST L'OBJET DE LA REQUÊTE, pas le compte : c'est lui qu'on cherche du regard dans
         une liste de requêtes, et le compte se lit juste en dessous. */
      'sujet', nullif(new.objet, ''),
      'reference', new.reference,
      'jeton', v_type,
      'ton', case when v_code = 'RECLAMATION' then 'alerte' else 'neutre' end,
      'precision', lower(nullif(new.categorie, '')),
      'sous_titre', v_compte
    ))
  );
  return new;
end;
$fn$;
