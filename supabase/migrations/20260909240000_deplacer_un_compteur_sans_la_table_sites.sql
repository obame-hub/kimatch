-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DEPLACER UN COMPTEUR SANS PASSER PAR LA TABLE SITES — ETAPE 7
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CINQ FONCTIONS CITAIENT sites, UNE SEULE AVAIT BESOIN D'ETRE REECRITE ══════════════════════
--
-- Releve du 09/09/2026, apres avoir lu les cinq definitions :
--
--   fn_restaurer_suppression   1 mention, et c'est UN COMMENTAIRE. Aucune dependance reelle.
--   fn_deplacer_site           la fonction EST la fonctionnalite site. Elle part avec l'objet.
--   liste_sites                l'ecran Sites. Part avec l'ecran.
--   carte_sites                la carte des sites. Part avec l'ecran.
--   fn_deplacer_compteur       DEUX lectures a remplacer. C'est celle-ci.
--
-- Autrement dit, « les cinq fonctions » n'etaient qu'une. Le compter avant d'ecrire a evite quatre
-- reecritures inutiles — et une reecriture inutile sur une fonction de 126 lignes, c'est autant
-- d'occasions de casser quelque chose pour rien.
--
-- ══ CE QUE LES DEUX LECTURES CHERCHAIENT ═══════════════════════════════════════════════════════
--
-- Le compte et le nom d'un site, pour le site de depart et celui d'arrivee. Les deux vivent
-- desormais sur le compteur : compte_id et libelle_site, poses par la migration 20260909100000.
-- La fonction les lit donc chez les compteurs du groupe, sans toucher a la table.
--
-- LA SIGNATURE NE CHANGE PAS. p_site_destination_id continue de designer un site, puisque
-- groupe_site_id reprend exactement la valeur de l'ancien sites.id. L'ecran qui appelle cette
-- fonction — DialogDeplacerCompteur — n'a rien a changer.
--
-- ══ UN CHANGEMENT DE COMPORTEMENT, ASSUME ET DIT ═══════════════════════════════════════════════
--
-- On ne peut plus deplacer un compteur vers un site QUI N'EN PORTE AUCUN. Il y en a 33, et ils
-- deviennent invisibles a cette fonction : un groupe sans compteur n'a ni compte ni nom a lire.
--
-- C'est coherent avec la direction prise — ces 33 dossiers vides ne survivront pas au retrait de
-- l'objet site — mais ce n'est pas rien : le geste « ranger ce compteur dans ce site vide »
-- disparait. Le message d'erreur le dit en clair plutot que d'echouer sans raison lisible.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA VUE D'APPUI GAGNE LE COMPTE ──────────────────────────────────────────────────────────────
--
-- Elle rendait le site et son adresse, pas son client. Or fn_contact_rattache_au_compte cherche
-- exactement ca : le compte d'un site. La colonne s'ajoute EN FIN de vue, ce que
-- create or replace view autorise, et il n'y a pas d'ambiguite — un groupe n'a qu'un compte,
-- puisque compteurs.compte_id vient du site lui-meme.
create or replace view v_groupes_de_site as
 SELECT DISTINCT compteurs.groupe_site_id AS site_id,
    compteurs.libelle_site AS libelle,
    compteurs.adresse_site AS adresse,
    compteurs.compte_id
   FROM compteurs
  WHERE compteurs.groupe_site_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_contact_rattache_au_compte(p_contact_id uuid, p_compte_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_contact_id is not null and p_compte_id is not null and (
    exists (select 1 from contacts c where c.id = p_contact_id and c.compte_id = p_compte_id)
    or exists (select 1 from contacts_comptes cc
                where cc.contact_id = p_contact_id and cc.compte_id = p_compte_id and cc.actif)
    or exists (select 1 from contacts_sites cs
                join v_groupes_de_site s on s.site_id = cs.site_id
                where cs.contact_id = p_contact_id and s.compte_id = p_compte_id and cs.actif)
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_deplacer_compteur(p_compteur_id uuid, p_site_destination_id uuid, p_detacher_contacts boolean DEFAULT false, p_motif text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_site_origine    uuid;
  v_compte_origine  uuid;
  v_compte_dest     uuid;
  v_numero          text;
  v_nom_dest        text;
  v_nom_origine     text;
  v_signaux         integer := 0;
  v_requetes        integer := 0;
  v_contacts        integer := 0;
  v_mandats         integer;
  v_contrats        integer;
  v_recos           integer;
  v_opportunites    integer;
  v_correlation     uuid := md5(txid_current()::text)::uuid;
begin
  select cp.site_id, cp.numero_point into v_site_origine, v_numero
    from compteurs cp where cp.id = p_compteur_id;
  if v_site_origine is null then
    raise exception 'Compteur introuvable : %', p_compteur_id;
  end if;

  select g.compte_id, g.libelle into v_compte_dest, v_nom_dest
    from ( select distinct cp.groupe_site_id, cp.compte_id, cp.libelle_site as libelle
             from compteurs cp ) g
   where g.groupe_site_id = p_site_destination_id;
  if v_compte_dest is null then
    raise exception 'Site de destination introuvable, ou sans aucun compteur : %', p_site_destination_id;
  end if;

  select g.compte_id, g.libelle into v_compte_origine, v_nom_origine
    from ( select distinct cp.groupe_site_id, cp.compte_id, cp.libelle_site as libelle
             from compteurs cp ) g
   where g.groupe_site_id = v_site_origine;

  if v_site_origine = p_site_destination_id then
    raise exception 'Le compteur % est déjà rattaché au site « % ».', v_numero, v_nom_dest;
  end if;

  -- ── CE QUI RESTERA DERRIÈRE, compté AVANT l'écriture ────────────────────────────────────────
  select count(distinct mc.mandat_id) into v_mandats
    from mandats_compteurs mc join mandats m on m.id = mc.mandat_id
   where mc.compteur_id = p_compteur_id and m.compte_id = v_compte_origine;

  select count(distinct cc.contrat_id) into v_contrats
    from contrats_compteurs cc join suivis_contrats sc on sc.id = cc.contrat_id
   where cc.compteur_id = p_compteur_id and sc.compte_id = v_compte_origine;

  select count(distinct rc.recommandation_id) into v_recos
    from recommandations_compteurs rc join recommandations r on r.id = rc.recommandation_id
   where rc.compteur_id = p_compteur_id and r.compte_id = v_compte_origine;

  select count(distinct oc.opportunite_id) into v_opportunites
    from opportunites_compteurs oc join opportunites o on o.id = oc.opportunite_id
   where oc.compteur_id = p_compteur_id and o.compte_id = v_compte_origine;

  -- ── 1. LE COMPTEUR ──────────────────────────────────────────────────────────────────────────
  update compteurs set site_id = p_site_destination_id where id = p_compteur_id;

  -- ── 2. LES SIGNAUX, qui portent leur propre site (NOT NULL) ─────────────────────────────────
  update signaux set site_id = p_site_destination_id
   where compteur_id = p_compteur_id and site_id = v_site_origine;
  get diagnostics v_signaux = row_count;

  -- ── 3. LES REQUÊTES, qui portent le compte ET le site ───────────────────────────────────────
  update requetes
     set site_id   = case when site_id  = v_site_origine   then p_site_destination_id else site_id end,
         compte_id = case when compte_id = v_compte_origine then v_compte_dest         else compte_id end
   where compteur_id = p_compteur_id
     and (site_id = v_site_origine or compte_id = v_compte_origine);
  get diagnostics v_requetes = row_count;

  -- ── 4. LES CONTACTS PORTÉS PAR LE COMPTEUR, sur demande seulement ───────────────────────────
  --
  -- 6 738 compteurs sur 7 919 désignent un responsable. Il appartient au compte d'origine : effacer
  -- une donnée réelle sans le dire serait pire que l'afficher étrangère, donc par défaut il reste.
  if p_detacher_contacts then
    update compteurs
       set responsable_contact_id =
             case when fn_contact_rattache_au_compte(responsable_contact_id, v_compte_dest)
                  then responsable_contact_id else null end,
           contact_conseil_syndical_id =
             case when fn_contact_rattache_au_compte(contact_conseil_syndical_id, v_compte_dest)
                  then contact_conseil_syndical_id else null end
     where id = p_compteur_id
       and (
         (responsable_contact_id is not null
          and not fn_contact_rattache_au_compte(responsable_contact_id, v_compte_dest))
         or (contact_conseil_syndical_id is not null
             and not fn_contact_rattache_au_compte(contact_conseil_syndical_id, v_compte_dest))
       );
    get diagnostics v_contacts = row_count;
  end if;

  -- ── 5. LA TRACE ─────────────────────────────────────────────────────────────────────────────
  -- `compte_id` reste vide : voir l'explication dans `fn_deplacer_site`. Remplir cette colonne
  -- rendrait le compte de destination indéboulonnable.
  insert into historiques_entites (
    entite_type, entite_id, operation, ancienne_valeur, nouvelle_valeur, champs_modifies,
    motif, auteur_profil_id, source, correlation_id
  ) values (
    'compteurs', p_compteur_id, 'UPDATE',
    jsonb_build_object('site_id', v_site_origine, 'site_nom', v_nom_origine, 'compte_id', v_compte_origine),
    jsonb_build_object('site_id', p_site_destination_id, 'site_nom', v_nom_dest, 'compte_id', v_compte_dest),
    array['site_id'],
    p_motif, auth.uid(), 'APPLICATION', v_correlation
  );

  return jsonb_build_object(
    'geste', 'compteur',
    'compteur', v_numero,
    'change_de_compte', v_compte_origine is distinct from v_compte_dest,
    'site_origine', v_nom_origine,
    'site_destination', v_nom_dest,
    'suivis', jsonb_build_object('signaux', v_signaux, 'requetes', v_requetes,
                                 'contacts_detaches', v_contacts),
    'restes', jsonb_build_object('mandats', v_mandats, 'contrats', v_contrats,
                                 'recommandations', v_recos, 'opportunites', v_opportunites)
  );
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_reste integer;
  v_def   text;
  v_noms  text;
begin
  -- (1) LA FONCTION NE LIT PLUS LA TABLE. On relit sa definition, on ne se fie pas au fichier.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_deplacer_compteur';
  if v_def ilike '%from sites%' then
    raise exception 'Garde-fou : fn_deplacer_compteur lit encore la table sites';
  end if;

  /* (2) COMBIEN DE FONCTIONS CITENT ENCORE sites, ET LESQUELLES SONT ATTENDUES.
     Trois le font legitimement : elles SONT la fonctionnalite site et partiront avec elle. Une
     quatrieme ne la cite que dans un commentaire. Toute cinquieme serait une surprise. */
  /* IL NOMME LE COUPABLE. Ma premiere version comptait seulement, et « 1 fonction inattendue » m'a
     fait chercher a l'aveugle pendant plusieurs essais — surcharges, triggers, agregats. Un
     controle qui compte sans nommer est un controle a moitie ecrit. */
  select string_agg(p.proname, ', ' order by p.proname) into v_noms
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     /* MOT ENTIER, et c'est necessaire : un simple like '%sites%' attrape aussi contacts_sites,
        recommandations_sites, opportunites_sites et types_sites. Ma premiere version l'a fait, et
        elle a accuse fn_contact_rattache_au_compte d'une dependance qu'elle venait de perdre. */
     and pg_get_functiondef(p.oid) ~ 'msitesM'
     and p.proname not in ('fn_deplacer_site', 'liste_sites', 'carte_sites', 'fn_restaurer_suppression');
  if v_noms is not null then
    raise exception 'Garde-fou : ces fonctions citent encore sites : %', v_noms;
  end if;

  raise notice 'Garde-fou passe : fn_deplacer_compteur ne lit plus sites, et seules les 3 fonctions de l ecran Sites la citent encore';
end $$;

commit;
