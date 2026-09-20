-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE RECOMMANDATION PERDUE PEUT LAISSER UNE OPPORTUNITÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel, 20/09/2026 : à la clôture PERDUE d'une recommandation, demander au commercial s'il veut
-- suivre le client. S'il dit oui et que l'échéance tombe dans l'année, une opportunité naît
-- automatiquement — le client n'a pas dit non pour toujours, il a dit non pour cette fois.
--
--   · il ne s'est pas encore décidé → on garde la main ;
--   · il a signé chez un autre courtier → on ne perd pas le dossier, on le rappellera vers la fin
--     de SON échéance, celle qu'il vient de contracter ailleurs.
--
-- Au-delà d'un an, pas d'opportunité : l'échéance est trop lointaine pour tenir une relance, et le
-- dossier se retrouvera en ressortant les affaires perdues. On écrit tout de même la nouvelle
-- échéance et le nouveau fournisseur, parce que ce sont des faits appris.
--
-- ══ TROIS COLONNES, ET CHACUNE RÉPARE UN OUBLI DIFFÉRENT ═════════════════════════════════════
--
-- 1. `opportunites.recommandation_origine_id` — DANS L'AUTRE SENS QUE LE LIEN EXISTANT.
--
--    `recommandations.opportunite_id` existe déjà et dit « cette recommandation VIENT DE cette
--    opportunité » : 25 lignes l'utilisent ainsi. Ce qu'on crée ici est l'inverse — une
--    opportunité NÉE D'une recommandation perdue. Réemployer le même champ mélangerait les deux
--    sens dans une seule colonne, et plus personne ne saurait lequel il lit. Aucun lien inverse
--    n'existait, vérifié : c'est ce qui manquait.
--
-- 2 et 3. `compteurs.date_echeance_precedente` et `compteurs.fournisseur_precedent_compte_id`.
--
--    Naoëlle, 20/09/2026 : « on l'écrit sur les champs qui vivent sur le compteur. Par contre, il
--    faut toujours garder une trace des anciens champs. »
--
--    L'audit trace DÉJÀ ces deux colonnes — 7 355 changements enregistrés au 20/09. Mais
--    `historique_modifications` répond à « qu'est-ce qui a changé ici ? », pas à « quelle était
--    l'échéance avant celle-ci ? » : il faut la parcourir, la trier, et savoir qu'elle existe. La
--    valeur précédente posée sur le compteur se lit d'un coup d'œil, depuis la fiche, par quelqu'un
--    qui se demande simplement d'où vient cette date. Les deux ne font pas le même travail — on
--    garde l'historique pour la traçabilité et la colonne pour la lecture.
--
-- ══ POURQUOI LE GARDE-FOU NE CRÉE PAS D'OPPORTUNITÉ D'ESSAI ══════════════════════════════════
--
-- Ce serait le contrôle le plus parlant, et il est pourtant exclu : `fn_reference_chaine` tire la
-- référence d'une opportunité d'une SÉQUENCE, et une séquence n'est pas transactionnelle. Le
-- rollback de l'essai annulerait la ligne mais pas le `nextval` — il resterait un trou définitif
-- dans la numérotation des opportunités, pour un test. On vérifie donc la forme : les colonnes, les
-- clés étrangères et leur cible. C'est ce qui rend l'écriture possible, et c'est vérifiable sans
-- rien consommer.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table opportunites
  add column if not exists recommandation_origine_id uuid references recommandations(id) on delete set null;

comment on column opportunites.recommandation_origine_id is
  'La recommandation PERDUE qui a fait naître cette opportunité, quand le commercial a choisi de '
  'suivre le client malgré la clôture. À ne pas confondre avec recommandations.opportunite_id, qui '
  'dit l''inverse : la recommandation issue d''une opportunité.';

create index if not exists idx_opportunites_recommandation_origine
  on opportunites (recommandation_origine_id)
  where recommandation_origine_id is not null;

alter table compteurs
  add column if not exists date_echeance_precedente date,
  add column if not exists fournisseur_precedent_compte_id uuid references comptes(id) on delete set null;

comment on column compteurs.date_echeance_precedente is
  'L''échéance d''avant la dernière correction, conservée pour qu''on puisse répondre « d''où sort '
  'cette date ? » sans parcourir l''historique. L''audit reste la source complète ; cette colonne '
  'n''en est que la dernière page, lisible depuis la fiche.';

comment on column compteurs.fournisseur_precedent_compte_id is
  'Le fournisseur d''avant la dernière correction. Renseigné notamment quand un client perdu a '
  'signé ailleurs : on sait alors chez qui il est parti, et chez qui il était.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES TROIS RATTACHEMENTS EXISTENT ET POINTENT AU BON ENDROIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Une colonne uuid sans clé étrangère accepterait n'importe quel identifiant et laisserait créer
-- des opportunités rattachées à une recommandation qui n'existe pas — une donnée fausse, muette, du
-- genre qui ne se découvre que le jour où un écran reste vide. On vérifie donc la cible de chaque
-- clé, et pas seulement la présence des colonnes.
--
do $$
declare
  manquant text;
  cible    text;
begin
  select string_agg(c.tbl || '.' || c.col, ', ') into manquant
  from (values
    ('opportunites', 'recommandation_origine_id'),
    ('compteurs',    'date_echeance_precedente'),
    ('compteurs',    'fournisseur_precedent_compte_id')
  ) as c(tbl, col)
  where not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = c.tbl and column_name = c.col
  );
  if manquant is not null then
    raise exception 'Colonnes absentes après la migration : %', manquant;
  end if;

  select confrelid::regclass::text into cible
    from pg_constraint
   where conrelid = 'public.opportunites'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.opportunites'::regclass
                            and attname = 'recommandation_origine_id')];
  if cible is distinct from 'recommandations' then
    raise exception 'recommandation_origine_id ne pointe pas vers recommandations (cible : %)', coalesce(cible, 'aucune');
  end if;

  select confrelid::regclass::text into cible
    from pg_constraint
   where conrelid = 'public.compteurs'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.compteurs'::regclass
                            and attname = 'fournisseur_precedent_compte_id')];
  if cible is distinct from 'comptes' then
    raise exception 'fournisseur_precedent_compte_id ne pointe pas vers comptes (cible : %)', coalesce(cible, 'aucune');
  end if;

  raise notice 'Garde-fou : les trois colonnes existent et leurs clés pointent où il faut.';
end $$;

commit;
