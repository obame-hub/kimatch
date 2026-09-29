import { createClient } from '@supabase/supabase-js'
import type { VercelResponse } from '@vercel/node'
import { cleService, urlSupabase } from './_cleService.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ON N'INTERROGE UN POINT DE LIVRAISON QUE SI UN MANDAT ACTIF LE COUVRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : « on récupère bien les données que si le mandat est actif, tu peux me
 * confirmer ça ? » Elle le croyait acquis. Ce ne l'était pas — et le constat mérite d'être écrit
 * ici plutôt que perdu dans une conversation :
 *
 *   · Sur la fiche d'un compteur, le bouton « Synchroniser » n'était désactivé que pendant le
 *     chargement. N'importe quel PDL tapé à la main partait chez Enedis.
 *   · Et la requête envoyée porte `<autorisationClient>true</autorisationClient>` ÉCRIT EN DUR :
 *     Kimatch DÉCLARE à Enedis que le client a donné son accord. Il ne le vérifiait pas.
 *
 * Mesuré le 29/09 : 680 compteurs synchronisés, dont 17 sans mandat actif.
 *
 * ══ POURQUOI CÔTÉ SERVEUR, ET PAS EN GRISANT LE BOUTON ══════════════════════════════════════
 *
 * Un bouton grisé est une politesse : la requête part quand même si on la fabrique à la main, et
 * le point d'entrée est joignable avec n'importe quelle session. Le refus doit vivre là où la
 * requête passe, pas là où on clique.
 *
 * ══ CE QUE ÇA NE COUVRE PAS ═════════════════════════════════════════════════════════════════
 *
 * LA SYNCHRO DÉCLENCHÉE PAR DOCUSIGN N'EST PAS CONCERNÉE : elle appelle `fetchElecData`
 * directement depuis `_grdSync.ts`, sans passer par ce point d'entrée — et pour cause, elle part
 * d'un mandat qui vient d'être signé. Ajouter le contrôle là serait redondant.
 *
 * ET CE CONTRÔLE EST TECHNIQUE, PAS JURIDIQUE. Il fait correspondre le code à la règle telle que
 * Naoëlle la comprenait. Ce que le contrat Enedis exige exactement reste à confirmer avec Michel.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Refuse et répond, si aucun mandat actif ne couvre ce point de livraison.
 * Rend `true` quand la réponse a été envoyée — l'appelant doit alors s'arrêter.
 *
 * @param colonne `numero_point` porte le PDL en électricité comme le PCE en gaz.
 */
export async function refuserSansMandatActif(
  pointDeLivraison: string,
  res: VercelResponse,
): Promise<boolean> {
  const url = urlSupabase()
  const cle = cleService()
  if (!url || !cle) {
    /* SANS MOYEN DE VÉRIFIER, ON REFUSE. Laisser passer « parce qu'on ne sait pas » transformerait
       une panne de configuration en porte ouverte, et personne ne s'en apercevrait. */
    res.status(503).json({ error: 'Vérification du mandat impossible : configuration incomplète.' })
    return true
  }

  const admin = createClient(url, cle, { auth: { persistSession: false } })

  const { data, error } = await admin
    .from('mandats_compteurs')
    .select('mandat_id, caduc_depuis, compteur:compteurs!inner(numero_point), mandat:mandats!inner(statut:statuts_mandats!inner(code))')
    .eq('compteur.numero_point', pointDeLivraison)
    .is('caduc_depuis', null)

  if (error) {
    res.status(503).json({ error: `Vérification du mandat impossible : ${error.message}` })
    return true
  }

  const actif = (data ?? []).some((l) => {
    const m = (l as { mandat?: { statut?: { code?: string } | { code?: string }[] } }).mandat
    const s = Array.isArray(m?.statut) ? m?.statut[0] : m?.statut
    return s?.code === 'ACTIF'
  })

  if (!actif) {
    /* LE MESSAGE DIT CE QU'IL FAUT FAIRE, pas seulement ce qui est refusé : sans cela, l'écran
       affiche « échec » et on cherche une panne réseau pendant dix minutes. */
    res.status(403).json({
      success: false,
      error: 'Aucun mandat actif ne couvre ce point de livraison. '
        + 'Les données du gestionnaire de réseau ne peuvent être interrogées qu’avec un mandat signé et actif.',
    })
    return true
  }

  return false
}
