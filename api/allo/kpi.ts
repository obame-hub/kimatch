import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * ══ LES CHIFFRES D'APPELS, CALCULÉS PAR ALLO ══
 *
 * William, réunion du 08/09/2026 : « au moins après, avec ce type dans l'appel, on peut savoir : tu
 * as eu 20 personnes au téléphone aujourd'hui et tu as passé 60 appels. »
 *
 * ILS EXISTAIENT DÉJÀ, ENTIÈREMENT CALCULÉS, et personne ne le savait. Découvert le 08/09/2026 en
 * demandant à `GET /v2/api/me` la liste des endpoints joignables : deux routes d'analyse y
 * figuraient, accessibles avec la portée `CONVERSATIONS_READ` que la clé avait depuis le début.
 *
 * Relevé sur les sept derniers jours au premier appel : 248 appels, 8 h 25 de téléphone, 90 appels
 * de plus d'une minute, 76,6 % de décroché, et le détail des sept commerciaux. Plus l'entonnoir :
 * composés → décrochés (50,9 %) → conversations (40 %) → conversions (33,7 %).
 *
 * ══ POURQUOI CETTE ROUTE EXISTE PLUTÔT QU'UN APPEL DEPUIS LE NAVIGATEUR ══
 *
 * La clé Allo donne accès à TOUT le compte — les appels, les enregistrements, les transcriptions.
 * Elle n'a rien à faire dans un navigateur. Comme pour `appeler.ts` et le webhook, le serveur la
 * détient et l'écran ne voit que des chiffres.
 */

/** Ce que l'écran attend : deux objets, aplatis, sans les enveloppes `{ value: … }` d'Allo. */
interface Resume {
  appels: number
  secondes_au_telephone: number
  appels_plus_une_minute: number
  taux_decroche: number
}
interface ParPersonne extends Resume {
  nom: string
  email: string
}
interface EtapeEntonnoir {
  libelle: string
  nombre: number
  taux: number | null
}

/** Allo emballe chaque métrique dans `{ value, … }` : on ne garde que le nombre. */
function nombre(x: unknown): number {
  if (typeof x === 'number') return x
  if (x && typeof x === 'object' && 'value' in x) {
    const v = (x as { value: unknown }).value
    return typeof v === 'number' ? v : 0
  }
  return 0
}

async function allo(chemin: string, corps: unknown, cle: string): Promise<Record<string, unknown>> {
  const r = await fetch('https://api.withallo.com' + chemin, {
    method: 'POST',
    headers: { Authorization: 'Api-Key ' + cle, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const j = (await r.json()) as { data?: Record<string, unknown>; error?: { message?: string } }
  if (!r.ok) throw new Error(j.error?.message ?? `Allo ${r.status} sur ${chemin}`)
  return j.data ?? (j as Record<string, unknown>)
}

/** Une date au format « AAAA-MM-JJ », telle qu'Allo les attend. */
const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/

/** Le nombre de jours entre deux dates ISO, bornes incluses. */
function etendue(du: string, au: string): number {
  return Math.round((Date.parse(au) - Date.parse(du)) / 86400000) + 1
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const cle = process.env.ALLO_API_KEY
  if (!supabaseUrl || !anon || !cle) {
    res.status(500).json({ error: 'Allo non configuré côté serveur' })
    return
  }

  // LA SESSION EST VÉRIFIÉE, comme partout : ces chiffres décrivent le travail de l'équipe.
  const client = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: utilisateur, error } = await client.auth.getUser()
  if (error || !utilisateur.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  /* ══ LES BORNES SONT CALCULÉES PAR L'ÉCRAN, PAS ICI ═══════════════════════════════════════════

     Michel, 08/09/2026, rapporté par Naoëlle : « il aimerait qu'on mette plutôt des dates relatives
     comme demain, aujourd'hui, cette semaine. »

     « Aujourd'hui » et « cette semaine » sont des notions LOCALES. Cette fonction tourne sur un
     serveur en UTC : y calculer « aujourd'hui » donnerait le mauvais jour chaque soir après 2 h du
     matin heure de Paris — et « cette semaine » commencerait un dimanche si on laissait faire
     JavaScript. Le navigateur, lui, connaît le fuseau et le calendrier de celui qui regarde. Il
     envoie donc deux dates, et cette route ne fait que les valider.

     ELLES SONT VALIDÉES, pas seulement recopiées : une borne libre est une requête libre vers Allo,
     dont les réponses grossissent avec la période. La forme est imposée et l'étendue plafonnée. */
  const du = typeof req.query.du === 'string' ? req.query.du : ''
  const au = typeof req.query.au === 'string' ? req.query.au : ''
  if (!FORME_JOUR.test(du) || !FORME_JOUR.test(au)) {
    res.status(400).json({ error: 'Bornes attendues au format AAAA-MM-JJ (du, au)' })
    return
  }
  if (du > au) {
    res.status(400).json({ error: 'La borne de début est postérieure à la borne de fin' })
    return
  }
  const jours = etendue(du, au)
  if (jours > 400) {
    res.status(400).json({ error: 'Période trop longue : 400 jours au maximum' })
    return
  }
  const periode = { date: { from: du, to: au }, granularity: 'DAY' }

  try {
    // EN PARALLÈLE : deux lectures indépendantes, et la limite d'Allo est de 20 par seconde.
    const [vue, sortants] = await Promise.all([
      allo('/v2/api/analytics/overview', periode, cle),
      allo('/v2/api/analytics/outbound', periode, cle),
    ])

    const s = (vue.summary ?? {}) as Record<string, unknown>
    const resume: Resume = {
      appels: nombre(s.total_calls),
      secondes_au_telephone: Math.round(nombre(s.talk_time_seconds)),
      appels_plus_une_minute: nombre(s.calls_over1_min),
      taux_decroche: nombre(s.answer_rate),
    }

    const brut = Array.isArray(vue.breakdown) ? (vue.breakdown as Record<string, unknown>[]) : []
    const parPersonne: ParPersonne[] = brut
      .map((l) => {
        const u = (l.user ?? {}) as { name?: string; email?: string }
        return {
          nom: u.name ?? u.email ?? 'Inconnu',
          email: u.email ?? '',
          appels: nombre(l.calls),
          secondes_au_telephone: Math.round(nombre(l.talk_time_seconds)),
          appels_plus_une_minute: nombre(l.calls_over1_min),
          taux_decroche: nombre(l.answer_rate),
        }
      })
      // Le plus actif en premier : c'est l'ordre dans lequel on lit un classement.
      .sort((a, b) => b.appels - a.appels)

    const f = (sortants.funnel ?? {}) as Record<string, Record<string, unknown>>
    const etape = (cle2: string, libelle: string): EtapeEntonnoir => ({
      libelle,
      nombre: nombre(f[cle2]?.count),
      taux: typeof f[cle2]?.rate === 'number' ? (f[cle2].rate as number) : null,
    })
    const entonnoir: EtapeEntonnoir[] = [
      etape('dials', 'Appels composés'),
      etape('connected', 'Décrochés'),
      etape('conversations', 'Conversations de plus d’une minute'),
      etape('conversions', 'Conversions'),
    ]

    /* L'HEURE DU RELEVÉ ACCOMPAGNE LES CHIFFRES. Naoëlle, 08/09/2026 : « ajoute aussi cette heure-ci
       à tout ça. » Sur « Aujourd'hui », un nombre d'appels change d'une minute à l'autre : sans
       l'heure à laquelle il a été lu, on ne sait pas si on regarde le compte de maintenant ou celui
       d'il y a une demi-heure — et l'écran garde ses chiffres cinq minutes en mémoire.

       ALLO NE SAIT PAS DESCENDRE SOUS LA JOURNÉE. Vérifié le 08/09/2026 en leur envoyant
       `granularity: 'HOUR'`, puis `'HOURLY'`, puis des bornes horodatées : les trois rendent
       exactement le même résultat que la journée entière, et la réponse ne contient aucune série
       temporelle. C'est pourquoi il n'y a pas de période « cette heure » : elle serait fausse. */
    res.status(200).json({ jours, du, au, luLe: new Date().toISOString(), resume, parPersonne, entonnoir })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur Allo inconnue'
    /* LA PORTÉE MANQUANTE SE DIT EN CLAIR — même si `CONVERSATIONS_READ` est présente depuis le
       début, une clé recréée sans elle rendrait un 403 opaque. */
    if (/INSUFFICIENT_SCOPE|CONVERSATIONS_READ/i.test(message)) {
      res.status(502).json({
        error: 'La clé Allo n’a pas le droit de lire les conversations.',
        code: 'portee_manquante',
      })
      return
    }
    res.status(502).json({ error: message })
  }
}
