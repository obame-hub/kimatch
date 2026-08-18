-- Comment on consulte chaque fournisseur : par email, ou dans son outil en ligne.
--
-- RÉUNION DU 17/08/2026 (23:36 → 25:27). Naoëlle décrit deux circuits distincts, et l'application
-- les traite aujourd'hui de façon identique :
--
--   · GAZ EUROPEEN et GEDIA — « la demande des offres se fait par mail ». C'est le circuit long :
--     on envoie, on attend l'accusé de réception, puis l'offre arrive.
--   · ILEK — « on a un priceur, un outil où on peut aller voir les offres directement. On n'a pas
--     besoin de ça. Je ne suis plus obligée de basculer par demande fournisseur : je peux juste
--     mettre offre acceptée directement. »
--
-- Sans cette distinction, l'écran impose à Erwan de passer par « demande envoyée » chez Ilek alors
-- qu'aucune demande n'est jamais partie — et le futur bouton « Lancer le pricing » enverrait un
-- email à un fournisseur qui n'en attend pas. C'est le préalable à ce bouton, pas un ornement.
--
-- DEUX VALEURS SEULEMENT, parce que la réunion n'en nomme que deux. Une liste fermée par CHECK :
-- c'est un aiguillage de comportement, une faute de frappe y ferait prendre le mauvais chemin
-- silencieusement. Le jour où un fournisseur passe par une API, on étend la contrainte — comme on
-- vient de le faire pour `documents.entite_type`.
--
-- LE DÉFAUT EST `EMAIL` : c'est le circuit de la grande majorité des 51 fournisseurs, et c'est aussi
-- le plus prudent. Se tromper vers `EMAIL` fait afficher une étape de trop ; se tromper vers
-- `OUTIL_EN_LIGNE` ferait croire qu'une offre est accessible alors que personne ne l'a demandée.
--
-- `url_outil_consultation` VA AVEC, et je l'ajoute sans qu'elle ait été demandée : un mode
-- « outil en ligne » sans l'adresse de l'outil laisse Erwan chercher où aller. La colonne reste
-- vide jusqu'à ce que quelqu'un renseigne les liens — elle ne coûte rien tant qu'elle l'est.

begin;

alter table public.comptes_fournisseurs
  add column if not exists mode_consultation text not null default 'EMAIL',
  add column if not exists url_outil_consultation text;

alter table public.comptes_fournisseurs
  drop constraint if exists comptes_fournisseurs_mode_consultation_check;

alter table public.comptes_fournisseurs
  add constraint comptes_fournisseurs_mode_consultation_check
  check (mode_consultation = any (array['EMAIL', 'OUTIL_EN_LIGNE']));

comment on column public.comptes_fournisseurs.mode_consultation is
  'EMAIL : la demande d''offre part par mail, on attend l''accusé de réception. OUTIL_EN_LIGNE : les prix sont consultables directement, aucune demande à envoyer — le suivi démarre à « Demande acceptée ».';
comment on column public.comptes_fournisseurs.url_outil_consultation is
  'Adresse de l''outil de pricing du fournisseur, quand mode_consultation vaut OUTIL_EN_LIGNE.';

-- ILEK est le seul fournisseur que la réunion désigne explicitement comme ayant un outil en ligne.
-- On ne devine pas pour les 50 autres : ils restent en EMAIL jusqu'à ce que quelqu'un les qualifie,
-- ce qui est le comportement actuel et donc sans surprise.
update public.comptes_fournisseurs cf
   set mode_consultation = 'OUTIL_EN_LIGNE'
  from public.comptes co
 where co.id = cf.compte_id
   and upper(co.nom) = 'ILEK';

commit;

-- Vérification après application (à coller tel quel) :
--
--   select mode_consultation, count(*) from public.comptes_fournisseurs group by 1;
--   -- attendu : EMAIL 50, OUTIL_EN_LIGNE 1
--
--   select co.nom, cf.mode_consultation
--     from public.comptes_fournisseurs cf join public.comptes co on co.id = cf.compte_id
--    where upper(co.nom) in ('GAZ EUROPEEN', 'GEDIA', 'ILEK') order by co.nom;
--   -- attendu : GAZ EUROPEEN et GEDIA en EMAIL, ILEK en OUTIL_EN_LIGNE
--
-- À FAIRE ENSUITE, hors migration : qualifier les autres fournisseurs avec Erwan, qui sait lesquels
-- ont un priceur. Tant que ce n'est pas fait, l'écran leur propose le circuit par email — ce qui
-- reste juste, simplement plus long d'une étape.
