// ════════════════════════════════════════════════════════════════════════════════════════════════
// DEPUIS QUAND N'A-T-ON PAS PARLÉ À CE CONTACT
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// 3 206 contacts sur 3 416 n'ont jamais été touchés par une action, et vingt échanges seulement
// portent une date de réalisation sur les douze derniers mois (mesuré le 13/09/2026). Le chiffre
// dit moins l'inactivité de l'équipe que l'absence de trace : on appelle sans consigner.
//
// AFFICHER LE SILENCE EST CE QUI LE FAIT CESSER. Tant que « jamais contacté » n'apparaît nulle
// part, rien ne distingue le contact qu'on vient d'avoir au téléphone de celui dont personne ne
// sait s'il travaille encore là.
//
// ══ UNE REQUÊTE, ET SEULEMENT QUAND L'ONGLET EST OUVERT ══
//
// Le composant qui appelle ce crochet n'est monté que sur l'onglet Contacts : les autres onglets de
// la fiche ne paient rien. La lecture porte sur les contacts du compte — une vingtaine au plus, 28
// sur le compte le plus fourni de la base.
//
// ON LIT `date_realisation` PUIS `date_prevue`. Une action terminée porte sa date de réalisation ;
// une action passée jamais clôturée ne prouve pas un échange, mais elle prouve qu'on avait prévu de
// parler — et c'est plus honnête que de dire « jamais » à quelqu'un qu'on a probablement appelé.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

/** Au-delà, le lien est considéré comme refroidi. Un an et demi : deux cycles de renouvellement. */
export const JOURS_LIEN_FROID = 548

/** En deçà, le lien est vif. Trois mois, soit la durée d'une consultation. */
export const JOURS_LIEN_VIF = 92

export type Temperature = 'vive' | 'tiede' | 'froide' | 'jamais'

export interface Fraicheur {
  /** Jours écoulés depuis le dernier échange, ou `null` si aucun n'a jamais été consigné. */
  jours: number | null
  temperature: Temperature
}

interface LigneAction {
  contact_id: string | null
  date_realisation: string | null
  date_prevue: string | null
}

function temperature(jours: number | null): Temperature {
  if (jours === null) return 'jamais'
  if (jours <= JOURS_LIEN_VIF) return 'vive'
  if (jours <= JOURS_LIEN_FROID) return 'tiede'
  return 'froide'
}

export function useFraicheurContacts(contactIds: string[]) {
  // La clé porte les identifiants triés : deux rendus successifs du même compte ne relancent pas la
  // requête parce que le tableau a changé d'instance.
  const cle = [...contactIds].sort().join(',')

  return useQuery({
    queryKey: ['fraicheur-contacts', cle],
    enabled: contactIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, Fraicheur>> => {
      const lignes = await fetchAllRows<LigneAction>(
        'actions',
        'contact_id, date_realisation, date_prevue',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.in('contact_id', contactIds).eq('actif', true),
      )

      const derniere = new Map<string, string>()
      for (const l of lignes) {
        if (!l.contact_id) continue
        // Une date prévue dans le futur ne prouve rien : c'est un rendez-vous, pas un échange.
        const aujourdhui = new Date().toISOString().slice(0, 10)
        const date = l.date_realisation ?? (l.date_prevue && l.date_prevue <= aujourdhui ? l.date_prevue : null)
        if (!date) continue
        const connue = derniere.get(l.contact_id)
        if (!connue || date > connue) derniere.set(l.contact_id, date)
      }

      const sortie = new Map<string, Fraicheur>()
      const maintenant = Date.now()
      for (const id of contactIds) {
        const date = derniere.get(id)
        const jours = date ? Math.floor((maintenant - new Date(date).getTime()) / 86_400_000) : null
        sortie.set(id, { jours, temperature: temperature(jours) })
      }
      return sortie
    },
  })
}

/** Ce qu'on écrit sous la fiche. Court : la pastille porte déjà l'alerte. */
export function libelleFraicheur(f: Fraicheur | undefined): string {
  if (!f || f.temperature === 'jamais') return 'Jamais contacté'
  const j = f.jours ?? 0
  if (j <= 1) return 'Échange aujourd’hui'
  if (j < 31) return `Échange il y a ${j} j`
  const mois = Math.round(j / 30.5)
  if (mois < 24) return `Échange il y a ${mois} mois`
  return `Échange il y a ${Math.floor(j / 365)} ans`
}
