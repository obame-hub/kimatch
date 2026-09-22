// ════════════════════════════════════════════════════════════════════════════════════════════════
// CE QUI A BOUGÉ DEPUIS LE DERNIER PUSH
//
// William, 14/09/2026 : « à chaque push, il faut réévaluer pour voir si ça a bougé (champ supprimé,
// champ ajouté, objet modifié etc.) ».
//
// ══ UNE CARTE RÉGÉNÉRÉE NE RÉPOND PAS À ÇA ════════════════════════════════════════════════════
//
// `npm run carte` dit ce qui EST. La question posée ici est ce qui a CHANGÉ, et un état ne se
// compare à rien. Il faut donc garder l'état précédent quelque part et le confronter — c'est tout
// ce que fait ce script, et c'est ce qui transforme une photographie en surveillance.
//
// ══ POURQUOI L'INSTANTANÉ N'EST PAS DANS GIT ══════════════════════════════════════════════════
//
// `carte-donnees/` est ignoré : le dépôt est PUBLIC, et la carte porte les volumes de chaque table.
// L'instantané vit donc à côté d'elle, local à chaque poste. Conséquence assumée, et elle est dite
// plutôt que découverte : le premier push d'une machine n'a rien à comparer et l'annonce.
//
// ══ CE QU'IL NE FAIT JAMAIS ═══════════════════════════════════════════════════════════════════
//
// IL NE BLOQUE PAS LE PUSH. Un champ ajouté est une information, pas une faute, et une base
// injoignable à 19 h un vendredi ne doit pas empêcher de livrer. Le seul cas qui mérite un arrêt —
// le code lit une colonne qui n'existe plus — appartient à `npm run carte:verifier`, qui existe
// déjà pour ça et sort en échec, lui.
//
// ══ USAGE ══
//
//   npm run carte:evolution              régénère la carte, compare, enregistre le nouvel état
//   npm run carte:evolution -- --lire    relit le dernier rapport sans rien recalculer
//   npm run carte:evolution -- --a-blanc compare sans enregistrer (pour voir venir)
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const RACINE = path.resolve(__dirname, '..')
const SORTIE = path.join(RACINE, 'carte-donnees')
const CATALOGUE = path.join(SORTIE, '6-catalogue-des-champs.csv')
const INSTANTANE = path.join(SORTIE, '.instantane.json')
const RAPPORT = path.join(SORTIE, 'evolution.md')
const JOURNAL = path.join(SORTIE, 'journal-evolution.md')

/* LES CHAMPS SURVEILLÉS, ET SEULEMENT EUX. Comparer la ligne entière ferait crier le rapport à
   chaque déploiement : « Où dans l'interface » bouge dès qu'un fichier est renommé, « Fichiers »
   dès qu'un import change. Ce qu'on veut voir venir, c'est la FORME du champ — son existence, son
   type, son obligation, son vocabulaire et son statut — pas la plomberie autour. */
const SURVEILLES = [
  ['type', 4, 'type'],
  ['obligatoire', 5, 'obligation'],
  ['valeurs', 6, 'valeurs possibles'],
  ['origineValeurs', 7, 'origine des valeurs'],
  ['libelle', 3, 'nom affiché'],
  ['prod', 11, 'utilisé en prod'],
  ['visible', 13, 'visible en prod'],
]

/* ══ UNE VALEUR QUI BOUGE N'EST PAS TOUJOURS UN CHANGEMENT DE SCHÉMA ═══════════════════════════
 *
 * Constaté au premier passage réel, le 14/09/2026 : entre deux relevés à dix minutes d'écart, le
 * rapport annonçait trois changements. Un seul était vrai — `actions.compte_id` venait d'apparaître.
 * Les deux autres disaient que les valeurs possibles de `historiques_entites.entite_type` étaient
 * passées de « libre » à une liste de sept : personne n'avait touché à la base, c'est l'ANALYZE de
 * Postgres qui avait rafraîchi son échantillon.
 *
 * Ces champs-là n'ont pas de liste FERMÉE : leurs valeurs sont OBSERVÉES dans les données, donc
 * elles bougeront à chaque import, à chaque semaine de saisie. Les mêler aux vrais changements, à
 * chaque push, apprend à ne plus lire le rapport — et c'est le seul vrai risque pour un garde-fou.
 *
 * Ils sont donc rendus à part, sous un titre qui dit ce qu'ils sont. Une valeur qui entre dans un
 * CHECK ou dans une table de référence, elle, reste un changement de schéma : c'est l'ORIGINE des
 * valeurs, pas les valeurs, qui tranche. */
const estObservee = (origine) => /OBSERV/.test(origine || '')

/** Un lecteur de CSV point-virgule, guillemets et retours à la ligne compris. */
function lireCsv(texte) {
  const lignes = []
  let champ = ''
  let ligne = []
  let dansGuillemets = false
  const contenu = texte.replace(/^﻿/, '')
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i]
    if (dansGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"'
          i++
        } else dansGuillemets = false
      } else champ += c
      continue
    }
    if (c === '"') {
      dansGuillemets = true
    } else if (c === ';') {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n') {
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else if (c !== '\r') champ += c
  }
  if (champ || ligne.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return lignes
}

/** L'état courant, réduit à ce qui est surveillé : clé « objet.champ » → valeurs. */
function etatCourant() {
  const lignes = lireCsv(fs.readFileSync(CATALOGUE, 'utf8')).slice(1)
  const champs = {}
  const objets = {}
  for (const l of lignes) {
    if (!l[0] || !l[2]) continue
    const cle = `${l[0]}.${l[2]}`
    const valeur = {}
    for (const [nom, indice] of SURVEILLES) valeur[nom] = l[indice] ?? ''
    champs[cle] = valeur
    objets[l[0]] = (objets[l[0]] ?? 0) + 1
  }
  return { champs, objets, genereLe: new Date().toISOString() }
}

/** Ce qui sépare deux états. Rien d'inventé : que des différences constatées. */
function comparer(avant, apres) {
  const objetsAjoutes = Object.keys(apres.objets).filter((o) => !(o in avant.objets)).sort()
  const objetsSupprimes = Object.keys(avant.objets).filter((o) => !(o in apres.objets)).sort()
  /* UN OBJET SUPPRIMÉ EMPORTE SES CHAMPS, et les lister un par un noierait le fait principal sous
     quarante lignes. On ne détaille que les champs des objets QUI RESTENT — la disparition d'une
     table se dit une fois, en haut. */
  const partis = new Set(objetsSupprimes)
  const arrives = new Set(objetsAjoutes)

  const champsAjoutes = []
  const champsSupprimes = []
  const modifies = []
  for (const cle of Object.keys(apres.champs)) {
    if (cle in avant.champs) continue
    if (arrives.has(cle.split('.')[0])) continue
    champsAjoutes.push(cle)
  }
  for (const cle of Object.keys(avant.champs)) {
    if (cle in apres.champs) continue
    if (partis.has(cle.split('.')[0])) continue
    champsSupprimes.push(cle)
  }
  const derives = []
  for (const cle of Object.keys(apres.champs)) {
    if (!(cle in avant.champs)) continue
    for (const [nom, , libelle] of SURVEILLES) {
      const a = avant.champs[cle][nom] ?? ''
      const b = apres.champs[cle][nom] ?? ''
      if (a === b) continue
      const derive = nom === 'valeurs'
        && estObservee(avant.champs[cle].origineValeurs)
        && estObservee(apres.champs[cle].origineValeurs)
      ;(derive ? derives : modifies).push({ cle, quoi: libelle, avant: a, apres: b })
    }
  }
  return {
    objetsAjoutes,
    objetsSupprimes,
    champsAjoutes: champsAjoutes.sort(),
    champsSupprimes: champsSupprimes.sort(),
    modifies,
    derives,
    /* LE TOTAL IGNORE LES DÉRIVES : c'est lui qui décide si le push affiche « rien n'a bougé ».
       Les compter ferait crier le rapport à chaque ANALYZE de Postgres. */
    total: objetsAjoutes.length + objetsSupprimes.length + champsAjoutes.length
      + champsSupprimes.length + modifies.length,
  }
}

const couper = (s, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s)

function redigerRapport(d, avant, apres) {
  const nbChamps = (o) => Object.keys(apres.champs).filter((c) => c.startsWith(o + '.')).length
  const lignes = []
  const depuis = avant.genereLe ? new Date(avant.genereLe).toLocaleString('fr-FR') : 'un état inconnu'
  lignes.push(`# Ce qui a bougé dans le modèle de données`, '')
  lignes.push(`Comparé à l'état du ${depuis}.`, '')

  if (!d.total) {
    lignes.push('Rien. Aucun objet, aucun champ, aucun type, aucune liste de valeurs n\'a changé.')
    /* « RIEN » NE DOIT PAS EFFACER CE QU'ON A VU. Le schéma n'a pas bougé, et c'est la réponse à la
       question posée — mais taire les dérives de contenu ferait douter du relevé le jour où on les
       cherche. Elles sont dites ici, sous leur vrai nom. */
    if (d.derives.length) {
      lignes.push('', `(${d.derives.length} champ(s) sans liste fermée ont vu leur contenu bouger — `
        + 'de la donnée qui change, pas du schéma.)')
      for (const m of d.derives) lignes.push(`- \`${m.cle}\``)
    }
    return lignes.join('\n')
  }

  if (d.objetsAjoutes.length) {
    lignes.push(`## ${d.objetsAjoutes.length} objet(s) apparu(s)`, '')
    for (const o of d.objetsAjoutes) lignes.push(`- **${o}** — ${nbChamps(o)} champ(s)`)
    lignes.push('')
  }
  if (d.objetsSupprimes.length) {
    lignes.push(`## ${d.objetsSupprimes.length} objet(s) disparu(s)`, '')
    for (const o of d.objetsSupprimes) lignes.push(`- **${o}**`)
    lignes.push('')
  }
  if (d.champsAjoutes.length) {
    lignes.push(`## ${d.champsAjoutes.length} champ(s) ajouté(s)`, '')
    for (const c of d.champsAjoutes) lignes.push(`- \`${c}\``)
    lignes.push('')
  }
  if (d.champsSupprimes.length) {
    lignes.push(`## ${d.champsSupprimes.length} champ(s) supprimé(s)`, '')
    lignes.push('À vérifier avant de pousser : un export, une requête enregistrée ou un écran peut',
      'encore les attendre.', '')
    for (const c of d.champsSupprimes) lignes.push(`- \`${c}\``)
    lignes.push('')
  }
  if (d.modifies.length) {
    lignes.push(`## ${d.modifies.length} changement(s) sur des champs existants`, '')
    for (const m of d.modifies) {
      lignes.push(`- \`${m.cle}\` — ${m.quoi} : « ${couper(m.avant) || '—'} » → « ${couper(m.apres) || '—'} »`)
    }
    lignes.push('')
  }
  if (d.derives.length) {
    lignes.push(`## ${d.derives.length} champ(s) dont le CONTENU a bougé — pas le schéma`, '')
    lignes.push('Ces champs n\'ont pas de liste fermée : leurs valeurs sont observées dans les',
      'données. Elles changent quand la donnée change, pas quand quelqu\'un touche à la base.', '')
    for (const m of d.derives) {
      lignes.push(`- \`${m.cle}\` : « ${couper(m.avant, 60) || '—'} » → « ${couper(m.apres, 60) || '—'} »`)
    }
    lignes.push('')
  }
  return lignes.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  const aBlanc = args.includes('--a-blanc')

  if (args.includes('--lire')) {
    if (!fs.existsSync(RAPPORT)) {
      console.log('Aucun rapport. Lancez `npm run carte:evolution`.')
      return
    }
    console.log(fs.readFileSync(RAPPORT, 'utf8'))
    return
  }

  if (!args.includes('--sans-regenerer')) {
    try {
      execFileSync('node', [path.join(__dirname, 'cartographier-donnees.cjs')], { stdio: 'ignore' })
    } catch {
      /* LA BASE EST INJOIGNABLE, ET CE N'EST PAS UNE RAISON D'ARRÊTER QUOI QUE CE SOIT. On le dit
         et on sort en succès : ce script surveille, il n'autorise pas. */
      console.log('carte : base injoignable, comparaison remise au prochain push.')
      return
    }
  }
  if (!fs.existsSync(CATALOGUE)) {
    console.log('carte : catalogue absent, rien à comparer.')
    return
  }

  const apres = etatCourant()
  const premier = !fs.existsSync(INSTANTANE)
  const avant = premier ? { champs: {}, objets: {}, genereLe: null } : JSON.parse(fs.readFileSync(INSTANTANE, 'utf8'))

  if (premier) {
    if (!aBlanc) fs.writeFileSync(INSTANTANE, JSON.stringify(apres), 'utf8')
    console.log(
      `carte : premier relevé sur cette machine — ${Object.keys(apres.champs).length} champs sur `
        + `${Object.keys(apres.objets).length} objets enregistrés. La comparaison commencera au prochain push.`,
    )
    return
  }

  const d = comparer(avant, apres)
  const rapport = redigerRapport(d, avant, apres)
  fs.writeFileSync(RAPPORT, rapport + '\n', 'utf8')

  if (!d.total) {
    console.log('carte : le modèle de données n\'a pas bougé depuis le dernier relevé.')
  } else {
    const bouts = []
    if (d.objetsAjoutes.length) bouts.push(d.objetsAjoutes.length + ' objet(s) en plus')
    if (d.objetsSupprimes.length) bouts.push(d.objetsSupprimes.length + ' objet(s) en moins')
    if (d.champsAjoutes.length) bouts.push(d.champsAjoutes.length + ' champ(s) en plus')
    if (d.champsSupprimes.length) bouts.push(d.champsSupprimes.length + ' champ(s) en moins')
    if (d.modifies.length) bouts.push(d.modifies.length + ' champ(s) modifié(s)')
    if (d.derives.length) bouts.push(d.derives.length + ' contenu(s) en dérive')
    console.log('carte : ' + bouts.join(', ') + '.')
    /* LES DIX PREMIÈRES LIGNES DANS LE TERMINAL, LE RESTE DANS LE FICHIER. Un push qui déroule
       quarante lignes ne se lit pas — on passe au suivant sans les voir, et la surveillance ne sert
       plus à rien. */
    for (const l of rapport.split('\n').filter((l) => l.startsWith('- ')).slice(0, 10)) console.log('  ' + l)
    console.log('  → détail complet : carte-donnees/evolution.md')

    const horodatage = new Date().toLocaleString('fr-FR')
    let tete = ''
    try {
      tete = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RACINE, encoding: 'utf8' }).trim()
    } catch { /* hors dépôt : le journal se passe du commit */ }
    fs.appendFileSync(
      JOURNAL,
      `\n## ${horodatage}${tete ? ' — ' + tete : ''}\n\n` + rapport.split('\n').slice(3).join('\n') + '\n',
      'utf8',
    )
  }

  if (!aBlanc) fs.writeFileSync(INSTANTANE, JSON.stringify(apres), 'utf8')
}

main()
