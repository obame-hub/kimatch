import { supabase } from '@/lib/supabase'
import { utilisateurCourant } from '@/lib/data/utilisateurCourant'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DIRE D'OÙ L'ON APPELLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « je veux absolument que tu rattaches l'appel au suivi ».
 *
 * Un appel Allô se range par reconnaissance du numéro : le webhook sait QUI est au bout du fil, pas
 * sur quel dossier on travaillait. Le volet d'activité d'un suivi de contrat ne lisant que les
 * interactions portant `suivi_contrat_id`, un appel lancé depuis la fiche se consignait sur le
 * contact et le compte — et restait invisible là où on venait de cliquer.
 *
 * On pose donc une intention juste avant de composer : « le prochain appel vers ce numéro appartient
 * à ce suivi ». Le webhook la retrouve par le numéro et le moment, puis la consomme. Voir
 * `api/allo/webhook.ts`, fonction `contexteDeLAppel`, et la migration du 25/09/2026.
 *
 * ══ LES NEUF DERNIERS CHIFFRES, COMME TOUTE LA CHAÎNE D'APPEL ══
 *
 * 1 319 numéros sont écrits avec des espaces ou des points. Comparer les chaînes brutes est
 * exactement l'erreur corrigée le 21/09/2026 sur la reconnaissance de l'appelant : « 06 12 34 56
 * 78 » ne finit pas par « 612345678 ». Le webhook compare neuf chiffres ; on écrit neuf chiffres.
 */
export function finDuNumero(numero: string | null | undefined): string {
  const chiffres = (numero ?? '').replace(/\D/g, '')
  return chiffres.length >= 9 ? chiffres.slice(-9) : chiffres
}

/**
 * Pose l'intention, puis rend la main.
 *
 * ELLE NE BLOQUE JAMAIS L'APPEL. Si l'écriture échoue — réseau coupé, session expirée —, l'appel
 * part quand même et se consignera sur le contact et le compte, comme avant. Un rattachement est un
 * confort ; empêcher quelqu'un de téléphoner parce qu'on n'a pas pu l'écrire serait absurde.
 */
export async function poserContexteAppel(
  numero: string | null | undefined,
  suiviContratId: string,
): Promise<void> {
  const fin = finDuNumero(numero)
  if (fin.length < 9 || !suiviContratId) return
  try {
    const profil = await utilisateurCourant()
    const { error } = await supabase.from('appels_contexte').insert({
      numero_normalise: fin,
      suivi_contrat_id: suiviContratId,
      profil_id: profil?.id ?? null,
    })
    if (error) console.error('poserContexteAppel', error)
  } catch (e) {
    console.error('poserContexteAppel', e)
  }
}
