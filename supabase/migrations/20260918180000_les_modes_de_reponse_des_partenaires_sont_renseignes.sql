-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES MODES DE RÉPONSE SONT RENSEIGNÉS, ET ENDESA N'EST PLUS PARTENAIRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William a rempli les dix-huit modes le 18/09/2026, et tranché ENDESA dans la foulée : « important,
-- ENDESA n'est plus partenaire ».
--
-- ══ CE QUE LES VALEURS RÉVÈLENT ══
--
-- Onze partenaires sur dix-huit passent par TRADÉO, cinq par PLATEFORME, deux seulement par MAIL, un
-- par GRILLE. C'est l'inverse exact de ce que la base croyait : `mode_consultation` disait EMAIL sur
-- cinquante fournisseurs sur cinquante et un.
--
-- La conséquence est immédiate et concrète : pour cinq partenaires — MET ENERGIE, OHM ENERGIE, SEFE,
-- ALTERNA et TOTAL ENERGIES — RIEN NE PART. Erwan va chercher leurs prix le jour de la livraison
-- souhaitée. Les écrans leur proposaient pourtant « Demande envoyée », et les auraient comptés parmi
-- les relances à faire vingt-quatre heures plus tard. C'est précisément le genre de fausse alerte qui
-- apprend à ignorer les vraies.
--
-- ══ L'ANCIENNE COLONNE EST SYNCHRONISÉE, PAS ABANDONNÉE ══
--
-- `mode_consultation` est encore lue par la fiche recommandation, par le Pricing et par la vue
-- `v_pricing_versions` — elle décide de la pastille « outil en ligne » et du masquage du statut
-- « Demande envoyée ». La laisser à EMAIL aurait gardé les cinq erreurs à l'écran jusqu'à ce que le
-- code bascule sur la nouvelle colonne.
--
-- La correspondance suit le SENS et non le mot : ce qui compte pour ces écrans est « une demande
-- part-elle ? ». MAIL et TRADEO → EMAIL, PLATEFORME et GRILLE → OUTIL_EN_LIGNE. C'est approximatif
-- pour TRADÉO — la demande part sur la plateforme d'un partenaire, pas par courriel — mais du bon
-- côté de la seule distinction que ces écrans savent faire.
--
-- ══ ENDESA : TERMINÉ, PAS SUSPENDU ══
--
-- « N'est plus partenaire » se lit comme une fin, pas comme une pause : `TERMINE`. Il portait trois
-- consultations et un partenariat marqué « aucun » tout en étant actif — une incohérence que cette
-- migration résout par le haut. Son mode de réponse reste NULL : on ne renseigne pas le circuit d'un
-- fournisseur qu'on ne consulte plus.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update comptes_fournisseurs cf
set mode_reponse = v.mode
from (values
  ('GAZ EUROPEEN',   'MAIL'),
  ('GEDIA',          'MAIL'),
  ('PICOTY',         'TRADEO'),
  ('ENERGEM',        'TRADEO'),
  ('PRIMEO ENERGIE', 'TRADEO'),
  ('GME FRANCE',     'TRADEO'),
  ('HELLIO',         'TRADEO'),
  ('SAVE',           'TRADEO'),
  ('GAZEL ENERGIE',  'TRADEO'),
  ('SELIA',          'TRADEO'),
  ('LA BELLENERGIE', 'TRADEO'),
  ('GEG',            'TRADEO'),
  ('MET ENERGIE',    'PLATEFORME'),
  ('OHM ENERGIE',    'PLATEFORME'),
  ('SEFE',           'PLATEFORME'),
  ('ALTERNA',        'PLATEFORME'),
  ('ILEK',           'PLATEFORME'),
  ('TOTAL ENERGIES', 'GRILLE')
) as v(nom, mode)
join comptes c on c.nom = v.nom
where cf.compte_id = c.id;

-- ENDESA sort du portefeuille de partenaires. Son mode reste vide.
update comptes_fournisseurs cf
set statut_partenariat = 'TERMINE'
from comptes c
where c.id = cf.compte_id and c.nom = 'ENDESA';

-- L'ancienne colonne suit la nouvelle, sur la seule distinction qu'elle sait porter : une demande
-- part-elle, oui ou non ? Sans quoi cinq partenaires continueraient à se voir proposer « Demande
-- envoyée » alors que rien ne leur est jamais envoyé.
update comptes_fournisseurs
set mode_consultation = case
  when mode_reponse in ('MAIL', 'TRADEO') then 'EMAIL'
  when mode_reponse in ('PLATEFORME', 'GRILLE') then 'OUTIL_EN_LIGNE'
  else mode_consultation
end
where mode_reponse is not null;
