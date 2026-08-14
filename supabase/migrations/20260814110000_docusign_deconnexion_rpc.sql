-- ============================================================================================
-- Réparer « Déconnecter » sans ouvrir la lecture des jetons DocuSign
-- ============================================================================================
-- Le bouton « Déconnecter » de Mon profil ne faisait rien. Constaté en cliquant : la ligne restait
-- en base, aucune erreur affichée.
--
-- Cause. PostgreSQL applique les politiques SELECT en plus des politiques DELETE dès que la commande
-- lit des colonnes de la table — ce qui est le cas de `delete ... where profil_id = $1`. Comme
-- docusign_sessions n'a AUCUNE politique de lecture (volontairement : un refresh token permet
-- d'envoyer des enveloppes au nom de la personne), aucune ligne n'était visible, donc aucune
-- supprimée. PostgREST renvoie alors 204 avec zéro ligne : succès apparent, effet nul.
--
-- Ajouter une politique SELECT réglerait le bug mais reviendrait à laisser chacun lire son propre
-- refresh token — exactement ce que la conception cherchait à éviter, et le défaut que
-- profils_gmail_tokens porte déjà.
--
-- La déconnexion passe donc par une fonction SECURITY DEFINER : elle s'exécute avec les droits du
-- propriétaire, ne touche que la ligne de l'appelant via auth.uid(), et ne renvoie aucune donnée.
-- La table redevient totalement muette pour le client.
--
-- Au passage : anon et authenticated avaient les privilèges SELECT/INSERT/UPDATE/DELETE/TRUNCATE
-- complets sur cette table (privilèges par défaut du schéma public dans Supabase), seul RLS les
-- retenait. Ils sont révoqués — une erreur de politique ne doit pas suffire à exposer des jetons.
-- ============================================================================================

begin;

create or replace function public.docusign_deconnecter()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.docusign_sessions where profil_id = auth.uid();
$$;

comment on function public.docusign_deconnecter() is
  'Supprime la session DocuSign de l''appelant. SECURITY DEFINER : docusign_sessions n''accorde aucune lecture au client.';

revoke all on function public.docusign_deconnecter() from public;
grant execute on function public.docusign_deconnecter() to authenticated;

-- La politique DELETE n'a plus d'objet : sans privilège sur la table, le client ne peut de toute
-- façon plus tenter la suppression directement.
drop policy if exists docusign_sessions_self_delete on public.docusign_sessions;

revoke all on public.docusign_sessions from anon, authenticated;

commit;

-- Contrôle attendu après application :
--   grants anon/authenticated sur docusign_sessions : aucun
--   select public.docusign_deconnecter() en tant qu'utilisateur connecté : supprime SA ligne
