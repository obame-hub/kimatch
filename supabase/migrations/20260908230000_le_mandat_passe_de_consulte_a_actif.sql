-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE CHEMIN D'UN MANDAT : À PRÉPARER → ENVOYÉ → CONSULTÉ → ACTIF
--
-- William, 08/09/2026 : « il faut carrément supprimer le jalon Signé qui ne sert à rien. À la
-- seconde où j'ai envoyé le mandat en signature via DocuSign, le mandat doit passer au statut
-- "Envoyé". À la seconde où le client a consulté le mandat, le statut passe immédiatement à
-- "Consulté". Puis quand le client signe, il faut immédiatement que le statut passe à "Actif". »
--
-- ── « SIGNÉ » N'A JAMAIS RIEN DÉSIGNÉ, ET A DÉJÀ COÛTÉ DEUX FOIS ──
--
-- Mesuré avant d'écrire : sur les 1 466 mandats de la base, ZÉRO porte « Signé », zéro porte « En
-- signature ». Ce ne sont pas des états rares, ce sont des états morts — le retour DocuSign écrit
-- directement « Actif » pour un mandat signé dans sa fenêtre (`statutAEcrire`), et la validation
-- manuelle fait de même.
--
-- Mais la frise de la fiche les proposait au clic, et s'arrêter sur « Signé » rend le compte
-- INVISIBLE dans la création de recommandation, qui n'accepte que « Actif ». C'est arrivé le
-- 21/08/2026 sur SENAC IMMOBILIER — signalé par Michel — et de nouveau aujourd'hui sur INTERSERVICES
-- JMD, où Matthieu s'est arrêté à « Signé » à 15 h 51. Le geste est pourtant naturel : le mandat EST
-- signé. C'est le jalon qui est faux, pas l'utilisateur.
--
-- ── « EN SIGNATURE » DEVIENT « CONSULTÉ », PARCE QUE C'EST CE QUE DIT DOCUSIGN ──
--
-- L'événement `delivered` de DocuSign ne veut pas dire « remis » : il veut dire que le destinataire
-- a OUVERT l'enveloppe. Il était traduit en « Envoyé », c'est-à-dire perdu — le commercial ne
-- pouvait pas savoir que son client avait ouvert le document sans le signer, alors que c'est
-- précisément le moment où une relance sert à quelque chose.
--
-- Le code du statut change avec son libellé. Un code `EN_SIGNATURE` affiché « Consulté » se relit
-- comme une incohérence trois mois plus tard, et c'est la moitié des heures perdues sur ce projet.
--
-- ── LE TEMPS RÉEL ──
--
-- `mandats` rejoint la publication `supabase_realtime` : la fiche s'abonne aux changements de SON
-- mandat et voit le statut avancer sans rechargement. `appels_en_cours` y était déjà — Naoëlle l'a
-- publiée le 08/09/2026 tout en choisissant d'interroger toutes les quatre secondes plutôt que
-- d'ouvrir un websocket « la veille d'un test ». Le test est passé ; le besoin ici est le sien à un
-- détail près : un mandat change trois fois en dix minutes, pas trois fois par heure.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  n_en_signature int;
  n_signe int;
begin
  select count(*) into n_en_signature from mandats m
    join statuts_mandats s on s.id = m.statut_id where s.code = 'EN_SIGNATURE';
  select count(*) into n_signe from mandats m
    join statuts_mandats s on s.id = m.statut_id where s.code = 'SIGNE';

  -- On ne supprime un statut que si PERSONNE ne s'en sert. Sinon la suppression échouerait sur la
  -- clé étrangère — ou, pire, laisserait des mandats pointant vers un référentiel disparu.
  if n_signe > 0 then
    raise exception '% mandat(s) portent encore « Signé » : les basculer avant de supprimer le jalon.', n_signe;
  end if;

  raise notice 'Jalon « Signé » supprimé ; « En signature » devient « Consulté » (% mandat(s) concerné(s)).',
    n_en_signature;
end $$;

-- ── « En signature » devient « Consulté » ──
update statuts_mandats
set code = 'CONSULTE', libelle = 'Consulté'
where code = 'EN_SIGNATURE';

-- ── « Signé » disparaît du chemin ──
delete from statuts_mandats where code = 'SIGNE';

-- ── Le temps réel sur la fiche mandat ──
-- `add table` échoue si la table y est déjà : on ne l'ajoute donc que si elle en est absente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mandats'
  ) then
    alter publication supabase_realtime add table public.mandats;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   -- Le chemin, dans l'ordre. Doit rendre : À préparer, Envoyé, Consulté, Actif, Expiré,
--   -- Refusé, Annulé — et plus aucun « Signé ».
--   select code, libelle, ordre from statuts_mandats order by ordre;
--
--   -- Doit contenir `mandats` en plus de `appels_en_cours`.
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
