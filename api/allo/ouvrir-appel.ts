import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleService } from '../_cleService.js'
import { createClient } from '@supabase/supabase-js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * KIMATCH OUVRE LA CARTE D'APPEL LUI-MÊME, SANS ATTENDRE ALLO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 22/09/2026 : « je vois le bloc une fois sur deux, surtout quand je lance un appel direct
 * après. Au pire créons-en un custom à nous, comme ça on est sûr qu'il apparaisse tout le temps, et
 * il apparaît quand quelqu'un lance un appel. »
 *
 * ══ POURQUOI UNE FOIS SUR DEUX — MESURÉ, PAS SUPPOSÉ ══
 *
 * La carte lit `appels_en_cours`, que seul le webhook d'Allo remplissait. Or ce webhook est
 * capricieux : relevé le 22/09, ses trois événements sont arrivés pour certains appels et pas du
 * tout pour d'autres — le téléphone sonnait (constaté à l'écran, « Sonnerie en cours » chez Allo),
 * et AUCUNE ligne n'apparaissait en base. Pas de ligne, pas de carte, quoi qu'on fasse dans
 * l'interface.
 *
 * Et quand il arrive, il prend son temps : de 2 secondes à 372 selon les appels du jour.
 *
 * ══ CE QU'ON FAIT, ET POURQUOI C'EST SÛR ══
 *
 * KIMATCH SAIT QU'IL LANCE L'APPEL — c'est lui qui a cliqué. Il écrit donc la ligne lui-même, et
 * la carte paraît dans la seconde. Quand Allo se réveille, son `call.triggered` retrouve cette
 * ligne par `appelDejaConnu` (même adresse, mêmes neuf derniers chiffres, fenêtre de dix minutes)
 * et l'ENRICHIT au lieu d'en créer une seconde. Le décroché, la durée, l'enregistrement et le
 * résumé arrivent ensuite normalement.
 *
 * ON N'INVENTE RIEN QU'ON NE SACHE : ni `decroche_le`, ni `termine_le`, ni résultat. La carte dira
 * « ça sonne » tant qu'Allo n'a pas dit mieux — ce qui est exactement la vérité.
 *
 * ══ POURQUOI CÔTÉ SERVEUR ET NON DEPUIS LE NAVIGATEUR ══
 *
 * `appels_en_cours` porte une RLS qui n'autorise personne à insérer : la table est alimentée par le
 * webhook, avec la clé de service. Laisser le navigateur écrire dedans demanderait d'ouvrir cette
 * porte à tout le monde, pour une ligne qu'on peut aussi bien créer ici.
 *
 * L'ADRESSE ALLO EST PRISE DU SERVEUR, jamais du corps de la requête : sinon n'importe qui pourrait
 * ouvrir une carte au nom d'un collègue. Même règle que l'ancien `appeler.ts`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface CorpsOuverture {
  /** Le numéro en E.164, normalisé par `numeroInternational` côté navigateur. */
  numero?: string
}

/** Les neuf derniers chiffres — la maille que le webhook utilise pour rapprocher deux appels. */
function neufDerniers(numero: string): string | null {
  const chiffres = numero.replace(/[^0-9]/g, '')
  return chiffres.length >= 9 ? chiffres.slice(-9) : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const numero = ((req.body as CorpsOuverture)?.numero ?? '').trim()
  if (!/^\+\d{8,15}$/.test(numero)) {
    res.status(400).json({ error: 'Numéro attendu au format international.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const cleAdmin = cleService()
  if (!supabaseUrl || !supabaseAnonKey || !cleAdmin) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const authed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await authed.auth.getUser()
  if (userError || !userData.user?.email) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const admin = createClient(supabaseUrl, cleAdmin, { auth: { persistSession: false } })

  /* L'ADRESSE ALLO N'EST PAS TOUJOURS L'ADRESSE KIMATCH : sept membres chez Allo, dix profils ici.
     La carte se cale sur le compte Allo qui passe l'appel — voir `useAppelEnCours`. */
  let emailAllo = userData.user.email
  const { data: adresse } = await admin.rpc('fn_email_allo', { p_profil_id: userData.user.id })
  if (typeof adresse === 'string' && adresse.trim()) emailAllo = adresse.trim()

  const fin = neufDerniers(numero)

  /* ══ ON NE CRÉE PAS DE DOUBLON ══
   *
   * Si Allo a été plus rapide que nous — ça arrive, son webhook met parfois deux secondes — la
   * ligne existe déjà. On la rend telle quelle plutôt que d'en ouvrir une seconde, qui ferait
   * deux cartes pour un seul appel. La fenêtre est celle du webhook : deux minutes suffisent ici,
   * puisqu'on vient de cliquer. */
  const ilYaDeuxMinutes = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: deja } = await admin
    .from('appels_en_cours')
    .select('id')
    .eq('user_email', emailAllo)
    .eq('numero_normalise', fin)
    .is('termine_le', null)
    .gte('demarre_le', ilYaDeuxMinutes)
    .limit(1)

  if (deja?.[0]) {
    res.status(200).json({ ok: true, id: deja[0].id, deja: true })
    return
  }

  /* ══ QUI ON APPELLE, TOUT DE SUITE ══
   *
   * `qui_appelle` (migration 20260921160000) rend le contact, le compte ou la piste à qui appartient
   * ce numéro, en comparant les CHIFFRES SEULS. Sans elle, la carte afficherait « numéro inconnu »
   * pendant que le webhook prend son temps — et c'est précisément ce que Naoëlle a refusé ce matin
   * en voyant la carte provisoire. */
  const { data: quiRows } = await admin.rpc('qui_appelle', { p_numero: numero })
  const qui = Array.isArray(quiRows) ? quiRows[0] : null

  const { data: cree, error } = await admin
    .from('appels_en_cours')
    .insert({
      user_email: emailAllo,
      profil_id: userData.user.id,
      numero,
      numero_normalise: fin,
      sens: 'SORTANT',
      demarre_le: new Date().toISOString(),
      contact_id: qui?.contact_id ?? null,
      compte_id: qui?.compte_id ?? null,
      piste_id: qui?.piste_id ?? null,
    })
    .select('id')
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, id: cree?.id ?? null })
}
