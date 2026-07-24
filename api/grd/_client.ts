// Client serveur pour la synchro GRD/gaz via le broker watt-else.pro (SEFE).
// Ce n'est pas une API GRDF officielle : on simule une session navigateur
// (login CSRF + cookies) sur la plateforme courtier utilisée par KiWee.
// Ne jamais importer ce fichier depuis le code front — les identifiants ne
// doivent exister que côté serveur (variables d'env Vercel, jamais préfixées VITE_).

const BASE_URL = 'https://watt-else.pro'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function credentials() {
  const login = process.env.WATTELSE_LOGIN
  const password = process.env.WATTELSE_PASSWORD
  if (!login || !password) {
    throw new Error('Identifiants WattElse manquants (WATTELSE_LOGIN / WATTELSE_PASSWORD)')
  }
  return { login, password }
}

function extractToken(html: string): string | null {
  return (
    html.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/)?.[1] ??
    html.match(/value=["']([^"']+)["'][^>]*name=["']_token["']/)?.[1] ??
    html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/)?.[1] ??
    null
  )
}

// Analogue Node/undici du helper Deno getSetCookie() — gère les dates
// "Expires" contenant des virgules dans les en-têtes Set-Cookie multiples.
function parseCookies(headers: Headers): string {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
  const list = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : []
  if (list.length > 0) {
    return list.map((c) => c.split(';')[0].trim()).filter((c) => c.includes('=')).join('; ')
  }
  return (headers.get('set-cookie') ?? '')
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.includes('='))
    .join('; ')
}

function mergeCookies(...parts: string[]): string {
  const jar = new Map<string, string>()
  for (const part of parts) {
    if (!part) continue
    for (const kv of part.split(';')) {
      const t = kv.trim()
      if (!t.includes('=')) continue
      const name = t.slice(0, t.indexOf('='))
      jar.set(name, t)
    }
  }
  return [...jar.values()].join('; ')
}

export interface GrdGazResult {
  success: boolean
  error?: string
  pce?: string
  carMwh?: number | null
  profil?: string | null
  tarif?: string | null
  nomSite?: string | null
  adresse?: string | null
  codePostalSite?: string | null
  ville?: string | null
}

export async function fetchGazData(pce: string, codePostal: string): Promise<GrdGazResult> {
  const { login, password } = credentials()

  // ─── Étape 1 : GET /login ───
  const r1 = await fetch(`${BASE_URL}/login`, { headers: { Accept: 'text/html', 'User-Agent': UA } })
  const html1 = await r1.text()
  const cookies1 = parseCookies(r1.headers)
  const formToken = extractToken(html1)
  if (!r1.ok) return { success: false, error: `Page de login WattElse inaccessible (HTTP ${r1.status})` }
  if (!formToken) return { success: false, error: 'Token CSRF introuvable sur la page de login WattElse (le site a peut-être changé).' }

  // ─── Étape 2 : POST /login (redirection gérée manuellement pour conserver les cookies) ───
  const r2 = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html',
      Referer: `${BASE_URL}/login`,
      Origin: BASE_URL,
      'User-Agent': UA,
      Cookie: cookies1,
    },
    body: new URLSearchParams({ _token: formToken, username: login, password }).toString(),
    redirect: 'manual',
  })
  await r2.text()
  const cookies2 = parseCookies(r2.headers)
  const allCookies = mergeCookies(cookies1, cookies2)
  const location = r2.headers.get('location') ?? ''
  const loginFailed = r2.status !== 302 || /\/login(\?|$)/.test(location)
  if (loginFailed) {
    return { success: false, error: 'Authentification WattElse refusée (identifiants invalides ou compte bloqué).' }
  }

  // ─── Étape 3 : GET /broker (second token CSRF) ───
  const r3 = await fetch(`${BASE_URL}/broker?opportunity=new`, {
    headers: { Accept: 'text/html', Referer: `${BASE_URL}/home`, Cookie: allCookies, 'User-Agent': UA },
  })
  const html3 = await r3.text()
  const cookies3 = parseCookies(r3.headers)
  const brokerToken = extractToken(html3)
  const finalCookies = mergeCookies(allCookies, cookies3)
  if (r3.url.includes('/login')) {
    return { success: false, error: 'Session WattElse perdue (redirection vers /login).' }
  }
  if (!brokerToken) {
    return { success: false, error: 'Token CSRF introuvable sur la page /broker WattElse.' }
  }

  // ─── Étape 4 : POST /Omega ───
  const r4 = await fetch(`${BASE_URL}/Omega`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': brokerToken,
      Referer: `${BASE_URL}/broker?opportunity=new`,
      Origin: BASE_URL,
      Cookie: finalCookies,
      'User-Agent': UA,
    },
    body: new URLSearchParams({ pce, zipcode: codePostal, opportunity_id: 'new' }).toString(),
  })
  const raw4 = await r4.text()

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw4)
  } catch {
    return { success: false, error: `Réponse non-JSON de WattElse (HTTP ${r4.status}). Session probablement expirée.` }
  }

  if (data.CODE_RETOUR !== 'OK') {
    return { success: false, error: `WattElse a renvoyé un statut "${data.CODE_RETOUR ?? '(absent)'}" pour le PCE ${pce}.` }
  }

  // WattElse renvoie la CAR en kWh — notre schéma (compteurs_gaz.car_mwh) est en MWh.
  const carKwh = data.CAR != null ? parseFloat(String(data.CAR)) : null
  const carMwh = carKwh != null && !Number.isNaN(carKwh) ? Math.round((carKwh / 1000) * 1000) / 1000 : null

  return {
    success: true,
    pce,
    carMwh,
    profil: (data.PROFIL as string) ?? null,
    tarif: (data.TARIF as string) ?? null,
    nomSite: (data.NOM_SITE as string) ?? null,
    adresse: ((data.ADDRESS_1 as string) ?? '').trim() || null,
    codePostalSite: (data.ZIPCODE != null ? String(data.ZIPCODE).trim() : '') || null,
    ville: ((data.CITY as string) ?? '').trim() || null,
  }
}
