/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * D'UN DOSSIER KIMATCH À UNE DEMANDE DE COTATION TRADEO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 28/09/2026 : « on simule avec des versions qui existent ». Le banc part donc d'une
 * version de recommandation réelle et en tire ce que `creerDemandeDeCotationParApi` exige : le
 * SIRET, un responsable, et des compteurs datés.
 *
 * RIEN N'EST INVENTÉ POUR COMBLER UN TROU. Un champ que Kimatch ne connaît pas reste vide et
 * `manques` le nomme : William doit voir ce qui manquera le jour où ce sera automatique, et un
 * responsable fabriqué pour passer la validation le lui cacherait.
 *
 * Les formats sont ceux que Tradeo contrôle (documentation v1.4, section 2) : on les vérifie avant
 * l'envoi pour que l'erreur se lise ici, sur la ligne concernée, et non dans un 400 global.
 */

export interface CompteurKimatch {
  id: string
  numero_point: string | null
  libelle: string | null
  libelle_site: string | null
  energie: 'ELECTRICITE' | 'GAZ' | null
  date_echeance: string | null
  consommation_annuelle_mwh: number | null
  duree_mois: number | null
}

export interface DossierKimatch {
  version_id: string
  version_nom: string | null
  recommandation_nom: string
  compte_nom: string | null
  siret: string | null
  duree_mois: number | null
  contact: {
    civilite: string | null
    nom: string | null
    prenom: string | null
    email: string | null
    telephone: string | null
    telephone_mobile?: string | null
    fonction: string | null
  } | null
  compteurs: CompteurKimatch[]
}

export interface CompteurTradeo {
  num_compteur: string
  site: string
  type: 'ELEC' | 'GAZ'
  regie: 'oui' | 'non'
  dateDebut: string
  dateFin: string
}

export interface ResponsableTradeo {
  sex: string
  nom: string
  prenom: string
  email: string
  tele: string
  fonction: string
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * La fourniture commence au lendemain de l'échéance si elle est à venir, sinon au premier jour du
 * mois suivant — Tradeo refuse une date de début passée.
 */
export function dateDebutProposee(dateEcheance: string | null, aujourdHui = new Date()): string {
  const demain = new Date(Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), aujourdHui.getUTCDate() + 1))
  if (dateEcheance) {
    const e = new Date(`${dateEcheance}T00:00:00Z`)
    e.setUTCDate(e.getUTCDate() + 1)
    if (e >= demain) return iso(e)
  }
  return iso(new Date(Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth() + 1, 1)))
}

/** Dernier jour de la durée : un contrat de 12 mois au 01/01/2027 finit le 31/12/2027. */
export function dateFinPour(dateDebut: string, dureeMois: number): string {
  const d = new Date(`${dateDebut}T00:00:00Z`)
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dureeMois, d.getUTCDate() - 1)))
}

export function compteursPourTradeo(dossier: DossierKimatch, aujourdHui = new Date()): CompteurTradeo[] {
  return dossier.compteurs
    .filter((c) => c.energie)
    .map((c) => {
      const debut = dateDebutProposee(c.date_echeance, aujourdHui)
      return {
        num_compteur: (c.numero_point ?? '').replace(/\s/g, ''),
        site: c.libelle_site ?? c.libelle ?? '',
        type: c.energie === 'GAZ' ? 'GAZ' : 'ELEC',
        regie: 'non',
        dateDebut: debut,
        dateFin: dateFinPour(debut, c.duree_mois ?? dossier.duree_mois ?? 12),
      }
    })
}

export function responsablePourTradeo(dossier: DossierKimatch): ResponsableTradeo {
  const c = dossier.contact
  return {
    sex: c?.civilite === 'Mme' ? 'Mme' : c?.civilite === 'M.' ? 'M.' : '',
    nom: c?.nom ?? '',
    prenom: c?.prenom ?? '',
    email: c?.email ?? '',
    // Le fixe d'abord, le mobile à défaut : Tradeo n'en prend qu'un, et ne dit pas lequel il préfère.
    tele: (c?.telephone || c?.telephone_mobile || '').replace(/[^\d+]/g, ''),
    fonction: c?.fonction ?? '',
  }
}

/** Ce que Tradeo refusera, dit avant l'envoi. Tableau vide : la demande est prête. */
export function manquesDemande(siret: string, responsable: ResponsableTradeo, compteurs: CompteurTradeo[], aujourdHui = new Date()): string[] {
  const manques: string[] = []
  if (!/^\d{14}$/.test(siret.replace(/\s/g, ''))) manques.push('Le SIRET doit contenir 14 chiffres.')
  if (responsable.sex !== 'M.' && responsable.sex !== 'Mme') manques.push('Responsable : civilité (M. ou Mme).')
  for (const [champ, libelle] of [['nom', 'nom'], ['prenom', 'prénom'], ['email', 'email'], ['tele', 'téléphone'], ['fonction', 'fonction']] as const) {
    if (!responsable[champ].trim()) manques.push(`Responsable : ${libelle}.`)
  }
  if (compteurs.length === 0) manques.push('Aucun compteur.')
  const auj = iso(aujourdHui)
  for (const c of compteurs) {
    const n = c.num_compteur
    if (c.regie === 'non' && c.type === 'ELEC' && !/^\d{14}$/.test(n)) manques.push(`${n || '(vide)'} : un PDL fait 14 chiffres.`)
    if (c.regie === 'non' && c.type === 'GAZ' && !/^(GI\d{6}|\d{14})$/.test(n)) manques.push(`${n || '(vide)'} : un PCE s'écrit GI + 6 chiffres, ou 14 chiffres.`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateDebut) || c.dateDebut < auj) manques.push(`${n} : la date de début doit être aujourd'hui ou plus tard.`)
    if (!(c.dateFin > c.dateDebut)) manques.push(`${n} : la date de fin doit suivre la date de début.`)
  }
  return manques
}
