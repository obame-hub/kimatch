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

/**
 * Codes que DocuSign renvoie quand le compte connecté existe mais n'a pas le droit d'envoyer.
 *
 * Cas attendu : chaque conseiller est censé avoir une licence d'expéditeur (confirmé le 13/08/2026),
 * mais une arrivée récente ou une licence non attribuée produit exactement cette erreur — au moment
 * de créer l'enveloppe, pas à la connexion, puisque se connecter ne demande aucune licence.
 *
 * La liste couvre les formulations que DocuSign emploie selon l'origine du refus (appartenance au
 * compte, permissions du profil, envoi désactivé) : un seul code ne suffirait pas, et se rabattre
 * sur le message anglais brut laisserait la personne sans savoir quoi faire.
 */
const CODES_SANS_LICENCE = new Set([
  'USER_LACKS_MEMBERSHIP',
  'USER_LACKS_PERMISSIONS',
  'ACCOUNT_LACKS_PERMISSIONS',
  'USER_DOES_NOT_BELONG_TO_SPECIFIED_ACCOUNT',
  'USER_NOT_ENVELOPE_SENDER',
  'SENDING_NOT_ALLOWED',
  'ENVELOPE_SENDING_DISABLED',
])

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
  /**
   * Poser les champs de signature par ANCRES, ou laisser l'expediteur les placer.
   *
   * Les ancres `\s1\`, `\d1\`, `\l1\` sont imprimees dans le PDF par `mandatPdf.ts` : elles ne
   * valent que pour un document que NOUS fabriquons. Un contrat vient du fournisseur et ne les
   * contient pas -- ancrer dessus ne poserait aucun champ, et le signataire recevrait un document
   * sans nulle part ou signer.
   *
   * Pour ces documents-la, on cree un brouillon sans champ et l'expediteur les place lui-meme dans
   * DocuSign. Naoelle, 21/08/2026 : « il faut envoyer au signataire mais bien sur ouvrir DocuSign
   * pour verifier avant et bien placer toutes les ancres. »
   */
  ancres?: boolean
}

export interface SendEnvelopeResult {
  envelopeId: string
  status: string
  senderViewUrl?: string
}

/**
 * CHAQUE ENVELOPPE PORTE SA PROPRE DEMANDE DE NOTIFICATION.
 *
 * ── LE PROBLÈME QUE ÇA RÈGLE ──────────────────────────────────────────────────────────────────
 *
 * Le passage automatique au statut « Signé » repose sur une notification que DocuSign nous envoie à
 * la seconde où le signataire termine. Jusqu'ici, cette notification dépendait UNIQUEMENT d'une
 * configuration « Connect » posée à la main dans l'administration DocuSign : une case cochée dans
 * une interface qui ne vit pas dans ce dépôt, que personne dans Kimatch ne peut voir, et dont
 * personne ne sait dire si elle est encore là.
 *
 * Elle a déjà lâché deux fois, avec le même symptôme : rien du tout, en silence. Michel, le
 * 31/08/2026 : un contrat signé par la cliente affichait encore « pas encore envoyée ». Cinq
 * mandats étaient dans le même état, dont un depuis dix-sept jours.
 *
 * DEPUIS DOCUSIGN, ON PEUT DEMANDER LA NOTIFICATION ENVELOPPE PAR ENVELOPPE. C'est ce bloc. La
 * demande voyage avec l'enveloppe : elle ne peut plus être décochée par erreur, ni oubliée lors
 * d'un changement de compte DocuSign, et elle se lit ici, dans le code, au lieu de se deviner.
 *
 * ── TROIS DÉTAILS QUI DÉCIDENT SI ÇA MARCHE ───────────────────────────────────────────────────
 *
 * `eventData: { version: 'restv2.1', format: 'json' }` est OBLIGATOIRE. Sans lui, DocuSign envoie
 * l'ancien format XML (`DocuSignEnvelopeInformation`), que notre webhook ne sait pas lire : il y
 * chercherait `data.envelopeId` et ne trouverait rien. La notification arriverait, et serait
 * ignorée — soit exactement la panne qu'on répare, en plus difficile à voir.
 *
 * `requireAcknowledgment: 'true'` fait REESSAYER DocuSign quand notre réponse n'est pas un 200 :
 * un déploiement en cours, une fonction froide qui dépasse le délai, une coupure réseau ne coûtent
 * plus la signature. Sans cet indicateur, une notification ratée est perdue pour toujours.
 *
 * L'ADRESSE EST CELLE DU DOMAINE STABLE, jamais celle du déploiement courant. `VERCEL_URL` change
 * à chaque mise en production : une enveloppe créée aujourd'hui et signée dans trois semaines
 * notifierait un déploiement périmé. `kimatch.fr` vivra plus longtemps que l'enveloppe.
 */
function demandeDeNotification() {
  const hote = process.env.KIMATCH_URL_PUBLIQUE?.replace(/\/+$/, '') || 'https://kimatch.fr'
  return {
    url: `${hote}/api/docusign/webhook`,
    loggingEnabled: 'true',
    requireAcknowledgment: 'true',
    includeDocuments: 'false',
    includeCertificateOfCompletion: 'false',
    eventData: { version: 'restv2.1', format: 'json', includeData: ['custom_fields'] },
    // Les cinq événements que le webhook sait traduire, et aucun de plus : un événement qu'on
    // ignore n'est pas gratuit, il réveille une fonction pour rien.
    envelopeEvents: [
      { envelopeEventStatusCode: 'sent' },
      { envelopeEventStatusCode: 'delivered' },
      { envelopeEventStatusCode: 'completed' },
      { envelopeEventStatusCode: 'declined' },
      { envelopeEventStatusCode: 'voided' },
    ],
  }
}

export async function sendEnvelope(ctx: DocusignContext, input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  const envelope = {
    emailSubject: input.emailSubject,
    emailBlurb: input.emailMessage ?? '',
    status: input.draft ? 'created' : 'sent',
    /* LA NOTIFICATION EST DEMANDÉE MÊME SUR UN BROUILLON — et c'est justement le cas qui compte.
       Un brouillon est envoyé plus tard, à la main, depuis DocuSign : c'est le moment où Kimatch
       perd la trace, puisque ce n'est plus lui qui agit. La demande posée dès la création couvre
       donc l'envoi fait par quelqu'un d'autre, dans une autre fenêtre, une heure plus tard. */
    eventNotification: demandeDeNotification(),
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
          //
          // `ancres: false` n'en pose aucune : voir le commentaire de l'option.
          tabs: input.ancres === false ? undefined : {
            signHereTabs: [{ anchorString: '\\s1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8' }],
            dateSignedTabs: [{ anchorString: '\\d1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8', font: 'Arial', fontSize: 'Size8' }],
            // Le lieu de signature : un champ libre, obligatoire, ancre sur « Lieu : » du mandat
            // KiWee. Sans ce tab, DocuSign n'affichait aucune zone de saisie et le signataire
            // voyait un libelle sans « encre » (signale le 14/08/2026). `required` parce qu'un
            // mandat sans lieu de signature est incomplet au sens de l'article 1367 du code civil.
            textTabs: [
              // Deux ancres, une par document : \l1\ sur le mandat KiWee, \l2\ sur l'Energix. Un
              // meme anchorString poserait un champ sur CHAQUE occurrence trouvee dans l'enveloppe,
              // donc deux champs lies au meme endroit ; deux ancres distinctes donnent un champ par
              // document, chacun a sa place.
              {
                anchorString: '\\l1\\',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '-8',
                tabLabel: 'lieu_signature',
                name: 'Lieu',
                width: 120,
                required: 'true',
                font: 'Arial',
                fontSize: 'Size8',
              },
              {
                anchorString: '\\l2\\',
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '-8',
                tabLabel: 'lieu_signature_energix',
                name: 'Lieu',
                width: 120,
                required: 'true',
                font: 'Arial',
                fontSize: 'Size8',
              },
            ],
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
    // Compte DocuSign sans droit d'envoi : le cas se produit quand la personne s'est bien connectée
    // (elle a un compte DocuSign) mais n'a pas de licence d'expéditeur dans l'organisation. Le
    // message brut de DocuSign est en anglais et ne dit pas quoi faire ; l'erreur n'est pas dans
    // Kimatch, elle se règle par l'administrateur DocuSign.
    if (data.errorCode && CODES_SANS_LICENCE.has(data.errorCode)) {
      throw new Error(
        `Votre compte DocuSign (${ctx.emetteur ?? 'compte connecté'}) n’a pas le droit d’envoyer des enveloppes : ` +
          'il lui manque une licence d’expéditeur. Demandez à l’administrateur DocuSign de KiWee de vous en ' +
          `attribuer une, puis relancez la signature depuis la fiche du mandat. (Code DocuSign : ${data.errorCode}.)`,
      )
    }
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
