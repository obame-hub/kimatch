// Génération des 2 PDF de mandat, portée depuis les générateurs réels de Tools
// (mandat-pdf-generator.ts / energix-pdf-generator.ts), texte légal et mise en page identiques --
// seule la source des données change (Compte/Contact/Compteur Kimatch au lieu des objets
// Salesforce-shaped de Tools). Les libellés "Date"/"Signature" sont volontairement conservés en
// toutes lettres : les tabs DocuSign de Kimatch (api/docusign/_client.ts) sont posés par
// détection de ces ancres textuelles, pas par coordonnées comme dans Tools.
import jsPDF from 'jspdf'
import logoKiwee from '@/assets/kiwee-logo.png'
import type { Compte, Contact, Compteur } from '@/types/domain'

export interface MandatPdfResult {
  pdfBase64: string
  fileName: string
}

interface MandatPdfInput {
  compte: Compte
  contact: Contact
  compteurs: Compteur[]
  dureeMois: number
}

function formatAddress(compte: Compte): string {
  return [compte.rue, [compte.code_postal, compte.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

function joinNameParts(prenom: string, nom: string): string {
  return `${prenom} ${nom}`.trim()
}

async function loadImageAsBase64(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas indisponible')); return }
        ctx.drawImage(img, 0, 0)
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = reject
      img.src = src
    })
  } catch {
    return null
  }
}

// ──────────────── PDF Kiwee (mandat d'accès aux données) ────────────────

const PW = 210
const PH = 297
const ML = 15
const MR = 15
const CW = PW - ML - MR
const GREEN_LEFT = [61, 139, 55] as const
const GREEN_RIGHT = [122, 185, 41] as const
const TEXT_DARK: [number, number, number] = [51, 51, 51]
const SECTION_HEADER_HEIGHT = 9

function gradColor(t: number): [number, number, number] {
  return [
    Math.round(GREEN_LEFT[0] + t * (GREEN_RIGHT[0] - GREEN_LEFT[0])),
    Math.round(GREEN_LEFT[1] + t * (GREEN_RIGHT[1] - GREEN_LEFT[1])),
    Math.round(GREEN_LEFT[2] + t * (GREEN_RIGHT[2] - GREEN_LEFT[2])),
  ]
}

function drawHorizontalGradient(doc: jsPDF, x: number, y: number, w: number, h: number, steps = 320) {
  const baseStepW = w / steps
  for (let i = 0; i < steps; i++) {
    const startX = x + i * baseStepW
    const endX = i === steps - 1 ? x + w : x + (i + 1) * baseStepW
    const segW = endX - startX
    const t = steps === 1 ? 0 : i / (steps - 1)
    const [r, g, b] = gradColor(t)
    doc.setFillColor(r, g, b)
    doc.rect(startX, y, segW, h, 'F')
  }
}

function drawGradientBorder(doc: jsPDF, x: number, y: number, w: number, h: number, lineW = 0.7) {
  drawHorizontalGradient(doc, x, y, w, lineW)
  drawHorizontalGradient(doc, x, y + h - lineW, w, lineW)
  doc.setFillColor(...gradColor(0))
  doc.rect(x, y, lineW, h, 'F')
  doc.setFillColor(...gradColor(1))
  doc.rect(x + w - lineW, y, lineW, h, 'F')
}

function drawSectionHeader(doc: jsPDF, y: number, title: string): number {
  drawHorizontalGradient(doc, ML, y, CW, SECTION_HEADER_HEIGHT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(title, ML + 6, y + 6.5)
  return y + SECTION_HEADER_HEIGHT
}

function drawContentBox(doc: jsPDF, y: number, h: number) {
  doc.setFillColor(255, 255, 255)
  doc.rect(ML, y, CW, h, 'F')
  drawGradientBorder(doc, ML, y, CW, h)
}

function setBody(doc: jsPDF, size = 8) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(size)
  doc.setTextColor(...TEXT_DARK)
}

function setBold(doc: jsPDF, size = 8) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(size)
  doc.setTextColor(...TEXT_DARK)
}

function drawBullet(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(...TEXT_DARK)
  doc.circle(x, y - 0.8, 0.6, 'F')
}

function drawMixed(doc: jsPDF, segs: Array<{ t: string; b: boolean }>, x: number, y: number, sz = 7.5) {
  let cx = x
  for (const s of segs) {
    if (s.b) setBold(doc, sz); else setBody(doc, sz)
    doc.text(s.t, cx, y)
    cx += doc.getTextWidth(s.t)
  }
  setBody(doc, sz)
}

/** Pose une ancre DocuSign (motif rare, jamais présent dans le texte légal en prose) en tout
 * petit texte gris clair -- détectable par l'extraction de texte de DocuSign, sans perturber la
 * lecture humaine du document. Voir le commentaire dans api/docusign/_client.ts. */
function drawAnchor(doc: jsPDF, token: string, x: number, y: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4)
  doc.setTextColor(235, 235, 235)
  doc.text(token, x, y)
}

function drawUnderlinedLabel(doc: jsPDF, label: string, x: number, y: number, sz = 8.5) {
  setBold(doc, sz)
  doc.text(label, x, y)
  doc.setDrawColor(...TEXT_DARK)
  doc.setLineWidth(0.25)
  doc.line(x, y + 0.6, x + doc.getTextWidth(label), y + 0.6)
}

function drawPageHeader(doc: jsPDF, logo: { dataUrl: string; width: number; height: number } | null): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...TEXT_DARK)
  doc.text("Mandat d'accès aux données des points de livraison", ML, 18)

  if (logo) {
    const maxWidth = 35
    const maxHeight = 18
    const ratio = logo.width / logo.height
    let renderWidth = maxWidth
    let renderHeight = renderWidth / ratio
    if (renderHeight > maxHeight) {
      renderHeight = maxHeight
      renderWidth = renderHeight * ratio
    }
    const renderX = PW - MR - renderWidth
    const renderY = 6 + (maxHeight - renderHeight) / 2
    doc.addImage(logo.dataUrl, 'PNG', renderX, renderY, renderWidth, renderHeight)
  }
  return 26
}

export async function generateMandatKiweePdf({ compte, contact, compteurs, dureeMois }: MandatPdfInput): Promise<MandatPdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const tiersCompany = 'KIWEE ENERGIE FRANCE'
  const tiersSiren = '933 716 474'
  const tiersAddress = '131 BOULEVARD PEREIRE, 75017 PARIS'
  const logo = await loadImageAsBase64(logoKiwee)

  let y = drawPageHeader(doc, logo)

  y = drawSectionHeader(doc, y, 'Titulaire')
  const titBoxY = y
  const titBoxH = 40
  drawContentBox(doc, titBoxY, titBoxH)
  const FS = 7.5
  const pad = 5
  const rightColX = ML + CW * 0.55

  y += 6
  drawUnderlinedLabel(doc, 'Organisation', ML + pad, y, 8.5)
  y += 5.5
  setBody(doc, FS)
  doc.text('Dénomination sociale : ', ML + pad, y)
  setBold(doc, FS)
  doc.text(compte.nom, ML + pad + doc.getTextWidth('Dénomination sociale : '), y)
  setBody(doc, FS)
  doc.text('SIREN : ', rightColX, y)
  setBold(doc, FS)
  doc.text(compte.siren ?? '', rightColX + doc.getTextWidth('SIREN : '), y)
  y += 4.5
  setBody(doc, FS)
  doc.text('Siège social : ', ML + pad, y)
  setBold(doc, FS)
  doc.text(formatAddress(compte), ML + pad + doc.getTextWidth('Siège social : '), y)

  y += 6
  drawUnderlinedLabel(doc, 'Représentée par (titulaire du présent mandat) :', ML + pad, y, 8.5)
  y += 5.5
  setBody(doc, FS)
  doc.text('Prénom et Nom : ', ML + pad, y)
  setBold(doc, FS)
  doc.text(joinNameParts(contact.prenom, contact.nom), ML + pad + doc.getTextWidth('Prénom et Nom : '), y)
  setBody(doc, FS)
  doc.text('Fonction : ', rightColX, y)
  setBold(doc, FS)
  doc.text(contact.fonction ?? '', rightColX + doc.getTextWidth('Fonction : '), y)
  y += 4.5
  setBody(doc, FS)
  doc.text('Adresse e-mail : ', ML + pad, y)
  setBold(doc, FS)
  doc.text(contact.email ?? '', ML + pad + doc.getTextWidth('Adresse e-mail : '), y)
  setBody(doc, FS)
  doc.text('Téléphone : ', rightColX, y)
  setBold(doc, FS)
  doc.text(contact.telephone ?? '', rightColX + doc.getTextWidth('Téléphone : '), y)

  y = titBoxY + titBoxH + 3

  y = drawSectionHeader(doc, y, 'Tiers')
  const tiersBoxY = y
  const tiersBoxH = 14
  drawContentBox(doc, tiersBoxY, tiersBoxH)
  y += 5.5
  drawMixed(doc, [
    { t: "L'entreprise ", b: false },
    { t: tiersCompany, b: true },
    { t: ' immatriculée sous le SIREN ', b: false },
    { t: tiersSiren, b: true },
    { t: ',', b: false },
  ], ML + pad, y, FS)
  y += 4
  drawMixed(doc, [
    { t: 'dont le siège sociale est situé au ', b: false },
    { t: tiersAddress, b: true },
    { t: '.', b: false },
  ], ML + pad, y, FS)
  y = tiersBoxY + tiersBoxH + 3

  y = drawSectionHeader(doc, y, 'Objet')
  const objetBoxY = y
  const objetBoxH = 68
  drawContentBox(doc, objetBoxY, objetBoxH)
  const BS = 7

  y += 5
  drawUnderlinedLabel(doc, 'Accès aux données :', ML + pad, y, 8)
  y += 4.5
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'Techniques', b: true },
    { t: ' : données relatives aux caractéristiques du point de livraison (adresse, raccordement, dispositif de comptage,', b: false },
  ], ML + pad + 6, y, BS)
  y += 3.5
  setBody(doc, BS)
  doc.text('etc.), pour la durée du mandat.', ML + pad + 6, y)

  y += 4
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'Contractuelles', b: true },
    { t: ' : données relatives au contrat avec mon fournisseur (option tarifaire, profil de consommation, puissance', b: false },
  ], ML + pad + 6, y, BS)
  y += 3.5
  setBody(doc, BS)
  doc.text('souscrite, etc.), pour la durée du mandat.', ML + pad + 6, y)

  y += 4
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'Consommations', b: true },
    { t: " : données relatives à la consommation d'énergie (indexes, relèves, mesures, consommation publiée &", b: false },
  ], ML + pad + 6, y, BS)
  y += 3.5
  setBody(doc, BS)
  doc.text('informative, courbe de charge, puissances maximales et puissances atteintes), allant jusqu\'au pas de 5 min, pour la durée', ML + pad + 6, y)
  y += 3.5
  drawMixed(doc, [
    { t: 'du mandat, avec un historique de ', b: false },
    { t: '24 mois', b: true },
    { t: '.', b: false },
  ], ML + pad + 6, y, BS)

  y += 5
  drawUnderlinedLabel(doc, 'Pour les finalités suivantes :', ML + pad, y, 8)
  y += 4
  const finalites = [
    'Qualification du profil de consommation,',
    "Obtention des offres auprès des fournisseurs d'électricité et de gaz naturel,",
    'Estimation du budget annuel.',
  ]
  for (const f of finalites) {
    drawBullet(doc, ML + pad + 3, y)
    setBody(doc, BS)
    doc.text(f, ML + pad + 6, y)
    y += 3.8
  }

  y += 1
  drawUnderlinedLabel(doc, 'Délégation du mandat :', ML + pad, y, 8)
  y += 4
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'Aux ', b: false },
    { t: "fournisseurs d'électricité et de gaz naturel", b: true },
    { t: " (liste fournie sur simple demande), pour l'obtention d'offres de fourniture ;", b: false },
  ], ML + pad + 6, y, BS)
  y += 3.8
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'Aux ', b: false },
    { t: 'partenaires du Tiers', b: true },
    { t: ', ', b: false },
    { t: 'OBD GROUPE', b: true },
    { t: ', ', b: false },
    { t: 'ALTA DEVELOPPEMENT', b: true },
    { t: ', ', b: false },
    { t: 'PECUNIA & OHMEGA', b: true },
    { t: ' pour des prestations spécifiques ;', b: false },
  ], ML + pad + 6, y, BS)
  y += 3.8
  drawBullet(doc, ML + pad + 3, y)
  drawMixed(doc, [
    { t: 'À son ', b: false },
    { t: 'partenaire technique Optimum Broker', b: true },
    { t: ", pour l'optimisation de ses services.", b: false },
  ], ML + pad + 6, y, BS)

  y = objetBoxY + objetBoxH + 3

  y = drawSectionHeader(doc, y, 'Durée')
  const dureeBoxY = y
  const dureeBoxH = 10
  drawContentBox(doc, dureeBoxY, dureeBoxH)
  y += 6
  setBody(doc, FS)
  const dureePrefix = "À compter de la date de signature, l'autorisation est consentie pour une durée de :"
  doc.text(dureePrefix, ML + pad, y)
  const prefixW = doc.getTextWidth(dureePrefix)
  setBold(doc, FS)
  doc.text(`${dureeMois} mois`, ML + pad + prefixW + 1.2, y)
  y = dureeBoxY + dureeBoxH + 3

  y = drawSectionHeader(doc, y, 'Droits')
  const droitsBoxY = y
  const droitsBoxH = 72
  drawContentBox(doc, droitsBoxY, droitsBoxH)

  y += 5
  drawUnderlinedLabel(doc, 'Droit de révocation :', ML + pad, y, 8)
  y += 4
  drawMixed(doc, [
    { t: 'Vous disposez d\'un droit de révocation de ce mandat auprès de ', b: false },
    { t: tiersCompany, b: true },
    { t: ", d'", b: false },
    { t: 'ENEDIS', b: true },
    { t: ' et de ', b: false },
    { t: 'GRDF', b: true },
    { t: '.', b: false },
  ], ML + pad, y, BS)

  y += 5.5
  drawUnderlinedLabel(doc, 'Durée de conservation des données :', ML + pad, y, 8)
  y += 4
  setBody(doc, BS)
  doc.text("Les données sont conservées pendant toute la durée de validité de ce mandat dans un maximum de 3 ans à compter de sa date d'expiration.", ML + pad, y)
  y += 3.5
  doc.text("Le présent mandat est conservé pendant 5 ans à compter de sa date de signature, conformément à l'article 2224 du code civil", ML + pad, y)

  y += 5.5
  drawUnderlinedLabel(doc, 'Données personnelles :', ML + pad, y, 8)
  y += 4
  setBody(doc, BS)
  doc.text("Conformément aux dispositions de la loi n°78-17 du 6 janvier 1978 modifiée relative à l'informatique, aux fichiers et aux libertés, vous disposez", ML + pad, y)
  y += 3.5
  doc.text("d'un droit d'accès, de rectification, d'opposition et de suppression pour motifs légitimes sur les données à caractère personnel vous concernant.", ML + pad, y)

  y += 5.5
  drawUnderlinedLabel(doc, 'Exercer mes droits :', ML + pad, y, 8)
  y += 4
  setBody(doc, BS)
  doc.text('Vous pouvez exercer vos droits auprès du Tiers et/ou des Gestionnaires de Réseau de Distribution, aux adresses suivantes :', ML + pad, y)
  y += 4
  const addresses = [
    `${tiersCompany} – 131 Boulevard Pereire – 75017 - Paris ;`,
    'ENEDIS Service consommateur - 34 Place des Corolles - 92079 - Paris La Défense Cedex ;',
    'GRDF service client – Correspondant Informatique et Libertés - TSA 85101 - 27091 - Evreux Cedex.',
  ]
  for (const a of addresses) {
    drawBullet(doc, ML + pad + 3, y)
    setBody(doc, BS)
    doc.text(a, ML + pad + 6, y)
    y += 3.8
  }
  y += 0.5
  setBody(doc, BS)
  doc.text('Vous disposez également de la faculté d\'introduire une réclamation auprès de la CNIL', ML + pad, y)

  // ===== PAGE 2 : PDL + acceptation =====
  doc.addPage()
  y = drawPageHeader(doc, logo)

  const PAGE_BOTTOM = PH - 15
  const ACCEPT_BOX_H = 90
  const ACCEPT_TOTAL_H = SECTION_HEADER_HEIGHT + ACCEPT_BOX_H + 6
  const colWidths = [CW * 0.30, CW * 0.30, CW * 0.20, CW * 0.20]
  const colX = [ML, ML + colWidths[0], ML + colWidths[0] + colWidths[1], ML + colWidths[0] + colWidths[1] + colWidths[2]]
  const rowH = 7
  const headers = ['Nom du site', 'PRM / PCE', 'Code Postal', 'Énergie']

  const drawTableHeader = (yPos: number): number => {
    doc.setFillColor(255, 255, 255)
    doc.rect(ML, yPos, CW, rowH, 'F')
    setBold(doc, 8)
    headers.forEach((h, i) => doc.text(h, colX[i] + 4, yPos + 4.8))
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.line(ML, yPos + rowH, ML + CW, yPos + rowH)
    return yPos + rowH
  }

  y = drawSectionHeader(doc, y, 'Points de livraison')
  y = drawTableHeader(y)

  compteurs.forEach((c, idx) => {
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage()
      y = drawPageHeader(doc, logo)
      y = drawSectionHeader(doc, y, 'Points de livraison (suite)')
      y = drawTableHeader(y)
    }
    const [rF, gF, bF] = idx % 2 === 0 ? [230, 245, 225] : [245, 245, 245]
    doc.setFillColor(rF, gF, bF)
    doc.rect(ML, y, CW, rowH, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.15)
    doc.line(ML, y + rowH, ML + CW, y + rowH)
    setBody(doc, 7.5)
    doc.text(c.utilisation || c.site_nom || '', colX[0] + 4, y + 4.8, { maxWidth: colWidths[0] - 6 })
    doc.text(c.numero_pdl || '', colX[1] + 4, y + 4.8, { maxWidth: colWidths[1] - 6 })
    doc.text('', colX[2] + 4, y + 4.8, { maxWidth: colWidths[2] - 6 })
    doc.text(c.type_energie === 'gaz' ? 'Gaz' : 'Électricité', colX[3] + 4, y + 4.8, { maxWidth: colWidths[3] - 6 })
    y += rowH
  })

  y += 6
  if (y + ACCEPT_TOTAL_H > PAGE_BOTTOM) {
    doc.addPage()
    y = drawPageHeader(doc, logo)
  }

  y = drawSectionHeader(doc, y, 'Acceptation')
  const acceptBoxY = y
  drawContentBox(doc, acceptBoxY, ACCEPT_BOX_H)

  y += 5
  setBody(doc, 8)
  doc.text('En signant ce mandat je déclare :', ML + pad, y)
  y += 5
  setBody(doc, BS)
  doc.text('1.', ML + pad, y)
  doc.text('Être le titulaire ou être dûment habilité par le titulaire du contrat de fourniture d\'électricité ou de gaz naturel des points de livraison', ML + pad + 6, y)
  y += 3.5
  doc.text('mentionnés ci-dessus ;', ML + pad + 6, y)
  y += 5
  setBold(doc, BS)
  doc.text('2.', ML + pad, y)
  doc.text('Autoriser les Gestionnaires de Réseau de Distribution (Enedis & GRDF) à :', ML + pad + 6, y)
  y += 4
  drawBullet(doc, ML + pad + 9, y)
  drawMixed(doc, [
    { t: 'Utiliser mon adresse e-mail et numéro de téléphone', b: true },
    { t: ', indiquée ci-dessus, pour la validation de la demande d\'accès à vos données ;', b: false },
  ], ML + pad + 12, y, BS)
  y += 4
  drawBullet(doc, ML + pad + 9, y)
  drawMixed(doc, [
    { t: `Communiquer directement à ${tiersCompany} les données,`, b: true },
    { t: ' indiquées ci-dessus.', b: false },
  ], ML + pad + 12, y, BS)

  const sigW = 75
  const sigH = 50
  const sigX = ML + CW - sigW - pad
  const sigY = y + 5
  drawGradientBorder(doc, sigX, sigY, sigW, sigH, 0.5)

  setBody(doc, 8)
  const accordeLabel = 'Accordé par : '
  doc.text(accordeLabel, sigX + 4, sigY + 6)
  setBold(doc, 8)
  doc.text(joinNameParts(contact.prenom, contact.nom), sigX + 4 + doc.getTextWidth(accordeLabel), sigY + 6)
  setBody(doc, 8)

  doc.text('Date :', sigX + 4, sigY + 13)
  drawAnchor(doc, '\\d1\\', sigX + 4 + doc.getTextWidth('Date : ') + 2, sigY + 13)
  setBody(doc, 8)
  doc.text('Lieu :', sigX + 4, sigY + 20)
  doc.text('Signature :', sigX + 4, sigY + 27)
  drawAnchor(doc, '\\s1\\', sigX + 4, sigY + 33)

  return { pdfBase64: doc.output('datauristring').split(',')[1], fileName: `Mandat_KiWee_${compte.nom}.pdf` }
}

// ──────────────── PDF Energix (demande d'autorisation) ────────────────

export async function generateMandatEnergixPdf({ compte, contact, compteurs }: MandatPdfInput): Promise<MandatPdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const eML = 20
  const eMR = 20
  const eCW = PW - eML - eMR
  const PAGE_BOTTOM = PH - 15
  const TOP_MARGIN = 22

  let y = 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text('Demande d\'autorisation de consultation des données de consommation', PW / 2, y, { align: 'center' })
  y += 13

  const tableLabels = ['Raison sociale', 'Siren', 'Adresse du siège social', 'Nom et prénom du signataire', 'Fonction', 'Adresse email', 'Téléphone']
  const tableValues = [
    compte.nom,
    compte.siren ?? '',
    formatAddress(compte),
    joinNameParts(contact.prenom, contact.nom),
    contact.fonction ?? '',
    contact.email ?? '',
    contact.telephone ?? '',
  ]
  const col1W = 55
  const col2W = eCW - col1W
  const rowH = 7
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 0, 0)
  for (let i = 0; i < tableLabels.length; i++) {
    doc.rect(eML, y, col1W, rowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(tableLabels[i], eML + 2, y + 4.8)
    doc.rect(eML + col1W, y, col2W, rowH)
    doc.text(tableValues[i], eML + col1W + 2, y + 4.8)
    y += rowH
  }
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const authText = `Dans le cadre de l'organisation d'appel d'offre, la société ${compte.nom} autorise l'ensemble des fournisseurs d'énergie et leurs partenaires consultants (liste consultable ci-dessous*) à demander et à recevoir auprès des Gestionnaire de Réseau de Distribution de gaz naturel et d'électricité les informations inhérentes à l'historique des consommations jusqu'à la date de ce consentement, le flux des consommations jusqu'à la date de fin du consentement, les données contractuelles et techniques, les données publiées et les données informatives et consommations journalières.`
  const authLines = doc.splitTextToSize(authText, eCW)
  doc.text(authLines, eML, y)
  y += authLines.length * 4 + 4

  const gazText = 'Pour le gaz : PCE, Tarif, Profil, Fréquence de relève, Capacité journalière/horaire, Données de consommation en relève mensuelle.'
  const gazLines = doc.splitTextToSize(gazText, eCW)
  doc.text(gazLines, eML, y)
  y += gazLines.length * 4 + 3

  const elecText = 'Pour l\'électricité : PRM, courbe de charge, puissance souscrite, index, option tarifaire d\'acheminement.'
  const elecLines = doc.splitTextToSize(elecText, eCW)
  doc.text(elecLines, eML, y)
  y += elecLines.length * 4 + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  const sitesTitle = 'Liste des sites'
  doc.text(sitesTitle, PW / 2, y, { align: 'center' })
  const titleW = doc.getTextWidth(sitesTitle)
  doc.setLineWidth(0.4)
  doc.line(PW / 2 - titleW / 2, y + 1, PW / 2 + titleW / 2, y + 1)
  y += 8

  const siteCol1W = eCW / 2
  const siteCol2W = eCW / 2
  const drawSiteHeaders = (yPos: number): number => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('N° Compteurs ELECTRICITÉ', eML + siteCol1W / 2, yPos, { align: 'center' })
    doc.text('N° Compteurs GAZ', eML + siteCol1W + siteCol2W / 2, yPos, { align: 'center' })
    return yPos + 4
  }
  y = drawSiteHeaders(y)

  const elecPdls = compteurs.filter((c) => c.type_energie === 'electricite').map((c) => c.numero_pdl)
  const gazPdls = compteurs.filter((c) => c.type_energie === 'gaz').map((c) => c.numero_pdl)
  const maxRows = Math.max(elecPdls.length, gazPdls.length, 1)
  const siteRowH = 7
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 0, 0)

  for (let i = 0; i < maxRows; i++) {
    if (y + siteRowH > PAGE_BOTTOM) {
      doc.addPage()
      y = TOP_MARGIN
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      const contTitle = 'Liste des sites (suite)'
      doc.text(contTitle, PW / 2, y, { align: 'center' })
      const ctW = doc.getTextWidth(contTitle)
      doc.setLineWidth(0.4)
      doc.line(PW / 2 - ctW / 2, y + 1, PW / 2 + ctW / 2, y + 1)
      y += 8
      y = drawSiteHeaders(y)
      doc.setLineWidth(0.3)
    }
    doc.rect(eML, y, siteCol1W, siteRowH)
    doc.rect(eML + siteCol1W, y, siteCol2W, siteRowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (elecPdls[i]) doc.text(elecPdls[i], eML + siteCol1W / 2, y + 4.8, { align: 'center' })
    if (gazPdls[i]) doc.text(gazPdls[i], eML + siteCol1W + siteCol2W / 2, y + 4.8, { align: 'center' })
    else if (i === 0 && gazPdls.length === 0) doc.text('-', eML + siteCol1W + siteCol2W / 2, y + 4.8, { align: 'center' })
    y += siteRowH
  }
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  const suppliersText = '* Liste des fournisseurs et partenaires : Engie, Eni, Primeo Energie, Vattenfall, Gazelenergie, Enovos, Sefe Energy, Endesa, Picoty, Energem, Alterna Energie, Totalenergies, EDF, Uem, Met France, Ekwateur, Sélia, Ilek, GME ENERGY, Elmy, wekiwi, Ohmega, Energix, Pecunia, La bellenergie, HELLIO Energie, Save Energies, GEG, Power Conseils, Mint Energie ...'
  const suppLines = doc.splitTextToSize(suppliersText, eCW)

  const mention1 = "Cette présente autorisation et sa subdélégation est valable pour une durée de 12 mois à compter de sa signature. Elle concerne le(s) point(s) de livraison listé(s) dans l'annexe jointe. Ces données sont conservées sur base active pendant une durée de 2 ans sur serveur cloud. La durée de conservation des justificatifs de cette autorisation est de 5 ans à compter de la date de signature conformément à l'article 2224 du code civil."
  const mention2 = "J'accepte expressément que mes données soient conservées par le Fournisseur/mandataire à des fins de gestion et de traçabilité.  Cette autorisation est valable pour l'ensemble des compteurs dont mon entité est titulaire."
  const mention3 = "* ce document n'est en aucun cas un contrat de fourniture il s'agit d'une demande d'information"

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const m1Lines = doc.splitTextToSize(mention1, eCW)
  const m2Lines = doc.splitTextToSize(mention2, eCW)
  const suppHeight = suppLines.length * 3.5
  const faitHeight = 8 + 22
  const mentionsHeight = m1Lines.length * 3 + 2 + m2Lines.length * 3 + 2 + 3
  const trailingTotal = suppHeight + 6 + faitHeight + 6 + mentionsHeight

  if (y + trailingTotal > PAGE_BOTTOM) {
    doc.addPage()
    y = TOP_MARGIN
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text(suppLines, eML, y)
  y += suppHeight + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const faitLabel = 'Fait à : France'
  doc.text(faitLabel, eML, y)
  const dateLabelX = eML + doc.getTextWidth(faitLabel) + 3
  const dateLabel = ', Date :'
  doc.text(dateLabel, dateLabelX, y)
  drawAnchor(doc, '\\d1\\', dateLabelX + doc.getTextWidth(dateLabel) + 2, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const sigLabel = 'Signature :'
  doc.text(sigLabel, eML, y)
  drawAnchor(doc, '\\s1\\', eML, y + 6)
  const signHeight = 22
  y += signHeight + 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(m1Lines, eML, y)
  y += m1Lines.length * 3 + 2
  doc.text(m2Lines, eML, y)
  y += m2Lines.length * 3 + 2
  doc.text(mention3, eML, y)

  return { pdfBase64: doc.output('datauristring').split(',')[1], fileName: `Mandat_Energix_${compte.nom}.pdf` }
}
