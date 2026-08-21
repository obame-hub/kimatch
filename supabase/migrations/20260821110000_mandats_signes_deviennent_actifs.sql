-- Rattraper les mandats signés restés au statut « Signé ».
--
-- SIGNALÉ PAR MICHEL LE 21/08/2026 : « c'est signé, mais il est toujours pas actif. Ce qui fait que
-- je reviens ici pour dire tiens, je vais créer une recommandation, et ça ne montre pas ce compte.
-- Il faut savoir comment basculer automatiquement le mandat au mandat actif. »
--
-- CE QUI MANQUAIT. Rien, nulle part, ne faisait passer un mandat de Signé à Actif : ni le webhook
-- DocuSign, ni l'application, ni un déclencheur en base, ni une tâche planifiée. Vérifié le
-- 21/08/2026 :
--
--   · `pg_trigger` sur `mandats` : un seul déclencheur, `trg_audit_trace` ;
--   · aucune fonction dont le nom touche à mandat / actif / expiration ;
--   · `pg_cron` n'est même pas installé ;
--   · aucun `'ACTIF'` écrit sur un mandat dans tout le code.
--
-- Les 1075 mandats actifs venaient donc tous de la reprise Salesforce, où ils arrivaient déjà
-- actifs. Autrement dit AUCUN mandat signé dans Kimatch n'a jamais pu servir.
--
-- Or toute l'application se fonde sur `statut = 'ACTIF'` : la liste des comptes du wizard de
-- recommandation, la santé d'un site, la matrice de couverture, les compteurs déjà couverts, l'état
-- « prêt pour une recommandation ». Un mandat resté à Signé est un mandat invisible.
--
-- L'AUTOMATISATION est faite côté webhook (`api/docusign/webhook.ts`, même date) : une signature y
-- écrit désormais Actif. Elle ne peut rien pour les signatures déjà passées, d'où ce rattrapage.
--
-- LES TROIS CONCERNÉS, au moment de l'écriture :
--
--   MATERA by LE GOFF              signé le 20/08/2026, valide jusqu'au 19/08/2029
--   SYNDICAT COPROPRIETE GEMEAUX 2 signé le 17/08/2026, valide jusqu'au 16/08/2029
--   CABINET MOLINIER               signé le 14/08/2026, valide jusqu'au 13/08/2029
--
-- La requête n'est pas écrite pour ces trois-là : elle décrit la condition — signé, dans sa fenêtre
-- de validité — et se contente de la vérifier. Elle est donc rejouable sans effet.

begin;

update public.mandats m
   set statut_id = (select id from public.statuts_mandats where code = 'ACTIF')
 where m.statut_id = (select id from public.statuts_mandats where code = 'SIGNE')
   -- Signé pour de bon, pas seulement rangé dans la case.
   and m.date_signature is not null
   -- Et effectivement en vigueur aujourd'hui : annoncer actif un mandat hors de sa fenêtre serait
   -- remplacer un mandat invisible par un mandat mensonger.
   and (m.date_debut_validite is null or m.date_debut_validite <= current_date)
   and (m.date_fin_validite   is null or m.date_fin_validite   >= current_date);

commit;

-- Vérification après application (à coller tel quel) :
--
--   select s.code, count(*) from public.mandats m
--     left join public.statuts_mandats s on s.id = m.statut_id
--    group by 1 order by 2 desc;
--   -- attendu : ACTIF 1078 (au lieu de 1075), plus aucune ligne SIGNE,
--   --           A_PREPARER 293, EXPIRE 71, ENVOYE 2 — inchangés
--
-- Puis, dans l'application : Recommandations → Nouvelle recommandation. Les comptes MATERA by LE
-- GOFF, SYNDICAT COPROPRIETE GEMEAUX 2 et CABINET MOLINIER doivent apparaître dans la liste.
--
-- CE QUI RESTE À FAIRE, et qui n'est pas dans cette migration : personne ne fait expirer un mandat
-- dont la fenêtre s'achève. Les 71 mandats expirés le sont parce que Salesforce les avait déjà
-- marqués ainsi. Un mandat arrivé à terme dans Kimatch restera donc affiché Actif. C'est le même
-- trou, à l'autre bout de la vie du mandat, et il demande une tâche planifiée — à décider avec
-- Michel.
