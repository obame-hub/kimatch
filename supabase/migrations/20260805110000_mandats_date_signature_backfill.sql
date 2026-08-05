-- L'import initial (transform.js) a mappé date_signature sur Salesforce DS_Date_de_signature__c
-- (champ propre au process DocuSign), vide pour la quasi-totalité des mandats historiques signés
-- avant/sans DocuSign. William a confirmé que Date_de_d_but__c ("Date de début") sert réellement
-- de date de signature côté Salesforce -- ce champ est déjà importé dans date_debut_validite.
-- Purement additif : ne touche jamais une date_signature déjà renseignée.
update public.mandats
set date_signature = date_debut_validite
where date_signature is null and date_debut_validite is not null;
