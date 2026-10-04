import { supabase } from '@/lib/supabase'

/**
 * LA VALIDITÉ DE L'OFFRE GÉNÉRÉE — William, 04/10/2026 : « ok pour ton idée Compte à rebours de
 * validité ». Saisie à la génération, elle se garde sur la version (`validite_offre`) : la bande de la
 * proposition compte à rebours, l'offre passe « expirée » à l'heure dite et ne s'envoie plus, et le
 * consultant est prévenu la veille (api/offre/alerter-validite.ts).
 */

/** La validité de l'offre générée, gardée sur la version ; l'alerte de la veille repart à zéro. */
export async function enregistrerValiditeOffre(versionId: string, validite: string): Promise<void> {
  const { error } = await supabase.from('versions_recommandation').update({ validite_offre: validite, alerte_validite_le: null }).eq('id', versionId)
  if (error) throw new Error(error.message)
}

/** « 2 j 4 h », « 5 h 12 min », « 12 min » — le temps qui reste avant la fin de validité. */
export function tempsRestant(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const j = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (j > 0) return h ? `${j} j ${h} h` : `${j} j`
  if (h > 0) return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`
  return `${m} min`
}
