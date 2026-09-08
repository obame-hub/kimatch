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

const jour = (d: Date) => d.toISOString().slice(0, 10)

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

  /* LA PÉRIODE VIENT DE L'ÉCRAN, bornée ici. Sept ou trente jours : au-delà, les réponses d'Allo
     grossissent (séries temporelles, carte de chaleur) pour un écran qui n'en montre pas plus. */
  const jours = req.query.jours === '30' ? 30 : 7
  const fin = new Date()
  const debut = new Date(Date.now() - jours * 86400000)
  const periode = { date: { from: jour(debut), to: jour(fin) }, granularity: 'DAY' }

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

    res.status(200).json({ jours, resume, parPersonne, entonnoir })
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
