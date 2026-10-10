import { supabase } from '@/lib/supabase'
import { appelerBanc, chargerDossierKimatch, chargerMandatsActifs, messageErreur, type MandatDuCompteur } from '@/lib/data/tradeo'
import type { Chiffrage, CommandeFournisseur } from '@/lib/data/chiffrage'
import type { OffreLue, PropositionLue } from '@/lib/pricing/lectureOffre'
import { MARGE_APPEL_TRADEO, prixSurLaDuree } from '@/lib/parcoursPrix/sourceTradeo'
import { compteursPourTradeo, dateDebutProposee, dateFinPour, manquesDemande, responsablePourTradeo, type CompteurTradeo } from '@/lib/tradeo/dossier'
import { lireOffresTradeo, rapprocherFournisseur, type OffreTradeo } from '@/lib/tradeo/prixUnitaires'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TRADEO DANS LE PRICER : L'HOMOLOGATION, PUIS LES PRIX DANS LE TABLEAU
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Réunion du 05/10/2026. Les règles, telles que William les a posées :
 *
 *   · ON DEMANDE L'HOMOLOGATION seulement si le périmètre est couvert par un mandat ENERGIX et que
 *     la commande de la version compte au moins un fournisseur qui répond par Tradeo (`mode_reponse`
 *     = TRADEO). « Faut pas non plus tout le temps leur balancer des demandes d'homologation. »
 *   · L'HOMOLOGATION EST TENUE PAR LE MANDAT : une fois les compteurs acceptés, toutes les versions
 *     suivantes se cotent sans nouvelle demande, tant que le mandat est actif.
 *   · LES PRIX SE RÉCUPÈRENT LE JOUR DE L'OFFRE, d'un bouton grisé tant que l'homologation n'est pas
 *     confirmée — ce sont des prix immédiats.
 *   · TOUJOURS UN P0. Tradeo cote avec une marge (2 €/MWh au moins) ; « la marge qui a été notée dans
 *     la calculatrice, c'est inclus » : on la propose comme marge incluse, et le pricing la confirme,
 *     exactement comme pour une proposition Gaz Européen lue dans un PDF.
 *   · AU BON FORMAT : l'abonnement Tradeo est au mois (`abo`), la ligne le range à l'année.
 *
 * LES PRIX PASSENT PAR LE VOLET DE LECTURE DE WILLIAM (`LecturesPropositions`) : une réponse Tradeo
 * devient une `PropositionLue` par fournisseur, et le pricing l'inclut ligne par ligne, comme un PDF.
 * Un seul chemin d'écriture, une seule relecture — rien ne s'écrit sans que quelqu'un l'ait vu.
 *
 * Les communs (TQD, accise, CTA, CPB, TURPE) ne sont jamais repris : la base les calcule.
 */

export type EtatCompteurTradeo = 'NON_ENVOYE' | 'EN_ATTENTE' | 'ACCEPTE' | 'REFUSE'

export type EtapeTradeo =
  /** Aucun fournisseur Tradeo dans la commande : rien à faire, le panneau ne s'affiche pas. */
  | 'HORS_TRADEO'
  /** Fournisseur Tradeo commandé, mais aucun compteur sous mandat Energix actif. */
  | 'SANS_MANDAT'
  /** Des compteurs couverts n'ont jamais été envoyés à Tradeo. */
  | 'A_DEMANDER'
  /** Tout est envoyé, au moins un compteur attend l'équipe Tradeo. */
  | 'DEMANDEE'
  /** Au moins un compteur couvert est accepté : les prix peuvent se récupérer. */
  | 'HOMOLOGUE'

export interface CompteurSuivi {
  vcId: string
  numero: string
  energie: 'gaz' | 'electricite'
  mandat: MandatDuCompteur | null
  etat: EtatCompteurTradeo
  demandeId: number | null
}

export interface EtatTradeoVersion {
  etape: EtapeTradeo
  /** Tous les fournisseurs Tradeo commandés : ils déclenchent l'homologation. */
  fournisseurs: CommandeFournisseur[]
  /** Ceux qui passent par Tradeo mais envoient leur proposition en document (Picoty, Energem) :
   *  pas interrogés par l'API — leur PDF se dépose dans le Pricer. */
  sansPrixAutomatiques: CommandeFournisseur[]
  siret: string
  /** Les compteurs sous mandat Energix actif : les seuls que Tradeo accepte. */
  couverts: CompteurSuivi[]
  /** Les autres, nommés avec leur raison — un compteur exclu ne disparaît pas en silence. */
  exclus: { numero: string; raison: 'KIWEE_SEUL' | 'AUCUN' }[]
  /** Ce que Tradeo refusera si on envoie maintenant. Vide : la demande est prête. */
  manques: string[]
  /** Le numéro de la dernière demande chez Tradeo, pour la retrouver et relancer. */
  demandeNumero: number | null
}

interface DemandeLue {
  id: number
  societe?: { siret?: string }
  compteurs?: { status?: number; numCompteur?: string; objetConsommation?: { numCompteur?: string } | null }[]
}

const sansEspace = (s: string | null | undefined) => (s ?? '').replace(/\s/g, '')

/** Les fournisseurs de la commande qui répondent par Tradeo. */
export function fournisseursTradeo(commande: CommandeFournisseur[]): CommandeFournisseur[] {
  return commande.filter((f) => (f.modeReponse ?? '').toUpperCase() === 'TRADEO')
}

/**
 * Ce que Tradeo sait de chaque compteur, lu dans ses demandes sur ce SIRET. La plus récente a le
 * dernier mot. LE NUMÉRO EST SUR LE COMPTEUR (`numCompteur`), pas dans `objetConsommation` comme
 * l'écrit la documentation v1.4 : `objetConsommation` vaut `null` tant que le compteur n'est pas
 * accepté (mesuré sur la demande n° 3099, 29/09/2026).
 */
export function etatsDepuisDemandes(demandes: DemandeLue[], siret: string, numeros: string[]): Map<string, { etat: EtatCompteurTradeo; demandeId: number | null }> {
  const carte = new Map<string, { etat: EtatCompteurTradeo; demandeId: number | null }>()
  for (const n of numeros) carte.set(n, { etat: 'NON_ENVOYE', demandeId: null })
  for (const d of demandes.filter((x) => x.societe?.siret === siret).sort((a, b) => a.id - b.id)) {
    for (const c of d.compteurs ?? []) {
      const num = sansEspace(c.numCompteur ?? c.objetConsommation?.numCompteur)
      if (!carte.has(num)) continue
      carte.set(num, { etat: c.status === 1 ? 'ACCEPTE' : c.status === 0 || c.status === undefined ? 'EN_ATTENTE' : 'REFUSE', demandeId: d.id })
    }
  }
  return carte
}

/** L'étape de la version, d'après la commande et ce que Tradeo sait des compteurs couverts. */
export function etapeTradeo(nbFournisseurs: number, couverts: Pick<CompteurSuivi, 'etat'>[]): EtapeTradeo {
  if (nbFournisseurs === 0) return 'HORS_TRADEO'
  if (couverts.length === 0) return 'SANS_MANDAT'
  if (couverts.some((c) => c.etat === 'ACCEPTE')) return 'HOMOLOGUE'
  if (couverts.some((c) => c.etat === 'NON_ENVOYE')) return 'A_DEMANDER'
  return 'DEMANDEE'
}

async function lireDemandes(siret: string): Promise<DemandeLue[]> {
  const r = await appelerBanc('mes_demandes', { pageNumber: 1, dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: siret, column: 0, dir: 'desc' } })
  if (!r.ok) throw new Error(messageErreur(r) ?? 'Tradeo n’a pas répondu.')
  return (r.reponse as { demandesCotations?: DemandeLue[] } | undefined)?.demandesCotations ?? []
}

/** Note l'étape sur chaque mandat concerné. Une date déjà posée ne recule jamais (côté base). */
export async function noterSurLesMandats(mandatIds: string[], etape: 'DEMANDEE' | 'HOMOLOGUE', demande: number | null) {
  for (const id of new Set(mandatIds)) {
    const { error } = await supabase.rpc('fn_noter_homologation_tradeo', { p_mandat: id, p_etape: etape, p_demande: demande })
    if (error) throw new Error(error.message)
  }
}

export async function chargerEtatTradeo(chiffrage: Chiffrage): Promise<EtatTradeoVersion> {
  const fournisseurs = fournisseursTradeo(chiffrage.commande)
  const vide: EtatTradeoVersion = { etape: 'HORS_TRADEO', fournisseurs, sansPrixAutomatiques: [], siret: '', couverts: [], exclus: [], manques: [], demandeNumero: null }
  if (fournisseurs.length === 0) return vide
  const { data: fiches } = await supabase.from('comptes_fournisseurs').select('compte_id').in('compte_id', fournisseurs.map((f) => f.fournisseurId)).eq('tradeo_prix_automatiques', false)
  const sansAuto = new Set(((fiches ?? []) as { compte_id: string }[]).map((f) => f.compte_id))
  vide.sansPrixAutomatiques = fournisseurs.filter((f) => sansAuto.has(f.fournisseurId))

  const dossier = await chargerDossierKimatch(chiffrage.version.id)
  const siret = sansEspace(dossier.siret)
  const mandats = await chargerMandatsActifs(chiffrage.compteurs.map((c) => c.compteurId))
  const couverts: CompteurSuivi[] = []
  const exclus: EtatTradeoVersion['exclus'] = []
  for (const c of chiffrage.compteurs) {
    const numero = sansEspace(c.numero)
    const m = mandats.get(numero) ?? null
    if (m?.energix) couverts.push({ vcId: c.vcId, numero, energie: c.energie, mandat: m, etat: 'NON_ENVOYE', demandeId: null })
    else exclus.push({ numero: numero || '(sans numéro)', raison: m ? 'KIWEE_SEUL' : 'AUCUN' })
  }
  if (couverts.length === 0) return { ...vide, etape: 'SANS_MANDAT', siret, exclus }

  const manques: string[] = []
  if (!/^\d{14}$/.test(siret)) manques.push('Le compte n’a pas de SIRET à 14 chiffres.')
  let demandeNumero: number | null = null
  if (manques.length === 0) {
    const etats = etatsDepuisDemandes(await lireDemandes(siret), siret, couverts.map((c) => c.numero))
    for (const c of couverts) Object.assign(c, etats.get(c.numero))
    demandeNumero = Math.max(0, ...couverts.map((c) => c.demandeId ?? 0)) || null
    /* L'HOMOLOGATION LUE SE NOTE SUR LE MANDAT, la première fois qu'on la voit. */
    const ids = [...new Set(couverts.map((c) => c.mandat!.mandat_id))]
    const { data: deja } = await supabase.from('mandats').select('id').in('id', ids).not('tradeo_homologue_le', 'is', null)
    const notes = new Set(((deja ?? []) as { id: string }[]).map((m) => m.id))
    const aNoter = couverts.filter((c) => c.etat === 'ACCEPTE' && !notes.has(c.mandat!.mandat_id)).map((c) => c.mandat!.mandat_id)
    if (aNoter.length) await noterSurLesMandats(aNoter, 'HOMOLOGUE', demandeNumero)
  }

  const aEnvoyer = compteursAEnvoyer(dossier, couverts)
  if (aEnvoyer.length) manques.push(...manquesDemande(siret, responsablePourTradeo(dossier), aEnvoyer))
  if (aEnvoyer.length && !couverts.some((c) => c.etat === 'NON_ENVOYE' && c.mandat?.document_id)) manques.push('Le PDF du mandat Energix n’est pas rangé sur le mandat : Tradeo le demande en pièce jointe.')
  for (const g of await facturesGazAEnvoyer(dossier, aEnvoyer)) {
    if (!g.factureId) manques.push(`${g.numero} : aucune facture rangée sur ce compteur gaz — Tradeo refuse automatiquement un compteur gaz sans facture.`)
  }
  return { etape: etapeTradeo(fournisseurs.length, couverts), fournisseurs, sansPrixAutomatiques: vide.sansPrixAutomatiques, siret, couverts, exclus, manques: [...new Set(manques)], demandeNumero }
}

/**
 * LA DERNIÈRE FACTURE RANGÉE SUR CHAQUE COMPTEUR, par identifiant de compteur. Tradeo refuse
 * automatiquement un compteur gaz sans facture (Michel, 07/10/2026) : elle part avec la demande.
 */
async function facturesDesCompteurs(compteurIds: string[]): Promise<Map<string, string>> {
  const factures = new Map<string, string>()
  if (compteurIds.length === 0) return factures
  const { data, error } = await supabase
    .from('documents')
    .select('id, entite_id, type_document:types_documents!inner(code)')
    .eq('entite_type', 'compteur')
    .in('entite_id', compteurIds)
    .eq('type_document.code', 'FACTURE')
    .order('date_creation', { ascending: false })
  if (error) throw new Error(error.message)
  for (const d of (data ?? []) as { id: string; entite_id: string }[]) if (!factures.has(d.entite_id)) factures.set(d.entite_id, d.id)
  return factures
}

/** Les compteurs gaz à envoyer, avec l'identifiant de leur facture (`null` : aucune n'est rangée). */
async function facturesGazAEnvoyer(dossier: Awaited<ReturnType<typeof chargerDossierKimatch>>, aEnvoyer: CompteurTradeo[]) {
  const gaz = new Set(aEnvoyer.filter((c) => c.type === 'GAZ').map((c) => c.num_compteur))
  const compteurs = dossier.compteurs.filter((c) => gaz.has(sansEspace(c.numero_point)))
  const factures = await facturesDesCompteurs(compteurs.map((c) => c.id))
  return compteurs.map((c) => ({ numero: sansEspace(c.numero_point), factureId: factures.get(c.id) ?? null }))
}

function compteursAEnvoyer(dossier: Awaited<ReturnType<typeof chargerDossierKimatch>>, couverts: CompteurSuivi[]): CompteurTradeo[] {
  const nonEnvoyes = new Set(couverts.filter((c) => c.etat === 'NON_ENVOYE').map((c) => c.numero))
  return compteursPourTradeo(dossier).filter((c) => nonEnvoyes.has(c.num_compteur))
}

/**
 * Dépose la demande d'homologation : les compteurs couverts jamais envoyés, le mandat Energix en
 * pièce jointe (l'ACD), puis prévient l'équipe Tradeo par mail. La pré-production ne rend pas le
 * numéro de la demande (29/09/2026) : on le relit dans ses demandes.
 */
export async function demanderHomologation(chiffrage: Chiffrage, etat: EtatTradeoVersion): Promise<string> {
  const dossier = await chargerDossierKimatch(chiffrage.version.id)
  const aEnvoyer = compteursAEnvoyer(dossier, etat.couverts)
  if (aEnvoyer.length === 0) return 'Tous les compteurs couverts sont déjà chez Tradeo.'
  const nums = new Set(aEnvoyer.map((c) => c.num_compteur))
  const acd = etat.couverts.find((c) => nums.has(c.numero) && c.mandat?.document_id)?.mandat ?? null
  const r = await appelerBanc('creer_demande', {
    compteurs: aEnvoyer.map((c) => ({ ...c, site: c.site || undefined })),
    dataSociete: { siret: etat.siret }, dataResponsable: responsablePourTradeo(dossier),
    ...(acd?.document_id ? { acd_document_id: acd.document_id } : {}),
  })
  if (!r.ok) throw new Error(messageErreur(r) ?? 'Tradeo a refusé la demande.')

  /* LES FACTURES GAZ, une par compteur, sur la demande qui vient de le recevoir — AVANT de prévenir
     l'équipe Tradeo, pour qu'elle trouve un dossier complet. */
  const gaz = (await facturesGazAEnvoyer(dossier, aEnvoyer)).filter((g) => g.factureId)
  if (gaz.length) {
    const demandes = etatsDepuisDemandes(await lireDemandes(etat.siret), etat.siret, gaz.map((g) => g.numero))
    for (const g of gaz) {
      const demandeId = demandes.get(g.numero)?.demandeId
      if (!demandeId) throw new Error(`${g.numero} : la demande Tradeo est introuvable, la facture n’a pas pu être jointe.`)
      const f = await appelerBanc('ajouter_fichier', { demande_id: demandeId, facture_document_id: g.factureId })
      if (!f.ok) throw new Error(`${g.numero} : Tradeo a refusé la facture — ${messageErreur(f) ?? 'sans message'}.`)
    }
  }

  const prevenus = await relancerTradeo(etat.siret)
  const mandatsEnvoyes = etat.couverts.filter((c) => nums.has(c.numero) && c.mandat).map((c) => c.mandat!.mandat_id)
  await noterSurLesMandats(mandatsEnvoyes, 'DEMANDEE', prevenus.numero)
  return prevenus.message
}

/** Prévient l'équipe Tradeo pour chaque demande de ce SIRET qui attend encore. */
export async function relancerTradeo(siret: string): Promise<{ message: string; numero: number | null }> {
  const enAttente = (await lireDemandes(siret))
    .filter((d) => d.societe?.siret === siret && (d.compteurs ?? []).some((c) => c.status === 0 || c.status === undefined))
    .map((d) => d.id)
  if (enAttente.length === 0) return { message: 'Aucune demande en attente chez Tradeo.', numero: null }
  const resultats = await Promise.all(enAttente.map((id) => appelerBanc('demander_validation', { id_demande: id })))
  const ko = resultats.find((x) => !x.ok)
  return {
    message: ko ? `Tradeo n’a pas pu être prévenu : ${messageErreur(ko)}` : 'L’équipe Tradeo a été prévenue par mail.',
    numero: Math.max(...enAttente),
  }
}

/* ══ D'UNE RÉPONSE TRADEO À UNE PROPOSITION DU VOLET ══════════════════════════════════════════════ */

const POSTE_PAR_CHAMP: Record<string, string> = {
  prixBase: 'BASE', prixHp: 'HP', prixHc: 'HC', prixHph: 'HPH', prixHch: 'HCH', prixHpe: 'HPE', prixHce: 'HCE', prixPointe: 'POINTE',
}
const CAPACITE_PAR_CHAMP: Record<string, string> = {
  prixCapaBase: 'BASE', prixCapaHp: 'HP', prixCapaHc: 'HC', prixCapaHph: 'HPH', prixCapaHch: 'HCH', prixCapaHpe: 'HPE', prixCapaHce: 'HCE', prixCapaPointe: 'POINTE',
}
const arrondi = (n: number) => Math.round(n * 10000) / 10000
const fr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')

/** « Non Soumis » : le client n'est pas soumis aux CEE (mesuré le 05/10/2026, toutes les offres
 *  élec de LA MARMOTTE GOURMANDE) — c'est un prix de 0, pas une case vide. */
function ceeNonSoumis(o: OffreTradeo): boolean {
  const b = o.brut as { cee?: unknown; lesPrix?: { cee?: unknown } }
  return [b.cee, b.lesPrix?.cee].some((v) => typeof v === 'string' && /non\s*soumis/i.test(v))
}

/**
 * Une offre Tradeo, telle qu'une proposition imprimée la donnerait : le prix MARGÉ (la marge de la
 * calculatrice y est), l'abonnement à l'année. La capacité ne se reprend que si `typeCapa` vaut
 * « Valeur » — « Coef » est un coefficient, « Inclus » est déjà dans le prix. Le Pricer n'a qu'une
 * case de capacité : on garde la première valeur rendue.
 */
export function offreLueDepuisTradeo(o: OffreTradeo, gaz: boolean, dureeMois: number): OffreLue | null {
  const lu = prixSurLaDuree(o)
  if (!lu) return null
  const postes: Record<string, number> = {}
  if (!gaz) for (const [champ, poste] of Object.entries(POSTE_PAR_CHAMP)) if (lu.prix[champ] != null) postes[poste] = arrondi(lu.prix[champ])
  let capacite: number | null = null
  if (!gaz && (o.typeCapa ?? '').toLowerCase() === 'valeur') {
    for (const [champ, poste] of Object.entries(CAPACITE_PAR_CHAMP)) if (lu.prix[champ] != null && poste in postes) { capacite = lu.prix[champ]; break }
  }
  const p0 = gaz ? lu.prix.prixMolecule ?? null : null
  if (gaz ? p0 == null : Object.keys(postes).length === 0) return null
  const abo = lu.prix.abo ?? null
  return {
    numero_point: o.numCompteur,
    duree_mois: dureeMois,
    type_prix: /index/i.test(o.typeOffre ?? '') ? 'Indexé' : 'Fixe',
    car_mwh: null,
    profil: null,
    p0_mwh: p0 == null ? null : arrondi(p0),
    prix_postes_mwh: postes,
    capacite_mwh: capacite,
    abonnement_annuel: abo == null ? null : arrondi(abo * 12),
    abonnement_imprime: abo == null ? null : { montant: abo, periode: 'mois' },
    cee_classiques_mwh: null,
    cee_precarite_mwh: null,
    cee_mwh: lu.prix.cee ?? (ceeNonSoumis(o) ? 0 : null),
  }
}

/**
 * UNE SEULE OFFRE PAR LIGNE DU PRICER : LA MOINS CHÈRE AU BUDGET TTC — réunion du 07/10/2026
 * (Naoëlle, Michel, William). Ekwateur rend deux offres pour le même compteur et la même durée,
 * « Fixe semaine » (une grille tenue la semaine) et « Fixe journalier » ; GEG en rend parfois
 * plusieurs aussi. Les deux visaient la même ligne, et celle qui gagnait dépendait de l'ordre de la
 * réponse. « Toujours le moins cher, sur le budget total TTC, pas sur le budget énergie. » Une offre
 * sans budget TTC ne passe devant aucune autre.
 */
export function laMoinsChereParLigne<T extends { offre: Pick<OffreTradeo, 'budgetTtc'>; lue: Pick<OffreLue, 'numero_point' | 'duree_mois' | 'type_prix'> }>(candidates: T[]): T[] {
  const parLigne = new Map<string, T>()
  for (const c of candidates) {
    const cle = `${sansEspace(c.lue.numero_point)}|${c.lue.duree_mois}|${c.lue.type_prix}`
    const tenante = parLigne.get(cle)
    const prix = c.offre.budgetTtc ?? Number.POSITIVE_INFINITY
    if (!tenante || prix < (tenante.offre.budgetTtc ?? Number.POSITIVE_INFINITY)) parLigne.set(cle, c)
  }
  return [...parLigne.values()]
}

export interface RecuperationTradeo {
  propositions: PropositionLue[]
  /** Ce qui n'a pas pu se récupérer, dit en clair : fournisseur absent, compteur refusé… */
  manques: string[]
}

/**
 * Interroge Tradeo pour les compteurs acceptés de la version, sur chaque durée commandée aux
 * fournisseurs Tradeo, et rend une proposition par fournisseur — prête pour le volet de lecture.
 * Ne lit et n'écrit RIEN dans la base : c'est le pricing qui inclut.
 */
export async function recupererPropositionsTradeo(chiffrage: Chiffrage, etat: EtatTradeoVersion, aujourdHui = new Date()): Promise<RecuperationTradeo> {
  const manques: string[] = []
  const acceptes = etat.couverts.filter((c) => c.etat === 'ACCEPTE')
  for (const c of etat.couverts.filter((x) => x.etat !== 'ACCEPTE')) manques.push(`${c.numero} : pas encore accepté par Tradeo, non coté.`)
  if (acceptes.length === 0) return { propositions: [], manques }
  const sansAuto = new Set(etat.sansPrixAutomatiques.map((f) => f.id))
  const interroges = etat.fournisseurs.filter((f) => !sansAuto.has(f.id))
  for (const f of etat.sansPrixAutomatiques) manques.push(`${f.nom} passe par Tradeo mais envoie sa proposition en document : déposez-la sur le tableau.`)
  if (interroges.length === 0) return { propositions: [], manques }
  const durees = [...new Set(interroges.flatMap((f) => f.durees))].sort((a, b) => a - b)
  if (durees.length === 0) return { propositions: [], manques: [...manques, 'Aucune durée commandée aux fournisseurs Tradeo.'] }

  /* LE DÉBUT DE FOURNITURE, compteur par compteur : celui que la base retient (échéance + 1 jour, ou
     début de fourniture de la version). Tradeo refuse un début passé : on prend alors le 1er du mois
     prochain, et on le dit. */
  const demain = new Date(Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), aujourdHui.getUTCDate() + 1)).toISOString().slice(0, 10)
  const debutDe = (vcId: string, numero: string) => {
    const ref = chiffrage.compteurs.find((c) => c.vcId === vcId)?.reglementaire?.dateReference ?? null
    if (ref && ref >= demain) return ref
    const d = dateDebutProposee(null, aujourdHui)
    if (ref) manques.push(`${numero} : début de fourniture ${ref} déjà passé, coté à partir du ${d}.`)
    return d
  }

  const parDuree = new Map<number, OffreTradeo[]>()
  const periodeDe = new Map<string, { debut: string; duree: number }[]>()
  const energieDe = new Map(acceptes.map((c) => [c.numero, c.energie]))
  for (const energie of ['ELEC', 'GAZ'] as const) {
    const lot = acceptes.filter((c) => (c.energie === 'gaz') === (energie === 'GAZ'))
    if (lot.length === 0) continue
    const liste = await appelerBanc('compteurs_par_siret', { siret: etat.siret, energie })
    const connus = new Map(((liste.reponse as { listCompteur?: { id: number; numCompteur: string; parametreCompteur?: string }[] } | undefined)?.listCompteur ?? []).map((c) => [sansEspace(c.numCompteur), c]))
    for (let i = 0; i < lot.length; i += 10) {
      const paquet = lot.slice(i, i + 10).filter((c) => {
        if (connus.has(c.numero)) return true
        manques.push(`${c.numero} : accepté, mais Tradeo ne le rend pas pour ce SIRET.`)
        return false
      })
      if (paquet.length === 0) continue
      const conso = await appelerBanc('consommation', {
        compteurData: paquet.map((c) => {
          const t = connus.get(c.numero)!
          return energie === 'GAZ' ? { id: t.id, numCompteur: t.numCompteur } : { id: t.id, numCompteur: t.numCompteur, type: 'ELEC', parametreCompteur: t.parametreCompteur }
        }),
      })
      const parNum = (conso.reponse as { compteur?: Record<string, { id: number; objetConsommation?: Record<string, unknown>; autreFournisseur?: unknown[] }> } | undefined)?.compteur
      if (!conso.ok || !parNum) { manques.push(`Consommation illisible chez Tradeo : ${messageErreur(conso) ?? 'réponse vide'}.`); continue }
      const debuts = new Map(paquet.map((c) => [c.numero, debutDe(c.vcId, c.numero)]))
      for (const duree of durees) {
        const compteur: Record<string, unknown> = {}
        for (const [num, c] of Object.entries(parNum)) {
          const debut = debuts.get(sansEspace(num)) ?? dateDebutProposee(null, aujourdHui)
          periodeDe.set(sansEspace(num), [...(periodeDe.get(sansEspace(num)) ?? []), { debut, duree }])
          compteur[num] = { id: c.id, marge: MARGE_APPEL_TRADEO, objetConsommation: { ...(c.objetConsommation ?? {}), dateDebut: debut, dateFin: dateFinPour(debut, duree) }, autreFournisseur: c.autreFournisseur ?? [] }
        }
        const calcul = await appelerBanc('calculer', { compteur })
        if (!calcul.ok) { manques.push(`Calcul ${duree} mois refusé : ${messageErreur(calcul) ?? 'sans message'}.`); continue }
        const { offres, erreurs } = lireOffresTradeo(calcul.reponse)
        for (const e of erreurs) manques.push(`${e.numCompteur}, ${duree} mois : ${e.message}`)
        parDuree.set(duree, [...(parDuree.get(duree) ?? []), ...offres])
      }
    }
  }

  const propositions: PropositionLue[] = []
  const refuses = new Set<string>()
  for (const f of interroges) {
    const offres: OffreLue[] = []
    const candidates: { offre: OffreTradeo; lue: OffreLue }[] = []
    let marge: number | null = null
    for (const duree of f.durees) {
      for (const o of parDuree.get(duree) ?? []) {
        if (o.actuel || rapprocherFournisseur(o.fournisseur, [{ nom: f.nom }]) === null) continue
        /* LA DURÉE DE L'OFFRE, PAS CELLE DU CALCUL. Le 10/10/2026, un calcul demandé sur 36 mois rendait
           GEG sur 24, Mint Energie sur 48 et MET sur 33 : chaque fournisseur à sa propre limite.
           L'offre ne va que sur une ligne commandée à sa durée réelle ; un même prix revenu par deux
           calculs se départage plus bas (même ligne, même budget). */
        const dureeOffre = o.dureeMois ?? duree
        if (o.succes && !f.durees.includes(dureeOffre)) continue
        /* LE REFUS DU FOURNISSEUR, DANS SES MOTS. Le 05/10/2026 sur LA MARMOTTE GOURMANDE, Primeo et
           Total refusaient une fourniture au 01/01/2028 (« date de fin en dehors des limites », « la
           DDF maximum acceptée est 01/05/2027 ») ; l'écran disait seulement « aucun prix ». */
        if (!o.succes) {
          const p = periodeDe.get(sansEspace(o.numCompteur))?.find((x) => x.duree === duree)
          const periode = p ? ` — fourniture demandée du ${fr(p.debut)} au ${fr(dateFinPour(p.debut, duree))}` : ''
          manques.push(`${f.nom} ${duree} mois : non disponible (${o.message ?? 'sans raison donnée'})${periode}.`)
          refuses.add(f.id)
          continue
        }
        if (o.sansPrixUnitaire) { manques.push(`${f.nom} ${dureeOffre} mois (${o.numCompteur}) : Tradeo rend un budget sans prix unitaire.`); continue }
        const lue = offreLueDepuisTradeo(o, energieDe.get(sansEspace(o.numCompteur)) === 'gaz', dureeOffre)
        if (!lue) continue
        /* Le type commandé : un fournisseur commandé en fixe seul ne reçoit pas l'indexé. */
        if (f.types.length && !f.types.some((t) => /^index/i.test(t) === (lue.type_prix === 'Indexé'))) continue
        candidates.push({ offre: o, lue })
      }
    }
    for (const { offre, lue } of laMoinsChereParLigne(candidates)) {
      offres.push(lue)
      marge ??= prixSurLaDuree(offre)?.marge ?? null
    }
    if (offres.length === 0) { if (!refuses.has(f.id)) manques.push(`${f.nom} : Tradeo ne rend aucun prix sur ${f.durees.join(', ')} mois.`); continue }
    const energie = offres.some((o) => energieDe.get(sansEspace(o.numero_point)) === 'gaz') ? 'gaz' : 'electricite'
    propositions.push({
      fournisseur_nom: f.nom,
      type_energie: energie,
      reference_offre: etat.demandeNumero ? `Tradeo ${etat.demandeNumero}` : 'Tradeo',
      client: chiffrage.version.compteNom,
      date_prise_effet: null,
      offres,
      remarques: `prix calculés le ${aujourdHui.toLocaleDateString('fr-FR')}, avec une marge de ${(marge ?? MARGE_APPEL_TRADEO).toLocaleString('fr-FR')} €/MWh dans le prix.`,
      marge_incluse_proposee: marge ?? MARGE_APPEL_TRADEO,
      source: 'TRADEO',
    })
  }
  return { propositions, manques }
}
