import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil } from '@/lib/data/roles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI DOIT INTERROMPRE UNE SÉANCE DE PROSPECTION — ET RIEN D'AUTRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « j'aimerais avoir des bannières de notifications qui s'affichent pendant
 * le sprint, notamment pour prévenir d'un rappel (à heure précise) ou d'une réception de factures ».
 *
 * ══ UNE BANNIÈRE QUI SE TROMPE COÛTE UN APPEL ══
 *
 * Le sprint se mène le combiné en main : tout ce qui paraît à l'écran détourne le regard au moment
 * où il sert le plus. Deux familles seulement passent, et pour la même raison — ce sont les deux
 * choses qu'on ne peut pas rattraper après coup.
 *
 *   LE RAPPEL À L'HEURE   un rendez-vous téléphonique promis à 14 h 30 ne se rattrape pas à 15 h.
 *                         C'est la seule tâche du plan qui ait une heure, et c'est exactement ce
 *                         qui la distingue des soixante autres.
 *   LA FACTURE REÇUE      elle change ce qu'il faut faire À L'INSTANT : la piste devient
 *                         convertible, et le mail de relance qu'on s'apprêtait à écrire n'a plus
 *                         lieu d'être.
 *
 * Tout le reste — une tâche du jour sans heure, un mail lu, un appel manqué — attendra la fin de la
 * séance. Ça se lit dans le fil, ça n'interrompt personne.
 *
 * ══ LA FENÊTRE EST DE DIX MINUTES, PAS DE L'HEURE PILE ══
 *
 * Prévenir à 14 h 30 pour un appel à 14 h 30 arrive trop tard : on est déjà en ligne avec
 * quelqu'un d'autre. Dix minutes laissent le temps de finir l'appel en cours et d'ouvrir la fiche.
 * Au-delà de cinq minutes de retard, la bannière reste — un rappel oublié reste un rappel oublié.
 */
export type NatureAlerte = 'RAPPEL_HEURE' | 'FACTURES'

export interface Alerte {
  cle: string
  nature: NatureAlerte
  titre: string
  detail: string | null
  /** Vers quoi mène le clic : une ligne du plan si on l'y trouve, une fiche sinon. */
  cible_type: 'PISTE' | 'OPPORTUNITE' | null
  cible_id: string | null
  lien: string | null
  quand: string
}

/** Combien de temps avant l'heure dite la bannière paraît, et combien de temps après elle reste. */
const AVANCE_MINUTES = 10
const RETARD_MINUTES = 5

/**
 * ══ LES RAPPELS SUIVENT PARTOUT, PAS SEULEMENT DANS LE SPRINT ══
 *
 * William, 23/09/2026 : « je veux que la bannière puisse apparaître partout sur Kimatch, pas
 * uniquement dans Cockpit ».
 *
 * C'EST LA NATURE MÊME D'UN RENDEZ-VOUS TÉLÉPHONIQUE : il tombe à 14 h 30, qu'on soit en train de
 * prospecter, de relire une recommandation ou de chercher un compteur. Le réserver au Cockpit
 * revenait à ne prévenir que ceux qui n'avaient pas besoin d'être prévenus.
 *
 * LA CADENCE N'EST PAS LA MÊME DES DEUX CÔTÉS. Dans le sprint on enchaîne les appels et une minute
 * de retard fait manquer le créneau ; ailleurs on travaille sur autre chose, et relire quatre fois
 * par minute une requête qui rend presque toujours zéro ligne ne sert personne.
 */
export function useAlertes({ actif = true, cadenceMs = 45_000 }: { actif?: boolean; cadenceMs?: number } = {}) {
  const { data: profil } = useMonProfil()
  const moi = profil?.id ?? null

  return useQuery({
    queryKey: ['cockpit', 'alertes', moi],
    enabled: actif && Boolean(moi),
    refetchInterval: actif ? cadenceMs : false,
    staleTime: 0,
    queryFn: async (): Promise<Alerte[]> => {
      if (!moi) return []
      const maintenant = Date.now()
      const debut = new Date(maintenant - RETARD_MINUTES * 60_000).toISOString()
      const fin = new Date(maintenant + AVANCE_MINUTES * 60_000).toISOString()

      const [taches, factures] = await Promise.all([
        supabase
          .from('actions')
          .select('id, titre, date_prevue, piste_id, opportunite_id, statut:statuts_actions(code)')
          .eq('responsable_profil_id', moi)
          .eq('actif', true)
          .gte('date_prevue', debut)
          .lte('date_prevue', fin)
          .limit(10),
        supabase
          .from('notifications')
          .select('id, titre, message, lien, entite_type, entite_id, date_creation')
          .eq('destinataire_profil_id', moi)
          .eq('categorie', 'factures_recues')
          .is('lu_le', null)
          .order('date_creation', { ascending: false })
          .limit(5),
      ])

      const alertes: Alerte[] = []

      /* UNE TÂCHE SANS HEURE VAUT MINUIT LOCAL — c'est la convention de toute l'application
         (`heureTache.ts`). Elle tomberait dans la fenêtre une fois par nuit, et n'a rien à y faire :
         ce n'est pas un rendez-vous, c'est une échéance de journée. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of (taches.data ?? []) as any[]) {
        if (['TERMINEE', 'ANNULEE'].includes(t.statut?.code ?? '')) continue
        const quand = new Date(t.date_prevue as string)
        if (quand.getHours() === 0 && quand.getMinutes() === 0) continue
        const heure = quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        alertes.push({
          cle: `tache-${t.id}`,
          nature: 'RAPPEL_HEURE',
          titre: quand.getTime() < maintenant ? `Rappel de ${heure} — en retard` : `Rappel à ${heure}`,
          detail: (t.titre as string) ?? null,
          cible_type: t.opportunite_id ? 'OPPORTUNITE' : t.piste_id ? 'PISTE' : null,
          cible_id: (t.opportunite_id ?? t.piste_id) as string | null,
          lien: t.opportunite_id ? `/opportunites/${t.opportunite_id}`
            : t.piste_id ? `/pistes/${t.piste_id}` : null,
          quand: t.date_prevue as string,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const n of (factures.data ?? []) as any[]) {
        alertes.push({
          cle: `notif-${n.id}`,
          nature: 'FACTURES',
          titre: (n.titre as string) ?? 'Factures reçues',
          detail: (n.message as string) ?? null,
          cible_type: n.entite_type === 'opportunite' ? 'OPPORTUNITE' : n.entite_type === 'piste' ? 'PISTE' : null,
          cible_id: (n.entite_id as string) ?? null,
          lien: (n.lien as string) ?? null,
          quand: n.date_creation as string,
        })
      }

      /* LA FACTURE PASSE DEVANT LE RAPPEL : elle change ce qu'il faut faire, il dit seulement
         quand. À égalité, le plus récent d'abord. */
      return alertes.sort((a, b) =>
        a.nature === b.nature
          ? b.quand.localeCompare(a.quand)
          : a.nature === 'FACTURES' ? -1 : 1)
    },
  })
}

/** Marquer la notification lue : la bannière ne doit pas revenir à la lecture suivante. */
export async function acquitterAlerte(cle: string) {
  if (!cle.startsWith('notif-')) return
  await supabase
    .from('notifications')
    .update({ lu_le: new Date().toISOString() })
    .eq('id', cle.slice('notif-'.length))
}
