import { appelerBanc, chargerMandatsActifs, messageErreur } from '@/lib/data/tradeo'
import type { PrixParCompteur as PrixSaisi } from '@/lib/data/recommandations'
import { dateFinPour } from '@/lib/tradeo/dossier'
import { lireOffresTradeo, rapprocherFournisseur, type OffreTradeo } from '@/lib/tradeo/prixUnitaires'
import type { Compteur, OffreFournisseur, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES PRIX « PAR API » : CE QUE TRADEO REND, RANGÉ DANS LES OFFRES DE LA VERSION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 28/09/2026 : « KiMatch récupère les prix disponibles, par API ou par le processus prévu ».
 * Ce module est le « par API » des fournisseurs dont le mode de réponse est TRADEO. Il ne fait que
 * LIRE et PRÉPARER : il rend des écritures, c'est « Calculer » qui les applique.
 *
 * ══ LE CHEMIN ══
 *
 *   1. les compteurs de la version que Tradeo a ACCEPTÉS pour ce SIRET (les autres ne se calculent
 *      pas — il faut d'abord les déclarer, étape 1 du banc) ;
 *   2. la consommation que Tradeo connaît pour eux ;
 *   3. un calcul par DURÉE demandée, sur la période [date de début de fourniture, + durée] ;
 *   4. pour chaque offre Kimatch, l'offre Tradeo du même fournisseur, du même type de prix, sur le
 *      même compteur ; on en garde les PRIX, jamais le budget (règle de William).
 *
 * ══ LA MARGE : ON NE DEVINE PAS ══
 *
 * Tradeo exige une marge entre 2 et 30 et rend des prix dont on ne sait pas s'ils l'incluent. Si
 * elle y est, le P0 vaut prix − marge ; sinon, le prix EST le P0. Se tromper décale chaque budget de
 * la version de `marge × volume` — sans que rien à l'écran ne le montre.
 *
 * `MARGE_INCLUSE_DANS_LE_PRIX_TRADEO` reste donc à `null` tant que la mesure n'a pas été faite
 * (banc, étape 3, « Mesurer l'effet de la marge »), et à `null`, AUCUN P0 n'est écrit : le rapport
 * dit ce qui aurait été écrit, et pourquoi il ne l'est pas. Une fois mesuré, on pose `true` ou
 * `false` ici, et le chemin s'ouvre.
 */
export const MARGE_INCLUSE_DANS_LE_PRIX_TRADEO: boolean | null = null

/** La marge envoyée à Tradeo : la plus petite qu'il accepte, pour que l'erreur possible soit minimale. */
export const MARGE_APPEL_TRADEO = 2

const CLASSE_PAR_CHAMP: Record<string, string> = {
  prixBase: 'BASE', prixHp: 'HP', prixHc: 'HC', prixHph: 'HPH', prixHch: 'HCH',
  prixHpe: 'HPE', prixHce: 'HCE', prixPointe: 'POINTE',
}

export interface EcriturePrix {
  offreId: string
  lienId: string
  energie: 'electricite' | 'gaz'
  prix: PrixSaisi
}

export interface RapportTradeo {
  /** Faux quand Tradeo n'a pas pu être interrogé du tout. */
  joignable: boolean
  message: string | null
  ecritures: EcriturePrix[]
  /** Une ligne par offre TRADEO : ce qui a été trouvé, ou pourquoi rien. */
  lignes: { offreId: string; texte: string; ok: boolean }[]
}

/** Les prix d'une offre Tradeo sur toute la durée : la moyenne quand Tradeo la donne, sinon celle des années. */
function prixSurLaDuree(o: OffreTradeo): { prix: Record<string, number>; marge: number | null } | null {
  if (o.prixMoyens) {
    return { prix: o.prixMoyens, marge: o.periodes[0]?.margeAppliquee ?? o.marge }
  }
  if (o.periodes.length === 0) return null
  const cles = new Set(o.periodes.flatMap((p) => Object.keys(p.prix)))
  const prix: Record<string, number> = {}
  for (const cle of cles) {
    const valeurs = o.periodes.map((p) => p.prix[cle]).filter((v): v is number => v != null)
    if (valeurs.length === o.periodes.length) prix[cle] = valeurs.reduce((a, b) => a + b, 0) / valeurs.length
  }
  return { prix, marge: o.periodes[0].margeAppliquee ?? o.marge }
}

function arrondi(n: number) {
  return Math.round(n * 10000) / 10000
}

/**
 * ══ CE QU'ON PREND À TRADEO, POSTE PAR POSTE — le modèle de proposition de William (30/09/2026) ══
 *
 * William a donné son modèle aussi pour dire « quels prix récupérer chez Tradeo ». Sa page 2, et ce
 * que la documentation v1.4 rend pour chaque poste :
 *
 *   GAZ   abonnement €/mois   `abo`                    → abonnement annuel = abo × 12 (simpleAbo 527,28 = 43,94 × 12)
 *         molécule €/MWh      `prixMolecule`           → P0 (marge retirée si elle y est — voir plus haut)
 *         CEE €/MWh           `cee`                    → prix CEE
 *         CPB, TQD, accise, CTA   NON REPRIS — voir « les communs » plus bas
 *
 *   ÉLEC  abonnement €/mois   `abo`                    → abonnement annuel = abo × 12
 *         pointe, HPH… €/MWh  `prixPointe`, `prixHph`… → P0 par poste
 *         capacité €/MWh      `prixCapaHph`…           → capacité par poste, SEULEMENT si `typeCapa` = Valeur
 *                                                        (Coef = un coefficient, pas un prix ; Inclus = déjà dans le prix)
 *         CEE €/MWh           `cee`                    → prix CEE
 *         accise, CTA, TURPE  NON REPRIS — voir « les communs » plus bas
 *
 * ══ LES COMMUNS NE VIENNENT PAS DE TRADEO — décision du 01/10/2026 ══
 *
 * William : la TICGN, la CTA, l'ATRD, le CPB et le TURPE sont fixés par la régulation, identiques
 * chez tous les fournisseurs, et « tout ce qui est calculable et automatisable de notre côté, il ne
 * faut pas que tu le récupères […] parce que notre moteur de pricing doit fonctionner aussi quand un
 * fournisseur nous envoie un PDF ou un fichier Excel ». Ils viendront de tables datées (TICGN, CTA,
 * ATRD par tarif T1–T4, CPB, TURPE), que William construit.
 *
 * La version du 30/09 les reprenait de la réponse Tradeo (`dataCta`) ; elle ne le fait plus. On les
 * lit encore (`OffreTradeo.reglementaire`), pour pouvoir comparer les barèmes de Tradeo aux nôtres,
 * mais ils ne s'écrivent pas.
 *
 * LA MARGE N'EST RETIRÉE QUE DES PRIX D'ÉNERGIE : Tradeo l'applique à la molécule et aux postes
 * (`margeAppliquer`), pas aux taxes ni à l'abonnement.
 */
const CAPACITE_PAR_CHAMP: Record<string, string> = {
  prixCapaBase: 'BASE', prixCapaHp: 'HP', prixCapaHc: 'HC', prixCapaHph: 'HPH', prixCapaHch: 'HCH',
  prixCapaHpe: 'HPE', prixCapaHce: 'HCE', prixCapaPointe: 'POINTE',
}

/** Transforme les prix Tradeo en écriture Kimatch. `null` si aucun prix d'énergie ne s'y trouve. */
export function ecritureDepuisTradeo(o: OffreTradeo, gaz: boolean, margeInclusePrix: boolean): PrixSaisi | null {
  const lu = prixSurLaDuree(o)
  if (!lu) return null
  const retrait = margeInclusePrix ? (lu.marge ?? MARGE_APPEL_TRADEO) : 0
  const commun: PrixSaisi = {
    ...(lu.prix.abo != null ? { abonnement_fourniture_annuel_ht: arrondi(lu.prix.abo * 12) } : {}),
    ...(lu.prix.cee != null ? { prix_cee_mwh: lu.prix.cee } : {}),
  }
  if (gaz) {
    const molecule = lu.prix.prixMolecule
    if (molecule == null) return null
    // Les communs (ATRD, TICGN, CTA) ne s'écrivent pas : ils viendront des tables réglementées.
    return { ...commun, prix_molecule_p0_mwh: arrondi(molecule - retrait) }
  }
  const p0: Record<string, number> = {}
  for (const [champ, classe] of Object.entries(CLASSE_PAR_CHAMP)) {
    const v = lu.prix[champ]
    if (v != null) p0[classe] = arrondi(v - retrait)
  }
  if (Object.keys(p0).length === 0) return null
  const capacite: Record<string, number> = {}
  if ((o.typeCapa ?? '').toLowerCase() === 'valeur') {
    for (const [champ, classe] of Object.entries(CAPACITE_PAR_CHAMP)) {
      const v = lu.prix[champ]
      if (v != null && classe in p0) capacite[classe] = v
    }
  }
  return { ...commun, p0_mwh_par_classe: p0, ...(Object.keys(capacite).length ? { capacite_mwh_par_classe: capacite } : {}) }
}

interface CompteurTradeoAccepte { id: number; numCompteur: string; parametreCompteur?: string }

export async function recupererPrixTradeo(opts: {
  siret: string | null
  version: VersionRecommandation
  offres: OffreFournisseur[]
  compteurs: Map<string, Compteur>
}): Promise<RapportTradeo> {
  const { version, offres, compteurs } = opts
  const rapport: RapportTradeo = { joignable: false, message: null, ecritures: [], lignes: [] }
  const pourToutes = (texte: string) => offres.map((o) => ({ offreId: o.id, texte, ok: false }))
  if (offres.length === 0) return { ...rapport, joignable: true }

  const etat = await appelerBanc('etat')
  if (!etat.ok) return { ...rapport, message: messageErreur(etat), lignes: pourToutes(`Tradeo non joignable : ${messageErreur(etat)}`) }
  rapport.joignable = true

  const siret = (opts.siret ?? '').replace(/\s/g, '')
  if (!/^\d{14}$/.test(siret)) return { ...rapport, lignes: pourToutes('Le compte n’a pas de SIRET à 14 chiffres : Tradeo ne peut rien retrouver.') }
  const debut = version.date_debut_fourniture
  if (!debut) return { ...rapport, lignes: pourToutes('Date de début de fourniture absente : Tradeo cote une période, il lui faut son premier jour.') }

  // ① Les compteurs acceptés, par énergie.
  const energies = new Set(version.compteurs.map((l) => (compteurs.get(l.compteur_id)?.type_energie === 'gaz' ? 'GAZ' : 'ELEC')))
  const acceptes = new Map<string, CompteurTradeoAccepte & { energie: 'ELEC' | 'GAZ' }>()
  for (const energie of energies) {
    const r = await appelerBanc('compteurs_par_siret', { siret, energie })
    for (const c of ((r.reponse as { listCompteur?: CompteurTradeoAccepte[] } | undefined)?.listCompteur ?? [])) {
      acceptes.set(c.numCompteur, { ...c, energie: energie as 'ELEC' | 'GAZ' })
    }
  }
  /* LE MANDAT D'ABORD (29/09/2026) : un compteur sans mandat actif n'est pas interrogé, même si
     Tradeo le connaît — le mandat a pu expirer depuis sa déclaration. */
  const mandats = await chargerMandatsActifs(version.compteurs.map((l) => l.compteur_id))
  const liens = version.compteurs
    .map((l) => ({ lien: l, compteur: compteurs.get(l.compteur_id) }))
    .map((x) => ({ ...x, pdl: (x.compteur?.numero_pdl ?? '').replace(/\s/g, '') }))
    .map((x) => ({ ...x, mandat: Boolean(mandats.get(x.pdl)?.energix), tradeo: mandats.get(x.pdl)?.energix ? acceptes.get(x.pdl) : undefined }))
  const sansMandat = liens.filter((x) => !x.mandat).map((x) => x.compteur?.numero_pdl ?? x.lien.label)
  const absents = liens.filter((x) => x.mandat && !x.tradeo).map((x) => x.compteur?.numero_pdl ?? x.lien.label)
  const presents = liens.filter((x) => x.tradeo)
  if (presents.length === 0 && sansMandat.length > 0 && absents.length === 0) {
    return { ...rapport, lignes: pourToutes(`Aucun compteur de la version n’a de mandat Energix actif (${sansMandat.join(', ')}) : Tradeo n’accepte que son propre mandat.`) }
  }
  if (presents.length === 0) {
    return { ...rapport, lignes: pourToutes(`Aucun compteur de la version n’est accepté chez Tradeo (${absents.join(', ')}). Déclarez-les depuis l’étape « Déclarer un dossier ».`) }
  }

  // ② et ③ : par énergie (Tradeo n'en calcule qu'une à la fois), par durée demandée.
  const trouvees = new Map<string, OffreTradeo[]>() // clé : durée|numCompteur
  const durees = [...new Set(offres.map((o) => o.duree_mois).filter((d): d is number => d != null))]
  for (const energie of ['ELEC', 'GAZ'] as const) {
    const lot = presents.filter((x) => x.tradeo!.energie === energie).slice(0, 10)
    if (lot.length === 0) continue
    const conso = await appelerBanc('consommation', {
      compteurData: lot.map((x) => (energie === 'GAZ' ? { id: x.tradeo!.id, numCompteur: x.tradeo!.numCompteur } : { id: x.tradeo!.id, numCompteur: x.tradeo!.numCompteur, type: 'ELEC', parametreCompteur: x.tradeo!.parametreCompteur })),
    })
    const parNum = (conso.reponse as { compteur?: Record<string, { id: number; objetConsommation?: Record<string, unknown>; autreFournisseur?: unknown[] }> } | undefined)?.compteur
    if (!conso.ok || !parNum) {
      rapport.lignes.push(...pourToutes(`Consommation ${energie} illisible chez Tradeo : ${messageErreur(conso)}`))
      continue
    }
    for (const duree of durees) {
      const fin = dateFinPour(debut, duree)
      const compteur: Record<string, unknown> = {}
      for (const [num, c] of Object.entries(parNum)) {
        compteur[num] = {
          id: c.id,
          marge: MARGE_APPEL_TRADEO,
          objetConsommation: { ...(c.objetConsommation ?? {}), dateDebut: debut, dateFin: fin },
          autreFournisseur: c.autreFournisseur ?? [],
        }
      }
      const calcul = await appelerBanc('calculer', { compteur })
      const { offres: lues, erreurs } = lireOffresTradeo(calcul.reponse)
      for (const e of erreurs) rapport.lignes.push(...pourToutes(`${e.numCompteur}, ${duree} mois : ${e.message}`))
      for (const o of lues) {
        const cle = `${duree}|${o.numCompteur}`
        trouvees.set(cle, [...(trouvees.get(cle) ?? []), o])
      }
    }
  }

  // ④ Chaque offre Kimatch reçoit ce que Tradeo a rendu pour son fournisseur.
  for (const offre of offres) {
    const morceaux: string[] = []
    let ecrites = 0
    for (const x of presents) {
      const candidates = (trouvees.get(`${offre.duree_mois}|${x.tradeo!.numCompteur}`) ?? []).filter(
        (o) => o.succes && rapprocherFournisseur(o.fournisseur, [{ nom: offre.fournisseur_nom }]) !== null,
      )
      const memeType = candidates.filter((o) => !offre.type_prix || !o.typeOffre || o.typeOffre.toLowerCase() === offre.type_prix.toLowerCase())
      const retenue = memeType[0]
      const pdl = x.compteur?.numero_pdl ?? x.lien.label
      if (!retenue) {
        morceaux.push(`${pdl} : Tradeo ne rend pas ${offre.fournisseur_nom}${offre.type_prix ? ` en ${offre.type_prix}` : ''} sur ${offre.duree_mois} mois`)
        continue
      }
      if (retenue.sansPrixUnitaire) {
        morceaux.push(`${pdl} : budget seul, aucun prix unitaire — inutilisable`)
        continue
      }
      const gaz = x.compteur?.type_energie === 'gaz'
      if (MARGE_INCLUSE_DANS_LE_PRIX_TRADEO === null) {
        const apercu = ecritureDepuisTradeo(retenue, gaz, false)
        morceaux.push(`${pdl} : prix trouvé (${JSON.stringify(apercu?.prix_molecule_p0_mwh ?? apercu?.p0_mwh_par_classe)} avant retrait éventuel de la marge), NON écrit tant que l’effet de la marge n’est pas mesuré`)
        continue
      }
      const prix = ecritureDepuisTradeo(retenue, gaz, MARGE_INCLUSE_DANS_LE_PRIX_TRADEO)
      if (!prix) {
        morceaux.push(`${pdl} : aucun prix d’énergie dans la réponse`)
        continue
      }
      rapport.ecritures.push({ offreId: offre.id, lienId: x.lien.lien_id, energie: gaz ? 'gaz' : 'electricite', prix })
      ecrites += 1
    }
    if (absents.length > 0) morceaux.push(`non déclarés chez Tradeo : ${absents.join(', ')}`)
    if (sansMandat.length > 0) morceaux.push(`sans mandat Energix actif, non interrogés : ${sansMandat.join(', ')}`)
    rapport.lignes.push({ offreId: offre.id, texte: morceaux.join(' · ') || 'rien à faire', ok: ecrites > 0 && ecrites === version.compteurs.length })
  }
  return rapport
}
