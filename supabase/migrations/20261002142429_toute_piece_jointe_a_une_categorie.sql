-- ══ TOUTE PIÈCE JOINTE A UNE CATÉGORIE — 02/10/2026 ══
-- William : « dans Kimatch, peu importe où tu ajoutes une pièce jointe, cette pièce jointe doit toujours
-- avoir une catégorie (Facture, mandat, appel d'offres, contrat, RIB, certificat, avenant, appel, mail,
-- offre fournisseur, autre). Sur le fichier, possibilité de changer cette catégorie en un clic. »
--
--   1. Les onze catégories, dans cet ordre. « Recommandation » et « Annexe » sortent de la liste.
--   2. `fn_categorie_document(nom, entite)` : la catégorie que dit le nom du fichier (certificat DocuSign,
--      RIB ou mandat SEPA, avenant, facture, rapport de consultation…), à défaut celle de l'endroit du
--      dépôt (un compteur reçoit des factures, un mandat des mandats…).
--   3. Un déclencheur la pose sur tout document inséré SANS catégorie : il n'en manque plus jamais.
--      Avant lui, `type_document_id` étant obligatoire, ces dépôts échouaient — dont, en silence, la
--      facture lue à la création d'un compteur.
--   4. L'existant est reclassé : les certificats, RIB et avenants sortent de « Mandat » et « Contrat » ;
--      « Recommandation », « Annexe » et « Autre » sont relus par le nom.
insert into public.types_documents (code, libelle, ordre, actif) values
  ('FACTURE', 'Facture', 10, true), ('MANDAT', 'Mandat', 20, true), ('APPEL_OFFRES', 'Appel d''offres', 30, true),
  ('CONTRAT', 'Contrat', 40, true), ('RIB', 'RIB', 50, true), ('CERTIFICAT', 'Certificat', 60, true),
  ('AVENANT', 'Avenant', 70, true), ('APPEL', 'Appel', 80, true), ('MAIL', 'Mail', 90, true),
  ('OFFRE_FOURNISSEUR', 'Offre fournisseur', 100, true), ('AUTRE', 'Autre', 999, true)
on conflict (code) do update set libelle = excluded.libelle, ordre = excluded.ordre, actif = true, date_modification = now();

create or replace function public.fn_categorie_document(p_nom text, p_entite text)
returns text language sql immutable set search_path = public as $$
  with n as (
    select lower(translate(coalesce(p_nom, ''), 'ÉÈÊËéèêëÀÂàâÎÏîïÔôÙÛÜùûüÇç', 'EEEEeeeeAAaaIIiiOoUUUuuuCc')) as t
  )
  select coalesce(
    (select case
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
comment on function public.fn_categorie_document(text, text) is
  'La catégorie d''une pièce jointe : celle que dit son nom, à défaut celle de l''endroit du dépôt (02/10/2026).';

create or replace function public.fn_trg_categorie_document()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.type_document_id is null then
    select id into new.type_document_id from public.types_documents
    where code = public.fn_categorie_document(coalesce(nullif(new.nom_fichier, ''), new.nom) || ' ' || coalesce(new.nom, ''), new.entite_type);
  end if;
  return new;
end $$;
drop trigger if exists trg_categorie_document on public.documents;
create trigger trg_categorie_document before insert or update of type_document_id on public.documents
  for each row execute function public.fn_trg_categorie_document();

-- L'EXISTANT. Le journal d'audit suit chaque changement (trg_audit_trace).
with lu as (
  select d.id, t.code as ancien,
         public.fn_categorie_document(coalesce(d.nom_fichier, '') || ' ' || coalesce(d.nom, ''), null) as par_nom
  from public.documents d join public.types_documents t on t.id = d.type_document_id
), cible as (
  select id, case
    when par_nom in ('CERTIFICAT', 'RIB', 'AVENANT') then par_nom
    when ancien in ('FACTURE', 'MANDAT', 'CONTRAT') then ancien
    when par_nom <> 'AUTRE' then par_nom
    when ancien = 'RECOMMANDATION' then 'OFFRE_FOURNISSEUR'
    else 'AUTRE'
  end as code, ancien
  from lu
)
update public.documents d set type_document_id = t.id, date_modification = now()
from cible c join public.types_documents t on t.code = c.code
where d.id = c.id and c.code <> c.ancien;

update public.types_documents set actif = false, date_modification = now() where code in ('RECOMMANDATION', 'ANNEXE');
