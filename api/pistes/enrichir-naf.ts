import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CODE NAF ET LE LIBELLÉ APE D'UNE PISTE, DEPUIS SON SIRET
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « récupérer 2 informations à partir du SIRET (ou du SIREN si le SIRET est
 * vierge) : le code NAF et le libellé APE. Le code NAF c'est un champ à créer. Pour le libellé APE
 * tu peux éditer le champ Activité. »
 *
 * ══ POURQUOI CETTE SOURCE ══
 *
 * `recherche-entreprises.api.gouv.fr` : l'API publique de la DINUM, adossée à Sirene. Elle est DÉJÀ
 * branchée dans Kimatch (`src/lib/companyDirectory.ts`) pour créer un compte depuis une piste —
 * c'est donc une dépendance qu'on connaît, pas une de plus. Gratuite, sans clé, sans quota nominatif.
 *
 * L'API Sirene de l'INSEE dirait exactement la même chose, mais réclame un jeton OAuth et plafonne à
 * 30 appels la minute : 4 793 pistes à rattraper, c'est deux heures et demie contre onze minutes.
 *
 * ══ POURQUOI UN TRAITEMENT SERVEUR PAR LOTS ══
 *
 * 4 793 pistes portent un identifiant. Le faire depuis le navigateur demanderait de garder un onglet
 * ouvert onze minutes et échouerait au premier rechargement. Ici, chaque passage travaille le temps
 * qu'il a et rend ce qu'il reste ; une interruption ne perd que l'appel en cours.
 *
 * LA TÂCHE TOURNE TOUTES LES HEURES (`vercel.json`, « 40 * * * * »). Les quatre premiers passages
 * font le rattrapage ; ensuite chaque passage ne trouve que les pistes créées dans l'heure — une
 * requête de comptage et rien d'autre. C'est ce qui évite d'avoir à déclencher quoi que ce soit à la
 * main, et ce qui fait qu'une piste saisie ce matin porte son code NAF avant qu'on la rappelle.
 *
 * L'IDEMPOTENCE VIENT DU FILTRE, pas d'un marqueur : on ne prend que les pistes dont `code_naf` est
 * vide. Rejouer le traitement ne refait donc jamais un appel déjà payé.
 *
 * ══ LE SIRET D'ABORD, LE SIREN ENSUITE — ET CE QUE ÇA CHANGE ══
 *
 * 4 751 pistes ont un SIRET, 42 n'ont que le SIREN, 153 n'ont ni l'un ni l'autre et sont laissées de
 * côté : sans identifiant, il n'y a rien à demander.
 *
 * ON RETIENT LE CODE DE L'UNITÉ LÉGALE, pas celui de l'établissement. Les deux diffèrent :
 * SERGIC porte 68.32A (administration d'immeubles) au niveau de l'entreprise et 68.31Z (agence
 * immobilière) sur l'établissement interrogé. C'est 68.32A que William donne en exemple, et c'est
 * l'activité de la société qui dit à qui l'on parle — un établissement peut être un simple bureau.
 *
 * ══ LA NOMENCLATURE SE REMPLIT TOUTE SEULE ══
 *
 * L'API ne rend que le code : `libelle_activite_principale` est nul, vérifié sur trois SIRET réels.
 * La table `codes_naf` est donc chargée au premier passage depuis la source publique. Si ce
 * chargement échoue, on écrit quand même les codes et on le dit : un code sans libellé reste une
 * information, et le libellé se rattrapera au passage suivant.
 */

/** Nomenclature officielle, niveau 5 — 732 sous-classes du type « 68.32A ». */
const SOURCE_NOMENCLATURE = 'https://raw.githubusercontent.com/SocialGouv/codes-naf/master/index.json'

/** Le rythme que l'API tolère sans se fâcher. Sept par seconde, on reste à cinq. */
const PAUSE_ENTRE_APPELS_MS = 200

/**
 * LE LOT SE MESURE EN SECONDES, PAS EN LIGNES.
 *
 * Vercel coupe la fonction à `maxDuration` — 300 s, le maximum du plan. On s'arrête nous-mêmes vingt
 * secondes avant : une coupure franche perdrait le décompte final et, surtout, ne dirait pas combien
 * il reste. Cinq appels la seconde pendant 280 s, c'est environ 1 400 pistes par passage : les
 * 4 793 du rattrapage tiennent en quatre exécutions horaires.
 *
 * Le plafond en lignes reste une sécurité — il ne mord jamais avant le temps.
 */
export const config = { maxDuration: 300 }
const BUDGET_MS = 280_000
const PLAFOND_LOT = 2_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

interface PisteAEnrichir {
  id: string
  siret: string | null
  siren: string | null
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Charge la nomenclature si la table est vide.
 *
 * ON NE LA RECHARGE PAS À CHAQUE FOIS : elle ne bouge qu'à une révision de la NAF, et la relire à
 * chaque lot ajouterait 154 Ko de téléchargement pour un résultat identique.
 */
async function garantirNomenclature(admin: Admin): Promise<{ chargee: number; erreur: string | null }> {
  const { count } = await admin.from('codes_naf').select('code', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return { chargee: 0, erreur: null }

  try {
    const res = await fetch(SOURCE_NOMENCLATURE)
    if (!res.ok) throw new Error(`source indisponible (${res.status})`)
    const brut = (await res.json()) as { id?: string; label?: string }[]

    // Niveau 5 seulement : « 68.32A » fait six caractères avec un point en troisième position. Les
    // niveaux supérieurs — sections, divisions, groupes — ne désignent aucune entreprise.
    const lignes = brut
      .filter((x) => x.id && x.label && x.id.length === 6 && x.id[2] === '.')
      .map((x) => ({ code: x.id as string, libelle: x.label as string }))
    if (lignes.length === 0) throw new Error('aucune sous-classe dans la source')

    const { error } = await admin.from('codes_naf').upsert(lignes, { onConflict: 'code' })
    if (error) throw new Error(error.message)
    return { chargee: lignes.length, erreur: null }
  } catch (e) {
    return { chargee: 0, erreur: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Le code NAF de l'unité légale, pour un SIRET ou un SIREN.
 *
 * Rend `null` quand l'entreprise est introuvable — cela arrive, un SIRET peut être faux ou fermé — et
 * lève seulement si l'API elle-même refuse de répondre, pour que le lot s'arrête plutôt que de
 * marquer des centaines de pistes « sans résultat » sur une panne passagère.
 */
async function codeNafDe(identifiant: string): Promise<string | null> {
  const res = await fetch(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(identifiant)}&per_page=1`,
  )
  if (res.status === 429) throw new Error('rythme refusé par l’API (429) — relancez dans une minute')
  if (!res.ok) throw new Error(`API entreprises indisponible (${res.status})`)

  const corps = (await res.json()) as { results?: { activite_principale?: string | null }[] }
  const premier = corps.results?.[0]
  const code = premier?.activite_principale?.trim()
  return code && code.length >= 5 ? code.toUpperCase() : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* PAS DE FILTRE SUR LA MÉTHODE : Vercel déclenche ses tâches planifiées en GET, et exiger un POST
     ici aurait fait répondre 405 à la seule chose qui appelle cet endpoint. C'est la garde qui
     protège, pas le verbe. */
  const depart = Date.now()

  /* LA MÊME GARDE QUE LES AUTRES TÂCHES PLANIFIÉES. L'en-tête `x-vercel-cron` n'est PAS une
     barrière — n'importe qui peut la poser. La barrière réelle est `CRON_SECRET`, que Vercel envoie
     sur ses invocations. Tant qu'il n'est pas défini, on accepte l'en-tête pour ne pas casser la
     planification, et on le journalise. */
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
  } else if (!req.headers['x-vercel-cron']) {
    console.warn('[enrichir-naf] CRON_SECRET absent : garde réduite à l’en-tête Vercel')
    res.status(401).json({ error: 'Réservé à la tâche planifiée' })
    return
  }

  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) {
    res.status(500).json({ error: 'Supabase (service role) non configuré côté serveur' })
    return
  }
  const admin = createClient(url, cle)

  const demande = Number((req.query?.taille as string | undefined) ?? (req.body as { taille?: unknown } | undefined)?.taille)
  const taille = Math.min(Math.max(demande || PLAFOND_LOT, 1), PLAFOND_LOT)

  const nomenclature = await garantirNomenclature(admin)

  // Les pistes encore sans code NAF, qui portent de quoi le chercher.
  const { data: pistes, error: eLecture } = await admin
    .from('pistes')
    .select('id, siret, siren')
    .is('code_naf', null)
    .eq('actif', true)
    .or('siret.not.is.null,siren.not.is.null')
    .limit(taille)
  if (eLecture) {
    res.status(502).json({ error: eLecture.message })
    return
  }

  const lot = (pistes ?? []) as PisteAEnrichir[]
  let enrichies = 0
  let introuvables = 0
  let arret: string | null = null

  let traitees = 0
  for (const piste of lot) {
    if (Date.now() - depart > BUDGET_MS) {
      arret = 'budget de temps atteint — le reste part au prochain passage'
      break
    }
    const identifiant = piste.siret?.trim() || piste.siren?.trim()
    if (!identifiant) continue
    traitees += 1
    try {
      const code = await codeNafDe(identifiant)
      if (!code) {
        introuvables += 1
      } else {
        // Le libellé vient de la nomenclature ; s'il manque, on écrit quand même le code.
        const { data: ligne } = await admin.from('codes_naf').select('libelle').eq('code', code).maybeSingle()
        const libelle = (ligne as { libelle: string } | null)?.libelle ?? null
        const { error } = await admin
          .from('pistes')
          .update({ code_naf: code, ...(libelle ? { activite: libelle } : {}) })
          .eq('id', piste.id)
        if (error) throw new Error(error.message)
        enrichies += 1
      }
    } catch (e) {
      // On s'arrête au premier refus de l'API : insister ferait marquer le reste du lot comme
      // introuvable alors que le problème est chez nous.
      arret = e instanceof Error ? e.message : String(e)
      break
    }
    await dormir(PAUSE_ENTRE_APPELS_MS)
  }

  const { count: restantes } = await admin
    .from('pistes')
    .select('id', { count: 'exact', head: true })
    .is('code_naf', null)
    .eq('actif', true)
    .or('siret.not.is.null,siren.not.is.null')

  res.status(200).json({
    ok: true,
    traitees,
    enrichies,
    introuvables,
    restantes: restantes ?? 0,
    nomenclature_chargee: nomenclature.chargee,
    nomenclature_erreur: nomenclature.erreur,
    arret,
  })
}
