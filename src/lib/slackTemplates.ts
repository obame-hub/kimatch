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
    accountUrl: 'https://kiwee-os.vercel.app/comptes/demo',
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

export function sampleContratCreatedData(): ContratCreatedSlackData {
  return {
    siteName: 'Résidence Les Tilleuls',
    siteUrl: 'https://kiwee-os.vercel.app/sites/demo',
    fournisseurName: 'EDF',
    energyType: 'electricite',
    dateDebut: '01/06/2026',
    dateFin: '31/05/2028',
    compteurs: [{ label: 'Parties communes', numeroPdl: 'PDL-30001245' }],
  }
}
