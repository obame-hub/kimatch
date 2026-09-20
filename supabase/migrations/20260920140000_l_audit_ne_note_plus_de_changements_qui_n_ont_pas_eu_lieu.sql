-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'AUDIT N'ENREGISTRE PLUS DES CHANGEMENTS QUI N'ONT PAS EU LIEU
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Découvert le 20/09/2026 en requalifiant 146 échanges « Retour CS » et « FABA » : l'historique a
-- enregistré 292 lignes pour 146 modifications. La moitié annonçait que `ouverture_suivie` était
-- passée de « false » à « null » — ce qui n'est jamais arrivé : la colonne vaut toujours false sur
-- les 83 101 lignes concernées, zéro null en base.
--
-- ══ LA CAUSE ════════════════════════════════════════════════════════════════════════════════
--
-- `ouverture_suivie` est une colonne GÉNÉRÉE : `jeton_ouverture is not null`. PostgreSQL calcule
-- les colonnes générées APRÈS les déclencheurs `before`. Dans un `before update`, `NEW` porte donc
-- une valeur nulle pour ces colonnes-là, quoi qu'il arrive.
--
-- `fn_audit_trace` compare `old` et `new` colonne par colonne. Sur une colonne générée, elle
-- compare donc toujours « la vraie valeur d'avant » à « null », conclut à un changement, et écrit
-- une ligne d'historique. À CHAQUE MISE À JOUR, quel que soit le champ réellement modifié.
--
-- ══ L'AMPLEUR ═══════════════════════════════════════════════════════════════════════════════
--
-- 1 648 lignes fausses sur `interactions.ouverture_suivie` depuis le 14/09/2026 — date de création
-- de la colonne. Deux autres colonnes générées existent et produisent la même chose :
-- `compteurs.adresse_site` et `compteurs.adresse_site_recherche`.
--
-- CE N'EST PAS UN DÉTAIL DE JOURNAL. L'historique est ce qu'on ouvre pour savoir qui a changé quoi
-- sur un dossier ; un historique qui invente des modifications se lit comme le reste, et on finit
-- par ne plus croire aucune de ses lignes.
--
-- ══ LA CORRECTION ═══════════════════════════════════════════════════════════════════════════
--
-- On saute les colonnes générées. C'est la seule réponse juste : leur valeur ne se saisit pas, elle
-- se déduit — personne ne les « modifie », donc il n'y a rien à tracer. Et la liste n'est pas écrite
-- en dur : elle se lit dans le catalogue, pour la table qui déclenche. Une colonne générée ajoutée
-- demain sera ignorée sans qu'on y pense.
--
-- LES 1 648 LIGNES DÉJÀ ÉCRITES NE SONT PAS EFFACÉES ICI. Supprimer de l'historique demande une
-- décision, pas une migration qui passe en silence — voir `scripts/nettoyer-historique-fantome.cjs`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_audit_trace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  col       text;
  old_val   text;
  new_val   text;
  colonnes  jsonb;
  qui       uuid := auth.uid();
  d_ou      text;
  generees  text[];
begin
  -- `to_jsonb(new)` donne les colonnes REELLES de la table qui declenche : c'est ce qui permet au
  -- meme declencheur de servir une table qui porte un proprietaire et une autre qui n'en a pas,
  -- au lieu d'echouer sur la seconde.
  colonnes := to_jsonb(new);

  -- Ce qui ecrit, quand ce n'est pas quelqu'un. Reglage a nous : le pooler Supabase remplace
  -- `application_name` par « Supavisor », ce qui aurait signe tout l'historique d'un nom faux.
  d_ou := case
            when qui is not null then null
            else nullif(current_setting('kimatch.origine', true), '')
          end;

  if TG_OP = 'INSERT' then
    if colonnes ? 'cree_par_id'      then new.cree_par_id      := coalesce(new.cree_par_id, qui); end if;
    if colonnes ? 'proprietaire_id'  then new.proprietaire_id  := coalesce(new.proprietaire_id, qui); end if;
    if colonnes ? 'modifie_par_id'   then new.modifie_par_id   := qui; end if;
    if colonnes ? 'date_modification' then new.date_modification := now(); end if;
    return new;

  elsif TG_OP = 'UPDATE' then
    if colonnes ? 'modifie_par_id'    then new.modifie_par_id    := qui; end if;
    if colonnes ? 'date_modification' then new.date_modification := now(); end if;

    /* ══ LES COLONNES GÉNÉRÉES SONT HORS DU CHAMP DE L'AUDIT ══
       PostgreSQL les calcule APRÈS les déclencheurs `before` : ici, `NEW` en porte toujours null,
       et les comparer reviendrait à annoncer un changement à chaque mise à jour. Leur valeur ne se
       saisit d'ailleurs pas — elle se déduit d'autres colonnes, qui sont tracées, elles.

       LU DANS LE CATALOGUE, PAS ÉCRIT EN DUR : `TG_RELID` désigne la table qui déclenche, donc une
       colonne générée ajoutée demain sera ignorée sans que personne y pense. */
    select coalesce(array_agg(a.attname::text), '{}')
      into generees
      from pg_attribute a
     where a.attrelid = TG_RELID and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';

    for col in select key from jsonb_each_text(to_jsonb(old)) loop
      if col not in ('date_modification', 'modifie_par_id') and not (col = any(generees)) then
        old_val := (to_jsonb(old) ->> col);
        new_val := (to_jsonb(new) ->> col);
        if old_val is distinct from new_val then
          insert into public.historique_modifications(
            table_nom, ligne_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_id, origine)
          values (TG_TABLE_NAME, new.id, col, old_val, new_val, qui, d_ou);
        end if;
      end if;
    end loop;
    return new;

  elsif TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.fn_audit_trace() is
  'Trace les modifications dans historique_modifications. Ignore les colonnes GÉNÉRÉES : '
  'PostgreSQL les calcule après les déclencheurs « before », donc NEW y porte toujours null et les '
  'comparer inventait un changement à chaque mise à jour (1 648 lignes fausses au 20/09/2026).';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : UNE MISE À JOUR NE DOIT PLUS INVENTER DE LIGNE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- On modifie un champ ordinaire sur une ligne réelle, et on vérifie DEUX choses : que le vrai
-- changement est tracé, et que la colonne générée ne l'est pas. Tester seulement la seconde
-- laisserait passer un déclencheur devenu muet, ce qui serait bien pire.
--
do $$
declare
  cible     uuid;
  avant     text;
  n_vrai    int;
  n_fantome int;
begin
  select id, objet into cible, avant
    from public.interactions
   where objet is not null and jeton_ouverture is null
   order by date_creation desc limit 1;
  if cible is null then
    raise notice 'Aucune interaction pour le garde-fou — contrôle sauté.';
    return;
  end if;

  perform set_config('kimatch.origine', 'garde-fou-audit-genere', true);
  update public.interactions set objet = avant || ' [essai]' where id = cible;

  select count(*) into n_vrai from public.historique_modifications
   where ligne_id = cible and champ = 'objet' and origine = 'garde-fou-audit-genere';
  select count(*) into n_fantome from public.historique_modifications
   where ligne_id = cible and champ = 'ouverture_suivie' and origine = 'garde-fou-audit-genere';

  -- On remet la valeur d'origine avant de juger : un `raise exception` annulerait tout, mais un
  -- succès laisserait « [essai] » collé à l'objet d'un vrai échange.
  update public.interactions set objet = avant where id = cible;
  delete from public.historique_modifications where origine = 'garde-fou-audit-genere';

  if n_vrai <> 1 then
    raise exception 'Le déclencheur ne trace plus les vrais changements (% ligne(s) pour objet).', n_vrai;
  end if;
  if n_fantome <> 0 then
    raise exception 'Une colonne générée est encore tracée : % ligne(s) fantôme(s).', n_fantome;
  end if;

  raise notice 'Garde-fou : le vrai changement est tracé, la colonne générée ne l''est plus.';
end $$;

commit;
