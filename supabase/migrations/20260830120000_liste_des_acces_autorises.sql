begin;

-- LA LISTE DES ACCÈS AUTORISÉS ÉTAIT VIDE.
--
-- L'écran Administration propose d'inviter quelqu'un et affiche la liste des personnes
-- autorisées. La table qui la porte, profils_autorises, n'a jamais reçu une seule ligne : l'écran
-- montrait une liste vide et, surtout, rien ne consultait cette table au moment de se connecter.
--
-- On remplit d'abord la liste avec les dix personnes qui travaillent réellement dans Kimatch,
-- avec le rôle et le poste qu'elles ont aujourd'hui. Les trois comptes désactivés
-- (@ancien.kiwee-energie.invalid) en sont exclus : ils ne doivent pas être ré-autorisés.
--
-- C'est la migration suivante qui donne un effet à cette liste.

insert into profils_autorises (email, prenom, nom, role_acces_id, poste_id)
select p.email, p.prenom, p.nom, pra.role_acces_id, pp.poste_id
from profils p
left join profils_roles_acces pra on pra.profil_id = p.id
left join profils_postes pp on pp.profil_id = p.id
where p.actif
  and p.email is not null
  and p.email not like '%@ancien.kiwee-energie.invalid'
  and not exists (select 1 from profils_autorises a where lower(a.email) = lower(p.email));

commit;
