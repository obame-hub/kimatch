-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- QUI A MODIFIÉ LA PISTE DANS SALESFORCE — UNE COLONNE À PART, ET C'EST VOULU
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 14/09/2026 : le bloc « Informations système » de la fiche Lead montre « Créé par William
-- GOUPIL, 10/06/2026 » et « Dernière modification par Thomas LE GUEN, 07/07/2026 ». Les deux
-- manquaient : 0 créateur sur 5 139 pistes, 3 modificateurs.
--
-- ══ LE CRÉATEUR EST ENTRÉ, LE MODIFICATEUR NON, ET LA CAUSE EST UN GARDE-FOU ══════════════════
--
-- L'import a écrit les deux ; à la relecture, `cree_par_id` portait 5 113 valeurs et
-- `modifie_par_id` zéro. `fn_audit_trace` en est la raison, et il a raison :
--
--     elsif TG_OP = 'UPDATE' then
--       if colonnes ? 'modifie_par_id' then new.modifie_par_id := qui; end if;
--
-- `qui` vaut `auth.uid()`, nul sur une connexion directe. Toute écriture repose donc la colonne à
-- « personne ». Ce n'est pas un défaut à contourner : `modifie_par_id` répond à « qui a touché
-- cette piste DANS KIMATCH », et y inscrire Thomas ferait dire à la fiche qu'il l'a modifiée ici,
-- ce qui est faux. Le déclencheur protège le sens de la colonne.
--
-- ══ DEUX QUESTIONS, DEUX COLONNES ════════════════════════════════════════════════════════════
--
-- « Qui l'a modifiée dans Kimatch » et « qui l'a modifiée dans Salesforce » sont deux faits
-- différents, et le second ne bougera plus jamais — Salesforce n'est plus la source vivante. On lui
-- donne sa colonne, à côté de `date_modification_salesforce` qui existe déjà et qui, elle, était
-- restée orpheline de son auteur.
--
-- `cree_par_id`, LUI, GARDE LE CRÉATEUR SALESFORCE. Le déclencheur ne l'écrase pas (`coalesce` à
-- l'insertion seulement), et la question « qui a créé cette piste » n'a qu'une réponse : la
-- personne qui l'a créée, là où elle l'a été. Lui inventer une seconde colonne dirait qu'il y a eu
-- deux créations.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.pistes
  add column if not exists modifie_par_salesforce_id uuid references public.profils(id) on delete set null;

comment on column public.pistes.modifie_par_salesforce_id is
  'Qui a modifié la piste EN DERNIER DANS SALESFORCE — le « Dernière modification par » du bloc '
  'Informations système. Distinct de `modifie_par_id`, qui répond à la même question pour Kimatch '
  'et que `fn_audit_trace` repose à chaque écriture.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : CELLE-CI SURVIT À L'ÉCRITURE, CONTRAIREMENT À L'AUTRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- C'est tout l'objet de la colonne : vérifier qu'elle existe ne prouverait rien, puisque
-- `modifie_par_id` existe aussi et ne tient pas. On écrit donc les DEUX sur une vraie piste, on
-- relit, et on regarde laquelle a survécu au déclencheur d'audit.
--
do $$
declare
  essai    uuid;
  un_profil uuid;
  relu     record;
begin
  select id into un_profil from public.profils limit 1;
  if un_profil is null then
    raise exception 'Aucun profil en base : la colonne n''aurait personne à désigner.';
  end if;

  insert into public.pistes (societe, modifie_par_id, modifie_par_salesforce_id)
  values ('Garde-fou de migration', un_profil, un_profil)
  returning id into essai;

  -- Une mise à jour, celle qui fait travailler `fn_audit_trace`.
  update public.pistes set societe = 'Garde-fou de migration (modifié)' where id = essai;
  select * into relu from public.pistes where id = essai;

  if relu.modifie_par_salesforce_id is distinct from un_profil then
    raise exception 'La colonne Salesforce ne survit pas à une mise à jour : elle vaut % au lieu de %.',
      relu.modifie_par_salesforce_id, un_profil;
  end if;
  if relu.modifie_par_id is not null then
    raise notice 'Note : modifie_par_id vaut % — le déclencheur a trouvé un utilisateur connecté.',
      relu.modifie_par_id;
  end if;

  delete from public.pistes where id = essai;
  raise notice 'Garde-fou : le modificateur Salesforce survit là où `modifie_par_id` est reposé par l''audit.';
end $$;

commit;
