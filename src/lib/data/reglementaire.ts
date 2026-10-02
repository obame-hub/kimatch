import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireTurpe, type TurpeCompteur } from '@/lib/data/turpe'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES TAXES ET CONTRIBUTIONS RÉGLEMENTÉES — Administration › Pricing, et le Pricer
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026 : AE, AG, CPB, CTA et TQD, à côté du TURPE, datés, chacun avec la variation par
 * rapport à la période précédente. Migration `les_taxes_reglementees_en_base_datees` :
 *
 *   taxes_reglementees_versions / _valeurs   AE, AG (une valeur), TQD (par tarif), CTA (tarif × profil)
 *   cpb_coefficients                          CPB par année civile, EN_VIGUEUR ou PROJET
 *   fn_reglementaire_version_compteur         tout ce qui est réglementé pour un compteur de version,
 *                                             noté et reporté sur les offres
 *
 * DEUX DATES — William, 02/10/2026 : TURPE, AE, AG, TQD et CTA sont « décrétés par la CRE pour une
 * durée » et se lisent au jour de l'ENVOI de l'offre (la publication du comparatif, le jour même
 * avant) ; le CPB s'applique aux années de la PÉRIODE DE FOURNITURE (du lendemain de l'échéance du
 * compteur au terme de la durée de l'offre).
 *
 * Le calcul est en base : ce module lit, écrit les valeurs de l'administration, et appelle la base.
 */

export type CodeTaxe = 'AE' | 'AG' | 'TQD' | 'CTA'
export type StatutPeriode = 'active' | 'a_venir' | 'expiree'

export interface PeriodeTaxe {
  id: string
  taxe: CodeTaxe
  libelle: string
  dateDebut: string
  dateFin: string | null
  statut: StatutPeriode
}
export interface ValeurTaxe { id: string; periodeId: string; tarif: string | null; profil: string | null; valeur: number | null }
export interface AnneeCpb { annee: number; valeur: number; statut: 'EN_VIGUEUR' | 'PROJET'; commentaire: string | null }

export interface Taxes {
  periodes: PeriodeTaxe[]
  valeurs: ValeurTaxe[]
  cpb: AnneeCpb[]
}

function statutDe(debut: string, fin: string | null): StatutPeriode {
  const auj = new Date().toISOString().slice(0, 10)
  if (debut > auj) return 'a_venir'
  if (fin && fin < auj) return 'expiree'
  return 'active'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function chargerTaxes(): Promise<Taxes> {
  const [p, v, c] = await Promise.all([
    supabase.from('taxes_reglementees_versions').select('id, taxe, libelle, date_debut, date_fin').eq('actif', true).order('date_debut', { ascending: false }),
    supabase.from('taxes_reglementees_valeurs').select('id, version_id, tarif, profil, valeur'),
    supabase.from('cpb_coefficients').select('annee, valeur_mwh, statut, commentaire').order('annee'),
  ])
  for (const r of [p, v, c]) if (r.error) throw new Error(r.error.message)
  const n = (x: unknown) => (x == null ? null : Number(x))
  return {
    periodes: ((p.data ?? []) as any[]).map((r) => ({ id: r.id, taxe: r.taxe, libelle: r.libelle, dateDebut: r.date_debut, dateFin: r.date_fin, statut: statutDe(r.date_debut, r.date_fin) })),
    valeurs: ((v.data ?? []) as any[]).map((r) => ({ id: r.id, periodeId: r.version_id, tarif: r.tarif, profil: r.profil, valeur: n(r.valeur) })),
    cpb: ((c.data ?? []) as any[]).map((r) => ({ annee: r.annee, valeur: Number(r.valeur_mwh), statut: r.statut, commentaire: r.commentaire })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useTaxes() {
  return useQuery({ queryKey: ['taxes'], queryFn: chargerTaxes })
}

export function useTaxesMutations() {
  const qc = useQueryClient()
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ['taxes'] })
    void qc.invalidateQueries({ queryKey: ['chiffrage'] })
  }
  const deChevauchement = (m: string) => (m.includes('sans_chevauchement') ? 'Ces dates chevauchent une autre période : une seule peut être en vigueur à la fois.' : m)

  const enregistrerValeur = useMutation({
    mutationFn: async (x: { periodeId: string; tarif: string | null; profil: string | null; valeur: number | null }) => {
      const { error } = await supabase.from('taxes_reglementees_valeurs').upsert(
        { version_id: x.periodeId, tarif: x.tarif, profil: x.profil, valeur: x.valeur, date_modification: new Date().toISOString() },
        { onConflict: 'version_id,tarif,profil' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  const majPeriode = useMutation({
    mutationFn: async (x: { id: string; patch: Partial<{ libelle: string; date_debut: string; date_fin: string | null }> }) => {
      const { error } = await supabase.from('taxes_reglementees_versions').update({ ...x.patch, date_modification: new Date().toISOString() }).eq('id', x.id)
      if (error) throw new Error(deChevauchement(error.message))
    },
    onSuccess: rafraichir,
  })

  const nouvellePeriode = useMutation({
    mutationFn: async (x: { taxe: CodeTaxe; sourceId: string; libelle: string; debut: string }) => {
      const { data, error } = await supabase.rpc('fn_nouvelle_periode_taxe', { p_taxe: x.taxe, p_source: x.sourceId, p_libelle: x.libelle, p_debut: x.debut })
      if (error) throw new Error(deChevauchement(error.message))
      return data as string
    },
    onSuccess: rafraichir,
  })

  const enregistrerCpb = useMutation({
    mutationFn: async (x: { annee: number; valeur: number; statut: 'EN_VIGUEUR' | 'PROJET'; commentaire?: string | null }) => {
      const { error } = await supabase.from('cpb_coefficients').upsert(
        { annee: x.annee, valeur_mwh: x.valeur, statut: x.statut, commentaire: x.commentaire ?? null, date_modification: new Date().toISOString() },
        { onConflict: 'annee' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  return { enregistrerValeur, majPeriode, nouvellePeriode, enregistrerCpb }
}

/** La CPB moyenne d'une fourniture, telle que la base la calcule (années civiles couvertes). */
export async function cpbMoyen(debut: string, dureeMois: number): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_cpb_moyen', { p_debut: debut, p_duree_mois: dureeMois })
  if (error) throw new Error(error.message)
  return data == null ? null : Number(data)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CE QUI EST RÉGLEMENTÉ POUR UN COMPTEUR DE VERSION
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface Reglementaire {
  /** Le jour d'envoi qui a choisi TURPE, AE, AG, TQD et CTA. */
  dateEnvoi: string | null
  /** Vrai une fois le comparatif publié : les valeurs ne bougent plus. */
  envoiFige: boolean
  /** Le début de fourniture, d'où part le CPB. */
  dateReference: string | null
  /** D'où elle vient : l'échéance du compteur, le début de fourniture saisi, ou le mois prochain. */
  sourceDate: 'ECHEANCE' | 'DEBUT_FOURNITURE' | 'MOIS_PROCHAIN' | null
  /** AE (électricité) ou AG (gaz), €/MWh. */
  accise: number | null
  /** Gaz. */
  tqd: number | null
  cta: number | null
  /** Gaz : CPB moyenne par durée d'offre (en mois). */
  cpb: Record<string, number>
  /** Électricité. */
  turpe: TurpeCompteur | null
  /** Les taxes prises à leur dernière valeur connue (date au-delà des périodes saisies). */
  derniereValeurConnue: string[]
  manques: string[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function lireReglementaire(j: any): Reglementaire {
  const n = (x: unknown) => (x == null || x === '' ? null : Number(x))
  const cpb: Record<string, number> = {}
  for (const [k, v] of Object.entries(j?.cpb ?? {})) if (v != null) cpb[k] = Number(v)
  return {
    dateEnvoi: j?.date_envoi ?? null,
    envoiFige: !!j?.envoi_fige,
    dateReference: j?.date_reference ?? null,
    sourceDate: j?.source_date ?? null,
    accise: n(j?.accise), tqd: n(j?.tqd), cta: n(j?.cta), cpb,
    turpe: j?.turpe ? lireTurpe(j.turpe) : null,
    derniereValeurConnue: Array.isArray(j?.derniere_valeur_connue) ? j.derniere_valeur_connue : [],
    manques: Array.isArray(j?.manques) ? j.manques : [],
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Calcule, note et reporte sur les offres tout ce qui est réglementé pour ce compteur de version. */
export async function calculerReglementaire(vcId: string): Promise<Reglementaire> {
  const { data, error } = await supabase.rpc('fn_reglementaire_version_compteur', { p_vc: vcId })
  if (error) throw new Error(error.message)
  return lireReglementaire(data)
}
