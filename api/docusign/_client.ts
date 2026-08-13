import { createSign } from 'crypto'

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} non configurée`)
  return v
}

/**
 * Remet la cle privee RSA dans un PEM que OpenSSL accepte.
 *
 * Une variable d'environnement ne porte qu'une chaine sur une seule ligne. Coller une cle PEM
 * dans une interface comme Vercel produit selon les cas des \n LITTERAUX (les deux
 * caracteres barre oblique inverse et n), des guillemets autour de la valeur, ou du base64.
 * OpenSSL refuse alors de decoder et renvoie « error:1E08010C:DECODER routines::unsupported »,
 * un message qui ne dit rien du vrai probleme. C'est l'erreur rencontree le 13/08/2026 en
 * testant la creation de mandat sur le compte KIWEE ENERGIE FRANCE.
 *
 * Aucune de ces formes n\'est fautive : elles dependent de la facon dont la valeur a ete saisie.
 * On les ramene toutes au meme PEM, plutot que d\'exiger une saisie parfaite.
 */
function normaliserClePem(brut: string): string {
  let pem = brut.trim()

  // Guillemets ajoutes par certaines interfaces autour d'une valeur multi-lignes.
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1).trim()
  }

  // Cle stockee en base64 du PEM entier : elle ne contient alors aucun en-tete lisible.
  if (!pem.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(pem)) {
    try {
      const decode = Buffer.from(pem, 'base64').toString('utf8')
      if (decode.includes('BEGIN')) pem = decode.trim()
    } catch {
      // On garde la valeur brute : le controle de format ci-dessous produira un message clair.
    }
  }

  // Le cas le plus frequent : les retours a la ligne sont des \n litteraux.
  if (pem.includes('\\n')) pem = pem.replace(/\\n/g, '\n')
  // Valeur passee depuis Windows : les retours chariot feraient echouer le decodage.
  pem = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Corps de cle colle SANS ses en-tetes : c'est du base64 seul, sans « BEGIN ». On reconstruit
  // le PEM plutot que de refuser une cle qui est peut-etre la bonne. Le type est inconnu a ce
  // stade, donc on tente PKCS#8 puis PKCS#1 — l'appelant validera en signant.
  if (!pem.includes('BEGIN')) {
    const corps = pem.replace(/[^A-Za-z0-9+/=]/g, '')
    // Une cle RSA 2048 fait environ 1600 caracteres en base64 ; en dessous de 600 ce n'est pas
    // une cle mais probablement un identifiant colle par erreur.
    if (corps.length > 600) {
      const lignes = corps.match(/.{1,64}/g) ?? []
      for (const type of ['PRIVATE KEY', 'RSA PRIVATE KEY']) {
        // Les retours à la ligne sont écrits directement : passer par un marqueur textuel serait
        // dangereux ici, ses lettres pouvant apparaître dans le base64 de la clé et le corrompre.
        const candidat = ['-----BEGIN ' + type + '-----', ...lignes, '-----END ' + type + '-----', ''].join('\n')
        try {
          const essai = createSign('RSA-SHA256')
          essai.update('verification')
          essai.end()
          essai.sign(candidat)
          return candidat
        } catch {
          // Mauvais type d'encapsulation : on tente le suivant.
        }
      }
    }
  }

  if (!pem.includes('BEGIN') || !pem.includes('PRIVATE KEY')) {
    // Diagnostic sans rien divulguer : la longueur et l'absence de marqueur ne revelent pas la
    // cle, mais disent immediatement si la variable est vide, tronquee, ou d'une autre nature.
    const indice = brut.trim().length === 0 ? 'elle est vide' : `elle fait ${brut.trim().length} caracteres et ne contient pas « BEGIN »`
    throw new Error(
      `DOCUSIGN_RSA_PRIVATE_KEY ne contient pas une cle privee PEM lisible : ${indice}. ` +
        'Attendu : le bloc complet -----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----, ' +
        'tel que DocuSign le donne au moment de generer la cle RSA de l application ' +
        '(Settings > Apps and Keys > votre application > Generate RSA). ' +
        'La cle privee n est affichee qu une seule fois : si elle a ete perdue, il faut en generer une nouvelle.',
    )
  }

  // Un PEM doit se terminer par un retour a la ligne, sinon certaines versions d\'OpenSSL
  // tronquent la derniere ligne de base64.
  return pem.endsWith('\n') ? pem : pem + '\n'
}

async function getJwtAccessToken(): Promise<string> {
  const integrationKey = requireEnv('DOCUSIGN_INTEGRATION_KEY')
  const userId = requireEnv('DOCUSIGN_USER_ID')
  const rsaPem = normaliserClePem(requireEnv('DOCUSIGN_RSA_PRIVATE_KEY'))
  const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com'
  const aud = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: integrationKey,
    sub: userId,
    aud,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  let signature: string
  try {
    signature = base64url(signer.sign(rsaPem))
  } catch (err) {
    // L'erreur brute d'OpenSSL ne dit pas ce qui manque. On la traduit, sans jamais faire
    // apparaître la clé elle-même dans un message ou un journal.
    const brut = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Signature du jeton DocuSign impossible : la clé privée n'est pas exploitable (${brut}). ` +
        'Vérifiez DOCUSIGN_RSA_PRIVATE_KEY — la clé doit être celle générée dans DocuSign pour ' +
        'cette application, au format PEM, en-têtes compris.',
    )
  }
  const assertion = `${signingInput}.${signature}`

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    if (data.error === 'consent_required') {
      // Le redirect_uri doit correspondre EXACTEMENT à l'un de ceux enregistrés dans DocuSign
      // (Apps and Keys > l'application > Redirect URIs), sinon le consentement est refusé avant
      // même d'être demandé. Il était codé en dur sur l'ancienne URL Vercel alors que le domaine
      // de production est kimatch.fr : le lien affiché ne pouvait pas aboutir.
      const redirect = process.env.DOCUSIGN_REDIRECT_URI ?? 'https://kimatch.fr'
      const url =
        `https://${aud}/oauth/auth?response_type=code&scope=signature%20impersonation` +
        `&client_id=${integrationKey}&redirect_uri=${encodeURIComponent(redirect)}`
      throw new Error(
        'Consentement DocuSign requis : l’utilisateur au nom duquel Kimatch envoie les enveloppes ' +
          'doit autoriser l’application, une fois pour toutes. Ouvrez ce lien en étant connecté à ' +
          `DocuSign avec CE compte, puis cliquez « Accept » : ${url} — si DocuSign répond que ` +
          `l’URL de redirection est invalide, ajoutez « ${redirect} » dans les Redirect URIs de ` +
          'l’application (Settings > Apps and Keys), ou renseignez DOCUSIGN_REDIRECT_URI avec une ' +
          'valeur déjà enregistrée.',
      )
    }
    throw new Error(`DocuSign token error: ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }
  return data.access_token
}

interface DocusignContext {
  accessToken: string
  accountId: string
  baseUri: string
}

export async function getDocusignContext(): Promise<DocusignContext> {
  const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com'
  const accountIdEnv = requireEnv('DOCUSIGN_ACCOUNT_ID')
  const accessToken = await getJwtAccessToken()

  const res = await fetch(`${baseUrl}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = (await res.json()) as { accounts?: { account_id: string; base_uri: string; is_default: boolean }[] }
  if (!res.ok || !data.accounts) throw new Error('DocuSign userinfo failed')
  const account = data.accounts.find((a) => a.account_id === accountIdEnv) ?? data.accounts.find((a) => a.is_default) ?? data.accounts[0]
  if (!account) throw new Error('Aucun compte DocuSign associé à cet utilisateur')
  return { accessToken, accountId: account.account_id, baseUri: account.base_uri }
}

export interface SendEnvelopeDocument {
  pdfBase64: string
  fileName: string
}

export interface SendEnvelopeInput {
  documents: SendEnvelopeDocument[]
  signerEmail: string
  signerName: string
  emailSubject: string
  emailMessage?: string
  customFields?: { name: string; value: string }[]
  /** Si vrai, l'enveloppe est créée en BROUILLON ("created") -- un humain doit ensuite l'envoyer
   * depuis l'éditeur DocuSign (Sender View), jamais un envoi 100% automatique. Même comportement
   * que Tools, sur demande explicite (04/08/2026) -- avant ça Kimatch envoyait direct ("sent"). */
  draft?: boolean
  returnUrl?: string
}

export interface SendEnvelopeResult {
  envelopeId: string
  status: string
  senderViewUrl?: string
}

export async function sendEnvelope(ctx: DocusignContext, input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  const envelope = {
    emailSubject: input.emailSubject,
    emailBlurb: input.emailMessage ?? '',
    status: input.draft ? 'created' : 'sent',
    documents: input.documents.map((d, i) => ({ documentBase64: d.pdfBase64, name: d.fileName, fileExtension: 'pdf', documentId: String(i + 1) })),
    customFields: input.customFields?.length
      ? { textCustomFields: input.customFields.map((cf) => ({ name: cf.name, value: cf.value, required: 'false', show: 'false' })) }
      : undefined,
    recipients: {
      signers: [
        {
          email: input.signerEmail,
          name: input.signerName,
          recipientId: '1',
          routingOrder: '1',
          localePolicy: { languageCode: 'fr', cultureName: 'fr-FR' },
          // Ancres à motif rare (convention DocuSign classique, reprise de Tools) plutôt que des
          // mots ordinaires ("Signature", "Date") : le texte légal du mandat contient lui-même
          // ces mots en prose ("date de signature", etc.), ce qui créerait de faux tabs partout
          // si on ancrait sur les mots eux-mêmes.
          tabs: {
            signHereTabs: [{ anchorString: '\\s1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8' }],
            dateSignedTabs: [{ anchorString: '\\d1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8', font: 'Arial', fontSize: 'Size8' }],
          },
        },
      ],
    },
  }

  const res = await fetch(`${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  })
  const data = (await res.json()) as { envelopeId?: string; status?: string; message?: string; errorCode?: string }
  if (!res.ok || !data.envelopeId) {
    throw new Error(`DocuSign envelope creation failed: ${data.errorCode ?? res.status} — ${data.message ?? ''}`)
  }

  let senderViewUrl: string | undefined
  if (input.draft) {
    const viewRes = await fetch(`${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes/${data.envelopeId}/views/sender`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: input.returnUrl ?? 'https://kimatch.fr' }),
    })
    const viewData = (await viewRes.json()) as { url?: string; message?: string }
    if (viewRes.ok && viewData.url) senderViewUrl = viewData.url
  }

  return { envelopeId: data.envelopeId, status: data.status ?? (input.draft ? 'created' : 'sent'), senderViewUrl }
}
