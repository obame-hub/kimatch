import type { VercelRequest, VercelResponse } from '@vercel/node'
/* L'EXTENSION `.js` EST OBLIGATOIRE ICI, et son absence a coupé DocuSign.
 *
 * Le projet est en `"type": "module"` : Node résout les imports relatifs en ESM strict, où un chemin
 * sans extension n'existe pas. La fonction ne démarrait donc pas du tout — Vercel répondait
 * FUNCTION_INVOCATION_FAILED en 500 à CHAQUE notification DocuSign, et aucune signature ne remontait.
 *
 * Introduit le 30/08/2026 en extrayant ces trois fonctions dans `_decision.ts`. Les 24 autres
 * imports relatifs de `api/` portent tous leur `.js` ; celui-ci était le seul sans.
 *
 * POURQUOI RIEN NE L'A VU : le build passe, le lint passe, et les tests passent — Vitest résout les
 * chemins comme un bundler, pas comme Node. Seul le runtime déployé échoue. C'est le pire genre de
 * régression, et la seule défense est d'appeler l'URL après déploiement. */
import { verifierSignature, statutPourEnveloppe, doitEcrire } from './_decision.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionQuelconque } from './_oauth.js'
import { runGrdSyncForMandat } from './_grdSync.js'
import { sendMandatSignedEmail } from './_gmailNotify.js'
import { postMessage, joinChannel } from '../slack/_client.js'
import { NOM_SIGNE, retirerDocumentsEnvoyes } from './_archivage.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

/**
 * Vercel analyse le corps JSON et remplit `req.body` par defaut. Il faut l'en empecher : la
 * signature HMAC de DocuSign porte sur les octets EXACTS envoyes, et re-serialiser l'objet
 * analyse ne les redonne pas (espaces, echappements, ordre). C'est ce que faisait ce fichier :
 * toute notification etait rejetee en 401, donc aucun mandat ne passait a « Envoye » ni a
 * « Signe ». Constate le 14/08/2026 sur CABINET MOLINIER -- l'enveloppe etait `completed` chez
 * DocuSign depuis 12:22 alors que le mandat restait « A preparer ».
 */
export const config = { api: { bodyParser: false } }

/** Lit le corps de la requete tel qu'il est arrive, sans transformation. */
async function lireCorpsBrut(req: VercelRequest): Promise<string> {
  const morceaux: Buffer[] = []
  for await (const morceau of req) morceaux.push(typeof morceau === 'string' ? Buffer.from(morceau) : (morceau as Buffer))
  return Buffer.concat(morceaux).toString('utf8')
}

// CE QUE DIT DOCUSIGN. Ces codes decrivent le sort de l'ENVELOPPE, pas celui du mandat : voir
// `statutAEcrire` plus bas, qui traduit une signature en mandat actif.
//
// `voided` renvoyait vers 'REVOQUE', un code qui n'existe pas dans `statuts_mandats` -- la table ne
// connait que ANNULE. La recherche ne trouvait rien, `statutRow` restait nul et le statut n'etait
// tout simplement pas ecrit : une enveloppe annulee chez DocuSign laissait le mandat en « Envoye »,
// indefiniment.
const STATUT_CODE_PAR_EVENEMENT: Record<string, string> = {
  sent: 'ENVOYE',
  delivered: 'ENVOYE',
  completed: 'SIGNE',
  declined: 'REFUSE',
  voided: 'ANNULE',
}

/**
 * Le statut a inscrire sur le mandat, a partir de ce que dit DocuSign.
 *
 * UNE SIGNATURE REND LE MANDAT ACTIF. Signale par Michel le 21/08/2026 : « c'est signe, mais il est
 * toujours pas actif. Ce qui fait que je reviens ici pour dire tiens, je vais creer une
 * recommandation, et ca ne montre pas ce compte. Il faut savoir comment basculer automatiquement le
 * mandat au mandat actif. »
 *
 * Rien, nulle part, ne faisait passer un mandat de Signe a Actif : ni ce webhook, ni l'application,
 * ni un declencheur en base, ni une tache planifiee -- verifie le 21/08/2026. Les 1075 mandats
 * Actifs venaient tous de la reprise Salesforce, ou ils arrivaient deja actifs. Autrement dit AUCUN
 * mandat signe dans Kimatch n'a jamais pu servir : trois etaient bloques a Signe.
 *
 * Or toute l'application se fonde sur `statut === 'ACTIF'` -- la liste des comptes du wizard de
 * recommandation, la sante d'un site, la matrice de couverture, les compteurs deja couverts, l'etat
 * « pret pour une recommandation » d'un compte. Un mandat qui reste a Signe est donc un mandat
 * invisible, alors qu'il est signe.
 *
 * ON N'ATTEND PAS DE VALIDATION MANUELLE. C'est la demande explicite de Michel, et rien dans le
 * metier n'en appelle une : le mandat entre en vigueur a sa signature. La date de signature reste
 * ecrite et le PDF signe reste archive, donc la trace du passage par la signature ne se perd pas.
 *
 * La fenetre de validite est posee a la creation -- debut a la date du jour, fin a debut + duree --
 * et la signature arrive necessairement apres. Elle couvre donc le jour de la signature, et le
 * mandat est actif tout de suite. Un mandat qui serait signe hors de sa fenetre reste a Signe : il
 * n'est pas en vigueur, ce serait mentir que de l'annoncer actif.
 */
function statutAEcrire(
  statutDocusign: string,
  fenetre: { debut: string | null; fin: string | null },
): string {
  if (statutDocusign !== 'SIGNE') return statutDocusign
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const commence = !fenetre.debut || fenetre.debut <= aujourdhui
  const courtEncore = !fenetre.fin || fenetre.fin >= aujourdhui
  return commence && courtEncore ? 'ACTIF' : 'SIGNE'
}

interface ConnectPayload {
  event?: string
  data?: {
    envelopeId?: string
    envelopeSummary?: { status?: string; completedDateTime?: string }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const corpsBrut = await lireCorpsBrut(req)

  // La signature HMAC ne fait plus autorite a elle seule.
  //
  // Elle a bloque toutes les notifications pendant des semaines : 25 echecs enregistres cote
  // DocuSign, tous en 401, dont l'enveloppe signee de CABINET MOLINIER. Deux causes se sont
  // succedees -- la verification portait sur une re-serialisation du corps au lieu des octets
  // recus, puis la cle DOCUSIGN_CONNECT_HMAC_SECRET s'est revelee differente de celle configuree
  // dans Connect. Dans les deux cas le resultat etait le meme : aucun mandat ne passait a « Signe »,
  // en silence, et personne ne pouvait le deviner depuis l'application.
  //
  // On ne fait donc plus confiance au CONTENU de la notification, signee ou non : on en extrait le
  // seul identifiant d'enveloppe, puis on demande son vrai statut a DocuSign. Une notification
  // forgee ne peut alors rien affirmer -- au pire elle declenche une resynchronisation d'un mandat
  // existant avec la verite de DocuSign. Une signature valide reste un bon signe, elle est
  // journalisee, mais son absence ne fait plus perdre un statut.
  const secret = process.env.DOCUSIGN_CONNECT_HMAC_SECRET
  const signatureValide = secret
    ? verifierSignature(corpsBrut, req.headers['x-docusign-signature-1'] as string | undefined, secret)
    : null

  let payload: ConnectPayload
  try {
    payload = JSON.parse(corpsBrut) as ConnectPayload
  } catch {
    res.status(400).json({ error: 'Corps JSON illisible' })
    return
  }
  const envelopeId = payload?.data?.envelopeId
  if (!envelopeId) {
    res.status(200).json({ ok: true, skipped: true, reason: 'aucun identifiant d’enveloppe' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase (service role) non configuré côté serveur' })
    return
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // L'enveloppe doit correspondre a un mandat connu : c'est la premiere barriere, avant meme
    // d'appeler DocuSign.
    const { data: mandatConnu } = await admin
      .from('mandats')
      .select(
        'id, cree_par_id, proprietaire_id, date_debut_validite, date_fin_validite, statut:statuts_mandats(code, ordre)',
      )
      .eq('docusign_envelope_id', envelopeId)
      .maybeSingle()
    // UNE ENVELOPPE PEUT PORTER UN CONTRAT et non un mandat, depuis le 21/08/2026. On regarde donc
    // du cote des contrats avant de conclure qu'on ne connait pas l'enveloppe.
    //
    // Le traitement d'un contrat s'arrete ici : on inscrit son statut de signature et ses dates, et
    // rien de plus. L'archivage du signe, la synchro GRD et les notifications sont propres au
    // mandat -- un contrat signe ne declenche pas de demande de donnees aupres du gestionnaire de
    // reseau, c'est le mandat qui y donne droit.
    if (!mandatConnu) {
      const { data: contrat } = await admin
        .from('contrats')
        .select('id, statut_signature')
        .eq('docusign_envelope_id', envelopeId)
        .maybeSingle()
      if (contrat) {
        const session = await sessionQuelconque(admin, null)
        if (!session) {
          console.error('[docusign webhook] aucune session pour verifier le contrat', { envelopeId })
          res.status(200).json({ ok: true, skipped: true, reason: 'aucune session DocuSign pour vérifier' })
          return
        }
        const envRes = await fetch(
          `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        )
        const env = (await envRes.json()) as { status?: string; completedDateTime?: string; sentDateTime?: string }
        if (!envRes.ok || !env.status) {
          res.status(502).json({ error: 'Statut DocuSign illisible' })
          return
        }
        const statutSignature = statutPourEnveloppe(env.status)
        if (!statutSignature) {
          res.status(200).json({ ok: true, skipped: true, reason: `statut ${env.status} ignoré` })
          return
        }
        // Une signature ne se defait pas : un rejeu de notification ne doit pas ramener un contrat
        // signe a « envoye ».
        if (!doitEcrire(contrat.statut_signature, statutSignature)) {
          res.status(200).json({ ok: true, skipped: true, reason: 'statut conservé' })
          return
        }
        const { error: eContrat } = await admin
          .from('contrats')
          .update({
            statut_signature: statutSignature,
            ...(env.sentDateTime ? { date_envoi_signature: env.sentDateTime } : {}),
            ...(statutSignature === 'SIGNE'
              ? { date_signature: env.completedDateTime ?? new Date().toISOString() }
              : {}),
            date_modification: new Date().toISOString(),
          })
          .eq('id', contrat.id)
        if (eContrat) {
          res.status(502).json({ error: eContrat.message })
          return
        }
        // LE CONTRAT SIGNÉ REVIENT SUR LA FICHE, comme le mandat signé. Naoëlle, 21/08/2026 :
        // « comme mandat, on remplace le fichier avec le fichier signé. »
        //
        // Best-effort assume : l'enveloppe est signée chez DocuSign, le statut est déjà inscrit. Si
        // le téléchargement échoue, on journalise et on rend la main plutôt que de faire rejouer la
        // notification indéfiniment.
        if (statutSignature === 'SIGNE') {
          try {
            const { data: porteur } = await admin
              .from('contrats')
              .select('compte:comptes(nom)')
              .eq('id', contrat.id)
              .maybeSingle()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const compteNom = (porteur as any)?.compte?.nom ?? 'contrat'
            await archiverContratSigne(admin, session, envelopeId, contrat.id, compteNom)
          } catch (docErr) {
            console.error('[docusign-webhook] archivage du contrat signé échoué', docErr)
          }
        }
        console.log('[docusign webhook] contrat mis a jour', { envelopeId, statutSignature })
        res.status(200).json({ ok: true, envelopeId, objet: 'contrat', statutSignature })
        return
      }
      res.status(200).json({ ok: true, skipped: true, reason: 'enveloppe inconnue' })
      return
    }

    const session = await sessionQuelconque(admin, mandatConnu.proprietaire_id ?? mandatConnu.cree_par_id)
    if (!session) {
      // Sans session DocuSign, impossible de verifier quoi que ce soit. On refuse plutot que
      // d'appliquer un statut non verifie, et on repond 200 pour que DocuSign ne rejoue pas
      // indefiniment une notification que nous ne saurons pas traiter davantage la prochaine fois.
      console.error('[docusign webhook] aucune session DocuSign disponible pour verifier', { envelopeId })
      res.status(200).json({ ok: true, skipped: true, reason: 'aucune session DocuSign pour vérifier' })
      return
    }

    // La verite vient de DocuSign, pas du corps de la requete.
    const envRes = await fetch(`${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const env = (await envRes.json()) as { status?: string; completedDateTime?: string; sentDateTime?: string }
    if (!envRes.ok || !env.status) {
      res.status(502).json({ error: 'Statut DocuSign illisible' })
      return
    }
    const status = env.status
    const statutCode = STATUT_CODE_PAR_EVENEMENT[status]
    console.log('[docusign webhook] enveloppe verifiee', { envelopeId, status, signatureValide })
    if (!statutCode) {
      res.status(200).json({ ok: true, skipped: true, reason: `statut ${status} ignoré` })
      return
    }
    // `statutCode` dit ce qu'est devenue l'enveloppe ; `codeAEcrire` ce que devient le mandat.
    const codeAEcrire = statutAEcrire(statutCode, {
      debut: (mandatConnu.date_debut_validite as string | null) ?? null,
      fin: (mandatConnu.date_fin_validite as string | null) ?? null,
    })
    const { data: statutRow } = await admin
      .from('statuts_mandats')
      .select('id, ordre')
      .eq('code', codeAEcrire)
      .maybeSingle()
    if (!statutRow) {
      // Un code absent du referentiel ne doit pas passer inapercu : c'est exactement ce qui faisait
      // perdre silencieusement les annulations.
      console.error('[docusign webhook] code de statut inconnu du referentiel', {
        envelopeId,
        codeAEcrire,
      })
    }

    // Un statut ne recule jamais. DocuSign ne connait que le sort de l'enveloppe : une fois signee,
    // elle reste « completed » pour toujours. Le mandat, lui, continue sa vie -- il devient Actif,
    // puis Expire. Sans cette garde, chaque notification rejouee ramenait un mandat actif a
    // « Signe » : constate en rattrapant les notifications perdues, ou CABINET ROUMILHAC JOURDAN,
    // Actif depuis son import, est repasse a Signe.
    //
    // Les fins de vie negatives font exception : un refus ou une revocation s'appliquent quel que
    // soit l'avancement, puisqu'ils annulent ce qui precede.
    const statutActuel = (Array.isArray(mandatConnu.statut) ? mandatConnu.statut[0] : mandatConnu.statut) as
      | { code: string; ordre: number }
      | null
    const finNegative = codeAEcrire === 'REFUSE' || codeAEcrire === 'ANNULE'
    const reculerait =
      !finNegative && statutRow && statutActuel != null && statutActuel.ordre >= (statutRow.ordre ?? 0)
    if (reculerait) {
      console.log('[docusign webhook] statut conserve', {
        envelopeId,
        actuel: statutActuel?.code,
        propose: codeAEcrire,
      })
    }
    // Horodatages pris sur l'enveloppe verifiee, pas sur la notification : ce sont les memes que
    // ceux de la piste d'audit DocuSign.
    const dateSignature = statutCode === 'SIGNE' ? (env.completedDateTime ?? new Date().toISOString()) : undefined
    const dateEnvoi = env.sentDateTime ?? undefined
    const { data: mandats, error } = await admin
      .from('mandats')
      .update({
        ...(statutRow && !reculerait ? { statut_id: statutRow.id } : {}),
        ...(dateSignature ? { date_signature: dateSignature } : {}),
        ...(dateEnvoi ? { date_envoi: dateEnvoi } : {}),
      })
      .eq('docusign_envelope_id', envelopeId)
      .select('id, compte_id, proprietaire_id, compte:comptes(nom), proprietaire:profils!mandats_proprietaire_id_fkey(email, prenom, nom)')

    if (error) {
      res.status(502).json({ error: error.message })
      return
    }

    type Raw = {
      id: string
      compte_id: string
      proprietaire_id: string | null
      compte: { nom: string } | { nom: string }[] | null
      proprietaire: { email: string; prenom: string; nom: string } | { email: string; prenom: string; nom: string }[] | null
    }
    const raw = mandats?.[0] as Raw | undefined
    const compteNom = raw ? (Array.isArray(raw.compte) ? raw.compte[0]?.nom : raw.compte?.nom) ?? '(compte inconnu)' : ''
    const proprietaire = raw ? (Array.isArray(raw.proprietaire) ? raw.proprietaire[0] : raw.proprietaire) ?? null : null
    if (statutCode === 'SIGNE' && raw) {
      // Best-effort : la synchro GRD + les notifications ne doivent jamais faire échouer
      // l'accusé de réception du webhook envoyé à DocuSign (sinon DocuSign réessaiera indéfiniment).
      try {
        await archiverDocumentSigne(admin, session, envelopeId, raw.id, compteNom)
      } catch (docErr) {
        console.error('[docusign-webhook] archivage du mandat signé échoué', docErr)
      }
      try {
        const summary = await runGrdSyncForMandat(admin, raw.id)
        await notifyMandatSigne(admin, raw.id, compteNom, summary)
        await emailProprietaire(admin, raw.id, compteNom, proprietaire, summary)
      } catch (syncErr) {
        console.error('[docusign-webhook] synchro GRD post-signature échouée', syncErr)
      }
    }

    res.status(200).json({ ok: true, envelopeId, statutCode, statutEcrit: codeAEcrire })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}

/**
 * Depose le mandat signe dans les fichiers du mandat.
 *
 * Sans cela, le document signe n'existe nulle part dans Kimatch : la configuration Connect est en
 * `includeDocuments: false` (elle transporte les evenements, pas les PDF), et rien n'allait le
 * chercher. Signale le 14/08/2026 : « le mandat n'est nulle part dans le fichier ».
 *
 * On telecharge la version combinee -- tous les documents de l'enveloppe et le certificat de
 * signature en un seul PDF, c'est exactement ce qu'on veut conserver comme preuve.
 *
 * Le depot passe par la cle de service : le bucket « documents » n'accorde aucune ecriture aux
 * utilisateurs, et il n'a pas a en accorder pour cet usage puisque c'est le serveur qui archive.
 */
/**
 * Rapatrie le contrat signé depuis DocuSign et le pose sur la fiche.
 *
 * Deux différences avec le mandat, et elles tiennent à la même cause : le PDF du fournisseur est
 * déjà sur la fiche, déposé par une personne.
 *
 * On n'archive donc AUCUNE copie à l'envoi (voir `send.ts`), et l'on ne retire rien à la signature :
 * le signé s'ajoute au document d'origine. Supprimer un fichier déposé par quelqu'un, depuis un
 * webhook, sur la foi d'une notification extérieure, n'est pas une chose à faire.
 */
async function archiverContratSigne(
  admin: Admin,
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
  contratId: string,
  compteNom: string,
) {
  const NOM = 'Contrat signé'
  // Deja archive : le webhook peut etre rejoue plusieurs fois pour la meme enveloppe.
  const { data: existant } = await admin
    .from('documents')
    .select('id')
    .eq('entite_type', 'contrat')
    .eq('entite_id', contratId)
    .eq('nom', NOM)
    .maybeSingle()
  if (existant) return

  const res = await fetch(
    `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(`téléchargement du contrat signé refusé (${res.status})`)
  const pdf = Buffer.from(await res.arrayBuffer())
  if (!pdf.length) throw new Error('contrat signé vide')

  const url = process.env.VITE_SUPABASE_URL as string
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const nomFichier = `Contrat_signe_${compteNom.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`
  const chemin = `contrats/${contratId}/${nomFichier}`
  const depot = await fetch(`${url}/storage/v1/object/documents/${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: new Uint8Array(pdf),
  })
  if (!depot.ok) throw new Error(`dépôt dans le stockage refusé (${depot.status})`)

  const { data: typeDoc } = await admin.from('types_documents').select('id').eq('code', 'CONTRAT').maybeSingle()
  const { error } = await admin.from('documents').insert({
    ...(typeDoc ? { type_document_id: typeDoc.id } : {}),
    nom: NOM,
    nom_fichier: nomFichier,
    url: `${url}/storage/v1/object/public/documents/${chemin}`,
    mime_type: 'application/pdf',
    taille_octets: pdf.length,
    entite_type: 'contrat',
    entite_id: contratId,
  })
  if (error) throw new Error(error.message)
}

async function archiverDocumentSigne(
  admin: Admin,
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
  mandatId: string,
  compteNom: string,
) {
  // Deja archive : le webhook peut etre rejoue plusieurs fois pour la meme enveloppe.
  const { data: existant } = await admin
    .from('documents')
    .select('id')
    .eq('entite_type', 'mandat')
    .eq('entite_id', mandatId)
    .eq('nom', NOM_SIGNE)
    .maybeSingle()
  if (existant) return

  const res = await fetch(
    `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(`téléchargement du document signé refusé (${res.status})`)
  const pdf = Buffer.from(await res.arrayBuffer())
  if (!pdf.length) throw new Error('document signé vide')

  const url = process.env.VITE_SUPABASE_URL as string
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const nomFichier = `Mandat_signe_${compteNom.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`
  const chemin = `mandats/${mandatId}/${nomFichier}`
  const depot = await fetch(`${url}/storage/v1/object/documents/${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: new Uint8Array(pdf),
  })
  if (!depot.ok) throw new Error(`dépôt dans le stockage refusé (${depot.status})`)

  const { data: typeDoc } = await admin.from('types_documents').select('id').eq('code', 'MANDAT').maybeSingle()
  const { error } = await admin.from('documents').insert({
    ...(typeDoc ? { type_document_id: typeDoc.id } : {}),
    nom: NOM_SIGNE,
    nom_fichier: nomFichier,
    url: `${url}/storage/v1/object/public/documents/${chemin}`,
    mime_type: 'application/pdf',
    taille_octets: pdf.length,
    entite_type: 'mandat',
    entite_id: mandatId,
  })
  if (error) throw new Error(error.message)

  // La version signee REMPLACE la version envoyee, elle ne s'ajoute pas a cote (regle de William).
  // On ne retire l'envoyee qu'une fois la signee bien enregistree : si le depot precedent avait
  // echoue, la fiche garderait au moins ce qui a ete soumis au client.
  await retirerDocumentsEnvoyes(admin, mandatId)
}

async function notifyMandatSigne(
  admin: Admin,
  mandatId: string,
  compteNom: string,
  summary: { succes: string[]; echecs: { pdl: string; error: string }[] },
) {
  const { data: cfg } = await admin.from('parametres_slack').select('channel_id, enabled').eq('module', 'mandat').maybeSingle()
  if (!cfg || !cfg.enabled || !cfg.channel_id) return

  const mandatUrl = `https://kimatch.fr/mandats/${mandatId}`
  const lignes = [`*Mandat signé — <${mandatUrl}|${compteNom}>*`]
  if (summary.succes.length) lignes.push(`✅ Synchronisés : ${summary.succes.join(', ')}`)
  if (summary.echecs.length) lignes.push(`⚠️ Échecs : ${summary.echecs.map((e) => `${e.pdl} (${e.error})`).join(', ')}`)
  const text = `✅ Mandat signé — ${compteNom} — synchro GRD lancée automatiquement`
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: lignes.join('\n') } }]

  let result = await postMessage(cfg.channel_id, text, blocks)
  if (!result.ok && result.error === 'not_in_channel') {
    const join = await joinChannel(cfg.channel_id)
    if (join.ok) result = await postMessage(cfg.channel_id, text, blocks)
  }
  if (!result.ok) console.error('[docusign-webhook] notification Slack mandat échouée', result.error)
}

async function alertGmailDeconnecte(admin: Admin, error: string) {
  const { data: cfg } = await admin.from('parametres_slack').select('channel_id, enabled').eq('module', 'mandat').maybeSingle()
  if (!cfg || !cfg.enabled || !cfg.channel_id) return
  await postMessage(cfg.channel_id, `🔴 Email de récapitulatif mandat non envoyé — ${error}`)
}

async function emailProprietaire(
  admin: Admin,
  mandatId: string,
  compteNom: string,
  proprietaire: { email: string; prenom: string; nom: string } | null,
  summary: { succes: string[]; echecs: { pdl: string; error: string }[] },
) {
  if (!proprietaire?.email) return

  const mandatUrl = `https://kimatch.fr/mandats/${mandatId}`
  const lignes = [
    `Bonjour ${proprietaire.prenom},`,
    '',
    `Le mandat pour ${compteNom} vient d'être signé.`,
    '',
    summary.succes.length ? `PDL synchronisés (Enedis/GRDF) : ${summary.succes.join(', ')}` : 'Aucun PDL synchronisé.',
  ]
  if (summary.echecs.length) {
    lignes.push('', `Échecs de synchro : ${summary.echecs.map((e) => `${e.pdl} (${e.error})`).join(', ')}`)
  }
  lignes.push('', `Voir le mandat : ${mandatUrl}`)

  const result = await sendMandatSignedEmail(admin, {
    to: proprietaire.email,
    subject: `KiWee Énergie — Mandat signé (${compteNom})`,
    text: lignes.join('\n'),
  })
  if (!result.ok) {
    console.error('[docusign-webhook] email récapitulatif mandat échoué', result.error)
    if (result.senderMissing) await alertGmailDeconnecte(admin, result.error)
  }
}
