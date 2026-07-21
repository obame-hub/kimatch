import type {
  Compte,
  Site,
  Contact,
  Compteur,
  Signal,
  Mandat,
  Recommandation,
  Contrat,
  DocumentItem,
  ActionItem,
  Interaction,
} from '@/types/domain'

export type SearchKind =
  | 'compte'
  | 'site'
  | 'contact'
  | 'compteur'
  | 'signal'
  | 'mandat'
  | 'recommandation'
  | 'contrat'
  | 'document'
  | 'tache'
  | 'interaction'

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  compte: 'Comptes',
  site: 'Sites',
  contact: 'Contacts',
  compteur: 'Compteurs',
  signal: 'Signaux',
  mandat: 'Mandats',
  recommandation: 'Recommandations',
  contrat: 'Contrats',
  document: 'Documents',
  tache: 'Tâches',
  interaction: 'Interactions',
}

export interface SearchEntry {
  kind: SearchKind
  id: string
  label: string
  sublabel: string
  to: string
  fields: string[]
}

export interface SearchDatasets {
  comptes?: Compte[]
  sites?: Site[]
  contacts?: Contact[]
  compteurs?: Compteur[]
  signaux?: Signal[]
  mandats?: Mandat[]
  recommandations?: Recommandation[]
  contrats?: Contrat[]
  documents?: DocumentItem[]
  actions?: ActionItem[]
  interactions?: Interaction[]
}

export function buildSearchIndex(data: SearchDatasets): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const c of data.comptes ?? []) {
    entries.push({ kind: 'compte', id: c.id, label: c.nom, sublabel: c.ville || c.segment, to: `/comptes/${c.id}`, fields: [c.nom, c.siren ?? '', c.ville] })
  }
  for (const s of data.sites ?? []) {
    entries.push({ kind: 'site', id: s.id, label: s.nom, sublabel: [s.compte_nom, s.ville].filter(Boolean).join(' · '), to: `/sites/${s.id}`, fields: [s.nom, s.ville, s.code_postal, s.adresse, s.compte_nom] })
  }
  for (const c of data.contacts ?? []) {
    entries.push({
      kind: 'contact',
      id: c.id,
      label: `${c.prenom} ${c.nom}`,
      sublabel: [c.fonction, c.compte_nom].filter(Boolean).join(' · '),
      to: `/contacts/${c.id}`,
      fields: [c.prenom, c.nom, c.email ?? '', c.telephone ?? '', c.compte_nom],
    })
  }
  for (const c of data.compteurs ?? []) {
    entries.push({
      kind: 'compteur',
      id: c.id,
      label: c.numero_pdl,
      sublabel: [c.utilisation, c.site_nom].filter(Boolean).join(' · '),
      to: `/compteurs/${c.id}`,
      fields: [c.numero_pdl, c.utilisation, c.site_nom],
    })
  }
  for (const s of data.signaux ?? []) {
    entries.push({ kind: 'signal', id: s.id, label: s.type_signal, sublabel: s.site_nom, to: '/signaux', fields: [s.type_signal, s.description, s.site_nom] })
  }
  for (const m of data.mandats ?? []) {
    entries.push({
      kind: 'mandat',
      id: m.id,
      label: `Mandat ${m.compte_nom}`,
      sublabel: m.contact_signataire_nom || m.statut,
      to: `/mandats/${m.id}`,
      fields: [m.compte_nom, m.contact_signataire_nom ?? ''],
    })
  }
  for (const r of data.recommandations ?? []) {
    entries.push({
      kind: 'recommandation',
      id: r.id,
      label: r.titre,
      sublabel: r.compte_nom,
      to: `/recommandations/${r.id}`,
      fields: [r.titre, r.compte_nom, ...r.sites.map((s) => s.nom)],
    })
  }
  for (const c of data.contrats ?? []) {
    entries.push({
      kind: 'contrat',
      id: c.id,
      label: c.fournisseur_nom,
      sublabel: c.site_nom,
      to: `/contrats/${c.id}`,
      fields: [c.fournisseur_nom, c.site_nom, c.reference_fournisseur ?? ''],
    })
  }
  for (const d of data.documents ?? []) {
    entries.push({ kind: 'document', id: d.id, label: d.nom, sublabel: d.type_document, to: `/documents/${d.id}`, fields: [d.nom, d.type_document, d.objet_lie] })
  }
  for (const a of data.actions ?? []) {
    entries.push({ kind: 'tache', id: a.id, label: a.titre, sublabel: [a.type_action, a.cible_label].filter(Boolean).join(' · '), to: '/taches', fields: [a.titre, a.type_action, a.cible_label] })
  }
  for (const i of data.interactions ?? []) {
    entries.push({
      kind: 'interaction',
      id: i.id,
      label: i.objet || i.type_interaction,
      sublabel: [i.compte_nom, i.site_nom].filter(Boolean).join(' · '),
      to: `/interactions/${i.id}`,
      fields: [i.objet ?? '', i.type_interaction, i.resume ?? '', i.compte_nom, i.site_nom],
    })
  }

  return entries
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Score : 2 = un champ commence par la requête, 1 = un champ la contient, 0 = pas de match. */
function matchScore(entry: SearchEntry, query: string): number {
  let best = 0
  for (const raw of entry.fields) {
    if (!raw) continue
    const field = normalize(raw)
    if (field.startsWith(query)) return 2
    if (field.includes(query)) best = Math.max(best, 1)
  }
  return best
}

export interface SearchMatch {
  entry: SearchEntry
  score: number
}

export function searchIndex(index: SearchEntry[], query: string, maxPerKind = 5): SearchMatch[] {
  const q = normalize(query.trim())
  if (!q) return []
  const matches: SearchMatch[] = []
  for (const entry of index) {
    const score = matchScore(entry, q)
    if (score > 0) matches.push({ entry, score })
  }
  matches.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))

  const perKindCount = new Map<SearchKind, number>()
  const capped: SearchMatch[] = []
  for (const m of matches) {
    const n = perKindCount.get(m.entry.kind) ?? 0
    if (n >= maxPerKind) continue
    perKindCount.set(m.entry.kind, n + 1)
    capped.push(m)
  }
  return capped
}
