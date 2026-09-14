/**
 * ══ UN ÉCHANGE DE MAILS SE LIT COMME UN FIL ══
 *
 * William, 14/09/2026 : « avoir le fil de la conversation de mail dans Kimatch ».
 *
 * Les messages d'un même échange arrivaient dans le flux d'activité comme des lignes
 * indépendantes, triées par date au milieu des appels et des notes. Une conversation de six
 * messages occupait six cartes, et lire la réponse demandait de retrouver la question plus bas.
 *
 * `interactions.fil_discussion` (migration 20260914160000) porte l'identifiant de conversation —
 * le `ThreadIdentifier` de Salesforce, et demain le `Message-ID` d'un mail parti de Kimatch. Ce
 * fichier n'en fait qu'une chose : regrouper.
 *
 * IL VIT À PART DU COMPOSANT parce que c'est la seule partie qu'on peut prouver. Le rendu se juge
 * à l'œil ; le regroupement, lui, a des cas limites — un fil d'un seul message, un fil dont les
 * dates sont à l'envers, des mails sans fil du tout — et ils se testent.
 */
import type { Interaction } from '@/types/domain'

export interface FilsRepliés {
  /** Ce qui reste ligne à ligne : les appels, les notes, et les mails sans conversation. */
  seules: Interaction[]
  /** Chaque conversation, du message le plus récent au plus ancien. Au moins deux messages. */
  fils: Interaction[][]
}

/**
 * Sépare ce qui appartient à une conversation de ce qui n'y appartient pas.
 *
 * UN MESSAGE SEUL RESTE UN MESSAGE SEUL. Un fil d'un élément n'est pas un fil : le replier ne
 * gagnerait rien et ajouterait « 1 message » sur la moitié des cartes du flux.
 */
export function replierLesFils(interactions: Interaction[]): FilsRepliés {
  const parFil = new Map<string, Interaction[]>()
  const seules: Interaction[] = []

  for (const i of interactions) {
    const fil = i.fil_discussion?.trim()
    if (!fil) {
      seules.push(i)
      continue
    }
    const l = parFil.get(fil) ?? []
    l.push(i)
    parFil.set(fil, l)
  }

  const fils: Interaction[][] = []
  for (const l of parFil.values()) {
    if (l.length === 1) {
      seules.push(l[0])
      continue
    }
    /* Du plus récent au plus ancien : c'est le sens de lecture du flux d'activité, et la réponse
       la plus fraîche est ce qu'on cherche en ouvrant la carte. */
    fils.push([...l].sort(
      (a, b) => new Date(b.date_interaction).getTime() - new Date(a.date_interaction).getTime(),
    ))
  }

  return { seules, fils }
}

/**
 * Une ligne d'en-tête par message, puis son texte.
 *
 * La flèche dit le sens d'un coup d'œil — `←` ce que le client a écrit, `→` ce qu'on a envoyé.
 * L'objet n'est répété que s'il CHANGE en cours de fil : le rappeler à chaque message ferait six
 * fois la même ligne dans une carte qui le porte déjà en titre.
 */
export function messageEnTexte(i: Interaction, objetDuFil: string): string {
  const fleche = i.sens === 'ENTRANT' ? '←' : '→'
  const quand = new Date(i.date_interaction).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const objet = i.objet && i.objet !== objetDuFil ? ` · ${i.objet}` : ''
  const corps = i.resume?.trim() || i.resultat?.trim() || '(message vide)'
  return `${fleche} ${quand}${objet}\n${corps}`
}
