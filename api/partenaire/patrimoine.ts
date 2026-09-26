import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerCle, comptesDuPartenaire, lire, enListe } from './_cle.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GET /api/partenaire/patrimoine — TOUT CE QU'UN PARTENAIRE A CHEZ NOUS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « faudrait leur afficher TOUS leurs objets dans patrimoine dans
 * l'interface externe pour eux ».
 *
 * Les sept objets du patrimoine de Kimatch, moins ce qui ne le regarde pas :
 *
 *     comptes      les entreprises qu'il a apportées
 *     contacts     les personnes chez elles
 *     sites        leurs adresses
 *     compteurs    les points de livraison
 *     mandats      l'autorisation d'agir qu'elles nous ont donnée
 *     contrats     ce qui les engage, et jusqu'à quand
 *     documents    les pièces, sans le fichier lui-même (voir plus bas)
 *
 * L'onglet « Synthèse » de Kimatch ne passe pas : c'est la qualité des données vue par KiWee, un
 * outil de travail interne. « Activité » non plus : les mails et les appels de nos commerciaux.
 *
 * ══ LES CHAMPS SONT CHOISIS UN PAR UN ══
 *
 * Pas de `select *`. `contrats` porte 49 colonnes, dont `prix_molecule_eur_mwh`,
 * `strategie_tarifaire` et onze clauses : ce sont nos conditions de négociation, pas les siennes.
 * `comptes` en porte 39, dont les taux de commission. Un `*` les livrerait, et le jour où une
 * colonne s'ajoute il la livrerait encore sans que personne ne l'ait décidé.
 *
 * Chaque liste ci-dessous est donc la définition de ce qu'on accepte de rendre. Elle se relit.
 *
 * ══ LES DOCUMENTS SANS LEUR FICHIER ══
 *
 * On rend le nom, le type et la date — pas `url`. Le seau est privé depuis le 24/09 et ne s'ouvre
 * qu'avec une session Kimatch, que le partenaire n'a pas. Rendre une adresse qui ne s'ouvrirait
 * jamais serait pire que de ne rien rendre : il cliquerait, et rien ne se passerait.
 *
 * Le jour où il faudra qu'il télécharge, ce sera un point d'entrée à part, qui signera l'adresse
 * après avoir vérifié que le document est bien dans son périmètre.
 *
 * ══ LE PÉRIMÈTRE NE VIENT JAMAIS DE LA REQUÊTE ══
 *
 * Aucun paramètre ne désigne un compte. Il est déduit de la clé, par `comptesDuPartenaire`. C'est
 * la règle de toute cette API, et c'est elle qui la rend tenable : les trois failles trouvées côté
 * Kimatch venaient toutes d'un identifiant accepté depuis le corps de la requête.
 */

const CHAMPS_COMPTE = 'id,reference,nom,siret,siren,ville,code_postal,rue,segment,type_compte,actif,date_creation'
const CHAMPS_CONTACT = 'id,compte_id,civilite,prenom,nom,fonction,email,telephone,telephone_mobile,contact_principal,actif'
const CHAMPS_SITE = 'id,reference,compte_id,nom,adresse,code_postal,ville,surface_m2,actif'
const CHAMPS_COMPTEUR = 'id,reference,site_id,numero_point,libelle,consommation_annuelle_mwh,date_echeance,actif'

/* Le statut est joint en clair : un identifiant opaque n'est utilisable que par celui qui a écrit
   l'API. `document_url` reste dehors, pour la raison dite plus haut. */
const CHAMPS_MANDAT = [
  'id', 'reference', 'numero', 'compte_id', 'date_envoi', 'date_signature',
  'date_debut_validite', 'date_fin_validite', 'duree_mois', 'actif',
  'statut:statuts_mandats(libelle)',
  'signataire:contacts!mandats_contact_signataire_id_fkey(prenom,nom)',
].join(',')

/* NI LE PRIX, NI LA STRATÉGIE, NI LES CLAUSES : ce sont nos conditions de négociation. Le
   partenaire a besoin de savoir qu'un contrat existe, chez qui, et jusqu'à quand. */
const CHAMPS_CONTRAT = [
  'id', 'reference', 'compte_id', 'site_id', 'date_debut', 'date_fin', 'duree_mois',
  'date_signature', 'statut_signature', 'actif',
  'fournisseur:comptes!contrats_fournisseur_compte_id_fkey(nom)',
  'energie:types_energies(libelle)',
].join(',')

const CHAMPS_DOCUMENT = [
  'id', 'reference', 'nom', 'nom_fichier', 'entite_type', 'entite_id', 'date_creation',
  'type:types_documents(libelle)',
].join(',')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LECTURE SEULE, ET DITE COMME TELLE. Un POST refusé par un 405 explicite vaut mieux qu'un
     endpoint qui ignore la méthode : le jour où quelqu'un tente une écriture, il doit lire
     pourquoi elle n'existe pas plutôt que de croire à une panne. */
  if (req.method !== 'GET') {
    res.status(405).json({ erreur: 'Cette API est en lecture seule.' })
    return
  }

  const partenaire = await exigerCle(req, res)
  if (!partenaire) return

  const comptes = await comptesDuPartenaire(partenaire.compteId)
  if (comptes.length === 0) {
    res.status(200).json({
      comptes: [], contacts: [], sites: [], compteurs: [], mandats: [], contrats: [], documents: [],
    })
    return
  }

  const lesComptes = await lire<Record<string, unknown>>(
    `comptes?id=${enListe(comptes)}&select=${CHAMPS_COMPTE}&order=nom`)
  if (!lesComptes) {
    res.status(502).json({ erreur: 'Lecture impossible.' })
    return
  }

  const [contacts, sites, mandats, contrats] = await Promise.all([
    lire(`contacts?compte_id=${enListe(comptes)}&select=${CHAMPS_CONTACT}&order=nom`),
    lire<{ id: string }>(`sites?compte_id=${enListe(comptes)}&select=${CHAMPS_SITE}&order=nom`),
    lire(`mandats?compte_id=${enListe(comptes)}&select=${encodeURIComponent(CHAMPS_MANDAT)}&order=date_creation.desc`),
    lire(`contrats?compte_id=${enListe(comptes)}&select=${encodeURIComponent(CHAMPS_CONTRAT)}&order=date_debut.desc`),
  ])

  /* LES COMPTEURS SUIVENT LEURS SITES, pas le compte : `compteurs.compte_id` existe mais c'est
     `site_id` qui fait foi dans le modèle. Passer par les sites évite de rendre un compteur dont le
     site aurait changé de main. */
  const lesSites = sites ?? []
  const idsSites = lesSites.map((s) => s.id)
  const compteurs = idsSites.length
    ? (await lire(`compteurs?site_id=${enListe(idsSites)}&select=${CHAMPS_COMPTEUR}&order=numero_point`)) ?? []
    : []

  /* LES DOCUMENTS SONT RATTACHÉS PAR `entite_type` + `entite_id`, pas par une clé étrangère. On
     demande donc ceux qui pointent vers un objet de son périmètre — comptes, sites, compteurs,
     mandats et contrats confondus. */
  const idsPerimetre = [
    ...comptes,
    ...idsSites,
    ...(compteurs as { id: string }[]).map((c) => c.id),
    ...((mandats ?? []) as { id: string }[]).map((m) => m.id),
    ...((contrats ?? []) as { id: string }[]).map((c) => c.id),
  ]
  const documents = idsPerimetre.length
    ? (await lire(
        `documents?entite_id=${enListe(idsPerimetre)}&select=${encodeURIComponent(CHAMPS_DOCUMENT)}` +
        '&actif=eq.true&order=date_creation.desc')) ?? []
    : []

  res.status(200).json({
    comptes: lesComptes,
    contacts: contacts ?? [],
    sites: lesSites,
    compteurs,
    mandats: mandats ?? [],
    contrats: contrats ?? [],
    documents,
  })
}
