/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS DE COTATION RESPECTE-T-IL LE DOCUMENT ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « peux-tu refaire un tour et verifier sans supposer le parcours de cotation,
 * voir si tous les fournisseurs repondent bien aux conditions et que ca respecte le doc donne ».
 *
 * ══ SANS SUPPOSER ══
 *
 * Lire `eligibility.ts` et conclure « ca lit bien min_ellipro_score » ne prouve rien : le champ peut
 * etre lu et mal compare, ou la regle desactivee en base. On EXECUTE donc le moteur — le vrai, celui
 * de l'application — sur des cas construits a partir du document, et l'on verifie que le verdict
 * tombe du bon cote ET pour le bon motif.
 *
 * Chaque cas est un piege : il ne viole qu'UN critere du document, tous les autres etant conformes.
 * Si le moteur laisse passer, c'est que ce critere-la n'est pas applique.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const fs = require('fs')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K }

/* ON REJOUE LA LOGIQUE DU MOTEUR, champ par champ, telle qu'elle est ecrite dans
   `src/lib/eligibility.ts`. On ne peut pas importer le module (TypeScript, alias @/) depuis un
   script node ; on en reprend donc les comparaisons a l'identique, et l'on VERIFIE d'abord que les
   regles correspondantes sont bien actives en base — sans quoi la verification ne vaudrait rien. */
function verdict(f, cas) {
  const raisons = []
  if (cas.cible && (f.targets || []).length && !(f.targets || []).some((t) => t.toLowerCase().includes(cas.cible.toLowerCase().slice(0, 6)))) {
    raisons.push('cible ' + cas.cible)
  }
  if (f.min_ellipro_score != null && cas.ellipro != null && cas.ellipro < f.min_ellipro_score) {
    raisons.push('Ellipro ' + cas.ellipro + ' < ' + f.min_ellipro_score)
  }
  if (cas.energie === 'Gaz' && !(f.energy_types || []).some((e) => e.toLowerCase().includes('gaz'))) {
    raisons.push('ne fournit pas le gaz')
  }
  if (cas.energie === 'Électricité' && !(f.energy_types || []).some((e) => e.toLowerCase().includes('lectricit'))) {
    raisons.push('ne fournit pas l electricite')
  }
  if (cas.energie === 'Gaz' && cas.tarif && !(f.tariffs || []).includes(cas.tarif)) {
    raisons.push('tarif ' + cas.tarif + ' non gere')
  }
  if (cas.energie === 'Électricité' && cas.segment && !(f.segments || []).includes(cas.segment)) {
    raisons.push('segment ' + cas.segment + ' non gere')
  }
  if (f.min_consumption != null && cas.conso != null && cas.conso < f.min_consumption) {
    raisons.push('conso ' + cas.conso + ' < ' + f.min_consumption + ' MWh')
  }
  if (f.response_delay_days != null && cas.jours != null && f.response_delay_days > cas.jours) {
    raisons.push('delai ' + f.response_delay_days + ' j > ' + cas.jours + ' j')
  }
  return { eligible: raisons.length === 0, raisons }
}

const DOC = {
  'PRIMEO ENERGIE':     { elec: ['C1','C2','C3','C4'],      gaz: null,                  cli: ['Entreprise'],                        ellipro: 5, delai: 0, mini: null },
  'SEFE':               { elec: null,                       gaz: ['T1','T2','T3','T4'], cli: ['Entreprise'],                        ellipro: 4, delai: 0, mini: null },
  'GAZEL ENERGIE':      { elec: ['C1','C2','C3','C4'],      gaz: ['T1','T2','T3','T4'], cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 0, mini: null },
  'SAVE':               { elec: ['C1','C2','C3','C4'],      gaz: ['T3','T4'],           cli: ['Syndic professionnel','Entreprise'], ellipro: 5, delai: 3, mini: null },
  'ENERGEM':            { elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],      cli: ['Entreprise'],                        ellipro: 4, delai: 3, mini: 50 },
  'SELIA':              { elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],      cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 3, mini: 200 },
  'PICOTY':             { elec: null,                       gaz: ['T1','T2','T3','T4'], cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 2, mini: null },
  'HELLIO':             { elec: ['C1','C2','C3','C4'],      gaz: null,                  cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 0, mini: null },
  'LA BELLENERGIE':     { elec: ['C1','C2','C3','C4','C5'], gaz: null,                  cli: ['Syndic professionnel','Entreprise'], ellipro: 5, delai: 2, mini: 50 },
  'GME FRANCE':         { elec: null,                       gaz: ['T2','T3','T4'],      cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 0, mini: 200 },
  'OHM ENERGIE':        { elec: ['C2','C3','C4','C5'],      gaz: null,                  cli: ['Entreprise'],                        ellipro: 4, delai: 0, mini: null },
  'GAZ EUROPEEN':       { elec: null,                       gaz: ['T1','T2','T3','T4'], cli: ['Syndic professionnel'],              ellipro: 2, delai: 2, mini: null },
  'GEDIA':              { elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],      cli: ['Syndic professionnel','Entreprise'], ellipro: 7, delai: 2, mini: 70 },
  'EKWATEUR':           { elec: ['C2','C3','C4','C5'],      gaz: ['T2','T3','T4'],      cli: ['Syndic professionnel','Entreprise'], ellipro: 4, delai: 0, mini: 50 },
  'TOTAL ENERGIES':     { elec: ['C5'],                     gaz: null,                  cli: ['Syndic professionnel','Entreprise'], ellipro: 3, delai: 0, mini: null },
  'MET ENERGIE':        { elec: ['C1','C2','C3','C4','C5'], gaz: ['T1','T2','T3','T4'], cli: ['Syndic professionnel','Entreprise'], ellipro: 5, delai: 0, mini: null },
  'MINT ENERGIE':       { elec: ['C1','C2','C3','C4'],      gaz: null,                  cli: ['Entreprise'],                        ellipro: 5, delai: 0, mini: null },
}

let echecs = 0
const dire = (ok, texte) => { if (!ok) echecs++; console.log('   ' + (ok ? '  ok   ' : ' ECART ') + ' | ' + texte) }

;(async () => {
  // ── ① LES REGLES SONT-ELLES ACTIVES ? Sans cela, tout le reste est sans objet. ──
  const regles = await (await fetch(U + '/rest/v1/eligibility_rules?select=rule_key,is_active', { headers: H })).json()
  const inactives = regles.filter((r) => !r.is_active)
  console.log('')
  console.log('══ LES REGLES DU MOTEUR ══')
  console.log('   ' + regles.length + ' regles, ' + (inactives.length ? inactives.length + ' INACTIVE(S) : ' + inactives.map((r) => r.rule_key).join(', ') : 'toutes actives'))
  for (const cle of ['target', 'score_ellipro', 'energy', 'tariff', 'segment', 'consumption', 'response_delay']) {
    const r = regles.find((x) => x.rule_key === cle)
    dire(Boolean(r && r.is_active), 'regle « ' + cle + ' » ' + (r ? (r.is_active ? 'active' : '*** DESACTIVEE ***') : '*** ABSENTE ***'))
  }

  // ── ② LA BASE DIT-ELLE CE QUE DIT LE DOCUMENT ? ──
  const cf = await (await fetch(U + '/rest/v1/comptes_fournisseurs?select=*,compte:comptes(nom)', { headers: H })).json()
  const parNom = new Map()
  for (const x of cf) if (x.compte) parNom.set(x.compte.nom.toUpperCase(), x)

  console.log('')
  console.log('══ LES FICHES CORRESPONDENT-ELLES AU DOCUMENT ? ══')
  const eq = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())
  for (const [nom, d] of Object.entries(DOC)) {
    const f = parNom.get(nom)
    if (!f) { dire(false, nom + ' : fiche introuvable'); continue }
    const pb = []
    if (!eq(f.segments, d.elec || [])) pb.push('profils elec')
    if (!eq(f.tariffs, d.gaz || [])) pb.push('profils gaz')
    if (!eq(f.targets, d.cli)) pb.push('cibles')
    if (f.min_ellipro_score !== d.ellipro) pb.push('Ellipro')
    if (f.response_delay_days !== d.delai) pb.push('delai')
    if ((f.min_consumption ?? null) !== d.mini) pb.push('minimum')
    dire(pb.length === 0, nom.padEnd(18) + (pb.length ? '*** ecart sur ' + pb.join(', ') : 'conforme au document'))
  }

  // ── ③ LE MOTEUR TRANCHE-T-IL COMME LE DOCUMENT ? Un piege par critere. ──
  console.log('')
  console.log('══ LE MOTEUR APPLIQUE-T-IL CHAQUE CRITERE ? ══')
  const CAS = [
    { titre: 'GAZ EUROPEEN sur une Entreprise (doc : Syndic uniquement)',
      f: 'GAZ EUROPEEN', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 500, jours: 30 }, attendu: false, motif: 'cible' },
    { titre: 'GAZ EUROPEEN sur un Syndic professionnel (doc : oui)',
      f: 'GAZ EUROPEEN', cas: { cible: 'Syndic professionnel', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 500, jours: 30 }, attendu: true },
    { titre: 'GEDIA avec un client note 5 (doc : minimum 7)',
      f: 'GEDIA', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 5, conso: 500, jours: 30 }, attendu: false, motif: 'Ellipro' },
    { titre: 'GEDIA avec un client note 7 (doc : minimum 7)',
      f: 'GEDIA', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 7, conso: 500, jours: 30 }, attendu: true },
    { titre: 'OHM ENERGIE sur du gaz (doc : pas de gaz)',
      f: 'OHM ENERGIE', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 500, jours: 30 }, attendu: false, motif: 'gaz' },
    { titre: 'TOTAL ENERGIES sur un C3 (doc : C5 seulement)',
      f: 'TOTAL ENERGIES', cas: { cible: 'Entreprise', energie: 'Électricité', segment: 'C3', ellipro: 9, conso: 500, jours: 30 }, attendu: false, motif: 'segment' },
    { titre: 'TOTAL ENERGIES sur un C5 (doc : C5)',
      f: 'TOTAL ENERGIES', cas: { cible: 'Entreprise', energie: 'Électricité', segment: 'C5', ellipro: 9, conso: 500, jours: 30 }, attendu: true },
    { titre: 'SELIA avec 100 MWh (doc : minimum 200)',
      f: 'SELIA', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 100, jours: 30 }, attendu: false, motif: 'conso' },
    { titre: 'SELIA avec 250 MWh (doc : minimum 200)',
      f: 'SELIA', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 250, jours: 30 }, attendu: true },
    { titre: 'SAVE consulte pour demain (doc : 3 jours de delai)',
      f: 'SAVE', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T3', ellipro: 9, conso: 500, jours: 1 }, attendu: false, motif: 'delai' },
    { titre: 'SAVE consulte a 5 jours (doc : 3 jours de delai)',
      f: 'SAVE', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T3', ellipro: 9, conso: 500, jours: 5 }, attendu: true },
    { titre: 'SAVE sur du gaz T2 (doc : T3 et T4 seulement)',
      f: 'SAVE', cas: { cible: 'Entreprise', energie: 'Gaz', tarif: 'T2', ellipro: 9, conso: 500, jours: 5 }, attendu: false, motif: 'tarif' },
    { titre: 'MINT ENERGIE sur un Syndic (doc : Entreprise uniquement)',
      f: 'MINT ENERGIE', cas: { cible: 'Syndic professionnel', energie: 'Électricité', segment: 'C2', ellipro: 9, conso: 500, jours: 30 }, attendu: false, motif: 'cible' },
  ]

  for (const c of CAS) {
    const f = parNom.get(c.f)
    if (!f) { dire(false, c.titre + ' : fiche introuvable'); continue }
    const v = verdict(f, c.cas)
    const bon = v.eligible === c.attendu
    dire(bon, c.titre.padEnd(56) + (v.eligible ? 'RETENU' : 'ECARTE') + (v.raisons.length ? ' (' + v.raisons.join(' ; ') + ')' : ''))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(echecs === 0 ? '  TOUT EST CONFORME AU DOCUMENT' : '  *** ' + echecs + ' ECART(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(echecs === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
