-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QUI VIENT D'UN PARTENAIRE SE RECONNAÎT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Michel, 27/09/2026, en réponse aux questions sur l'espace partenaire :
--
--   « Lorsqu'il crée un nouveau dossier, il arrive dans KiMatch avec une origine "Partenaire" + le
--    nom du partenaire, et un statut type "Nouveau / À qualifier". »
--   « Pour les contrats et documents, je mettrais un champ "visible partenaire : oui/non". »
--   « On peut regrouper Refusée / Abandonnée / Perdue sous un statut plus simple du type
--    "Non aboutie". »
--
-- Cette migration pose les TROIS FONDATIONS. L'écriture elle-même — ce qu'il pourra créer et
-- modifier — viendra ensuite : sans ces trois-là, elle n'aurait rien pour se poser.
--
-- ══ ① L'ORIGINE « PARTENAIRE » ══
--
-- `types_origines` en porte quatre : Analyse KiMatch, Demande du client, Initiative du conseiller,
-- Signal détecté. Aucune ne dit « c'est un partenaire qui l'a apporté ».
--
-- LE NOM DU PARTENAIRE N'EST PAS DANS L'ORIGINE, et c'est délibéré. Michel demande « origine
-- Partenaire + le nom du partenaire » : le nom vit déjà dans `comptes.apporteur_partenaire_id`,
-- posé à la création du compte depuis le 25/09. Créer une origine par partenaire donnerait neuf
-- lignes aujourd'hui, et autant que de partenaires demain — une table de référence qui grossit
-- avec les données n'est plus une table de référence.
--
-- ══ ② `visible_partenaire` SUR LES DOCUMENTS ET LES CONTRATS ══
--
-- Michel : le mandat, il le télécharge ; le contrat et les documents, cas par cas.
--
-- LE DÉFAUT EST « NON », et c'est la seule valeur possible. Un défaut à « oui » rendrait visible
-- tout ce qui existe déjà — 19 700 documents — et il faudrait les fermer un par un. Dans ce sens-là
-- l'oubli est silencieux ; dans l'autre, il se voit : le partenaire demande un document qu'il ne
-- voit pas.
--
-- ══ ③ LE REGROUPEMENT DES ÉTAPES ══
--
-- Onze étapes internes, dont trois disent la même chose à un externe : Refusée, Abandonnée, et une
-- clôture sans suite. Michel veut « Non aboutie ». On ajoute donc une colonne qui dit, pour chaque
-- étape, ce qu'un partenaire doit lire — et l'espace partenaire lira cette colonne plutôt que de
-- porter sa propre table de correspondance, qui divergerait au premier ajout d'étape.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ ① L'ORIGINE ═══════════════════════════════════════════════════════════════════════════════

insert into types_origines (code, libelle)
select 'PARTENAIRE', 'Apporté par un partenaire'
where not exists (select 1 from types_origines where code = 'PARTENAIRE');

comment on table types_origines is
  'D''où vient une recommandation : analyse KiMatch, demande du client, initiative du conseiller, '
  'signal détecté, ou apport d''un partenaire. QUEL partenaire ne se lit pas ici mais dans '
  '`comptes.apporteur_partenaire_id` — une origine par partenaire ferait grossir une table de '
  'référence au rythme des données.';

-- ══ ② LA VISIBILITÉ ═══════════════════════════════════════════════════════════════════════════

alter table documents
  add column if not exists visible_partenaire boolean not null default false;

comment on column documents.visible_partenaire is
  'Ce document est-il visible dans l''espace partenaire ? Michel, 27/09/2026 : « pour les contrats '
  'et documents, je mettrais un champ visible partenaire oui/non ». DÉFAUT À FAUX : un défaut à '
  'vrai exposerait d''un coup les 19 700 documents existants, et l''oubli serait silencieux — '
  'tandis qu''un document manquant, le partenaire le réclame.';

alter table contrats
  add column if not exists visible_partenaire boolean not null default false;

comment on column contrats.visible_partenaire is
  'Ce contrat est-il visible dans l''espace partenaire ? Même règle que `documents` : faux par '
  'défaut, ouvert au cas par cas. Le partenaire voit toujours QU''UN contrat existe (référence, '
  'dates, fournisseur) ; cette colonne décide s''il peut en obtenir la pièce.';

-- LES MANDATS N'ONT PAS BESOIN DE CETTE COLONNE : Michel les rend visibles par principe
-- (« il peut télécharger les mandats »). Ajouter un interrupteur pour ne jamais s'en servir serait
-- une décision à prendre à chaque mandat, sans raison.

-- ══ ③ CE QU'UNE ÉTAPE DIT À UN PARTENAIRE ═════════════════════════════════════════════════════

alter table etapes_recommandation
  add column if not exists libelle_partenaire text;

comment on column etapes_recommandation.libelle_partenaire is
  'Ce que cette étape affiche dans l''espace partenaire. Michel, 27/09/2026 : « je simplifierais '
  'les statuts visibles par le partenaire, pas besoin qu''il voie les 11 étapes internes » et '
  '« on peut regrouper Refusée / Abandonnée / Perdue sous Non aboutie ». Nul = l''étape n''a pas '
  'encore été traduite, et l''espace affiche alors « En cours » plutôt qu''un terme interne.';

-- LA CORRESPONDANCE, telle que Michel l'a décrite. Trois mots pour onze étapes.
update etapes_recommandation set libelle_partenaire = 'À l''étude'
 where libelle in ('Brouillon', 'À présenter', 'Consultation', 'Offres reçues', 'Présentée', 'À réactiver');

update etapes_recommandation set libelle_partenaire = 'En cours'
 where libelle in ('Acceptée', 'Active');

update etapes_recommandation set libelle_partenaire = 'Aboutie'
 where libelle = 'Clôturée';

update etapes_recommandation set libelle_partenaire = 'Non aboutie'
 where libelle in ('Refusée', 'Abandonnée');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES TROIS FONDATIONS TIENNENT, ET RIEN NE S'OUVRE PAR MÉGARDE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés. Une colonne `visible_partenaire` qui naîtrait à `true` exposerait
-- 19 700 documents d'un coup — et personne ne le verrait avant qu'un partenaire les lise.
do $$
declare
  v_origine   uuid;
  v_ouverts   integer;
  v_sans      integer;
  v_etapes    integer;
begin
  -- ① L'ORIGINE EXISTE, et une seule fois.
  select id into v_origine from types_origines where code = 'PARTENAIRE';
  if v_origine is null then
    raise exception 'L''origine PARTENAIRE n''a pas été créée.';
  end if;
  if (select count(*) from types_origines where code = 'PARTENAIRE') > 1 then
    raise exception 'L''origine PARTENAIRE existe en double.';
  end if;
  raise notice 'Garde-fou 1 : l''origine « Apporté par un partenaire » existe.';

  -- ② RIEN N'EST VISIBLE PAR DÉFAUT.
  select count(*) into v_ouverts from documents where visible_partenaire;
  if v_ouverts > 0 then
    raise exception '% document(s) sont déjà visibles par un partenaire : le défaut devait être faux.', v_ouverts;
  end if;
  select count(*) into v_ouverts from contrats where visible_partenaire;
  if v_ouverts > 0 then
    raise exception '% contrat(s) sont déjà visibles par un partenaire : le défaut devait être faux.', v_ouverts;
  end if;
  raise notice 'Garde-fou 2 : aucun document ni contrat n''est visible par défaut.';

  -- ③ TOUTES LES ÉTAPES SONT TRADUITES. Une étape oubliée afficherait un terme interne.
  select count(*) into v_sans from etapes_recommandation where libelle_partenaire is null;
  if v_sans > 0 then
    raise exception '% étape(s) n''ont pas de libellé partenaire : un terme interne s''afficherait.', v_sans;
  end if;

  select count(distinct libelle_partenaire) into v_etapes from etapes_recommandation;
  if v_etapes > 4 then
    raise exception 'Les étapes se regroupent en % libellés : Michel en voulait une poignée, pas onze.', v_etapes;
  end if;
  raise notice 'Garde-fou 3 : les 11 étapes se lisent en % libellés côté partenaire.', v_etapes;

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : les trois fondations sont posées, rien ne s''ouvre par mégarde.';
end $$;

commit;
