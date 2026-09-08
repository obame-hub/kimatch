// Que rendent vraiment les deux endpoints d'analyse d'Allo ?
const fs = require('fs')
const cle = fs.readFileSync('.env.local', 'utf8').match(/^ALLO_API_KEY=(.+)$/m)[1].trim()
const H = { Authorization: 'Api-Key ' + cle, 'Content-Type': 'application/json' }

const jour = (d) => d.toISOString().slice(0, 10)
const aujourdhui = new Date()
const ilYaUneSemaine = new Date(Date.now() - 7 * 86400000)

const corps = {
  date: { from: jour(ilYaUneSemaine), to: jour(aujourdhui) },
  granularity: 'DAY',
}

;(async () => {
  for (const chemin of ['/v2/api/analytics/overview', '/v2/api/analytics/outbound']) {
    const r = await fetch('https://api.withallo.com' + chemin, {
      method: 'POST',
      headers: H,
      body: JSON.stringify(corps),
    })
    console.log('\n════════ ' + chemin + ' → HTTP ' + r.status + ' ════════')
    const t = await r.text()
    try {
      const j = JSON.parse(t)
      // On montre la STRUCTURE, pas les milliers de lignes : les clés et le type de chaque valeur.
      const forme = (o, prof = 0) => {
        if (prof > 3) return '…'
        if (Array.isArray(o)) return o.length === 0 ? '[]' : '[' + forme(o[0], prof + 1) + ' ×' + o.length + ']'
        if (o && typeof o === 'object') {
          const e = Object.entries(o).map(([k, v]) => '  '.repeat(prof + 1) + k + ': ' + forme(v, prof + 1))
          return '{\n' + e.join('\n') + '\n' + '  '.repeat(prof) + '}'
        }
        return typeof o === 'string' ? JSON.stringify(o).slice(0, 40) : String(o)
      }
      console.log(forme(j.data ?? j))
    } catch {
      console.log(t.slice(0, 500))
    }
  }
})().catch((e) => {
  console.error('ERREUR : ' + e.message)
  process.exit(1)
})
