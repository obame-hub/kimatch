-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE CONTRAT A DEUX CHEMINS, ET NON UN SEUL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE WILLIAM A TRANCHÉ, APPEL DU 09/09/2026 À 15 H 14 ════════════════════════════════════
--
-- « Il y a une espèce de double chemin. En fait, Salesforce nous empêchait de créer deux chemins.
-- […] Le contrat doit avoir deux chemins, c'est vraiment important qu'il ait ça. »
--
--   ① LE CYCLE DE SIGNATURE   Brouillon → Demandé → Réceptionné → Envoyé → CONSULTÉ → Signé
--   ② LE CYCLE DE VIE         À venir → En cours → Expiré,  et Résilié à part
--
-- Et sa règle de séparation, qui décide de tout le reste : « TANT QU'IL N'EST PAS SIGNÉ, TU NE PEUX
-- PAS LUI DONNER UN STATUT [de vie]. Il est encore dans le cycle de signature. »
--
-- ══ LA BONNE NOUVELLE : LES DEUX CHEMINS EXISTENT DÉJÀ ═════════════════════════════════════════
--
-- Depuis ce matin je cherchais laquelle des trois colonnes de statut fait foi. La question était
-- mal posée. Relevé du jour :
--
--   `statut_avancement_id` → Brouillon, Demandé, Réceptionné, Envoyé, Signé   = LE CYCLE DE SIGNATURE
--   `statut_vie_id`        → À venir, En cours, Expiré                        = LE CYCLE DE VIE
--   `statut_id`            → les neuf mélangés                                = CELLE QUI MENT
--
-- Deux des trois colonnes SONT les deux chemins de William. La troisième est celle que
-- l'application lit. Il n'y a donc presque rien à créer : il manque un jalon au premier chemin, et
-- une porte de sortie au second.
--
-- ══ ① CE QUI MANQUE AU CYCLE DE SIGNATURE : « CONSULTÉ » ═══════════════════════════════════════
--
-- « En attente de signature ne sert à rien, c'était un truc qui ne servait à rien, on le savait. À
-- la place, ce que j'aimerais, comme sur les mandats, c'est qu'on sache quand est-ce qu'il a été
-- consulté. »
--
-- Le mandat porte déjà `date_consultation` et `nb_ouvertures` (travail de William du 08/09). Le
-- contrat ne les a pas. On les ajoute À L'IDENTIQUE — mêmes noms, mêmes types, même nullabilité —
-- parce que les deux objets suivent la même enveloppe DocuSign et qu'un nom différent des deux
-- côtés obligerait à écrire deux fois chaque lecture.
--
-- « C'est normal qu'il n'y ait aucun contrat à Consulté, mais il faut le mettre en place. » En
-- effet : 0 contrat aujourd'hui. Ce jalon se remplira par le webhook DocuSign, comme pour le
-- mandat. On ne rétro-remplit rien — aucune consultation passée n'a jamais été observée sur un
-- contrat, et inventer un horodatage serait pire que la ligne vide.
--
-- ══ ② CE QUI MANQUE AU CYCLE DE VIE : LA RÉSILIATION ═══════════════════════════════════════════
--
-- « Tu peux garder le statut résilié. Est-ce que parfois on nous résilie un contrat avant son
-- terme ? Donc ça peut être intéressant. » Et sur l'autre : « Annuler, ça n'a pas de sens. À partir
-- du moment où il a été validé, il ne peut plus être annulé. »
--
-- MAIS LA RÉSILIATION N'EST PAS UN STATUT DE PLUS DANS LE RÉFÉRENTIEL, c'est un FAIT DATÉ, et c'est
-- le seul du cycle de vie qui ne se déduise pas. Les trois autres se déduisent, et c'est déjà fait
-- depuis le 30/08 : `src/lib/statutVieContrat.ts` et la vue `v_contrats_liste` calculent À venir /
-- En cours / Expiré à partir des deux dates, à la lecture.
--
-- Que la déduction soit la bonne voie, les données le disent : sur les 1 561 contrats dont
-- `statut_vie_id` est rempli, 1 547 s'accordent avec leurs dates et **14 divergent** — 8 marqués
-- « À venir » qui ont commencé, 6 marqués « En cours » qui sont expirés. Aucun humain n'a saisi
-- ces 14 : c'est la colonne stockée qui a vieilli en silence, faute de quiconque pour la réécrire.
--
-- D'où `date_resiliation` sur `contrats`, et non une ligne de plus dans `statuts_contrats_vie` : la
-- date porte l'information (« résilié le 12/03 »), elle ne peut pas se démoder, et elle laisse la
-- déduction faire le reste.
--
-- ══ ③ LES 11 CONTRATS SANS AVANCEMENT ══════════════════════════════════════════════════════════
--
-- 1 593 contrats sur 1 604 ont leur cycle de signature. Les 11 autres se déduisent sans arbitraire,
-- en croisant leur ancien statut mélangé avec les faits DocuSign :
--
--   5 « À venir »       avec date_signature ET enveloppe DocuSign  → SIGNÉ
--   3 « À signer »      avec enveloppe, sans date de signature     → ENVOYÉ
--   2 « Nouveau »       sans enveloppe                             → BROUILLON
--   1 « En préparation » sans enveloppe                            → BROUILLON
--
-- Chacun s'appuie sur un fait observable — une enveloppe existe ou non, une signature est datée ou
-- non — et jamais sur le seul libellé de la colonne qui ment.
--
-- ══ CE QUE CETTE MIGRATION NE FAIT PAS ═════════════════════════════════════════════════════════
--
-- Elle NE TOUCHE PAS à `statut_id` ni à `statuts_contrats`. C'est encore la colonne que
-- l'application lit partout ; la supprimer maintenant éteindrait les écrans avant que le code ne
-- sache lire les deux autres. Le ménage — Nouveau, En préparation, À signer, Signé et Annulé
-- « tout ça tu supprimes », Terminé qui devient Expiré — vient après, quand plus rien ne la lit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── ① LE JALON « CONSULTÉ », ET LES DEUX COLONNES QUI LE NOURRISSENT ───────────────────────────
/* Ordre 45 : entre Envoyé (40) et Signé (50), sans renuméroter le reste — les ordres existants
   sont espacés de dix précisément pour qu'on puisse intercaler sans rien réécrire. La couleur et
   le picto reprennent ceux du mandat, puisque c'est le même jalon du même parcours. */
insert into statuts_contrats_avancement (code, libelle, ordre, couleur, icone, est_cloture, actif)
values ('CONSULTE', 'Consulté', 45, '#7c5bb0', 'eye', false, true)
on conflict (code) do update
   set libelle = excluded.libelle, ordre = excluded.ordre, couleur = excluded.couleur,
       icone = excluded.icone, est_cloture = excluded.est_cloture, actif = true;

alter table contrats add column if not exists date_consultation timestamptz;
alter table contrats add column if not exists nb_ouvertures integer;

comment on column contrats.date_consultation is
  'Premiere ouverture du contrat par le signataire, rapportee par DocuSign. Calquee sur '
  '`mandats.date_consultation` : meme nom, meme type, meme enveloppe suivie. Nulle tant que '
  'l''evenement n''a pas ete observe — on n''invente pas un horodatage.';
comment on column contrats.nb_ouvertures is
  'Nombre d''ouvertures du contrat par le signataire, rapporte par DocuSign. Calque sur '
  '`mandats.nb_ouvertures`.';

-- ── ② LA RÉSILIATION, SEUL FAIT DU CYCLE DE VIE QUI NE SE DÉDUISE PAS ──────────────────────────
alter table contrats add column if not exists date_resiliation date;

comment on column contrats.date_resiliation is
  'Date a laquelle le contrat a ete resilie AVANT SON TERME. Le reste du cycle de vie — a venir, '
  'en cours, expire — se deduit des deux dates a la lecture (`src/lib/statutVieContrat.ts` et la '
  'vue `v_contrats_liste`) ; la resiliation est le seul fait qui ne se deduise pas, d''ou une date '
  'et non un statut stocke. William, 09/09/2026 : « tu peux garder resilie » — et « annuler, ca '
  'n''a pas de sens ».';

/* CONTRAINTE DE COHÉRENCE : on ne résilie pas un contrat avant qu'il commence. Elle est posée
   `not valid` puis validée juste après — sur zéro ligne concernée aujourd'hui, c'est gratuit, mais
   l'habitude évite de bloquer une table le jour où elle en porte des milliers. */
alter table contrats drop constraint if exists contrats_resiliation_apres_debut;
alter table contrats add constraint contrats_resiliation_apres_debut
  check (date_resiliation is null or date_debut is null or date_resiliation >= date_debut) not valid;
alter table contrats validate constraint contrats_resiliation_apres_debut;

-- ── ③ LES 11 CONTRATS SANS CYCLE DE SIGNATURE ──────────────────────────────────────────────────
/* Chaque branche s'appuie sur un FAIT (une enveloppe, une date de signature) et non sur le libellé
   de la colonne mélangée, qui est justement celle dont on se méfie. `coalesce` : on ne réécrit que
   ce qui est vide. */
update contrats c
   set statut_avancement_id = (
         select s.id from statuts_contrats_avancement s
          where s.code = case
                  when c.date_signature is not null      then 'SIGNE'
                  when c.docusign_envelope_id is not null then 'ENVOYE'
                  else 'BROUILLON'
                end),
       date_modification = now()
 where c.statut_avancement_id is null;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — chacun REFAIT le calcul depuis les données
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_total      integer;
  v_sans_avc   integer;
  v_consulte   integer;
  v_repartition text;
  v_colonnes   integer;
  v_resilies   integer;
begin
  select count(*) into v_total from contrats;
  if v_total <> 1604 then
    raise exception 'Garde-fou : % contrats au lieu des 1604 attendus — cette migration ne devait en creer ni en detruire aucun', v_total;
  end if;

  -- ① PLUS AUCUN CONTRAT SANS CYCLE DE SIGNATURE. C'est la condition pour que la frise puisse
  --   s'afficher sur les 1 604 fiches sans trou.
  select count(*) into v_sans_avc from contrats where statut_avancement_id is null;
  if v_sans_avc > 0 then
    raise exception 'Garde-fou : % contrat(s) restent sans cycle de signature', v_sans_avc;
  end if;

  -- ② LE JALON « CONSULTÉ » EXISTE, ET IL EST BIEN ENTRE ENVOYÉ ET SIGNÉ. Un jalon mal ordonné
  --   s'afficherait au mauvais endroit de la frise sans qu'aucune erreur ne le signale.
  select count(*) into v_consulte
    from statuts_contrats_avancement s
   where s.code = 'CONSULTE' and s.actif
     and s.ordre > (select ordre from statuts_contrats_avancement where code = 'ENVOYE')
     and s.ordre < (select ordre from statuts_contrats_avancement where code = 'SIGNE');
  if v_consulte <> 1 then
    raise exception 'Garde-fou : le jalon CONSULTE est absent ou mal place entre ENVOYE et SIGNE';
  end if;

  -- ③ LES TROIS COLONNES AJOUTÉES SONT LÀ. On les compte au lieu de faire confiance au `if not
  --   exists` : une colonne qui existait déjà sous un autre type passerait sinon inaperçue.
  select count(*) into v_colonnes from information_schema.columns
   where table_name = 'contrats'
     and (column_name, data_type) in (
       ('date_consultation', 'timestamp with time zone'),
       ('nb_ouvertures', 'integer'),
       ('date_resiliation', 'date'));
  if v_colonnes <> 3 then
    raise exception 'Garde-fou : % colonne(s) sur 3 posees avec le bon type', v_colonnes;
  end if;

  -- ④ AUCUNE RÉSILIATION N'A ÉTÉ INVENTÉE. La colonne naît vide : c'est une saisie à venir, pas
  --   une reprise. S'il en apparaissait une ici, elle sortirait de nulle part.
  select count(*) into v_resilies from contrats where date_resiliation is not null;
  if v_resilies > 0 then
    raise exception 'Garde-fou : % resiliation(s) apparues alors que la colonne vient d etre creee', v_resilies;
  end if;

  -- ⑤ ET ON DIT LA RÉPARTITION OBTENUE, plutôt que de se contenter d'un « c'est bon ». C'est elle
  --   qu'il faudra relire quand la frise s'affichera de travers.
  select string_agg(x.libelle || ' ' || x.n, ' · ' order by x.ordre) into v_repartition
    from (select s.libelle, s.ordre, count(c.id) as n
            from statuts_contrats_avancement s
            left join contrats c on c.statut_avancement_id = s.id
           group by s.libelle, s.ordre) x;
  raise notice 'Garde-fou passe : % contrats, cycle de signature complet -> %', v_total, v_repartition;
end $$;

commit;

analyze contrats;
