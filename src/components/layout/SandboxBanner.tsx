/**
 * LE BANDEAU QUI DIT SUR QUELLE BASE ON TRAVAILLE.
 *
 * Même principe que l'indicateur « Sandbox » de Salesforce : on ne doit jamais avoir à deviner
 * quel environnement on a sous les yeux.
 *
 * ── LE CAS QUI MANQUAIT : LE DÉVELOPPEMENT LOCAL ────────────────────────────────────────────
 *
 * Le bandeau ne s'affichait que sur le déploiement sandbox. Or `npm run dev` lit `.env.local`, qui
 * contient les identifiants de PRODUCTION — travailler « en local » n'isole rien du tout, c'est la
 * vraie base sur sa propre machine, avec les 2 767 comptes et les 1 600 contrats de vrais clients.
 *
 * Rien ne le signalait à l'écran. Un `npm run dev` et un `kimatch.fr` se ressemblaient trait pour
 * trait, et une manipulation d'essai partait dans les données réelles sans un mot.
 *
 * D'où le second bandeau, rouge celui-là : en développement, si la base contactée n'est pas la
 * sandbox, il le dit. Pour travailler sans risque : `npm run dev:sandbox`.
 */

/** L'identifiant du projet Supabase de production, lisible dans l'adresse de la base. */
const PROJET_PRODUCTION = 'llktvzbbfadmnhfjatrh'

export function SandboxBanner() {
  const etiquette = import.meta.env.VITE_ENV_LABEL
  const adresseBase = import.meta.env.VITE_SUPABASE_URL ?? ''

  if (etiquette === 'sandbox') {
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink-950">
        🧪 Sandbox — données de test, pas la production
      </div>
    )
  }

  // `import.meta.env.DEV` vaut true sous `npm run dev`, jamais dans une version construite : le
  // bandeau ne peut donc pas apparaître chez un utilisateur.
  if (import.meta.env.DEV && adresseBase.includes(PROJET_PRODUCTION)) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-600 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-white">
        ⚠️ Développement local branché sur la BASE DE PRODUCTION — utilisez « npm run dev:sandbox »
      </div>
    )
  }

  return null
}
