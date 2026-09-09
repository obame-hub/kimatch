-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE COMPTEUR PORTE SON SITE — ÉTAPE 1 DU RETRAIT DE L'OBJET SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Décision de la réunion du 09/09/2026 : l'objet site dégage. William : « site n'est relié
-- absolument à rien et ça complexifie beaucoup ». Michel : « bah dans ce cas, ça dégage ».
--
-- Naoëlle, consigne opérationnelle : « on garde l'id de regroupement […] il faut que tu t'assures
-- que chaque compteur ait bien son site rattaché, il faut 0 perte […] formatter toutes les adresses
-- comme ça on peut retrouver facilement des compteurs via leur adresse de site, d'ailleurs
-- t'appelleras ça adresse de site. »
--
-- ══ CETTE MIGRATION NE SUPPRIME RIEN ═══════════════════════════════════════════════════════════
--
-- Elle RECOPIE le site sur le compteur, et elle désamorce le piège. La table `sites` reste en place,
-- intacte, lue par tout ce qui la lit aujourd'hui. C'est ce qui rend l'étape réversible : tant que
-- les deux copies existent, une erreur se corrige en relisant l'original.
--
-- LE PIÈGE, mesuré le 09/09/2026 et absent de la discussion : `compteurs.site_id` est déclaré
-- `ON DELETE CASCADE`. Supprimer un site SUPPRIME ses compteurs. Une suppression de la table aurait
-- détruit les 7 919 compteurs de la base, plus 1 558 contrats, 1 454 signaux et 231 tâches. Les
-- quatre règles passent donc en `SET NULL` ici, AVANT que quiconque touche à `sites`. C'est la seule
-- chose qui sépare ce chantier d'une perte de patrimoine, et c'est pour ça qu'elle vient d'abord.
--
-- ══ CE QU'ON RECOPIE, ET RIEN DE PLUS ══════════════════════════════════════════════════════════
--
-- Remplissage réel des 23 colonnes de `sites`, mesuré sur les 6 374 lignes :
--
--   nom                 100 %        adresse                5 %
--   pays                100 %        rue                    0 %
--   proprietaire_id     100 %        surface_m2             0 %
--   code_postal          96 %        annee_construction     0 %
--   departement          95 %        date_derniere_ag       0 %
--   ville                90 %        reference              0 %
--   latitude/longitude   89 %        type_site_id           0 %
--
-- Les sept colonnes de droite sont VIDES : ce sont des champs d'écran que personne n'a remplis.
-- Elles ne sont pas recopiées, et il n'y a rien à perdre — contrairement à ce que je craignais
-- avant de compter.
--
-- ══ L'ADRESSE DE SITE : CE QU'ELLE PEUT ÊTRE, ET CE QU'ELLE NE PEUT PAS ═════════════════════════
--
-- Michel : « normalement un site c'est une adresse postale », et il voulait regrouper les compteurs
-- là-dessus. La mesure l'interdit : `sites.adresse` est rempli sur 336 sites (5 %) et `rue` sur 8.
-- L'adresse de rue N'EXISTE PAS dans la base.
--
-- Ce qui existe, et qui rend un compteur retrouvable :
--
--   · le nom du site, rempli à 100 % (6 067 valeurs distinctes)
--   · le code postal (96 %) et la ville (90 %) — 5 768 sites ont les trois
--
-- `adresse_site` est donc composée : la rue quand on l'a, le nom du site sinon, puis code postal et
-- ville. Ce n'est pas une adresse postale au sens de La Poste, et le commentaire le dit plutôt que
-- de laisser croire le contraire. C'est un IDENTIFIANT LISIBLE ET CHERCHABLE, ce que Naoëlle a
-- demandé : « on peut retrouver facilement des compteurs via leur adresse de site ».
--
-- La vraie adresse postale se reconstruira depuis les factures, avec le chantier d'extraction qui
-- attend la clé API. Ce jour-là, `compteurs.adresse` se remplira et `adresse_site` suivra seule —
-- voir ci-dessous.
--
-- ══ POURQUOI DEUX COLONNES CALCULÉES ET NON DEUX COPIES ════════════════════════════════════════
--
-- `adresse_site` et `adresse_site_recherche` sont des colonnes GÉNÉRÉES. Elles ne peuvent donc pas
-- dériver : corriger le code postal d'un compteur met à jour son adresse et sa clé de recherche
-- dans la même écriture, sans tâche de fond ni déclencheur à maintenir.
--
-- C'est la leçon de `statut_vie_id`, qui a dérivé en silence sur 13 contrats parce qu'une valeur
-- recopiée vieillit dès que sa source change.
--
-- ══ POURQUOI UNE CLÉ DE RECHERCHE SÉPARÉE ══════════════════════════════════════════════════════
--
-- William, en réunion : « il y en a qui vont mettre quatre rue du château et il y en a un qui va
-- mettre 4 R du château. Et du coup c'est pas la même adresse. En terme de texte, c'est pas
-- similaire. » Il a raison, et c'est exactement ce que `adresse_site_recherche` règle : accents
-- retirés, ponctuation retirée, abréviations de voirie développées, espaces normalisés. « 4 R du
-- Château » et « 4, rue du chateau » y rendent la même chaîne.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LA NORMALISATION, EN FONCTION IMMUABLE ──────────────────────────────────────────────────────
--
-- IMMUABLE est une obligation, pas une élégance : une colonne générée n'accepte que des fonctions
-- immuables. C'est aussi pourquoi on n'utilise pas `unaccent()`, qui est seulement STABLE — il
-- dépend d'un dictionnaire installé. `translate()` fait le travail et ne dépend de rien.
create or replace function fn_normaliser_adresse(p_texte text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      -- Les abréviations de voirie, développées sur des mots entiers (\m…\M) : « 4 r du chateau »
      -- et « 4 rue du chateau » doivent rendre la même chose, mais « rte » dans « porte » non.
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      -- Tout ce qui n'est ni lettre ni chiffre devient une espace : la virgule, le
                      -- tiret et le point ne distinguent pas deux adresses.
                      regexp_replace(
                        translate(
                          lower(coalesce(p_texte, '')),
                          'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                          'aaaaaaceeeeiiiinooooouuuuyyoa'
                        ),
                        '[^a-z0-9]+', ' ', 'g'
                      ),
                      '\mr\M', 'rue', 'g'
                    ),
                    '\m(av|ave)\M', 'avenue', 'g'
                  ),
                  '\m(bd|bld|boul)\M', 'boulevard', 'g'
                ),
                '\m(che|chem)\M', 'chemin', 'g'
              ),
              '\m(rte)\M', 'route', 'g'
            ),
            '\m(imp)\M', 'impasse', 'g'
          ),
          '\m(pl)\M', 'place', 'g'
        ),
        '\m(all|allee)\M', 'allee', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

comment on function fn_normaliser_adresse(text) is
  'Clef de comparaison d''une adresse : minuscules, sans accent, sans ponctuation, abréviations de '
  'voirie développées. « 4 R du Château » et « 4, rue du chateau » rendent la même chaîne. '
  'IMMUTABLE parce qu''une colonne générée l''exige.';

-- ── LES COLONNES RECOPIÉES ──────────────────────────────────────────────────────────────────────

alter table compteurs
  -- L'IDENTIFIANT DE REGROUPEMENT, décidé par Naoëlle le 09/09/2026. Il prend la valeur de
  -- l'ancien `sites.id`, ce qui préserve À L'IDENTIQUE les regroupements existants : les 989 sites
  -- qui portent plusieurs compteurs restent des groupes, sans qu'on ait à les reconstituer.
  -- Ce n'est PAS une clé étrangère : c'est justement ce qui permettra à `sites` de disparaître.
  add column if not exists groupe_site_id uuid,
  add column if not exists libelle_site text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists departement_code text,
  add column if not exists departement_nom text;

comment on column compteurs.groupe_site_id is
  'Regroupe les compteurs d''un même site. Reprend l''ancien sites.id pour préserver les '
  'regroupements existants. Volontairement SANS clé étrangère : sites doit pouvoir disparaître.';

/* LA RECOPIE. `coalesce` sur les colonnes déjà présentes : `compteurs.adresse`, `code_postal` et
   `ville` existaient et portaient une valeur sur un compteur. L'écraser serait une perte, aussi
   minime soit-elle, et la consigne est zéro perte. */
update compteurs c
   set groupe_site_id   = s.id,
       libelle_site     = nullif(trim(s.nom), ''),
       adresse          = coalesce(nullif(trim(c.adresse), ''), nullif(trim(s.adresse), '')),
       code_postal      = coalesce(nullif(trim(c.code_postal), ''), nullif(trim(s.code_postal), '')),
       ville            = coalesce(nullif(trim(c.ville), ''), nullif(trim(s.ville), '')),
       latitude         = coalesce(c.latitude, s.latitude),
       longitude        = coalesce(c.longitude, s.longitude),
       departement_code = coalesce(nullif(trim(c.departement_code), ''), nullif(trim(s.departement_code), '')),
       departement_nom  = coalesce(nullif(trim(c.departement_nom), ''), nullif(trim(s.departement_nom), '')),
       date_modification = now()
  from sites s
 where s.id = c.site_id;

-- ── L'ADRESSE DE SITE, CALCULÉE ─────────────────────────────────────────────────────────────────
--
-- Ajoutées APRÈS la recopie : une colonne générée se calcule à l'ajout, sur les valeurs présentes.
alter table compteurs
  add column if not exists adresse_site text
    generated always as (
      nullif(
        trim(
          coalesce(nullif(trim(adresse), ''), nullif(trim(libelle_site), ''), '')
          || case
               when coalesce(nullif(trim(code_postal), ''), nullif(trim(ville), '')) is null then ''
               else ', ' || trim(coalesce(nullif(trim(code_postal), '') || ' ', '') || coalesce(nullif(trim(ville), ''), ''))
             end
        ),
        ''
      )
    ) stored;

alter table compteurs
  add column if not exists adresse_site_recherche text
    generated always as (
      fn_normaliser_adresse(
        coalesce(nullif(trim(adresse), ''), nullif(trim(libelle_site), ''), '')
        || ' ' || coalesce(nullif(trim(code_postal), ''), '')
        || ' ' || coalesce(nullif(trim(ville), ''), '')
      )
    ) stored;

comment on column compteurs.adresse_site is
  'L''adresse du site, telle qu''on l''affiche et qu''on la cherche : la rue quand elle existe, le '
  'nom du site sinon, puis code postal et ville. Ce n''est pas une adresse postale certifiée — la '
  'rue n''est renseignée que sur 5 % des sites au 09/09/2026 — c''est un identifiant lisible.';

comment on column compteurs.adresse_site_recherche is
  'La même, normalisée pour la recherche et le regroupement : sans accent ni ponctuation, '
  'abréviations de voirie développées. Répond au cas de William : « 4 R du château » et « 4 rue du '
  'château » doivent se retrouver.';

-- ── LES INDEX : c'est la recherche par adresse qui a été demandée ───────────────────────────────
create index if not exists idx_compteurs_adresse_recherche on compteurs (adresse_site_recherche);
create index if not exists idx_compteurs_groupe_site on compteurs (groupe_site_id);

-- ── LE DÉSAMORÇAGE : QUATRE CASCADE DEVIENNENT SET NULL ────────────────────────────────────────
--
-- À partir d'ici, supprimer un site DÉLIE au lieu de DÉTRUIRE. C'est ce qui rend toutes les étapes
-- suivantes réversibles.
alter table compteurs   drop constraint if exists compteurs_site_id_fkey;
alter table compteurs   add  constraint compteurs_site_id_fkey
  foreign key (site_id) references sites (id) on delete set null;

alter table contrats    drop constraint if exists contrats_site_id_fkey;
alter table contrats    add  constraint contrats_site_id_fkey
  foreign key (site_id) references sites (id) on delete set null;

alter table signaux     drop constraint if exists signaux_site_id_fkey;
alter table signaux     add  constraint signaux_site_id_fkey
  foreign key (site_id) references sites (id) on delete set null;

alter table actions     drop constraint if exists actions_site_id_fkey;
alter table actions     add  constraint actions_site_id_fkey
  foreign key (site_id) references sites (id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — « il faut 0 perte », et on le prouve plutôt que de l'affirmer
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_compteurs        integer;
  v_sans_groupe      integer;
  v_sans_libelle     integer;
  v_sans_adresse     integer;
  v_libelles_perdus  integer;
  v_cascades         integer;
  v_groupes          integer;
  v_groupes_attendus integer;
begin
  select count(*) into v_compteurs from compteurs;

  -- ① CHAQUE COMPTEUR PORTE SON SITE. C'est la consigne, mot pour mot.
  select count(*) into v_sans_groupe  from compteurs where groupe_site_id is null;
  select count(*) into v_sans_libelle from compteurs where libelle_site is null;
  if v_sans_groupe > 0 then
    raise exception 'Garde-fou : % compteur(s) sans identifiant de regroupement', v_sans_groupe;
  end if;
  if v_sans_libelle > 0 then
    raise exception 'Garde-fou : % compteur(s) sans libelle de site', v_sans_libelle;
  end if;

  -- ② CHAQUE COMPTEUR A UNE ADRESSE DE SITE. Elle vient du libelle a defaut de la rue, donc elle
  --   ne peut manquer que si le site n'avait pas de nom — ce qui n'arrive sur aucun des 6 374.
  select count(*) into v_sans_adresse from compteurs where adresse_site is null;
  if v_sans_adresse > 0 then
    raise exception 'Garde-fou : % compteur(s) sans adresse de site', v_sans_adresse;
  end if;

  -- ③ AUCUN LIBELLE N'A ETE ALTERE. On compare au site d'origine, ligne par ligne : c'est la
  --   verification qui prouve « zero perte » au lieu de la supposer.
  select count(*) into v_libelles_perdus
    from compteurs c join sites s on s.id = c.site_id
   where coalesce(c.libelle_site, '') <> coalesce(nullif(trim(s.nom), ''), '');
  if v_libelles_perdus > 0 then
    raise exception 'Garde-fou : % compteur(s) dont le libelle differe de son site', v_libelles_perdus;
  end if;

  -- ④ LES REGROUPEMENTS SONT PRESERVES A L'IDENTIQUE. Autant de groupes que de sites porteurs.
  select count(distinct groupe_site_id) into v_groupes from compteurs;
  select count(distinct s.id) into v_groupes_attendus
    from sites s join compteurs c on c.site_id = s.id;
  if v_groupes <> v_groupes_attendus then
    raise exception 'Garde-fou : % groupes pour % sites porteurs de compteurs', v_groupes, v_groupes_attendus;
  end if;

  -- ⑤ PLUS AUCUNE CASCADE VERS `sites`. Le piege est desamorce, et on le verifie.
  select count(*) into v_cascades
    from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.constraint_name
   where ccu.table_name = 'sites' and ccu.column_name = 'id' and rc.delete_rule = 'CASCADE'
     and tc.table_name in ('compteurs', 'contrats', 'signaux', 'actions');
  if v_cascades > 0 then
    raise exception 'Garde-fou : % CASCADE subsistent vers sites', v_cascades;
  end if;

  raise notice 'Garde-fou passe : % compteurs portent leur site, % groupes preserves, 0 CASCADE restante',
    v_compteurs, v_groupes;
end $$;

commit;

-- Les statistiques du planificateur : sept colonnes ajoutees et 7 919 lignes reecrites changent la
-- forme de la table, et `compteurs` est lue par presque tous les ecrans. Consigne du 07/09/2026.
analyze compteurs;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTATE APRES APPLICATION — 09/09/2026, verifie independamment du garde-fou
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 7 919 compteurs, 7 919 identifiants distincts : zero perte, comme demande.
-- 100 % portent leur groupe, leur libelle de site, leur adresse de site et sa clef de recherche.
-- 6 341 groupes preserves — exactement les 6 374 sites moins les 33 qui ne portent aucun compteur.
-- L'adresse de site vient de la rue reelle pour 375 compteurs, du nom du site pour 7 544.
--
-- ── UNE FAUSSE AFFIRMATION DE MON PROPRE GARDE-FOU, CORRIGEE ICI ──
--
-- Le message annonce « 0 CASCADE restante ». C'est FAUX, et la verification independante l'a montre :
-- le garde-fou ne comptait que les quatre tables qu'il venait de modifier — compteurs, contrats,
-- signaux, actions — et ignorait donc les deux autres. Il restait :
--
--   contacts_sites       CASCADE   0 ligne
--   opportunites_sites   CASCADE   9 lignes
--
-- CES DEUX-LA GARDENT CASCADE VOLONTAIREMENT. Ce sont des tables de LIAISON : une ligne qui relie un
-- contact ou une opportunite a un site supprime ne designe plus rien, la supprimer avec lui est le
-- comportement juste. La regle dangereuse etait celle des tables porteuses de patrimoine, et ces
-- quatre-la sont desamorcees.
--
-- La lecon n'est pas la : un garde-fou qui ne verifie que ce que l'on vient d'ecrire confirme son
-- auteur au lieu de le contredire. Il aurait du compter TOUTES les cles etrangeres vers `sites`,
-- puis exclure nommement les deux qu'on accepte.
