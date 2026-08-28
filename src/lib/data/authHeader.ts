import { supabase } from '@/lib/supabase'

/**
 * L'EN-TÊTE D'AUTHENTIFICATION À JOINDRE À TOUT APPEL VERS `/api`.
 *
 * Remontée ici le 28/08/2026 : elle vivait dans `slackSettings.ts`, et quatre autres modules
 * appelaient une fonction serveur SANS jeton — Ellisphere, Enedis, le GRD gaz et l'OCR. Côté
 * serveur, ces fonctions ne vérifiaient rien : elles répondaient donc à n'importe qui sur Internet.
 * La garde est posée dans `api/_auth.ts` ; ce fichier est la moitié qui va avec.
 *
 * ELLE NE JETTE PAS quand la session manque : elle renvoie un objet vide, et le serveur répond 401.
 * Une erreur ici masquerait la vraie cause derrière un message de réseau.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Le même, avec le `Content-Type` des appels qui portent un corps JSON. */
export async function authHeaderJson(): Promise<Record<string, string>> {
  return { ...(await authHeader()), 'Content-Type': 'application/json' }
}
