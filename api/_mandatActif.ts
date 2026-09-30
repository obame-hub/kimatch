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
 * LA SYNCHRO DÉCLENCHÉE PAR DOCUSIGN L'EST AUSSI depuis le 30/09/2026 (`_grdSync.ts` appelle
 * `pointCouvertParMandatKiwee`) : elle part d'un mandat qui vient d'être signé, mais ce mandat peut
 * n'être qu'un mandat Energix — et « aucune erreur ne doit être possible ».
 *
 * ══ UN MANDAT KIWEE, ENCORE VALIDE (30/09/2026) ══════════════════════════════════════════════
 *
 * William : « les boutons de synchronisation GRDF et ENEDIS ne doivent être cliquables que si le
 * compteur est couvert par un mandat KiWee encore actif. Aucune erreur ne doit être possible car
 * tout appel non couvert pourrait être sanctionné envers l'entreprise. » Le statut ACTIF ne suffit
 * donc plus. Il faut, EN MÊME TEMPS, sur un même mandat :
 *   · le lien au compteur non caduc ;
 *   · le mandat non supprimé (`mandats.actif`) et au statut ACTIF ;
 *   · le courtier KiWee (`KIWI`) parmi ses mandataires — un mandat Energix seul ne couvre pas un
 *     appel fait avec le contrat de KiWee ;
 *   · une fin de validité absente ou pas encore passée, à la date de Paris.
 * Mesuré le 30/09 : les 1 123 mandats actifs portent tous KiWee et aucun n'est échu — la règle ne
 * retire rien aujourd'hui, elle empêche la dérive de demain. L'écran applique la même règle pour
 * griser les boutons (`mandatKiweeCouvre`, `src/lib/couvertureMandat.ts`).
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
/** Le point est-il couvert par un mandat KiWee actif et en cours de validité ? `erreur` quand la
 *  vérification elle-même n'a pas pu se faire — l'appelant doit alors REFUSER, jamais laisser passer. */
export async function pointCouvertParMandatKiwee(pointDeLivraison: string): Promise<{ couvert: boolean; erreur?: string }> {
  const url = urlSupabase()
  const cle = cleService()
  if (!url || !cle) return { couvert: false, erreur: 'Vérification du mandat impossible : configuration incomplète.' }
  const admin = createClient(url, cle, { auth: { persistSession: false } })

  const { data, error } = await admin
    .from('mandats_compteurs')
    .select('mandat_id, caduc_depuis, compteur:compteurs!inner(numero_point), mandat:mandats!inner(actif, date_fin_validite, statut:statuts_mandats!inner(code), courtiers:mandats_courtiers(type:types_courtiers_mandat(code)))')
    .eq('compteur.numero_point', pointDeLivraison)
    .is('caduc_depuis', null)

  if (error) return { couvert: false, erreur: `Vérification du mandat impossible : ${error.message}` }

  const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const un = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined)
  type LigneMandat = {
    actif?: boolean
    date_fin_validite?: string | null
    statut?: { code?: string } | { code?: string }[]
    courtiers?: { type?: { code?: string } | { code?: string }[] | null }[] | null
  }
  const actif = (data ?? []).some((l) => {
    const m = un((l as { mandat?: LigneMandat | LigneMandat[] }).mandat)
    if (!m || m.actif === false) return false
    if (un(m.statut)?.code !== 'ACTIF') return false
    if (m.date_fin_validite && m.date_fin_validite.slice(0, 10) < aujourdhui) return false
    return (m.courtiers ?? []).some((c) => un(c.type)?.code === 'KIWI')
  })

  return { couvert: actif }
}

export async function refuserSansMandatActif(
  pointDeLivraison: string,
  res: VercelResponse,
): Promise<boolean> {
  /* SANS MOYEN DE VÉRIFIER, ON REFUSE. Laisser passer « parce qu'on ne sait pas » transformerait
     une panne de configuration en porte ouverte, et personne ne s'en apercevrait. */
  const { couvert: actif, erreur } = await pointCouvertParMandatKiwee(pointDeLivraison)
  if (erreur) {
    res.status(503).json({ error: erreur })
    return true
  }
  if (!actif) {
    /* LE MESSAGE DIT CE QU'IL FAUT FAIRE, pas seulement ce qui est refusé : sans cela, l'écran
       affiche « échec » et on cherche une panne réseau pendant dix minutes. */
    res.status(403).json({
      success: false,
      error: 'Aucun mandat KiWee actif ne couvre ce point de livraison. '
        + 'Les données du gestionnaire de réseau ne peuvent être interrogées qu’avec un mandat KiWee signé, actif et en cours de validité.',
    })
    return true
  }

  return false
}
