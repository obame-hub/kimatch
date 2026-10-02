-- ══ UN APPEL OU UN MAIL GARDÉ EN FICHIER — 02/10/2026 ══
-- William : « pour mail et appel, c'est uniquement si je veux ajouter un enregistrement mail ou un
-- appel en mp3 dans les fichiers. Que les appels et mails soient renseignés dans les activités, c'est
-- deux choses complètement différentes. » L'extension suffit à le reconnaître, et passe avant le nom :
-- un enregistrement « facture_relance.mp3 » est un appel.
create or replace function public.fn_categorie_document(p_nom text, p_entite text)
returns text language sql immutable set search_path = public as $$
  with n as (
    select lower(translate(coalesce(p_nom, ''), 'ÉÈÊËéèêëÀÂàâÎÏîïÔôÙÛÜùûüÇç', 'EEEEeeeeAAaaIIiiOoUUUuuuCc')) as t
  )
  select coalesce(
    (select case
      when t ~ '\.(mp3|wav|m4a|ogg|aac|wma|amr)(\s|$)' then 'APPEL'
      when t ~ '\.(eml|msg)(\s|$)' then 'MAIL'
      when t ~ 'certificateofcompletion|certificat' then 'CERTIFICAT'
      when t ~ '(^|[^a-z])(rib|sepa)([^a-z]|$)' then 'RIB'
      when t ~ 'avenant' then 'AVENANT'
      when t ~ 'factur|invoice' then 'FACTURE'
      when t ~ 'rapport.{0,3}de.{0,3}consultation|appel.{0,3}d.{0,3}offres?|appel-offres?' then 'APPEL_OFFRES'
      when t ~ 'mandat' then 'MANDAT'
      when t ~ 'contrat|cgv|conditions.{0,3}particulieres|conditions.{0,3}generales' then 'CONTRAT'
      when t ~ '(^|[^a-z])offres?([^a-z]|$)|budget|proposition' then 'OFFRE_FOURNISSEUR'
    end from n),
    case
      when p_entite in ('compteur', 'opportunite', 'piste', 'site') then 'FACTURE'
      when p_entite = 'contrat' then 'CONTRAT'
      when p_entite = 'mandat' then 'MANDAT'
      when p_entite in ('version_recommandation', 'consultation_fournisseur', 'offre_fournisseur') then 'OFFRE_FOURNISSEUR'
      else 'AUTRE'
    end)
$$;
