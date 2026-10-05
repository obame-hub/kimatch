-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN FOURNISSEUR TRADEO REND-IL SES PRIX PAR L'API ?
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Réunion du 05/10/2026 : « il va falloir bien dire que Picoty est fournisseur Tradeo, mais que son
-- fonctionnement ne se fait pas via API […] chaque fournisseur doit avoir un parcours : parcours
-- Tradeo avec offre automatique, ou parcours Tradeo sans offre automatique ». Et : « tu ne
-- récupéreras pas des prix Picoty, Gaz Européen, GEDIA, Energem, parce qu'ils ont leur
-- fonctionnement ».
--
-- `mode_reponse` = TRADEO dit PAR QUI passe la demande ; cette colonne dit si les PRIX reviennent
-- par l'API. Vrai par défaut : c'est le cas des fournisseurs Tradeo, sauf ceux nommés en réunion.
-- Gaz Européen et GEDIA répondent par mail (`mode_reponse` = MAIL) : ils ne sont pas concernés.
-- Sans effet hors du mode TRADEO.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table comptes_fournisseurs
  add column if not exists tradeo_prix_automatiques boolean not null default true;

comment on column comptes_fournisseurs.tradeo_prix_automatiques is
  'Pour un fournisseur au mode de réponse TRADEO : vrai si ses prix reviennent par l''API Tradeo (bouton « Récupérer les prix Tradeo » du Pricer), faux s''il passe par Tradeo mais envoie sa proposition en document (Picoty, Energem — réunion du 05/10/2026), à déposer dans le Pricer. Sans effet pour les autres modes.';

update comptes_fournisseurs cf
   set tradeo_prix_automatiques = false
  from comptes c
 where c.id = cf.compte_id
   and upper(c.nom) in ('PICOTY', 'ENERGEM');

commit;
