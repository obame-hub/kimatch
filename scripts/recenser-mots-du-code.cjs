// ════════════════════════════════════════════════════════════════════════════════════════════════
// RECENSER LES MOTS QUI APPARAISSENT DANS LE CODE
//
// Le gestionnaire d'objets peut renommer et supprimer une colonne. La base, elle, acceptera
// toujours : `alter table ... rename column` réussit, et c'est l'application qui casse une seconde
// plus tard, en silence, sur un écran que personne ne regardait à ce moment-là.
//
// Le seul contrôle qui vaut est donc : CETTE COLONNE EST-ELLE NOMMÉE QUELQUE PART DANS LE CODE ?
// PostgreSQL ne peut pas y répondre — il ne lit pas notre dépôt. Ce script le fait, et l'écran
// d'administration affiche la réponse avant de laisser renommer quoi que ce soit.
//
// ── POURQUOI À LA CONSTRUCTION, ET NON UNE FOIS POUR TOUTES ──
//
// Un relevé figé se périme au premier commit et se met à mentir dans le sens dangereux : il
// affirmerait qu'une colonne n'est utilisée nulle part alors qu'un écran vient de s'en servir. En
// le régénérant à chaque `npm run build`, il décrit exactement le code qui part en production.
//
// ── CE QU'IL SUR-DÉTECTE, ET POURQUOI C'EST VOULU ──
//
// « nom », « email », « reference » apparaissent partout, y compris sans rapport avec la colonne
// qu'on regarde. L'écran affichera donc parfois un avertissement pour rien. C'est le bon sens du
// risque : un avertissement de trop fait réfléchir trois secondes, un avertissement manquant fait
// perdre une colonne.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')

const RACINE = path.join(__dirname, '..')
const DOSSIERS = ['src', 'api']
const SORTIE = path.join(RACINE, 'src', 'generated', 'mots-du-code.json')

/* On ne compte que ce qui peut être un nom de colonne : du snake_case, ou un mot d'au moins quatre
   lettres. En dessous, ce sont des variables de boucle et du bruit. */
const MOT = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z]{4,}\b/g

/** Les fichiers qui PARLENT du schéma sans s'en servir : les compter ferait croire à un usage. */
const IGNORES = [
  path.join('src', 'generated'),
  path.join('src', 'lib', 'data', 'catalogue.ts'),
  path.join('src', 'components', 'administration', 'GestionnaireObjets.tsx'),
]

function fichiers(dossier) {
  const out = []
  const parcourir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') parcourir(p) }
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  parcourir(dossier)
  return out
}

const usages = new Map()

for (const dossier of DOSSIERS) {
  const base = path.join(RACINE, dossier)
  if (!fs.existsSync(base)) continue
  for (const fichier of fichiers(base)) {
    const relatif = path.relative(RACINE, fichier)
    if (IGNORES.some((i) => relatif.startsWith(i))) continue
    /* LES COMMENTAIRES SONT RETIRÉS AVANT DE COMPTER. Ce dépôt en est plein — ils font les trois
       quarts du volume — et un mot écrit dans un commentaire n'est pas un usage : renommer une
       colonne ne casse pas une phrase. Les garder noyait les vrais usages sous le vocabulaire
       courant, et faisait passer le relevé de 732 Ko à ce qu'il pèse aujourd'hui. */
    const texte = fs.readFileSync(fichier, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    const vus = new Map()
    for (const m of texte.matchAll(MOT)) vus.set(m[0], (vus.get(m[0]) ?? 0) + 1)
    for (const [mot, n] of vus) {
      if (!usages.has(mot)) usages.set(mot, { n: 0, fichiers: [] })
      const u = usages.get(mot)
      u.n += n
      // CINQ FICHIERS SUFFISENT à faire comprendre l'ampleur ; la liste complète pèserait
      // plusieurs mégaoctets pour une information que personne ne lit en entier.
      if (u.fichiers.length < 5) u.fichiers.push(path.basename(relatif))
    }
  }
}

const objet = {}
for (const [mot, u] of [...usages].sort((a, b) => a[0].localeCompare(b[0]))) {
  objet[mot] = { n: u.n, f: u.fichiers }
}

fs.mkdirSync(path.dirname(SORTIE), { recursive: true })
fs.writeFileSync(SORTIE, JSON.stringify(objet), 'utf8')
console.log(`${Object.keys(objet).length} mots recensés → ${path.relative(RACINE, SORTIE)} `
  + `(${Math.round(fs.statSync(SORTIE).size / 1024)} Ko)`)
