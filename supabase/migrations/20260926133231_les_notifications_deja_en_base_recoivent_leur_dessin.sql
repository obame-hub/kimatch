-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES NOTIFICATIONS DÉJÀ EN BASE REÇOIVENT LEUR DESSIN
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 26/09/2026, capture à l'appui : « le design ne correspond pas exactement à ce que tu
-- m'as proposé... je veux exactement le même. »
--
-- ══ CE QUE J'AVAIS MAL JUGÉ ══
--
-- J'avais posé `donnees` sur les nouvelles notifications seulement, en me disant que les treize
-- anciennes garderaient tranquillement l'affichage d'avant. Sauf que la boîte de Fabien ne contient
-- QUE ces treize-là : le repli n'était pas un cas de bord, c'était tout ce qu'il voyait. Un dessin
-- qui n'apparaît qu'au prochain contrat validé n'est pas livré.
--
-- ══ RIEN N'EST INVENTÉ ══
--
-- Chaque notification porte `entite_id`, l'identifiant du contrat. Le compte, la référence,
-- l'énergie, le fournisseur et le valideur se relisent donc à la source plutôt que de se découper
-- dans la phrase du `message` — qui reste intacte, et qui resservira si un jour `donnees` manque.
--
-- LE CODE ÉNERGIE EST EN CAPITALES EN BASE (`GAZ`, `ELECTRICITE`) alors que l'application le
-- compare en minuscules : elle l'abaisse à la lecture. Une première version de cette reprise
-- comparait à `'gaz'` et rangeait les 1 085 contrats de gaz en électricité, sans erreur ni signal.

update notifications n
set
  /* LE LIEN SUIT LA MÊME RÈGLE QUE LES NOUVELLES : on va au suivi, là où est le travail. On ne
     touche au lien que si le suivi existe — sinon l'ancien lien reste, et il fonctionne. */
  lien = coalesce('/suivis-contrats/' || s.id, n.lien),
  donnees = jsonb_strip_nulls(jsonb_build_object(
    'sujet', cp.nom,
    'reference', c.reference,
    'jeton', case when e.code = 'GAZ' then 'Gaz' else 'Électricité' end,
    'ton', case when e.code = 'GAZ' then 'gaz' else 'elec' end,
    'precision', f.nom,
    'sous_titre', concat_ws(' · ', 'à revérifier',
                            case when v.id is not null then 'validé par ' || v.prenom || ' ' || v.nom end)
  ))
from contrats c
left join comptes cp on cp.id = c.compte_id
left join comptes f on f.id = c.fournisseur_compte_id
left join types_energies e on e.id = c.type_energie_id
left join profils v on v.id = c.valide_par_id
left join suivis_contrats s on s.contrat_id = c.id
where n.categorie = 'validation_contrat'
  and n.donnees is null
  and c.id = n.entite_id
  /* SANS COMPTE, PAS DE DESSIN : le sujet est le titre en gras, et une notification dont le gros
     titre serait vide se lirait plus mal que la phrase qu'elle remplace. */
  and cp.nom is not null;
