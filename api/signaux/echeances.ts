import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * Crée chaque nuit les signaux d'échéance — le premier observateur automatique de Kimatch.
 *
 * Diapositive 9 de Michel : « 1 • DÉTECTER — CRÉATION AUTOMATIQUE. Kimatch observe le patrimoine et
 * les interactions : échéance, contrat, consommation, appel, e-mail, rendez-vous ou demande client. »
 * Jusqu'ici rien n'observait quoi que ce soit : les 864 signaux en base viennent tous de la reprise
 * Salesforce, et la première étape de sa chaîne était vide.
 *
 * SES DEUX RÉPONSES DU 24/08/2026 À 22:05, qui commandent tout ce fichier :
 *
 *   « Combien de mois avant l'échéance on crée le signal ? » → DOUZE MOIS.
 *   « Le signal doit être accroché à un CONTACT et ensuite analyse les sites (compteurs) liés à ce
 *     contact pour créer un signal. »
 *
 * UN SIGNAL PAR CONTACT, PAS PAR COMPTEUR — et ce n'est pas un détail. Mesuré en production :
 * 1 065 compteurs arrivent à échéance dans les douze mois, mais ils appartiennent à 593 contacts.
 * Accrocher le signal au compteur produirait presque le double d'appels pour les mêmes
 * conversations. Le commercial appelle une personne ; le commentaire du signal liste ses compteurs.
 *
 * 45 COMPTEURS NE PRODUISENT AUCUN SIGNAL, et la réponse le dit à chaque passage. Ils n'ont de
 * contact ni sur le compteur, ni sur leur compte : sans contact, pas de signal, c'est sa règle. Ce
 * sont exactement les cas de sa diapositive 7 — le patrimoine à réactiver.
 *
 * L'IDEMPOTENCE EST PORTÉE PAR LA BASE. `signaux.cle_generation` a un index unique partiel
 * (migration 20260824190000), et la clé décrit LE FAIT : le contact, et l'échéance la plus proche de
 * ses compteurs. Deux exécutions qui se croisent n'insèrent donc rien deux fois, et une échéance
 * repoussée produit légitimement un nouveau signal. Répété sur la base de production le 24/08/2026
 * dans une transaction annulée : première passe 593 signaux, deuxième passe 0.
 *
 * DEUXIÈME GARDE-FOU, celui du bon sens : on n'ouvre pas de signal à un contact qui en a déjà un
 * ouvert. Sans lui, un contact dont deux compteurs arrivent à échéance à trois mois d'écart recevrait
 * deux signaux successifs, et le commercial appellerait deux fois pour la même conversation.
 *
 * LE MÊME CALCUL EXISTE EN SCRIPT — `scripts/generer-signaux-echeance.cjs`, à blanc par défaut, pour
 * regarder ce que la nuit va produire avant de la laisser faire, et pour rattraper un retard sans
 * attendre 3 h du matin. Deux chemins pour une règle, c'est un risque de divergence : la règle tient
 * en trois conditions, elles sont écrites ici et là avec les mêmes mots, et tout changement doit
 * toucher les deux fichiers.
 */

/** Douze mois, la réponse de Michel. Réglable par la requête pour un rattrapage ponctuel. */
const MOIS_PAR_DEFAUT = 12

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // LA GARDE, reprise à l'identique de api/mandats/expirer.ts. `x-vercel-cron` n'est PAS une
  // barrière — n'importe qui peut poser cet en-tête, vérifié le 21/08/2026 au curl. La barrière est
  // `CRON_SECRET`, que Vercel envoie lui-même en Authorization: Bearer sur ses invocations.
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
  } else {
    if (!req.headers['x-vercel-cron']) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
    console.warn('[cron] CRON_SECRET non définie : cette tâche est déclenchable par n’importe qui')
  }

  const moisDemandes = Number(req.query.mois ?? MOIS_PAR_DEFAUT)
  const mois = Number.isFinite(moisDemandes) && moisDemandes >= 1 && moisDemandes <= 60 ? moisDemandes : MOIS_PAR_DEFAUT

  const admin = clientService()

  // ── Le référentiel d'abord : sans le type ni le statut, on n'écrit rien plutôt que d'inventer ──
  const [{ data: types }, { data: statuts }] = await Promise.all([
    admin.from('types_signaux').select('id, code').eq('code', 'ECHEANCE_CONTRAT'),
    admin.from('statuts_signaux').select('id, code').in('code', ['NOUVEAU', 'A_QUALIFIER']),
  ])
  const typeId = types?.[0]?.id
  const statutNouveau = statuts?.find((s) => s.code === 'NOUVEAU')?.id
  if (!typeId || !statutNouveau) {
    console.error('[signaux/echeances] référentiel incomplet : ECHEANCE_CONTRAT ou NOUVEAU introuvable')
    res.status(500).json({ error: 'Référentiel incomplet' })
    return
  }

  const jour = new Date()
  const debut = jour.toISOString().slice(0, 10)
  const borne = new Date(jour)
  borne.setMonth(borne.getMonth() + mois)
  const fin = borne.toISOString().slice(0, 10)

  // ── Les compteurs dans l'horizon, avec leur site et le compte du site ──────────────────────────
  const { data: compteurs, error: erreurCompteurs } = await admin
    .from('compteurs')
    .select('id, numero_point, site_id, date_echeance, responsable_contact_id, site:sites(nom, compte_id)')
    .eq('actif', true)
    .not('date_echeance', 'is', null)
    .gte('date_echeance', debut)
    .lte('date_echeance', fin)
    .order('date_echeance')
  if (erreurCompteurs) {
    res.status(500).json({ error: erreurCompteurs.message })
    return
  }

  type Ligne = {
    id: string
    numero_point: string
    site_id: string
    date_echeance: string
    responsable_contact_id: string | null
    site: { nom: string; compte_id: string } | { nom: string; compte_id: string }[] | null
  }
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const lignes = (compteurs ?? []) as Ligne[]

  // ── Le contact principal des comptes concernés, pour les compteurs sans responsable ────────────
  //
  // LE CONTACT SE CHERCHE À DEUX NIVEAUX. Le responsable du compteur d'abord — le plus précis, et
  // renseigné sur 955 des 1 065 cas. À défaut le contact principal actif du compte : 65 cas de plus.
  const comptesADemander = [
    ...new Set(
      lignes
        .filter((l) => !l.responsable_contact_id)
        .map((l) => un(l.site)?.compte_id)
        .filter((v): v is string => !!v),
    ),
  ]
  const principalParCompte = new Map<string, string>()
  if (comptesADemander.length) {
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, compte_id, contact_principal, date_creation')
      .in('compte_id', comptesADemander)
      .eq('actif', true)
      .order('contact_principal', { ascending: false })
      .order('date_creation')
    for (const c of contacts ?? []) {
      const cle = c.compte_id as string
      if (!principalParCompte.has(cle)) principalParCompte.set(cle, c.id as string)
    }
  }

  // ── Regroupement par contact ──────────────────────────────────────────────────────────────────
  const parContact = new Map<string, Ligne[]>()
  const orphelins: Ligne[] = []
  for (const l of lignes) {
    const contactId = l.responsable_contact_id ?? principalParCompte.get(un(l.site)?.compte_id ?? '') ?? null
    if (!contactId) {
      orphelins.push(l)
      continue
    }
    parContact.set(contactId, [...(parContact.get(contactId) ?? []), l])
  }

  // ── Les contacts qui ont déjà un signal d'échéance ouvert ─────────────────────────────────────
  const { data: ouverts } = await admin
    .from('signaux')
    .select('contact_id, statut:statuts_signaux(code)')
    .eq('type_signal_id', typeId)
    .not('contact_id', 'is', null)
  const dejaOuverts = new Set(
    (ouverts ?? [])
      .filter((s) => {
        const code = un(s.statut as { code: string } | { code: string }[] | null)?.code
        return code === 'NOUVEAU' || code === 'A_QUALIFIER'
      })
      .map((s) => s.contact_id as string),
  )

  const dateFr = (iso: string) => iso.split('-').reverse().join('/')

  const aCreer = []
  let ignores = 0
  for (const [contactId, liste] of parContact) {
    if (dejaOuverts.has(contactId)) {
      ignores++
      continue
    }
    // La plus proche échéance décide de la date du signal ET de sa clé : c'est elle qui rend le
    // dossier urgent, et c'est elle qui change quand la situation change.
    const plusProche = liste[0]
    const detail = liste
      .slice(0, 10)
      .map((l) => `· ${l.numero_point} — ${un(l.site)?.nom ?? 'site inconnu'} — échéance le ${dateFr(l.date_echeance)}`)
    const reste = liste.length - detail.length
    aCreer.push({
      type_signal_id: typeId,
      statut_id: statutNouveau,
      contact_id: contactId,
      site_id: plusProche.site_id,
      compteur_id: plusProche.id,
      date_detection: debut,
      origine: 'AUTOMATIQUE',
      cle_generation: `ECHEANCE:${contactId}:${plusProche.date_echeance}`,
      actif: true,
      commentaire: [
        `${liste.length} point${liste.length > 1 ? 's' : ''} de livraison arrive${liste.length > 1 ? 'nt' : ''} à échéance dans les ${mois} prochains mois :`,
        ...detail,
        reste > 0 ? `· et ${reste} autre${reste > 1 ? 's' : ''}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  }

  let crees = 0
  if (aCreer.length) {
    // `ignoreDuplicates` sur la clé de génération : c'est l'index unique partiel qui garantit
    // l'unicité, pas une lecture préalable — deux exécutions qui se croisent ne peuvent donc pas
    // créer le même signal deux fois.
    const { data, error } = await admin
      .from('signaux')
      .upsert(aCreer, { onConflict: 'cle_generation', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error('[signaux/echeances] insertion refusée', error.message)
      res.status(500).json({ error: error.message })
      return
    }
    crees = (data ?? []).length
  }

  // Journalisé nommément : un signal créé déclenche un appel client, il faut pouvoir dire pourquoi
  // sans relire la base.
  console.log('[signaux/echeances]', {
    horizon_mois: mois,
    compteurs: lignes.length,
    contacts: parContact.size,
    crees,
    deja_ouverts: ignores,
    sans_contact: orphelins.length,
  })

  res.status(200).json({
    ok: true,
    horizon_mois: mois,
    compteurs_dans_horizon: lignes.length,
    contacts_concernes: parContact.size,
    signaux_crees: crees,
    contacts_deja_en_cours: ignores,
    // Dit et non tu : ces compteurs n'auront jamais de signal tant qu'aucun contact ne les porte.
    compteurs_sans_contact: orphelins.length,
  })
}
