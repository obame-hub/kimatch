import { supabase } from '@/lib/supabase'
import { authHeaderJson } from '@/lib/data/authHeader'
import type { ContexteOffre } from '@/lib/offrePdf/construction'
import type { RessourcesOffre } from '@/lib/offrePdf/document'
import { logoFournisseurNet } from '@/lib/logosFournisseurs'
import inter1 from '@/assets/polices/inter-latin.woff2?url'
import inter2 from '@/assets/polices/inter-latin-ext.woff2?url'
import mono1 from '@/assets/polices/geist-mono-latin.woff2?url'
import mono2 from '@/assets/polices/geist-mono-latin-ext.woff2?url'
import logoKiwee from '@/assets/logo-kiwee.svg?raw'

/**
 * CE QUE LA PROPOSITION COMMERCIALE PDF LIT HORS DU PRICER — le client, le contact, le consultant, les
 * fiches des fournisseurs, les puissances du compteur — et les ressources du document (polices, logos),
 * toutes converties en adresses `data:` : le serveur qui imprime n'a besoin d'aucun réseau.
 *
 * Provenances (William, 04/10/2026) :
 *   consultant   le propriétaire de la recommandation (nom, e-mail, téléphone — `profils.telephone`)
 *   client       le compte de la recommandation (nom, adresse)
 *   contact      le contact principal de la recommandation (à défaut, celui de la version)
 *   page 3       la fiche de chaque fournisseur (`comptes_fournisseurs`), son logo s'il en a un
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const premier = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null)
const nomComplet = (p: any) => [p?.prenom, p?.nom].filter(Boolean).join(' ').trim()

/** Un fichier (adresse) converti en adresse `data:`, ou `null` s'il est introuvable. */
export async function versData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const b = await r.blob()
    return await new Promise<string>((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.onerror = () => ko(f.error); f.readAsDataURL(b) })
  } catch {
    return null
  }
}

/**
 * Un logo prêt à imprimer : ramené à 256 px de côté au plus. Imprimé en 26 px (7 mm), il reste au-delà
 * de 900 points par pouce — et le document ne gonfle pas : le logo GME d'origine (1 382 px, 435 Ko),
 * répété dans chaque tableau, portait à lui seul le document au bord de la limite d'envoi (4,5 Mo).
 * Un SVG passe tel quel : il est net à toute taille.
 */
export async function logoPourImpression(url: string | null | undefined): Promise<string | null> {
  const data = await versData(url)
  if (!data || data.startsWith('data:image/svg')) return data
  try {
    const img = await createImageBitmap(await (await fetch(data)).blob())
    const echelle = Math.min(1, 256 / Math.max(img.width, img.height))
    if (echelle === 1) return data
    const toile = document.createElement('canvas')
    toile.width = Math.round(img.width * echelle)
    toile.height = Math.round(img.height * echelle)
    const g = toile.getContext('2d')
    if (!g) return data
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, toile.width, toile.height)
    return toile.toDataURL('image/png')
  } catch {
    return data
  }
}

export async function chargerContexteOffre(versionId: string, fournisseurIds: string[], compteurId: string): Promise<ContexteOffre> {
  const { data: v, error } = await supabase
    .from('versions_recommandation')
    .select('id, contact_id, reference_appel_offres, reco:recommandations(id, reference, compte_id, contact_principal_id, proprietaire_id, responsable_profil_id)')
    .eq('id', versionId)
    .single()
  if (error) throw new Error(error.message)
  const reco = premier((v as any).reco)
  const contactId = reco?.contact_principal_id ?? (v as any).contact_id ?? null
  const consultantId = reco?.proprietaire_id ?? reco?.responsable_profil_id ?? null

  const [compte, contact, consultant, fiches, compteur] = await Promise.all([
    reco?.compte_id ? supabase.from('comptes').select('nom, segment, rue, code_postal, ville').eq('id', reco.compte_id).single() : Promise.resolve({ data: null }),
    contactId ? supabase.from('contacts').select('prenom, nom, email, telephone, telephone_mobile').eq('id', contactId).single() : Promise.resolve({ data: null }),
    consultantId ? supabase.from('profils').select('prenom, nom, email, telephone').eq('id', consultantId).single() : Promise.resolve({ data: null }),
    fournisseurIds.length
      ? supabase.from('comptes_fournisseurs').select('compte_id, qualification, pays_origine, annee_creation, presentation, siege, clientele, tags, logo_url, compte:comptes(nom)').in('compte_id', fournisseurIds)
      : Promise.resolve({ data: [] }),
    supabase.from('compteurs').select('libelle, libelle_site, date_echeance, compteurs_electricite(puissance_pointe_kva, puissance_hph_kva, puissance_hch_kva, puissance_hpe_kva, puissance_hce_kva)').eq('id', compteurId).single(),
  ])

  const c = (compte as any).data
  const ville = [c?.code_postal, c?.ville].filter(Boolean).join(' ')
  const adresse = [c?.rue, ville].filter(Boolean).join(', ') || null
  const ct = (contact as any).data
  const pr = (consultant as any).data
  const k = (compteur as any).data
  const ke = premier(k?.compteurs_electricite)

  const fournisseurs: ContexteOffre['fournisseurs'] = {}
  await Promise.all(((fiches as any).data ?? []).map(async (f: any) => {
    const nom = premier(f.compte)?.nom ?? ''
    fournisseurs[f.compte_id] = {
      nom, logo: await logoPourImpression(f.logo_url ?? logoFournisseurNet(nom)),
      qualification: f.qualification ?? null, origine: f.pays_origine ?? null, creation: f.annee_creation ?? null,
      presentation: f.presentation ?? null, siege: f.siege ?? null, clients: f.clientele ?? null, tags: (f.tags ?? []).filter(Boolean).slice(0, 4),
    }
  }))

  return {
    reference: (v as any).reference_appel_offres ?? reco?.reference ?? null,
    clientNom: c?.nom ?? '—',
    clientSegment: c?.segment ?? null,
    clientAdresse: adresse,
    consultant: { nom: nomComplet(pr) || '—', email: pr?.email ?? null, telephone: pr?.telephone ?? null },
    contact: ct ? { nom: nomComplet(ct) || '—', email: ct.email ?? null, telephone: ct.telephone || ct.telephone_mobile || null } : null,
    compteur: {
      libelle: k?.libelle_site || k?.libelle || null,
      echeanceDeclaree: k?.date_echeance ?? null,
      puissances: { POINTE: ke?.puissance_pointe_kva ?? null, HPH: ke?.puissance_hph_kva ?? null, HCH: ke?.puissance_hch_kva ?? null, HPE: ke?.puissance_hpe_kva ?? null, HCE: ke?.puissance_hce_kva ?? null },
    },
    fournisseurs,
    logoParNom: () => null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Les polices et le logo KiWee, une fois pour toutes. */
let ressources: Promise<RessourcesOffre> | null = null
export function chargerRessourcesOffre(): Promise<RessourcesOffre> {
  ressources ??= (async () => ({
    polices: {
      inter: (await Promise.all([versData(inter1), versData(inter2)])).filter((x): x is string => !!x),
      mono: (await Promise.all([versData(mono1), versData(mono2)])).filter((x): x is string => !!x),
    },
    logoKiwee: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoKiwee)}`,
  }))()
  return ressources
}

/** Le document HTML imprimé en PDF par le serveur (`api/offre/pdf`) — le même Chrome que les modèles. */
export async function imprimerOffrePdf(html: string, nomFichier: string): Promise<Blob> {
  const res = await fetch('/api/offre/pdf', { method: 'POST', headers: await authHeaderJson(), body: JSON.stringify({ html, nomFichier }) })
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try { message = ((await res.json()) as { error?: string }).error ?? message } catch { /* corps vide */ }
    throw new Error(res.status === 404 ? 'L’impression des propositions n’est pas encore en ligne.' : message)
  }
  return await res.blob()
}
