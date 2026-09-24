// Gabarits de messages Slack (Block Kit) — portés depuis l'ancien outil,
// adaptés au modèle KiWee OS (pas d'objet Opportunité/Lead Salesforce).
const SEPARATOR_BAR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

function link(label: string, url?: string | null) {
  return url ? `<${url}|${label}>` : label
}

export interface AccountCreatedSlackData {
  accountName: string
  accountUrl?: string | null
  accountType: string
  siren?: string | null
  ville?: string | null
  segment?: string | null
}

export function buildAccountCreatedBlocks(d: AccountCreatedSlackData) {
  const text = `🏢 Nouveau compte — ${d.accountName} (${d.accountType})`
  const detailLines: string[] = [`• *Compte :* ${link(d.accountName, d.accountUrl)}`, `• *Type :* ${d.accountType}`]
  if (d.siren) detailLines.push(`• *SIREN :* \`${d.siren}\``)
  if (d.segment) detailLines.push(`• *Activité :* ${d.segment}`)
  if (d.ville) detailLines.push(`• *Ville :* ${d.ville}`)

  const blocks: unknown[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] },
    { type: 'section', text: { type: 'mrkdwn', text: `*${d.accountName}* — _${d.accountType}_` } },
    { type: 'section', text: { type: 'mrkdwn', text: detailLines.join('\n') } },
  ]
  if (d.accountUrl) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Ouvrir le compte', emoji: true }, url: d.accountUrl, style: 'primary' }],
    })
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] })
  return { text, blocks }
}

export function sampleAccountCreatedData(): AccountCreatedSlackData {
  return {
    accountName: 'Résidence Les Mimosas',
    accountUrl: 'https://kimatch.fr/comptes/demo',
    accountType: 'Syndic non professionnel',
    siren: '123456789',
    ville: 'Paris',
    segment: 'Copropriété',
  }
}

export interface ContratCreatedSlackData {
  siteName: string
  siteUrl?: string | null
  fournisseurName: string
  energyType: 'electricite' | 'gaz'
  dateDebut?: string | null
  dateFin?: string | null
  compteurs: { label: string; numeroPdl: string }[]
  contratUrl?: string | null
}

export function buildContratCreatedBlocks(d: ContratCreatedSlackData) {
  const icon = d.energyType === 'gaz' ? '🔥' : '⚡'
  const text = `${icon} Nouveau contrat — ${d.siteName} (${d.fournisseurName})`

  const detailLines: string[] = [
    `• *Site :* ${link(d.siteName, d.siteUrl)}`,
    `• *Fournisseur :* ${d.fournisseurName}`,
    `• *Énergie :* ${d.energyType === 'gaz' ? 'Gaz' : 'Électricité'}`,
  ]
  if (d.dateDebut || d.dateFin) {
    detailLines.push(`• *Début :* ${d.dateDebut ?? '—'}   *Fin :* ${d.dateFin ?? '—'}`)
  }

  const pdlLines = d.compteurs.length
    ? d.compteurs.map((c) => `• *${c.label || 'Sans libellé'}* — \`${c.numeroPdl}\``).join('\n')
    : '_Aucun compteur lié_'

  const blocks: unknown[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] },
    { type: 'section', text: { type: 'mrkdwn', text: detailLines.join('\n') } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Compteurs (${d.compteurs.length})*\n${pdlLines}` } },
  ]
  if (d.contratUrl) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Ouvrir le contrat', emoji: true }, url: d.contratUrl, style: 'primary' }],
    })
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] })
  return { text, blocks }
}

export interface MandatSignedSlackData {
  compteName: string
  mandatUrl?: string | null
  succes: string[]
  echecs: { pdl: string; error: string }[]
}

export function buildMandatSignedBlocks(d: MandatSignedSlackData) {
  const text = `✅ Mandat signé — ${d.compteName} — synchro GRD lancée automatiquement`
  const lines: string[] = [`• *Compte :* ${link(d.compteName, d.mandatUrl)}`]
  if (d.succes.length) lines.push(`• *Synchronisés :* ${d.succes.join(', ')}`)
  if (d.echecs.length) lines.push(`• *Échecs :* ${d.echecs.map((e) => `${e.pdl} (${e.error})`).join(', ')}`)

  const blocks: unknown[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] },
    { type: 'section', text: { type: 'mrkdwn', text: `*Mandat signé — ${d.compteName}*` } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ]
  if (d.mandatUrl) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Ouvrir le mandat', emoji: true }, url: d.mandatUrl, style: 'primary' }],
    })
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] })
  return { text, blocks }
}

export function sampleMandatSignedData(): MandatSignedSlackData {
  return {
    compteName: 'Résidence Les Mimosas',
    mandatUrl: 'https://kimatch.fr/mandats/demo',
    succes: ['30001245678901', '30001245678902'],
    echecs: [],
  }
}

export function sampleContratCreatedData(): ContratCreatedSlackData {
  return {
    siteName: 'Résidence Les Tilleuls',
    siteUrl: 'https://kimatch.fr/sites/demo',
    fournisseurName: 'EDF',
    energyType: 'electricite',
    dateDebut: '01/06/2026',
    dateFin: '31/05/2028',
    compteurs: [{ label: 'Parties communes', numeroPdl: 'PDL-30001245' }],
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LE DEAL GAGNÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════

   William, 24/09/2026 : « une fois qu'une opportunité est clôturée (Acceptée), un message de
   félicitation doit être envoyé dans le canal Slack "deals-gagnés". Le plus important est de savoir
   qui a signé (le propriétaire de la recommandation) ainsi que le champ montant présent sur la
   recommandation. »

   LES DEUX CHOSES IMPORTANTES SONT DANS LA PREMIÈRE LIGNE, celle que Slack montre en notification
   et dans la liste des canaux : le nom et le montant. Tout le reste — le compte, la référence, le
   lien — est du détail qu'on lit en ouvrant, et qui ne doit pas repousser l'essentiel hors du
   résumé.

   LE MONTANT PEUT MANQUER : 55 des 872 recommandations acceptées n'en portent aucun. On le dit
   plutôt que d'écrire « 0,00 € », qui ferait passer une affaire signée pour une affaire nulle. */

export interface DealGagneSlackData {
  /** Le propriétaire de la recommandation — « qui a signé ». */
  proprietaire: string | null
  /** `recommandations.montant`, au centime. `null` quand il n'a jamais été renseigné. */
  montant: number | null
  recommandationNom: string
  recommandationUrl?: string | null
  reference?: string | null
  compteNom?: string | null
  compteUrl?: string | null
}

export function buildDealGagneBlocks(d: DealGagneSlackData) {
  const qui = d.proprietaire?.trim() || 'Un commercial'
  const combien = d.montant == null ? 'montant à renseigner' : eurosSlack(d.montant)
  const text = `🎉 Deal gagné — ${qui} · ${combien}`

  const detail: string[] = []
  if (d.compteNom) detail.push(`• *Client :* ${link(d.compteNom, d.compteUrl)}`)
  detail.push(`• *Affaire :* ${link(d.recommandationNom, d.recommandationUrl)}`)
  if (d.reference) detail.push(`• *Référence :* \`${d.reference}\``)

  const blocks: unknown[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:tada: *${qui}* vient de signer\n*${combien}*` },
    },
    { type: 'section', text: { type: 'mrkdwn', text: detail.join('\n') } },
  ]
  if (d.recommandationUrl) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: "Ouvrir l'affaire", emoji: true }, url: d.recommandationUrl, style: 'primary' }],
    })
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: SEPARATOR_BAR }] })
  return { text, blocks }
}

/**
 * Le montant, au centime, comme partout dans Kimatch.
 *
 * ÉCRIT ICI ET NON IMPORTÉ DE `euros.ts` : ce fichier de gabarits est aussi lu côté serveur, où
 * l'espace fine insécable de la version écran passerait mal dans le résumé d'une notification
 * Slack. Même règle — deux décimales, toujours — avec une espace ordinaire.
 */
function eurosSlack(v: number): string {
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

export function sampleDealGagneData(): DealGagneSlackData {
  return {
    proprietaire: 'Matthieu Berthier',
    montant: 18450.75,
    recommandationNom: 'Renouvellement électricité — parties communes',
    recommandationUrl: 'https://kimatch.fr/recommandations/demo',
    reference: 'REC-2026-0412',
    compteNom: 'Résidence Les Mimosas',
    compteUrl: 'https://kimatch.fr/comptes/demo',
  }
}
