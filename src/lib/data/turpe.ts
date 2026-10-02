import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE TURPE — les grilles que l'Administration renseigne, et que le Pricer appelle
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026 : « tous les pricers élec que l'on doit calculer doivent pouvoir utiliser un
 * TURPE (versionné car il change tous les ans). Le TURPE est le même pour chaque ligne du
 * comparatif, raison pour laquelle on ne le montre pas, mais il doit être noté en base. »
 *
 * Le modèle (migrations du 02/10/2026, fusion du cahier des charges Lovable `prompts-turpe.md`) :
 *
 *   versions_turpe              une GRILLE par période, datée ; deux grilles ne se chevauchent pas
 *   formules_tarifaires_turpe   BTSUPCU4, BTSUPLU4, HTACU5, HTALU5 — BT > 36 kVA et HTA, pointe fixe
 *   coefficients_turpe          soutirage, par formule et par poste : b (€/kVA/an en BT, €/kW/an en
 *                               HTA) et c (c€/kWh, comme la CRE le publie)
 *   composantes_fixes_turpe     gestion (CG) et comptage (CC), par domaine et par cadre
 *
 * LE CALCUL EST EN BASE, et nulle part ailleurs : `fn_calculer_turpe` applique la formule,
 * `fn_turpe_version_compteur` l'écrit sur le compteur de la version avec la grille utilisée.
 *
 *   TURPE annuel HT = CG + CC + b₁·P₁ + Σ bᵢ·(Pᵢ − Pᵢ₋₁) + Σ (cᵢ / 100) · Eᵢ(kWh)
 */

export type StatutGrille = 'active' | 'a_venir' | 'expiree'

export interface VersionTurpe {
  id: string
  code: string
  libelle: string
  dateDebut: string | null
  dateFin: string | null
  reference: string | null
  lien: string | null
  statut: StatutGrille
}

export type DomaineTension = 'BT_SUP_36' | 'HTA'
export type Cadre = 'CONTRAT_UNIQUE' | 'CARD'

export interface FormuleTurpe {
  id: string
  versionId: string
  code: string
  libelle: string
  domaine: DomaineTension
  nombrePostes: number
  puissanceMin: number | null
  puissanceMax: number | null
}

export type CodeComposante = 'TURPE_CS_PUISSANCE' | 'TURPE_CS_ENERGIE'
export interface ComposanteTurpe { id: string; code: CodeComposante; libelle: string }
export interface PosteTurpe { id: string; code: string }
export interface CoefficientTurpe { formuleId: string; composanteId: string; posteId: string | null; valeur: number | null }
export interface ComposanteFixe { id: string; versionId: string; domaine: DomaineTension; cadre: Cadre; cg: number | null; cc: number | null }

export interface GrilleTurpe {
  versions: VersionTurpe[]
  formules: FormuleTurpe[]
  composantes: ComposanteTurpe[]
  postes: PosteTurpe[]
  coefficients: CoefficientTurpe[]
  fixes: ComposanteFixe[]
  /** Combien de compteurs portent chaque formule (`compteurs_electricite.tarif_distribution`). */
  usage: Record<string, number>
}

/** Les postes d'une formule, dans l'ordre où le soutirage se calcule : 5 en HTA, 4 en BT > 36 kVA. */
export const postesDuDomaine = (d: DomaineTension) => (d === 'HTA' ? ['PTE', 'HPH', 'HCH', 'HPE', 'HCE'] : ['HPH', 'HCH', 'HPE', 'HCE'])
/** L'unité de b : la CRE facture la puissance en kVA en BT, en kW en HTA. */
export const uniteB = (d: DomaineTension) => (d === 'HTA' ? '€/kW/an' : '€/kVA/an')

/** Les cases d'une formule : b et c sur chacun de ses postes. */
export const casesDeLaFormule = (f: FormuleTurpe) => 2 * postesDuDomaine(f.domaine).length

function statutDe(debut: string | null, fin: string | null): StatutGrille {
  const auj = new Date().toISOString().slice(0, 10)
  if (debut && debut > auj) return 'a_venir'
  if (fin && fin < auj) return 'expiree'
  return 'active'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function chargerGrille(): Promise<GrilleTurpe> {
  const [v, f, c, p, x] = await Promise.all([
    supabase.from('versions_turpe').select('id, code, libelle, date_debut, date_fin, reference_reglementaire, url_reference').eq('actif', true).order('date_debut', { ascending: false }),
    supabase.from('formules_tarifaires_turpe').select('id, version_turpe_id, code, libelle, domaine_tension, nombre_postes_tarifaires, puissance_min_kva, puissance_max_kva, ordre').eq('actif', true).order('ordre'),
    supabase.from('composantes_tarifaires').select('id, code, libelle').in('code', ['TURPE_CS_PUISSANCE', 'TURPE_CS_ENERGIE']).order('ordre'),
    supabase.from('postes_tarifaires').select('id, code').eq('actif', true),
    supabase.from('composantes_fixes_turpe').select('id, version_turpe_id, domaine_tension, cadre, cg_annuel, cc_annuel'),
  ])
  for (const r of [v, f, c, p, x]) if (r.error) throw new Error(r.error.message)
  const formules: FormuleTurpe[] = ((f.data ?? []) as any[]).map((r) => ({
    id: r.id, versionId: r.version_turpe_id, code: r.code, libelle: r.libelle, domaine: r.domaine_tension,
    nombrePostes: r.nombre_postes_tarifaires ?? 4, puissanceMin: r.puissance_min_kva, puissanceMax: r.puissance_max_kva,
  }))
  const ids = formules.map((r) => r.id)
  const { data: coefs, error: eC } = ids.length
    ? await supabase.from('coefficients_turpe').select('formule_tarifaire_id, composante_tarifaire_id, poste_tarifaire_id, valeur').in('formule_tarifaire_id', ids)
    : { data: [] as any[], error: null }
  if (eC) throw new Error(eC.message)
  const codes = [...new Set(formules.map((r) => r.code))]
  const comptes = await Promise.all(codes.map((code) =>
    supabase.from('compteurs_electricite').select('compteur_id', { count: 'exact', head: true }).eq('tarif_distribution', code)
      .then((r) => [code, r.count ?? 0] as const)))
  const n = (x: unknown) => (x == null ? null : Number(x))
  return {
    versions: ((v.data ?? []) as any[]).map((r) => ({
      id: r.id, code: r.code, libelle: r.libelle, dateDebut: r.date_debut, dateFin: r.date_fin, reference: r.reference_reglementaire, lien: r.url_reference,
      statut: statutDe(r.date_debut, r.date_fin),
    })),
    formules,
    composantes: ((c.data ?? []) as any[]).map((r) => ({ id: r.id, code: r.code, libelle: r.libelle })),
    postes: ((p.data ?? []) as any[]).map((r) => ({ id: r.id, code: r.code })),
    coefficients: ((coefs ?? []) as any[]).map((r) => ({ formuleId: r.formule_tarifaire_id, composanteId: r.composante_tarifaire_id, posteId: r.poste_tarifaire_id, valeur: n(r.valeur) })),
    fixes: ((x.data ?? []) as any[]).map((r) => ({ id: r.id, versionId: r.version_turpe_id, domaine: r.domaine_tension, cadre: r.cadre, cg: n(r.cg_annuel), cc: n(r.cc_annuel) })),
    usage: Object.fromEntries(comptes),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useGrilleTurpe() {
  return useQuery({ queryKey: ['turpe', 'grille'], queryFn: chargerGrille })
}

export function useTurpeMutations() {
  const qc = useQueryClient()
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ['turpe'] })
    /* Une valeur du TURPE change : les budgets du Pricer se recalculent à leur prochaine lecture. */
    void qc.invalidateQueries({ queryKey: ['chiffrage'] })
  }

  /* UNE CASE = UNE LIGNE (index unique formule × composante × poste) : on écrit par-dessus. Une case
     vidée garde sa ligne, valeur nulle — le pricing peut vider, seul un administrateur supprime. */
  const enregistrerCoefficient = useMutation({
    mutationFn: async (x: { formule: FormuleTurpe; composante: ComposanteTurpe; poste: PosteTurpe; valeur: number | null; dateDebut: string | null }) => {
      const { error } = await supabase.from('coefficients_turpe').upsert({
        formule_tarifaire_id: x.formule.id,
        composante_tarifaire_id: x.composante.id,
        poste_tarifaire_id: x.poste.id,
        code: [x.formule.code, x.composante.code === 'TURPE_CS_PUISSANCE' ? 'B' : 'C', x.poste.code].join('_'),
        libelle: `${x.composante.libelle} · ${x.poste.code}`,
        unite: x.composante.code === 'TURPE_CS_PUISSANCE' ? uniteB(x.formule.domaine) : 'c€/kWh',
        valeur: x.valeur,
        date_debut: x.dateDebut ?? '2025-08-01',
        actif: true,
        date_modification: new Date().toISOString(),
      }, { onConflict: 'formule_tarifaire_id,composante_tarifaire_id,poste_tarifaire_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  const enregistrerFixe = useMutation({
    mutationFn: async (x: { id: string; champ: 'cg_annuel' | 'cc_annuel'; valeur: number | null }) => {
      const { error } = await supabase.from('composantes_fixes_turpe').update({ [x.champ]: x.valeur, date_modification: new Date().toISOString() }).eq('id', x.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  const majVersion = useMutation({
    mutationFn: async (x: { id: string; patch: Partial<{ libelle: string; date_debut: string | null; date_fin: string | null; reference_reglementaire: string | null; url_reference: string | null }> }) => {
      const { error } = await supabase.from('versions_turpe').update({ ...x.patch, date_modification: new Date().toISOString() }).eq('id', x.id)
      if (error) throw new Error(error.message.includes('sans_chevauchement') ? 'Ces dates chevauchent une autre grille : une seule grille peut être en vigueur à la fois.' : error.message)
    },
    onSuccess: rafraichir,
  })

  /* LA GRILLE DE L'ANNÉE SUIVANTE : copie de la grille choisie à partir d'une date ; la grille en
     cours se clôt la veille. On ne ressaisit que ce que la CRE a changé. */
  const nouvelleGrille = useMutation({
    mutationFn: async (x: { sourceId: string; libelle: string; debut: string }) => {
      const { data, error } = await supabase.rpc('fn_nouvelle_grille_turpe', { p_source: x.sourceId, p_libelle: x.libelle, p_debut: x.debut })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: rafraichir,
  })

  return { enregistrerCoefficient, enregistrerFixe, majVersion, nouvelleGrille }
}

/** Le TURPE d'un compteur de version, tel que la base le calcule et le note. */
export interface TurpeCompteur {
  total: number | null
  versionId: string | null
  formule: string | null
  manques: string[]
  detail: { cg: number | null; cc: number | null; csFixe: number | null; csVariable: number | null }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function lireTurpe(j: any): TurpeCompteur {
  const n = (x: unknown) => (x == null || x === '' ? null : Number(x))
  return {
    total: n(j?.total), versionId: j?.version_turpe_id ?? null, formule: j?.formule ?? null,
    manques: Array.isArray(j?.manques) ? j.manques : [],
    detail: { cg: n(j?.cg), cc: n(j?.cc), csFixe: n(j?.cs_fixe), csVariable: n(j?.cs_variable) },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
