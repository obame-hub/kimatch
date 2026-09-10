-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SUPPRIMER UN CONTACT NE BUTE PLUS SUR LES RÔLES QU'IL TENAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Suite du 10/09/2026. La suppression d'un compte réparée, l'audit `npm run suppressions` a joué
-- toutes les autres et en a trouvé trois encore bloquées. Naoëlle : « fais les deux » — corriger
-- celles qui sont des bugs, expliquer celles qui sont des refus légitimes.
--
-- ══ LE CRITÈRE N'EST PAS « LA COLONNE ACCEPTE-T-ELLE LE VIDE » ═══════════════════════════════
--
-- C'est la question que je me suis posée d'abord, et elle est mauvaise. `contrats.fournisseur_
-- compte_id` accepte le vide, et pourtant le vider serait un désastre : supprimer UN compte
-- fournisseur effacerait le nom du fournisseur sur 1 057 contrats appartenant à des dizaines de
-- clients différents. La colonne le permet ; le métier l'interdit.
--
-- LA BONNE QUESTION EST : LA LIGNE QUI RÉFÉRENCE APPARTIENT-ELLE AU MÊME CLIENT ?
--
--   · Un contact est signataire d'un contrat DE SON PROPRE CLIENT. Le supprimer doit vider la
--     case « signataire » — le contrat survit, il ne nomme plus personne. C'est un bug que ça
--     bloque.
--   · Un compte fournisseur est cité sur les contrats DES AUTRES. Le supprimer ne doit pas les
--     toucher. C'est un refus légitime — mais la fenêtre doit le DIRE, ce qu'elle fera désormais
--     (voir `inventaireSuppression.ts`, même livraison).
--
-- ══ CE QUI SE VIDE (7 LIENS) ══════════════════════════════════════════════════════════════════
--
-- Les rôles qu'une personne tient chez son propre client. L'objet porteur survit, il perd un nom :
--
--   compteurs.responsable_contact_id             6 752 lignes
--   compteurs.contact_conseil_syndical_id          435
--   contrats.contact_signataire_id               1 588
--   contrats.interlocuteur_pricing_contact_id      203
--   recommandations.contact_signataire_id        1 617
--   versions_recommandation.contact_id               1
--   comptes.apporteur_partenaire_id                  0   (l'origine partenaire d'un compte)
--
-- Et les deux liens d'un signal vers ce qui l'a motivé. Un signal tient debout sans eux — il a son
-- site, qui est obligatoire — donc il survit en perdant la référence plutôt qu'en disparaissant :
--
--   signaux.contrat_id                             791
--   signaux.recommandation_id                      745
--
-- ══ CE QUI SUIT L'OBJET (2 LIENS) ═════════════════════════════════════════════════════════════
--
-- L'historique D'UN compte n'a pas de sens sans lui : ce ne sont pas des données du client, c'est
-- la trace de ce qu'on a fait à sa fiche. Les deux sont vides aujourd'hui, mais la contrainte
-- attendait la première ligne pour rendre un compte indéboulonnable — exactement le genre de piège
-- qui se révèle six mois plus tard, un vendredi.
--
--   evenements_metier.compte_id
--   historiques_entites.compte_id
--
-- ══ CE QU'ON NE TOUCHE PAS, ET POURQUOI ═══════════════════════════════════════════════════════
--
--   contrats.fournisseur_compte_id                 1 057   contrats d'autres clients
--   compteurs.fournisseur_actuel_compte_id         4 303   compteurs d'autres clients
--   recommandations.fournisseur_compte_id            814   chiffrages d'autres clients
--   optimisations_fournisseurs.fournisseur_compte_id 3 575  et la colonne est NOT NULL
--   mandats_compteurs.compteur_id                  2 705   un mandat SIGNÉ liste ses compteurs ;
--                                                          en retirer une ligne en silence
--                                                          falsifierait un document signé
--   recommandations.compte_id                              RESTRICT délibéré depuis l'origine
--
-- Ces six-là refusent, et ils ont raison de refuser. Ce qui était faux, c'est le message : « d'autres
-- enregistrements y sont encore rattachés » sans dire lesquels ni combien. La fenêtre les nomme
-- maintenant, avant qu'on clique.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── LES RÔLES SE VIDENT : L'OBJET SURVIT, IL NE NOMME PLUS PERSONNE ───────────────────────────
alter table public.compteurs drop constraint compteurs_responsable_contact_id_fkey;
alter table public.compteurs add constraint compteurs_responsable_contact_id_fkey
  foreign key (responsable_contact_id) references public.contacts(id) on delete set null;

alter table public.compteurs drop constraint compteurs_contact_conseil_syndical_id_fkey;
alter table public.compteurs add constraint compteurs_contact_conseil_syndical_id_fkey
  foreign key (contact_conseil_syndical_id) references public.contacts(id) on delete set null;

alter table public.contrats drop constraint contrats_contact_signataire_id_fkey;
alter table public.contrats add constraint contrats_contact_signataire_id_fkey
  foreign key (contact_signataire_id) references public.contacts(id) on delete set null;

alter table public.contrats drop constraint contrats_interlocuteur_pricing_contact_id_fkey;
alter table public.contrats add constraint contrats_interlocuteur_pricing_contact_id_fkey
  foreign key (interlocuteur_pricing_contact_id) references public.contacts(id) on delete set null;

alter table public.recommandations drop constraint recommandations_contact_signataire_id_fkey;
alter table public.recommandations add constraint recommandations_contact_signataire_id_fkey
  foreign key (contact_signataire_id) references public.contacts(id) on delete set null;

alter table public.versions_recommandation drop constraint versions_recommandation_contact_id_fkey;
alter table public.versions_recommandation add constraint versions_recommandation_contact_id_fkey
  foreign key (contact_id) references public.contacts(id) on delete set null;

alter table public.comptes drop constraint comptes_apporteur_partenaire_id_fkey;
alter table public.comptes add constraint comptes_apporteur_partenaire_id_fkey
  foreign key (apporteur_partenaire_id) references public.comptes(id) on delete set null;

-- ── LE SIGNAL SURVIT À CE QUI L'A MOTIVÉ ──────────────────────────────────────────────────────
alter table public.signaux drop constraint signaux_contrat_id_fkey;
alter table public.signaux add constraint signaux_contrat_id_fkey
  foreign key (contrat_id) references public.contrats(id) on delete set null;

alter table public.signaux drop constraint signaux_recommandation_id_fkey;
alter table public.signaux add constraint signaux_recommandation_id_fkey
  foreign key (recommandation_id) references public.recommandations(id) on delete set null;

-- ── L'HISTORIQUE D'UNE FICHE PART AVEC ELLE ───────────────────────────────────────────────────
alter table public.evenements_metier drop constraint evenements_metier_compte_id_fkey;
alter table public.evenements_metier add constraint evenements_metier_compte_id_fkey
  foreign key (compte_id) references public.comptes(id) on delete cascade;

alter table public.historiques_entites drop constraint historiques_entites_compte_id_fkey;
alter table public.historiques_entites add constraint historiques_entites_compte_id_fkey
  foreign key (compte_id) references public.comptes(id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON SUPPRIME LE CONTACT LE PLUS CHARGÉ DE RÔLES, PUIS ON ANNULE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que les clés portent « set null » ne dirait rien de l'ORDRE dans lequel les gardes-fous
-- des interactions passent — c'est ce qui a piégé la suppression de compte ce matin. On joue donc
-- une vraie suppression sur le contact qui tient le plus de rôles, et on l'annule.
--
do $$
declare
  cible     uuid;
  nom_cible text;
  roles     integer;
begin
  select c.id,
         coalesce(c.prenom || ' ', '') || coalesce(c.nom, '(sans nom)'),
         (select count(*) from public.compteurs m where m.responsable_contact_id = c.id)
       + (select count(*) from public.compteurs m where m.contact_conseil_syndical_id = c.id)
       + (select count(*) from public.contrats k where k.contact_signataire_id = c.id)
       + (select count(*) from public.recommandations r where r.contact_signataire_id = c.id)
    into cible, nom_cible, roles
  from public.contacts c
  order by 3 desc
  limit 1;

  if cible is null then
    raise exception 'Garde-fou impossible : aucun contact en base.';
  end if;

  begin
    delete from public.contacts where id = cible;
    raise exception 'essai concluant';
  exception
    when others then
      if sqlerrm <> 'essai concluant' then
        raise exception 'La suppression d''un contact échoue encore sur « % » (% rôles) : % (%)',
          nom_cible, roles, sqlerrm, sqlstate;
      end if;
  end;

  raise notice 'Garde-fou : « % » tenait % rôle(s), sa suppression passe, et a été annulée.',
    nom_cible, roles;
end $$;

commit;
