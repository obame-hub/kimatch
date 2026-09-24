/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * AVANT D'ECRASER QUOI QUE CE SOIT : QU'EST-CE QUI CHANGE ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « le document ecrase la base mais avant de le faire tu me fais un tableau
 * de l'avant apres de tout ce qui change ».
 *
 * CE SCRIPT N'ECRIT RIEN par defaut. Avec `--appliquer`, il ecrit — et seulement alors.
 *
 * ══ OU VONT LES SIX COLONNES DU DOCUMENT ══
 *
 * Tout existe deja dans `comptes_fournisseurs`, il n'y a aucune table a creer :
 *
 *     Electricite / profils  -> segments             (C1..C5)
 *     Gaz / profils          -> tariffs              (T1..T4)
 *     Type de client         -> targets              (Entreprise, Syndic professionnel)
 *     Limite Ellipro         -> min_ellipro_score
 *     Delai de reponse       -> response_delay_days  (Instantane = 0)
 *     Minimum annuel         -> min_consumption      (en MWh)
 *
 * `energy_types` se deduit : un fournisseur qui a des segments fournit l'electricite, un qui a des
 * tarifs fournit le gaz. On ne le saisit pas deux fois.
 *
 * ══ CE QU'ON NE TOUCHE PAS ══
 *
 * Le processus de cotation. Naoelle : « pas besoin de decider, on a deja pris la decision dans le
 * processus de cotation, faut pas que tu changes ca ». On met a jour des FICHES, rien d'autre.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const fs = require('fs')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const TYPE_FOURNISSEUR = '731cfdc0-979f-4a97-a1f1-829c23f1ebb5'
const APPLIQUER = process.argv.includes('--appliquer')

/* LE DOCUMENT DU 23/09/2026, RECOPIE DU PDF.
   `elec: null` = « le fournisseur ne propose pas d'electricite » ; `gaz: null` de meme.
   `delai` en jours, 0 pour « Instantane ». `mini` en MWh, null pour « Aucun minimum ». */
const DOC = [
  { nom: 'PRIMEO ENERGIE',     elec: ['C1','C2','C3','C4'],      gaz: null,                    cli: ['Entreprise'],                          ellipro: 5, delai: 0, mini: null },
  { nom: 'SEFE',               elec: null,                       gaz: ['T1','T2','T3','T4'],   cli: ['Entreprise'],                          ellipro: 4, delai: 0, mini: null },
  { nom: 'GAZEL ENERGIE',      elec: ['C1','C2','C3','C4'],      gaz: ['T1','T2','T3','T4'],   cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 0, mini: null },
  { nom: 'SAVE',               elec: ['C1','C2','C3','C4'],      gaz: ['T3','T4'],             cli: ['Syndic professionnel','Entreprise'],   ellipro: 5, delai: 3, mini: null },
  { nom: 'ENERGEM',            elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],        cli: ['Entreprise'],                          ellipro: 4, delai: 3, mini: 50 },
  { nom: 'SELIA',              elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],        cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 3, mini: 200 },
  { nom: 'PICOTY',             elec: null,                       gaz: ['T1','T2','T3','T4'],   cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 2, mini: null },
  { nom: 'HELLIO',             elec: ['C1','C2','C3','C4'],      gaz: null,                    cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 0, mini: null },
  { nom: 'LA BELLENERGIE',     elec: ['C1','C2','C3','C4','C5'], gaz: null,                    cli: ['Syndic professionnel','Entreprise'],   ellipro: 5, delai: 2, mini: 50 },
  { nom: 'GME FRANCE',         elec: null,                       gaz: ['T2','T3','T4'],        cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 0, mini: 200 },
  { nom: 'OHM ENERGIE',        elec: ['C2','C3','C4','C5'],      gaz: null,                    cli: ['Entreprise'],                          ellipro: 4, delai: 0, mini: null },
  { nom: 'GAZ EUROPEEN',       elec: null,                       gaz: ['T1','T2','T3','T4'],   cli: ['Syndic professionnel'],                ellipro: 2, delai: 2, mini: null },
  { nom: 'GEDIA',              elec: ['C1','C2','C3','C4'],      gaz: ['T2','T3','T4'],        cli: ['Syndic professionnel','Entreprise'],   ellipro: 7, delai: 2, mini: 70 },
  { nom: 'EKWATEUR',           elec: ['C2','C3','C4','C5'],      gaz: ['T2','T3','T4'],        cli: ['Syndic professionnel','Entreprise'],   ellipro: 4, delai: 0, mini: 50 },
  { nom: 'TOTAL ENERGIES',     elec: ['C5'],                     gaz: null,                    cli: ['Syndic professionnel','Entreprise'],   ellipro: 3, delai: 0, mini: null },
  { nom: 'MET ENERGIE FRANCE', elec: ['C1','C2','C3','C4','C5'], gaz: ['T1','T2','T3','T4'],   cli: ['Syndic professionnel','Entreprise'],   ellipro: 5, delai: 0, mini: null, enBase: 'MET ENERGIE' },
  { nom: 'MINT ENERGIE',       elec: ['C1','C2','C3','C4'],      gaz: null,                    cli: ['Entreprise'],                          ellipro: 5, delai: 0, mini: null, aCreer: true },
]

const norm = (s) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const lst = (a) => (a && a.length ? a.join(',') : '—')
const eq = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort())

;(async () => {
  const comptes = await (await fetch(U + '/rest/v1/comptes?type_compte_id=eq.' + TYPE_FOURNISSEUR +
    '&select=id,nom', { headers: H })).json()
  const cf = await (await fetch(U + '/rest/v1/comptes_fournisseurs?select=*', { headers: H })).json()
  const parId = new Map(cf.map((x) => [x.compte_id, x]))
  const parNom = new Map(comptes.map((c) => [norm(c.nom), c]))

  console.log('')
  console.log('═'.repeat(100))
  console.log('  AVANT / APRES — document du 23/09/2026 contre les fiches fournisseurs de Kimatch')
  console.log('  ' + (APPLIQUER ? '*** MODE ECRITURE ***' : 'lecture seule — rien ne sera modifie'))
  console.log('═'.repeat(100))

  let nChange = 0
  const aEcrire = []

  for (const d of DOC) {
    const c = parNom.get(norm(d.enBase || d.nom))
    if (!c && !d.aCreer) { console.log('\n  ' + d.nom + '  *** COMPTE INTROUVABLE ***'); continue }

    const av = c ? (parId.get(c.id) || {}) : {}
    const lignes = []
    const cmp = (libelle, avant, apres, egal) => {
      if (egal) return
      lignes.push('      ' + libelle.padEnd(20) + String(avant).padEnd(34) + ' -> ' + apres)
    }

    cmp('profils elec', lst(av.segments), lst(d.elec), eq(av.segments, d.elec || []))
    cmp('profils gaz', lst(av.tariffs), lst(d.gaz), eq(av.tariffs, d.gaz || []))
    cmp('type de client', lst(av.targets), lst(d.cli), eq(av.targets, d.cli))
    cmp('limite Ellipro', av.min_ellipro_score ?? 'vide', d.ellipro, av.min_ellipro_score === d.ellipro)
    cmp('delai (jours)', av.response_delay_days ?? 'vide', d.delai, av.response_delay_days === d.delai)
    cmp('minimum (MWh)', av.min_consumption ?? 'aucun', d.mini ?? 'aucun', (av.min_consumption ?? null) === d.mini)

    if (d.aCreer && !c) {
      console.log('\n  ' + d.nom + '  <- COMPTE A CREER, puis toutes les conditions')
      nChange++
      aEcrire.push(d)
      continue
    }
    if (lignes.length === 0) { console.log('\n  ' + d.nom + '  — rien ne change'); continue }
    console.log('\n  ' + d.nom + (d.enBase ? '  (en base : « ' + d.enBase + ' »)' : ''))
    for (const l of lignes) console.log(l)
    nChange++
    aEcrire.push(Object.assign({}, d, { compte_id: c.id }))
  }

  console.log('')
  console.log('─'.repeat(100))
  console.log('  ' + nChange + ' fournisseur(s) modifie(s) sur ' + DOC.length + ' au document.')
  console.log('  Les ' + (comptes.length - DOC.length + 1) + ' autres fournisseurs de Kimatch ne sont PAS touches.')
  console.log('')

  if (!APPLIQUER) {
    console.log('  Rien n a ete ecrit. Pour appliquer : node scripts/.comparer-fournisseurs.cjs --appliquer')
    console.log('')
    return
  }

  // ── ECRITURE ──
  console.log('  Ecriture en cours…')
  for (const d of aEcrire) {
    let compteId = d.compte_id
    if (!compteId) {
      const r = await fetch(U + '/rest/v1/comptes', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ nom: d.nom, type_compte_id: TYPE_FOURNISSEUR, segment: 'Fournisseur' }) })
      const cree = await r.json()
      if (!cree[0]) { console.log('   ' + d.nom + ' : creation impossible — ' + JSON.stringify(cree).slice(0, 140)); continue }
      compteId = cree[0].id
      console.log('   ' + d.nom + ' : compte cree')
    }
    const energies = []
    if (d.elec) energies.push('Électricité')
    if (d.gaz) energies.push('Gaz Naturel')
    const r = await fetch(U + '/rest/v1/comptes_fournisseurs', {
      method: 'POST',
      headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({
        compte_id: compteId,
        segments: d.elec || [],
        tariffs: d.gaz || [],
        targets: d.cli,
        energy_types: energies,
        min_ellipro_score: d.ellipro,
        response_delay_days: d.delai,
        min_consumption: d.mini,
        fournit_electricite: Boolean(d.elec),
        fournit_gaz: Boolean(d.gaz),
      }),
    })
    const out = await r.text()
    console.log('   ' + d.nom.padEnd(22) + (r.ok ? 'mis a jour' : '*** ECHEC : ' + out.slice(0, 120)))
    // `limite_ellipro` sur la fiche compte suit la meme valeur : les deux s'affichent a l'ecran.
    await fetch(U + '/rest/v1/comptes?id=eq.' + compteId, { method: 'PATCH', headers: H,
      body: JSON.stringify({ limite_ellipro: d.ellipro }) })
  }
  console.log('')
  console.log('  Termine.')
  console.log('')
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
