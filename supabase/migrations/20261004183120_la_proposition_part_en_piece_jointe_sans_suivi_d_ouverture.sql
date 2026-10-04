-- ══ LA PROPOSITION PART EN PIÈCE JOINTE — William, 04/10/2026 ══
-- « Non en fait on va juste ajouter le PDF en pièce jointe du mail pour le moment, supprime tout ce que
-- tu as créé vis-à-vis de l'ouverture et le tracking du lien. » Le lien de consultation et son
-- comptage disparaissent (aucune donnée réelle : seuls des essais, effacés). La validité de l'offre
-- (`validite_offre`, `alerte_validite_le`) reste : le compte à rebours et l'alerte de la veille en vivent.
drop function if exists public.fn_ouvrir_proposition(text);
drop table if exists public.propositions_envoyees;
delete from public.notifications where categorie = 'proposition_ouverte';
