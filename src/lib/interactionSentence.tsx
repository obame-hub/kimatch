import { EntityLink } from '@/components/ui/entity-link'
import type { Interaction } from '@/types/domain'

// Reproduit la phrase du fil d'activité Salesforce ("{auteur} a une prochaine tâche avec
// {contact} sur {related}", avec les 3 entités cliquables) -- demande explicite du 31/07/2026 :
// les commerciaux ne doivent pas être perdus en passant de Salesforce à Kimatch, donc même
// structure de phrase, mêmes informations, mêmes liens cliquables, pour tous les types
// d'interaction.

export type InteractionCategory = 'appel' | 'email' | 'reunion' | 'visite' | 'note' | 'autre'

// Même heuristique que ActivityFeed (titres importés de Salesforce parfois en anglais/sans
// accent) -- on regarde le type ET l'objet pour ne rien manquer.
export function classifyInteraction(i: Pick<Interaction, 'type_interaction' | 'objet'>): InteractionCategory {
  const t = `${i.type_interaction} ${i.objet ?? ''}`.toLowerCase()
  if (t.includes('note')) return 'note'
  if (t.includes('appel') || t.includes('call') || t.includes('voicemail')) return 'appel'
  if (t.includes('visite')) return 'visite'
  if (t.includes('réunion') || t.includes('reunion') || t.includes('visio') || t.includes('rendez-vous') || t.includes('rendez vous')) return 'reunion'
  if (t.includes('email') || t.includes('e-mail') || t.includes('mail')) return 'email'
  return 'autre'
}

const TEMPLATES: Record<InteractionCategory, { future: [string, string, string]; past: [string, string, string] }> = {
  // [prefixe verbal, connecteur avant le contact ('' = complement direct, pas de preposition), connecteur avant l'entite liee]
  appel: { future: ['a un appel prévu', 'avec', 'au sujet de'], past: ['a appelé', '', 'au sujet de'] },
  email: { future: ['a un email prévu', 'avec', 'au sujet de'], past: ['a échangé un email', 'avec', 'au sujet de'] },
  reunion: { future: ['a une réunion prévue', 'avec', 'sur'], past: ['a eu une réunion', 'avec', 'sur'] },
  visite: { future: ['a une visite prévue', 'chez', 'pour'], past: ['a effectué une visite', 'chez', 'pour'] },
  note: { future: ['a une note prévue', 'concernant', 'sur'], past: ['a ajouté une note', 'concernant', 'sur'] },
  autre: { future: ['a une prochaine tâche', 'avec', 'sur'], past: ['a eu un échange', 'avec', 'sur'] },
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * Entité "Related To" (WhatId Salesforce) : recommandation en priorité, sinon site, compte.
 *
 * LE SIGNAL VENAIT EN DEUXIÈME jusqu'au 02/09/2026 — c'est-à-dire au beau milieu du fil
 * d'activité, dans la phrase même : « Untel a appelé Machin au sujet de <signal> », avec un lien
 * vers une page qui n'existe plus. Naoëlle : « enlève toute trace de signal sur toute l'app, même
 * dans le flux d'activité » (voir `cycleNavItems`). Une interaction qui ne portait qu'un signal se
 * rattache maintenant à son site, à défaut à son compte.
 */
function relatedEntity(i: Interaction): { to: string; label: string } | null {
  if (i.recommandation_id && i.recommandation_nom) return { to: `/recommandations/${i.recommandation_id}`, label: i.recommandation_nom }
  if (i.site_id && i.site_nom) return { to: `/sites/${i.site_id}`, label: i.site_nom }
  if (i.compte_id && i.compte_nom) return { to: `/comptes/${i.compte_id}`, label: i.compte_nom }
  return null
}

/** Phrase complète, cliquable, du meme type que le fil d'activite Salesforce. */
export function InteractionSentence({ interaction }: { interaction: Interaction }) {
  const cat = classifyInteraction(interaction)
  const future = new Date(interaction.date_interaction).getTime() > Date.now()
  const [prefix, connector, relConn] = TEMPLATES[cat][future ? 'future' : 'past']
  const related = relatedEntity(interaction)
  const hasAuteur = interaction.auteur.trim().length > 0

  return (
    <span>
      {hasAuteur ? <strong>{interaction.auteur}</strong> : null}
      {hasAuteur ? ' ' : ''}
      {hasAuteur ? prefix : capitalize(prefix)}
      {interaction.contact_nom && (
        <>
          {connector ? ` ${connector} ` : ' '}
          {interaction.contact_id ? <EntityLink to={`/contacts/${interaction.contact_id}`}>{interaction.contact_nom}</EntityLink> : interaction.contact_nom}
        </>
      )}
      {related && (
        <>
          {' '}
          {relConn} <EntityLink to={related.to}>{related.label}</EntityLink>
        </>
      )}
    </span>
  )
}
