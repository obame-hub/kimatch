/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE MICHEL A DEMANDÉ, ÉPROUVÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Michel, 27/09/2026 :
 *   « Il peut télécharger les mandats. Pour les contrats et documents, je mettrais un champ
 *    visible partenaire oui/non. »
 *   « Je simplifierais les statuts visibles par le partenaire. Pas besoin qu'il voie les 11 étapes
 *    internes. On peut regrouper Refusée / Abandonnée / Perdue sous Non aboutie. »
 *
 * Trois règles, et chacune a deux côtés. Le défaut fermé est le plus important : un document ouvert
 * par mégarde part sans que personne ne le voie ; un document oublié, le partenaire le réclame.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const fs = require('fs')
const crypto = require('crypto')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}
const a = (chemin, meth, corps) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: meth || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: corps ? JSON.stringify(corps) : undefined,
  })

;(async () => {
  const cree = {}

  const menage = async () => {
    await a('cles_api_partenaires?libelle=like.ZZZ VIS*', 'DELETE')
    await a('documents?nom=like.ZZZ VIS*', 'DELETE')
    await a('recommandations?nom=like.ZZZ VIS*', 'DELETE')
    await a('contrats?reference=like.ZZZ VIS*', 'DELETE')
    await a('mandats?reference=like.ZZZ VIS*', 'DELETE')
    await a('sites?nom=like.ZZZ VIS*', 'DELETE')
    await a('comptes?nom=like.ZZZ VIS*', 'DELETE')
  }

  try {
    await menage()

    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    const TE = (await (await a('types_energies?select=id&limit=1')).json())[0].id

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ VIS PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    cree.client = (await (await a('comptes', 'POST', {
      nom: 'ZZZ VIS CLIENT', type_compte_id: TC, type_compte: 'client', actif: true,
      apporteur_partenaire_id: cree.part,
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ VIS SITE', compte_id: cree.client,
    })).json())[0].id

    const stM = (await (await a('statuts_mandats?select=id&limit=1')).json())[0]
    cree.mandat = (await (await a('mandats', 'POST', {
      reference: 'ZZZ VIS MANDAT', compte_id: cree.client, statut_id: stM.id, actif: true,
    })).json())[0].id

    const stC = (await (await a('statuts_contrats?select=id&limit=1')).json())[0]
    cree.contrat = (await (await a('contrats', 'POST', {
      reference: 'ZZZ VIS CONTRAT', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, statut_id: stC.id, actif: true,
    })).json())[0].id

    const tdoc = (await (await a('types_documents?select=id&limit=1')).json())[0]

    // ── TROIS DOCUMENTS, POUR TROIS CAS ──
    cree.docMandat = (await (await a('documents', 'POST', {
      nom: 'ZZZ VIS PIECE DE MANDAT', nom_fichier: 'mandat.pdf',
      entite_type: 'mandat', entite_id: cree.mandat,
      type_document_id: tdoc ? tdoc.id : null, actif: true, url: 'https://exemple.invalid/m.pdf',
    })).json())[0].id

    cree.docFerme = (await (await a('documents', 'POST', {
      nom: 'ZZZ VIS PIECE FERMEE', nom_fichier: 'ferme.pdf',
      entite_type: 'compte', entite_id: cree.client,
      type_document_id: tdoc ? tdoc.id : null, actif: true, url: 'https://exemple.invalid/f.pdf',
    })).json())[0].id

    cree.docOuvert = (await (await a('documents', 'POST', {
      nom: 'ZZZ VIS PIECE OUVERTE', nom_fichier: 'ouvert.pdf',
      entite_type: 'compte', entite_id: cree.client,
      type_document_id: tdoc ? tdoc.id : null, actif: true, url: 'https://exemple.invalid/o.pdf',
      visible_partenaire: true,
    })).json())[0].id

    // ── UNE RECOMMANDATION PAR GROUPE D'ÉTAPE ──
    const etapes = await (await a('etapes_recommandation?select=id,libelle,libelle_partenaire')).json()
    const uneDe = (lib) => etapes.find((e) => e.libelle === lib)
    for (const [ref, lib] of [['ZZZ VIS ETUDE', 'Consultation'], ['ZZZ VIS REFUS', 'Refusée']]) {
      const e = uneDe(lib)
      if (e) {
        await a('recommandations', 'POST', {
          nom: ref, compte_id: cree.client, etape_id: e.id, actif: true,
        })
      }
    }

    // ── LA CLÉ ──
    const cle = 'kw_' + crypto.randomBytes(32).toString('base64url')
    await a('cles_api_partenaires', 'POST', {
      compte_id: cree.part, libelle: 'ZZZ VIS', prefixe: cle.slice(0, 11),
      empreinte: crypto.createHash('sha256').update(cle).digest('hex'),
    })

    const pat = await (await fetch(BASE + '/api/partenaire/patrimoine', {
      headers: { Authorization: 'Bearer ' + cle },
    })).json()
    const reco = await (await fetch(BASE + '/api/partenaire/recommandations', {
      headers: { Authorization: 'Bearer ' + cle },
    })).json()

    const noms = (pat.documents ?? []).map((d) => d.nom)

    console.log('')
    console.log('══ ① LES MANDATS, PAR PRINCIPE ══')
    dire(noms.includes('ZZZ VIS PIECE DE MANDAT'), 'la piece d un mandat est rendue',
      noms.includes('ZZZ VIS PIECE DE MANDAT') ? 'oui' : '*** absente ***')

    console.log('')
    console.log('══ ② LE RESTE, AU CAS PAR CAS ══')
    dire(noms.includes('ZZZ VIS PIECE OUVERTE'), 'une piece marquee visible est rendue',
      noms.includes('ZZZ VIS PIECE OUVERTE') ? 'oui' : '*** absente ***')
    dire(!noms.includes('ZZZ VIS PIECE FERMEE'), 'une piece NON marquee reste fermee',
      noms.includes('ZZZ VIS PIECE FERMEE') ? '*** ELLE SORT ***' : 'fermee')

    console.log('')
    console.log('══ ③ LE DEFAUT EST FERME ══')
    //
    // C'est le point le plus important : les 19 700 documents deja en base ne doivent pas sortir.
    const total = (await (await a('documents?select=id&limit=1&actif=eq.true', 'HEAD')).headers) // lisibilite
    const ouvertsEnBase = (await (await a('documents?visible_partenaire=eq.true&select=id')).json()).length
    dire(ouvertsEnBase <= 1, 'un seul document est ouvert dans toute la base',
      ouvertsEnBase + ' ouvert(s) — celui de cet essai')

    console.log('')
    console.log('══ ④ LES ETAPES SONT SIMPLIFIEES ══')
    const etapesVues = (reco.recommandations ?? []).map((r) => r.etape?.libelle_partenaire)
    dire(etapesVues.includes('À l’étude') || etapesVues.includes("À l'étude"),
      '« Consultation » se lit « A l etude »', JSON.stringify(etapesVues))
    dire(etapesVues.includes('Non aboutie'), '« Refusée » se lit « Non aboutie »')

    const internes = (reco.recommandations ?? []).map((r) => r.etape?.libelle)
    dire(internes.includes('Consultation') && internes.includes('Refusée'),
      'l etape interne reste disponible pour nous', JSON.stringify(internes))
  } finally {
    await menage()
    const reste = (await (await a('comptes?nom=like.ZZZ VIS*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LES REGLES DE MICHEL SONT TENUES'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
