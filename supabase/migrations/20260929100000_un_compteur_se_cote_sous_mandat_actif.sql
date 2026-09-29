-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR NE SE COTE QUE SOUS MANDAT ACTIF
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 29/09/2026 : « pour Tradeo il faut aussi afficher les comptes et compteurs avec les
-- mandats actifs, car on ne peut pas demander des prix si on n'a pas le droit ».
--
-- Le mandat EST l'autorisation : c'est lui que Tradeo appelle ACD (autorisation de collecte des
-- données). Déclarer chez Tradeo un compteur qu'aucun mandat actif ne couvre, c'est demander des
-- prix pour un client qui ne nous l'a pas permis.
--
-- ══ LA RÈGLE N'EST PAS NOUVELLE, ELLE EST ÉCRITE UNE FOIS ══
--
-- Kimatch la connaît déjà : un mandat est actif quand son statut est ACTIF — la tâche de nuit
-- `api/mandats/expirer` le fait passer Expiré au terme de sa validité, c'est donc la colonne qui fait
-- foi, pas un calcul de dates refait à la lecture. Un compteur est couvert tant qu'il n'a pas été
-- retiré du mandat (`caduc_depuis` vide). C'est ce que lisent déjà la santé d'un site et la
-- conversion d'une opportunité.
--
-- CETTE VUE LA POSE EN BASE, pour que l'écran du banc Tradeo et la fonction `api/tradeo` posent la
-- même question au même endroit : un contrôle de droit tenu par l'écran seul se contourne en
-- appelant la route directement.
--
-- ══ LE PDF DU MANDAT ══
--
-- C'est l'ACD que Tradeo attend. Il vit dans `documents` (entite_type = 'mandat'), pas dans
-- `mandats.document_url`, vide sur les 56 mandats des versions en cours (mesuré le 29/09/2026).
-- `mime_type` n'est renseigné que sur 219 des 7 171 documents de mandat : le nom de fichier sert de
-- repli. Le plus récent l'emporte.
--
-- LE CERTIFICAT DE SIGNATURE N'EST PAS LE MANDAT. L'archivage DocuSign range à côté du mandat signé
-- son certificat (« Certificat_signature_… »), sous le même type « Mandat » : 1 728 des 7 169
-- documents de mandat. Le premier essai du 29/09/2026 a joint un certificat comme ACD — il est donc
-- exclu. Tradeo attend l'autorisation signée, pas la preuve de sa signature.
--
-- SECURITY INVOKER : la vue répond avec les droits de celui qui la lit. Un partenaire, que les
-- policies de `mandats_compteurs` et `documents` écartent déjà, n'y voit rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace view v_compteurs_mandat_actif
with (security_invoker = true) as
select distinct on (mc.compteur_id)
  mc.compteur_id,
  k.numero_point,
  k.compte_id,
  m.id as mandat_id,
  m.reference as mandat_reference,
  m.date_fin_validite,
  d.id as document_id,
  d.nom_fichier as document_nom
from mandats_compteurs mc
join mandats m on m.id = mc.mandat_id
join statuts_mandats s on s.id = m.statut_id and s.code = 'ACTIF'
join compteurs k on k.id = mc.compteur_id
left join lateral (
  select d.id, d.nom_fichier
  from documents d
  where d.entite_type = 'mandat'
    and d.entite_id = m.id
    and d.actif
    and (d.mime_type ilike '%pdf%' or d.nom_fichier ilike '%.pdf')
    and coalesce(d.nom_fichier, '') not ilike 'certificat%'
  order by d.date_creation desc
  limit 1
) d on true
where mc.caduc_depuis is null
-- Plusieurs mandats actifs sur un même compteur : celui qui court le plus longtemps, puis celui
-- qui a un PDF. C'est lui qu'on joindra comme ACD.
order by mc.compteur_id, m.date_fin_validite desc nulls first, (d.id is null), m.date_creation desc;

comment on view v_compteurs_mandat_actif is
  'Les compteurs couverts par un mandat ACTIF (et non retirés du mandat), un par compteur, avec le '
  'PDF du mandat quand il existe. Seule définition de « on a le droit de demander des prix pour ce '
  'compteur », lue par le banc Tradeo et par api/tradeo. Voir la migration du 29/09/2026.';
comment on column v_compteurs_mandat_actif.compteur_id is 'Le compteur couvert.';
comment on column v_compteurs_mandat_actif.numero_point is 'Son PDL ou PCE : c''est sous ce numéro que Tradeo le connaît.';
comment on column v_compteurs_mandat_actif.compte_id is 'Le compte du compteur.';
comment on column v_compteurs_mandat_actif.mandat_id is 'Le mandat actif qui le couvre (celui qui court le plus longtemps s''il y en a plusieurs).';
comment on column v_compteurs_mandat_actif.mandat_reference is 'La référence du mandat, telle qu''elle s''affiche.';
comment on column v_compteurs_mandat_actif.date_fin_validite is 'Fin de validité du mandat. NULL : sans échéance.';
comment on column v_compteurs_mandat_actif.document_id is 'Le PDF du mandat signé, le plus récent. NULL : aucun PDF rattaché.';
comment on column v_compteurs_mandat_actif.document_nom is 'Le nom de ce fichier.';

grant select on v_compteurs_mandat_actif to authenticated;

commit;
