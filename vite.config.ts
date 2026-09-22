import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

/**
 * ══ QUAND `tailwind.config.js` CHANGE, CE SERVEUR NE LE SAIT PAS ══
 *
 * William, 22/09/2026, deux fois dans la même journée : ce qu'il voyait à l'écran ne correspondait
 * pas au code. La cause était la même les deux fois — un jeton ou une taille ajoutés dans
 * `tailwind.config.js` n'existaient pas dans la feuille servie par Vite.
 *
 * POURQUOI : à travers PostCSS, Tailwind lit sa configuration UNE SEULE FOIS, au démarrage. Il
 * surveille ensuite les fichiers listés dans `content` — donc le code —, jamais sa propre
 * configuration. Un serveur lancé une semaine plus tôt sert indéfiniment l'ancienne palette : les
 * classes inconnues disparaissent en silence et l'écran retombe sur les valeurs héritées. C'est le
 * pire mode de défaillance possible, parce qu'il ressemble à une erreur de conception.
 *
 * ══ ET `server.restart()` N'Y SUFFIT PAS — MESURÉ, PAS SUPPOSÉ ══
 *
 * Ma première version appelait `server.restart()`. Vite écrit bien « server restarted » dans le
 * journal, et j'ai cru le problème réglé. Vérification faite en interrogeant la feuille servie :
 * elle contenait TOUJOURS les anciennes valeurs. Toucher `index.css` ensuite n'y change rien non
 * plus. La configuration est retenue par le processus, pas par le serveur HTTP — seul un vrai
 * relancement la relit.
 *
 * CE PLUGIN NE PRÉTEND DONC PLUS RÉPARER : il AVERTIT, en grand, dans le terminal où tourne le
 * serveur. Un message qu'on ne peut pas manquer vaut mieux qu'un redémarrage qui ment — c'est
 * exactement ce qui m'a fait perdre une heure.
 */
function avertirConfigTailwind() {
  const config = path.resolve(__dirname, 'tailwind.config.js')
  return {
    name: 'kimatch-avertir-tailwind',
    configureServer(serveur: {
      watcher: { add: (f: string) => void; on: (e: string, cb: (f: string) => void) => void }
    }) {
      serveur.watcher.add(config)
      serveur.watcher.on('change', (fichier: string) => {
        if (path.resolve(fichier) !== config) return
        const bord = '─'.repeat(74)
        console.log(
          `\n\x1b[33m┌${bord}┐\n`
          + `│ tailwind.config.js a changé — CE SERVEUR SERT ENCORE L'ANCIENNE PALETTE.  │\n`
          + `│ Tailwind ne relit sa configuration qu'au démarrage du processus.         │\n`
          + `│ → Arrêtez le serveur (Ctrl+C) et relancez « npm run dev ».               │\n`
          + `└${bord}┘\x1b[0m\n`,
        )
      })
    },
  }
}


/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SERVIR `api/` PENDANT LE DÉVELOPPEMENT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « pourquoi j'ai le message "Réponse illisible du serveur (404)" dans le
 * héros l'avis de Kimatch ».
 *
 * PARCE QUE VITE NE SERT QUE `src/`. Les fonctions de `api/` sont déployées par Vercel et
 * n'existent qu'en ligne : en local, un `POST /api/cockpit/conseil` tombait sur la règle de repli
 * du SPA et rendait un 404. Toute la famille en souffrait — l'extraction de documents, l'envoi de
 * mails, les webhooks : rien de tout cela n'était essayable sans déployer.
 *
 * CE PLUGIN LES CHARGE À LA DEMANDE avec `ssrLoadModule`, le chargeur serveur de Vite — et non un
 * `import()` de Node, qui butterait sur les `import '../_auth.js'` de ces fichiers : ils écrivent
 * `.js` parce que Vercel compile en ESM, alors que le fichier sur le disque est en `.ts`. Vite
 * connaît cette correspondance, Node non. Il n'imite pas Vercel pour autant : il fournit le strict
 * nécessaire pour que le même fichier tourne des deux côtés — le corps JSON déjà analysé, et
 * `res.status().json()`.
 *
 * ══ IL NE TOURNE QU'EN DÉVELOPPEMENT ══
 *
 * `apply: 'serve'` : rien de ceci n'entre dans le paquet de production, où c'est Vercel qui sert
 * ces fichiers pour de vrai.
 *
 * ══ LES SECRETS VIENNENT DE `.env.local`, ET N'Y SONT PAS TOUS ══
 *
 * Vite n'expose au navigateur que les variables `VITE_*` — c'est ce qui protège les clés. Ici on
 * est DANS le processus Node, du côté serveur : on charge donc tout `.env.local` dans
 * `process.env`, exactement comme Vercel le fait en ligne. Une clé absente du fichier reste
 * absente, et le point d'entrée le dit en clair plutôt que d'échouer obscurément.
 */
function servirApiEnLocal() {
  return {
    name: 'kimatch-api-en-local',
    apply: 'serve' as const,
    configureServer(serveur: {
      ssrLoadModule: (url: string) => Promise<Record<string, unknown>>
      middlewares: {
        use: (
          fn: (
            req: {
              url?: string
              method?: string
              headers: Record<string, string | string[] | undefined>
              on: (e: string, cb: (c?: unknown) => void) => void
            },
            res: {
              statusCode: number
              setHeader: (k: string, v: string) => void
              end: (corps?: string) => void
            },
            suite: (e?: unknown) => void,
          ) => void,
        ) => void
      }
    }) {
      /* `.env.local` d'abord, sans écraser ce qui est déjà dans l'environnement : une clé passée à
         la main devant `npm run dev` doit gagner sur le fichier. */
      try {
        const fichier = path.resolve(__dirname, '.env.local')
        if (fs.existsSync(fichier)) {
          for (const ligne of fs.readFileSync(fichier, 'utf8').split('\n')) {
            const m = ligne.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
            if (!m) continue
            const valeur = m[2].trim().replace(/^["']|["']$/g, '')
            if (process.env[m[1]] === undefined) process.env[m[1]] = valeur
          }
        }
      } catch { /* un `.env.local` illisible ne doit pas empêcher le serveur de démarrer */ }

      serveur.middlewares.use((req, res, suite) => {
        const chemin = (req.url ?? '').split('?')[0]
        if (!chemin.startsWith('/api/')) return suite()

        /* LE CORPS EST LU ICI, parce que les fonctions Vercel le reçoivent déjà analysé. Sans
           cela, chaque point d'entrée verrait `req.body` indéfini et répondrait « requête
           invalide » — un faux négatif très coûteux à diagnostiquer. */
        const morceaux: Buffer[] = []
        req.on('data', (c?: unknown) => morceaux.push(c as Buffer))
        req.on('end', () => {
          void (async () => {
            const brut = Buffer.concat(morceaux).toString('utf8')
            let corps: unknown = undefined
            if (brut) { try { corps = JSON.parse(brut) } catch { corps = brut } }

            /* `res.status().json()` est l'interface d'Express que Vercel fournit ; `http` ne
               l'a pas. On la pose ici, en laissant tout le reste intact. */
            const reponse = res as typeof res & {
              status: (c: number) => typeof reponse
              json: (d: unknown) => void
            }
            reponse.status = (c: number) => { res.statusCode = c; return reponse }
            reponse.json = (d: unknown) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(d))
            }

            try {
              const module = await serveur.ssrLoadModule(`.${chemin}.ts`)
              const gestionnaire = module.default as ((q: unknown, r: unknown) => unknown) | undefined
              if (typeof gestionnaire !== 'function') {
                reponse.status(500).json({ error: `\`${chemin}\` n'exporte pas de gestionnaire par défaut.` })
                return
              }
              await gestionnaire(Object.assign(req, { body: corps, query: {} }), reponse)
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e)
              console.error(`\x1b[31m[api en local] ${chemin} : ${message}\x1b[0m`)
              reponse.status(500).json({ error: `Point d'entrée local en échec : ${message}` })
            }
          })()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), avertirConfigTailwind(), servirApiEnLocal()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
