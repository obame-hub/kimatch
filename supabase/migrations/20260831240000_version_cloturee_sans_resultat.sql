-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE VERSION CLÔTURÉE SANS RÉSULTAT
--
-- La refonte des statuts du 28/08/2026 a séparé le STATUT d'une version (EN_CONSTRUCTION,
-- DISPONIBLE, EN_DECISION, CLOTUREE) de son RÉSULTAT (ACCEPTEE, REFUSEE, EXPIREE). Une version
-- CLOTUREE doit donc dire pourquoi : sans résultat, elle indique qu'on a arrêté sans dire ce qu'il en
-- est sorti.
--
-- Mesuré le 31/08/2026 : une seule version dans ce cas, sur les 2 000 et quelques de la base. C'est
-- l'inverse d'un problème de fond — mais une exception non traitée est ce qui rend une règle
-- inexploitable, et un écran qui affiche « clôturée » sans dire l'issue relance la question à chaque
-- lecture.
--
-- LE RÉSULTAT EST DÉDUIT, PAS INVENTÉ. La version est la dernière de son dossier, et ce dossier est
-- clôturé avec la finalité EXPIREE. C'est la même information vue de l'autre bout : la finalité du
-- dossier vient du résultat de sa dernière version. On la recopie.
--
-- CIBLAGE PAR LA RÈGLE, PAS PAR L'IDENTIFIANT. Écrire l'UUID en dur corrigerait cette ligne et
-- laisserait passer la suivante. La condition décrit le cas : version clôturée, sans résultat, dont
-- le dossier porte une finalité. Si une deuxième apparaît d'ici l'application, elle est traitée aussi.
-- Et si le chemin d'écriture qui a produit celle-ci existe encore, cette migration ne le corrige pas :
-- le compteur à surveiller est « version CLOTUREE sans résultat », qui doit rester à zéro.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.versions_recommandation v
   set resultat = r.finalite_cloture,
       date_modification = now()
  from public.recommandations r,
       public.statuts_versions_recommandation s
 where r.id = v.recommandation_id
   and s.id = v.statut_version_id
   and s.code = 'CLOTUREE'
   and v.resultat is null
   and r.finalite_cloture is not null
   -- Les trois seules valeurs que la contrainte de `resultat` accepte. Une finalité hors de cette
   -- liste ferait échouer la migration entière plutôt que d'écrire une valeur refusée.
   and r.finalite_cloture in ('ACCEPTEE', 'REFUSEE', 'EXPIREE');

commit;
