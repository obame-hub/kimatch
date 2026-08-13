import { clientService, sessionUtilisable } from './_oauth.js'

// Appel de l API DocuSign une fois la session de l utilisateur obtenue. Tout ce qui concerne
// l autorisation (flot OAuth, jetons, rafraichissement) est dans _oauth.ts.
//
// Ce fichier portait jusqu au 13/08/2026 la signature d un JWT RSA au nom d un compte central,
// avec pres de cent lignes de normalisation de cle PEM. Le passage a une session par utilisateur
// rend tout cela sans objet : le flot Authorization Code Grant n utilise aucune cle privee. Voir
// le commit correspondant si ce code doit reservir un jour (envois automatiques sans utilisateur
// derriere, par exemple).

interface DocusignContext {
  accessToken: string
  accountId: string
  baseUri: string
  /** Adresse du compte DocuSign qui émet — celle du conseiller, pas un compte central. */
  emetteur: string | null
}

/**
 * Contexte DocuSign de L'UTILISATEUR qui déclenche l'envoi.
 *
 * Depuis le 13/08/2026, sur demande de William, chaque conseiller autorise DocuSign avec son propre
 * compte (voir _oauth.ts et la migration docusign_par_utilisateur) : l'enveloppe part de son
 * compte, le client reçoit un e-mail de sa part, et la piste d'audit porte son nom.
 *
 * Il n'y a volontairement AUCUN repli vers le compte central : un repli silencieux ferait croire à
 * un envoi personnel là où l'enveloppe serait partie sous une autre identité. Sans session, l'appel
 * échoue avec NON_CONNECTE et le front propose la connexion.
 */
export async function getDocusignContext(profilId: string): Promise<DocusignContext> {
  const session = await sessionUtilisable(clientService(), profilId)
  return {
    accessToken: session.access_token,
    accountId: session.account_id,
    baseUri: session.base_uri,
    emetteur: session.docusign_email,
  }
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
