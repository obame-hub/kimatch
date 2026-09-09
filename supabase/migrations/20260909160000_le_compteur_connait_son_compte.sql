-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE COMPTEUR CONNAÎT SON COMPTE — ÉTAPE 3 DU RETRAIT DE L'OBJET SITE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUE JE CHERCHAIS, ET CE QUE J'AI TROUVÉ ═════════════════════════════════════════════════
--
-- Je partais réécrire les onze vues qui joignent `sites`, en pensant qu'elles y prenaient le nom du
-- site. Relevé des colonnes réellement lues, le 09/09/2026 :
--
--   compte_id   v_comptes_liste · v_compteurs_liste · v_qualite_compteur ·
--               v_patrimoine_synthese · v_signal_score_contact          ← CINQ vues
--   nom         v_compteurs_liste · v_contrats_liste · v_documents_liste ·
--               v_qualite_compteur · v_recommandations_liste · v_suivis_contrats_liste
--
-- Cinq vues ne joignent pas `sites` pour son nom : elles le traversent POUR ATTEINDRE LE COMPTE.
-- Et `compteurs` n'a pas de `compte_id`. Le site n'est donc pas seulement un dossier d'affichage,
-- c'est LE CHEMIN par lequel un compteur connaît son client. C'était le vrai blocage du chantier,
-- et il ne se voyait pas dans la discussion de la réunion.
--
-- Aucune vue ne peut être réécrite avant que ce chemin existe en direct. C'est ce que fait cette
-- migration, et elle ne fait que ça.
--
-- ══ ET UNE RÉGRESSION QUE J'AI MOI-MÊME INTRODUITE HIER ════════════════════════════════════════
--
-- `sites.compte_id` est `ON DELETE CASCADE`, et `compteurs.site_id` l'était aussi. Supprimer un
-- compte supprimait donc ses sites, et par ricochet SES COMPTEURS.
--
-- En passant `compteurs.site_id` en `SET NULL` (migration 20260909100000) j'ai coupé ce ricochet
-- sans le voir : depuis hier, supprimer un compte laisserait ses compteurs en vie, sans site et
-- sans client — des orphelins invisibles, que l'inventaire de suppression annonçait pourtant comme
-- supprimés.
--
-- Le désamorçage restait juste — un site est un dossier, jeter un dossier ne doit pas détruire les
-- compteurs qu'il contient. Ce qui manquait, c'est le lien DIRECT au compte pour porter la règle
-- qui, elle, a du sens : jeter un client jette ses compteurs. D'où `on delete cascade` ci-dessous,
-- qui rétablit exactement le comportement d'avant-hier par un chemin d'un seul saut.
--
-- ══ POURQUOI LE CHEMIN EST SÛR ═════════════════════════════════════════════════════════════════
--
-- 7 919 compteurs, tous rattachés à un site ; 6 374 sites, tous rattachés à un compte ; et
-- 0 compteur qui n'atteindrait pas son compte. La recopie est donc totale et sans arbitrage.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table compteurs add column if not exists compte_id uuid;

/* LA RECOPIE, par le chemin qui existe encore : compteur → site → compte. `coalesce` par principe,
   même si la colonne vient d'être créée : cette migration doit pouvoir se rejouer sans écraser. */
update compteurs c
   set compte_id = coalesce(c.compte_id, s.compte_id),
       date_modification = now()
  from sites s
 where s.id = c.site_id
   and c.compte_id is distinct from s.compte_id;

/* LA CLÉ ÉTRANGÈRE ARRIVE APRÈS LE REMPLISSAGE : posée avant, elle validerait 7 919 lignes encore
   nulles. `on delete cascade` rétablit la règle d'avant-hier — supprimer un compte supprime ses
   compteurs — par un lien direct au lieu du ricochet par le site. */
alter table compteurs drop constraint if exists compteurs_compte_id_fkey;
alter table compteurs add constraint compteurs_compte_id_fkey
  foreign key (compte_id) references comptes (id) on delete cascade;

alter table compteurs alter column compte_id set not null;

create index if not exists idx_compteurs_compte_id on compteurs (compte_id);

comment on column compteurs.compte_id is
  'Le client du compteur, en direct. Il ne s''atteignait qu''en traversant `sites` — ce qui faisait '
  'du site le chemin obligatoire vers le compte, et empêchait de le retirer. NOT NULL : un compteur '
  'sans client n''a pas de sens, et les 7 919 en ont un.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES GARDE-FOUS — chacun REFAIT le calcul depuis les données
-- ════════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_compteurs   integer;
  v_sans_compte integer;
  v_desaccord   integer;
  v_cascade     text;
begin
  select count(*) into v_compteurs from compteurs;

  -- ① AUCUN COMPTEUR SANS CLIENT. Le NOT NULL l'impose déjà ; on le vérifie quand même, parce
  --   qu'un garde-fou qui fait confiance à la contrainte qu'il vient de poser ne prouve rien.
  select count(*) into v_sans_compte from compteurs where compte_id is null;
  if v_sans_compte > 0 then
    raise exception 'Garde-fou : % compteur(s) sans compte', v_sans_compte;
  end if;

  -- ② LE COMPTE DIRECT EST LE MÊME QUE CELUI DU SITE. C'est la preuve que la recopie n'a rien
  --   inventé : tant que `sites` existe, les deux chemins doivent donner le même résultat.
  select count(*) into v_desaccord
    from compteurs c join sites s on s.id = c.site_id
   where c.compte_id <> s.compte_id;
  if v_desaccord > 0 then
    raise exception 'Garde-fou : % compteur(s) dont le compte differe de celui de son site', v_desaccord;
  end if;

  -- ③ LA RÈGLE DE SUPPRESSION EST BIEN RÉTABLIE. Sans elle, supprimer un compte laisserait des
  --   compteurs orphelins — la régression que cette migration corrige.
  select rc.delete_rule into v_cascade
    from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.constraint_name
   where tc.table_name = 'compteurs' and ccu.table_name = 'comptes'
     and tc.constraint_name = 'compteurs_compte_id_fkey';
  if v_cascade is distinct from 'CASCADE' then
    raise exception 'Garde-fou : la regle de suppression vers comptes vaut % au lieu de CASCADE', coalesce(v_cascade, 'aucune');
  end if;

  raise notice 'Garde-fou passe : % compteurs connaissent leur compte en direct, 0 desaccord avec le site, suppression en CASCADE retablie', v_compteurs;
end $$;

commit;

analyze compteurs;
