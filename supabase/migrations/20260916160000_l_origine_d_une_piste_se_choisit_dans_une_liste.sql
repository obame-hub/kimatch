-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- L'ORIGINE D'UNE PISTE SE CHOISIT DANS UNE LISTE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 16/09/2026 : « dans le header il faudrait également ajouter une cartouche avec l'origine.
-- Cette cartouche doit être cliquable et modifiable au clic. »
--
-- ══ POURQUOI UNE TABLE, ET PAS UN CHAMP LIBRE ══
--
-- `pistes.source` est du texte libre, repris de `LeadSource` côté Salesforce. Tant qu'on ne faisait
-- que l'AFFICHER, c'était sans conséquence. Le rendre modifiable change tout : dix personnes qui
-- retapent « Google Ads sans facture (Inbound) » produisent dix variantes, et la question « d'où
-- viennent nos affaires » cesse d'avoir une réponse.
--
-- Les onze valeurs présentes en base au 16/09/2026 sont donc figées en référentiel :
--
--   Prospect base (Interne)              4 424      LinkedIn (Outbound)                    17
--   Lead Boubacar                          213      Portefeuille existant                  14
--   Google Ads sans facture (Inbound)      134      Listing (Outbound)                      3
--   (aucune origine)                       135      Google Ads avec facture (Inbound)       2
--                                                   Site internet                           2
--                                                   LinkedIn Ads (Inbound)                  1
--                                                   Prospection téléphonique (Outbound)     1
--
-- L'ORDRE EST CELUI DES VOLUMES, pas l'alphabet. On ouvre cette liste pour corriger une origine, et
-- la bonne réponse est presque toujours l'une des trois premières ; classer « Google Ads avec
-- facture » avant « Prospect base » ferait descendre 4 424 pistes sous une qui en compte 2.
--
-- ══ CE QUI N'EST PAS FAIT, ET POURQUOI ══
--
-- PAS DE CLÉ ÉTRANGÈRE, PAS DE MIGRATION DE DONNÉES. `pistes.source` continue de porter le LIBELLÉ,
-- tel quel. Deux raisons : l'import Salesforce écrit cette colonne et n'a aucune idée de ce
-- référentiel — une contrainte ferait échouer une reprise sur une valeur nouvelle, ce qui est le
-- plus mauvais moment pour découvrir qu'une liste est incomplète ; et les 135 pistes sans origine
-- restent légitimement sans origine. La table guide la SAISIE, elle ne garde pas la porte.
--
-- Le jour où une origine inconnue apparaît, elle s'affiche telle quelle sur la fiche et il suffit de
-- l'ajouter ici pour qu'elle rejoigne la liste.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists origines_pistes (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,
  libelle text not null,
  ordre   integer not null default 0,
  actif   boolean not null default true
);

comment on table origines_pistes is
  'Les origines proposées à la saisie sur une piste. `pistes.source` porte le libellé en texte libre : cette table guide le choix, elle ne le contraint pas.';

alter table origines_pistes enable row level security;

-- Lecture pour tous, comme `statuts_pistes` : c'est une liste de choix, pas une donnée.
drop policy if exists origines_pistes_lecture on origines_pistes;
create policy origines_pistes_lecture on origines_pistes for select to authenticated using (true);

drop policy if exists origines_pistes_ecriture_admins on origines_pistes;
create policy origines_pistes_ecriture_admins on origines_pistes for all to authenticated
  using (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']))
  with check (has_role_acces(auth.uid(), array['SUPER_ADMIN','ADMIN']));

insert into origines_pistes (code, libelle, ordre) values
  ('BASE_INTERNE',              'Prospect base (Interne)',              10),
  ('LEAD_BOUBACAR',             'Lead Boubacar',                        20),
  ('GOOGLE_ADS_SANS_FACTURE',   'Google Ads sans facture (Inbound)',    30),
  ('LINKEDIN',                  'LinkedIn (Outbound)',                  40),
  ('PORTEFEUILLE_EXISTANT',     'Portefeuille existant',                50),
  ('LISTING',                   'Listing (Outbound)',                   60),
  ('GOOGLE_ADS_AVEC_FACTURE',   'Google Ads avec facture (Inbound)',    70),
  ('SITE_INTERNET',             'Site internet',                        80),
  ('LINKEDIN_ADS',              'LinkedIn Ads (Inbound)',               90),
  ('PROSPECTION_TELEPHONIQUE',  'Prospection téléphonique (Outbound)', 100)
on conflict (code) do nothing;
