// ════════════════════════════════════════════════════════════════════════════════════════════════
// QUI D'AUTRE A TOUCHÉ CES FICHIERS
//
// ══ POURQUOI CE SCRIPT EXISTE : LE 09/09/2026 ══
//
// William, 14 h 50 : « Vous vous êtes croisés DEUX FOIS aujourd'hui sur le même fichier, et la
// seconde a demandé une résolution manuelle complète. Un message avant votre prochaine session
// éviterait le troisième. »
//
// Il avait raison, et le problème n'est pas qu'on travaille en même temps — c'est normal — mais
// qu'on ne le SAIT qu'au moment du conflit, quand le travail est déjà fait des deux côtés. La
// consigne « git fetch avant de commencer » existait déjà et ne suffit pas : `git fetch` dit qu'il
// y a des commits, pas qu'ils touchent précisément les fichiers qu'on s'apprête à ouvrir.
//
// Ce script répond à la seule question utile : PARMI CE QUE JE M'APPRÊTE À MODIFIER, qu'est-ce que
// quelqu'un d'autre a touché récemment ?
//
// ══ CE QU'IL REGARDE ══
//
//   ① MON TRAVAIL EN COURS — les fichiers modifiés non commités, plus ceux de mes commits du jour.
//   ② CE QUI EST ARRIVÉ SUR `origin/master` — les commits des dernières 24 h, par auteur.
//   ③ L'INTERSECTION, qui se lit en deux temps :
//        · DÉJÀ CROISÉ : un fichier que l'autre a modifié et que j'ai modifié aussi.
//        · À VENIR      : un fichier que l'autre vient de modifier sur `origin` et que j'ai ouvert
//                         sans avoir encore rebasé — c'est CELUI-LÀ qui produit le conflit, et
//                         c'est le seul qu'on peut encore éviter.
//
// ══ À LANCER QUAND ══
//
//   · AU DÉBUT d'une session, avant d'ouvrir le premier fichier.
//   · AVANT DE POUSSER, si la session a duré : quelqu'un a pu pousser entre-temps.
//
//   node scripts/verifier-croisement.cjs            (24 h par défaut)
//   node scripts/verifier-croisement.cjs --heures 48
//   npm run croisement
//
// Il ne modifie RIEN — ni fichier, ni index, ni branche. Il fait un `git fetch`, il lit, il dit.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const { execFileSync } = require('child_process')
const path = require('path')

const RACINE = path.resolve(__dirname, '..')

function git(...args) {
  return execFileSync('git', args, { cwd: RACINE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

/** L'auteur de cette session, tel que git le signera. C'est lui qu'on considère comme « moi ». */
function moi() {
  try {
    return git('config', 'user.name').trim()
  } catch {
    return ''
  }
}

const heures = (() => {
  const i = process.argv.indexOf('--heures')
  if (i === -1) return 24
  const n = Number(process.argv[i + 1])
  if (!Number.isFinite(n) || n <= 0) {
    console.error('--heures attend un nombre positif.')
    process.exit(1)
  }
  return n
})()

/* LE `fetch` EST LE SEUL GESTE RÉSEAU, et il ne touche pas la copie de travail : il met à jour
   `origin/master` sans rien fusionner. Sans lui le script raconterait l'état d'hier. */
try {
  git('fetch', '--quiet', 'origin')
} catch (e) {
  console.error("Impossible de joindre origin — le rapport porterait sur un etat perime.")
  console.error(String(e.message).trim())
  process.exit(1)
}

const depuis = `--since=${heures}.hours.ago`

/* LE SEPARATEUR DE CHAMPS EST \x1f, ET SURTOUT PAS L'OCTET NUL.

   Premier reflexe : \0, le separateur habituel pour decouper une sortie de git sans qu'un message
   de commit casse le decoupage. Ca ne marche pas ici, et la raison est propre a Node :
   `execFileSync` REFUSE un argument contenant un octet nul —

     The argument 'args[3]' must be a string without null bytes.

   L'erreur partait dans le `catch` de `commits()`, qui renvoyait une liste vide. Resultat au
   premier essai : « personne d'autre n'a pousse depuis 24 h », alors que William avait cinq
   commits dans la fenetre et cinq fichiers en commun avec moi. Un outil cense signaler les
   croisements et qui jure qu'il n'y en a aucun est PIRE que pas d'outil.

   C'est le meme defaut que celui trouve dans l'application le meme jour : 26 lectures qui
   renvoient une liste vide quand la requete echoue, d'ou la page « 0 piste » pendant la coupure
   de 15 h. Une erreur qu'on avale est une erreur qui ment — d'ou le `catch` bavard ci-dessous.

   Ecrit en SEQUENCE D'ECHAPPEMENT et non en caractere brut. Le caractere \x1f pose litteralement
   dans le fichier est invisible a la relecture, et un editeur ou un `sed` le supprime sans qu'on
   s'en apercoive : c'est arrive deux fois pendant cette correction, laissant `SEPARATEUR = ''`,
   qui « marche » sans rien separer. */
const SEPARATEUR = '\x1f'

/**
 * Les commits d'une reference, avec leurs fichiers.
 *
 * On lit `--name-only` plutot que `--stat` : on veut des chemins exacts pour comparer, pas un
 * resume lisible.
 */
function commits(ref) {
  let brut
  try {
    brut = git('log', ref, depuis, `--pretty=format:@@@%h${SEPARATEUR}%an${SEPARATEUR}%ad${SEPARATEUR}%s`,
               '--date=format:%d/%m %H:%M', '--name-only')
  } catch (e) {
    /* UNE REFERENCE VIDE EST NORMALE : `HEAD..origin/master` ne rend rien sur une branche a jour.
       Une erreur d'invocation, elle, ne l'est pas — et c'est celle qu'il faut voir passer, plutot
       que de rendre un rapport rassurant et faux. */
    const message = String(e.message).trim().split('\n')[0]
    if (!/unknown revision|ambiguous argument|bad revision|does not have any commits/.test(message)) {
      console.error(`Lecture de « ${ref} » impossible — le rapport serait faux :`)
      console.error('   ' + message)
      process.exit(1)
    }
    return []
  }
  const sortie = []
  for (const bloc of brut.split('@@@').slice(1)) {
    const [entete, ...reste] = bloc.split('\n')
    const [sha, auteur, quand, sujet] = entete.split(SEPARATEUR)
    sortie.push({
      sha, auteur, quand, sujet,
      fichiers: reste.map((l) => l.trim()).filter(Boolean),
    })
  }
  return sortie
}

/** Mes fichiers ouverts : modifiés, ajoutés, supprimés, non encore commités. */
function enCours() {
  const brut = git('status', '--porcelain')
  const f = new Set()
  for (const ligne of brut.split('\n')) {
    if (!ligne.trim()) continue
    // Format porcelain : deux caractères d'état, un espace, le chemin. Un renommage s'écrit
    // « R  ancien -> nouveau » : les deux chemins comptent, on a touché aux deux.
    const chemin = ligne.slice(3)
    for (const part of chemin.split(' -> ')) f.add(part.replace(/^"|"$/g, '').trim())
  }
  return f
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
const JE = moi()
const tousCommits = commits('origin/master')
const mesCommitsLocaux = commits('HEAD')

/* CE QUE `origin` A ET QUE JE N'AI PAS : c'est la source des conflits à venir. `HEAD..origin/master`
   ne liste que les commits d'en face, jamais les miens. */
const enAvance = (() => {
  try {
    return commits('HEAD..origin/master')
  } catch {
    return []
  }
})()

const autresCommits = tousCommits.filter((c) => c.auteur !== JE)
const parFichierAutrui = new Map()
for (const c of autresCommits) {
  for (const f of c.fichiers) {
    if (!parFichierAutrui.has(f)) parFichierAutrui.set(f, [])
    parFichierAutrui.get(f).push(c)
  }
}

const mesFichiers = new Set(enCours())
for (const c of mesCommitsLocaux) {
  if (c.auteur === JE) for (const f of c.fichiers) mesFichiers.add(f)
}

const fichiersEnAvanceAutrui = new Set()
for (const c of enAvance) {
  if (c.auteur !== JE) for (const f of c.fichiers) fichiersEnAvanceAutrui.add(f)
}

console.log('')
console.log(`Auteur de cette session : ${JE || '(inconnu)'}`)
console.log(`Fenetre examinee        : ${heures} h`)
console.log('')

const auteurs = [...new Set(tousCommits.map((c) => c.auteur))]
if (auteurs.length <= 1) {
  console.log(`Personne d'autre n'a pousse depuis ${heures} h. Aucun croisement possible.`)
  process.exit(0)
}

console.log('Qui a pousse :')
for (const a of auteurs) {
  const n = tousCommits.filter((c) => c.auteur === a).length
  console.log(`   ${a === JE ? '(moi) ' : '      '}${a.padEnd(12)} ${n} commit${n > 1 ? 's' : ''}`)
}

// ── ① LE CAS ENCORE ÉVITABLE ────────────────────────────────────────────────────────────────────
const aVenir = [...mesFichiers].filter((f) => fichiersEnAvanceAutrui.has(f)).sort()
console.log('')
if (aVenir.length === 0) {
  console.log('A VENIR   : aucun conflit en approche.')
  if (enAvance.length > 0) {
    console.log(`            (${enAvance.length} commit(s) a rebaser, mais sur d'autres fichiers)`)
  }
} else {
  console.log('A VENIR   : CONFLIT EN APPROCHE — ces fichiers sont ouverts chez moi ET modifies sur origin')
  for (const f of aVenir) {
    console.log(`   ! ${f}`)
    for (const c of parFichierAutrui.get(f) ?? []) {
      console.log(`       ${c.auteur} ${c.quand} — ${c.sujet}`)
    }
  }
  console.log('')
  console.log('            Rebaser MAINTENANT (`git pull --rebase origin master`) coute moins')
  console.log('            qu\'une resolution manuelle une fois les deux travaux finis.')
}

// ── ② CE QUI EST DÉJÀ ARRIVÉ ────────────────────────────────────────────────────────────────────
const dejaCroise = [...mesFichiers].filter((f) => parFichierAutrui.has(f) && !aVenir.includes(f)).sort()
console.log('')
if (dejaCroise.length === 0) {
  console.log('DEJA VU   : aucun fichier touche par les deux cotes.')
} else {
  console.log('DEJA VU   : fichiers touches par les deux cotes dans la fenetre')
  for (const f of dejaCroise) {
    console.log(`   · ${f}`)
    for (const c of parFichierAutrui.get(f) ?? []) {
      console.log(`       ${c.auteur} ${c.quand} — ${c.sujet}`)
    }
  }
  console.log('')
  console.log('            Deja resolu, mais a savoir : leur intention peut differer de la mienne.')
  console.log('            Relire leur commit avant de repasser dessus.')
}

console.log('')
process.exit(aVenir.length > 0 ? 2 : 0)
