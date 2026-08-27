-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'OFFRE DE RÉFÉRENCE : LA BASE DU COMPARATIF, DÉSIGNÉE À LA MAIN
--
-- Michel, 27/08/2026 : « une offre de référence peut être n'importe quelle offre. C'est un peu comme
-- retenir une offre. C'est juste que je décide que c'est sur cette offre-là que je vais me baser pour
-- faire le comparatif. »
--
-- Et l'effet attendu, dans ses mots : « si je prends une offre qui est au milieu, il va me mettre des
-- offres en disant "offre moins chère que l'offre de référence" ou "offre plus chère que l'offre de
-- référence" ».
--
-- ══ CE QUE FAISAIT L'APPLICATION, ET POURQUOI C'ÉTAIT FAUX ══
--
-- Aucune colonne ne portait ce fait. Le code prenait donc, faute de mieux, LA MOINS CHÈRE — et le
-- commentaire l'avouait : « la moins chère du lot, en attendant l'offre de référence de Michel ».
--
-- Deux défauts, dont un grave :
--
--   · la moins chère n'est pas un choix, c'est un calcul. Or Michel décrit une DÉCISION : on se
--     compare à ce qu'on veut démontrer, souvent le contrat actuel ou la reconduction du fournisseur
--     en place — pas à la meilleure offre du lot ;
--   · le calcul se faisait PAR FOURNISSEUR et non sur toute la cotation. Chaque fournisseur avait
--     donc sa propre « référence », et deux offres de deux fournisseurs n'étaient pas comparées à la
--     même chose. C'est ce qui rendait la colonne illisible.
--
-- ══ UN SEUL DRAPEAU, EXCLUSIF PAR COTATION ══
--
-- L'index unique partiel garantit qu'il n'y a jamais deux références sur une même optimisation :
-- deux bases de comparaison rendraient tous les écarts indéterminés, et rien à l'écran ne dirait
-- laquelle a servi. Désigner une nouvelle référence retire donc l'ancienne — c'est au code de le
-- faire, et la contrainte est là pour le cas où il oublierait.
--
-- ══ POURQUOI CE N'EST PAS `est_offre_recommandee` ══
--
-- Ce sont deux faits différents sur la même offre, et ils peuvent tomber sur deux offres distinctes :
--
--   `est_offre_recommandee`  ce que Kiwee a obtenu et défend — l'offre retenue
--   `est_offre_reference`    ce à quoi on la compare pour montrer le gain
--
-- Une offre peut être les deux (on se compare à ce qu'on a obtenu), aucune, ou l'une sans l'autre.
-- Le cas le plus courant les sépare : la référence est le contrat en cours du client, et l'offre
-- retenue est celle qu'on a négociée. Les confondre ferait afficher un gain de zéro.
--
-- `reference_offre` existe déjà mais ne convient pas : c'est un TEXTE, la référence commerciale du
-- fournisseur pour son offre. Vérifié le 27/08 : renseignée sur 0 des 56 offres.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.offres_fournisseurs
  add column if not exists est_offre_reference boolean not null default false;

comment on column public.offres_fournisseurs.est_offre_reference is
  'L''offre qui sert de base au comparatif : les autres s''affichent « plus chère » ou « moins chère » qu''elle. Désignée à la main, sur n''importe quelle nature d''offre — y compris l''offre en cours. Distincte de est_offre_recommandee, qui dit l''offre retenue (Michel, 27/08/2026).';

-- Une seule référence par cotation. Deux rendraient tous les écarts indéterminés.
create unique index if not exists offres_fournisseurs_reference_unique
  on public.offres_fournisseurs (optimisation_id)
  where est_offre_reference and actif;

commit;
