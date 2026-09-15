-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE ATTEND SA FACTURE AVANT D'ÊTRE CONVERTIE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 15/09/2026 : « dans la fiche Piste, le statut doit avoir Nouvelle > En cours de
-- qualification > En attente de facture > Convertie (vert) ou Disqualifiée (rouge) ».
--
-- ══ UNE ÉTAPE S'INTERCALE, ELLE NE REMPLACE RIEN ══
--
-- « En attente de facture » se place APRÈS la qualification et AVANT les deux issues. C'est le temps
-- réel du métier : la piste est qualifiée, on a demandé la facture d'énergie au prospect, et rien ne
-- peut avancer tant qu'elle n'est pas arrivée — sans elle, aucune analyse n'est possible.
--
-- Elle n'est PAS clôturante : une piste en attente de facture est vivante, elle attend. C'est même
-- l'état où la relance a le plus de valeur, et la marquer close la ferait disparaître des écrans de
-- travail.
--
-- ══ LES DEUX ISSUES REÇOIVENT ENFIN LEUR COULEUR ══
--
-- La colonne `couleur` était NULLE sur les quatre statuts : chaque écran choisissait la sienne dans
-- son coin. Convertie passe au vert, Disqualifiée au rouge, comme demandé.
--
-- CELA RENVERSE UN CHOIX QUE J'AVAIS FAIT, et il faut le dire : la fiche piste rendait « Disqualifiée »
-- en GRIS, avec cet argument — « écarter une piste est un travail fait, pas un échec ; sur cinq mille
-- pistes importées, en écarter est l'issue normale de la majorité ». L'argument tient toujours, mais
-- ce n'est pas à moi de trancher la sémiotique du portefeuille : William demande le rouge, c'est le
-- rouge. La raison de l'ancien choix reste écrite ici pour qu'on sache ce qu'on a changé.
--
-- ══ LES ORDRES SONT RENUMÉROTÉS, PAS BRICOLÉS ══
--
-- Glisser la nouvelle étape en 25 pour éviter de toucher aux autres aurait marché, et aurait laissé
-- une échelle 10-20-25-30-40 que personne ne saurait relire dans six mois. On renumérote de dix en
-- dix : l'ordre EST la progression affichée par la frise, il doit se lire comme elle.
--
-- ══ AUCUNE PISTE N'EST DÉPLACÉE ══
--
-- 4 465 Nouvelle · 365 En qualification · 295 Disqualifiée · 15 Convertie. Le nouveau statut naît
-- vide, et c'est juste : décider qu'une piste attend sa facture est une observation humaine, pas une
-- déduction. Rien dans les données ne permet de le savoir à leur place.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

insert into statuts_pistes (code, libelle, ordre, est_cloture, couleur, actif)
values ('EN_ATTENTE_FACTURE', 'En attente de facture', 30, false, null, true)
on conflict (code) do update
   set libelle = excluded.libelle, ordre = excluded.ordre,
       est_cloture = excluded.est_cloture, actif = excluded.actif;

-- Les deux issues reculent pour laisser la place, et prennent leur couleur.
update statuts_pistes set ordre = 40, couleur = '#0D7A5F' where code = 'CONVERTIE';
update statuts_pistes set ordre = 50, couleur = '#B85145' where code = 'DISQUALIFIEE';

-- Les deux premières ne changent que de couleur : ce sont des étapes de travail, pas des issues.
-- L'ambre dit « en cours », et c'est déjà ce que la fiche affichait.
update statuts_pistes set couleur = '#A06B19' where code in ('NOUVELLE', 'EN_QUALIFICATION');
update statuts_pistes set couleur = '#A06B19' where code = 'EN_ATTENTE_FACTURE';
