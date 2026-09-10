// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES LIENS QUI NE MARCHENT QUE DANS UN SENS
//
// ══ POURQUOI CE SCRIPT EXISTE : TROIS FOIS LA MÊME FAUTE ══
//
// Naoëlle, 10/09/2026 : « lui il a deux compteurs rattachés, mais quand je vais sur un de ces
// compteurs je ne vois pas son contact dans rattachements. Vérifie, parce qu'on peut pas avoir
// toujours des erreurs. »
//
// Elle avait raison, et c'était la TROISIÈME occurrence de la même faute :
//
//   09/09  un contact montrait un site, le site ne montrait pas le contact
//          (`contacts_sites` était vide : la fiche site n'affichait jamais personne)
//   09/09  le signataire d'un contrat menait à sa fiche en lecture seule, et pas en édition
//   10/09  un contact montrait ses compteurs, le compteur ne montrait pas ses contacts
//
// Chaque fois découverte par hasard, en cliquant. Ce script cherche les autres AVANT qu'on tombe
// dessus.
//
// ══ CE QU'IL VÉRIFIE, ET CE QU'IL NE PEUT PAS VÉRIFIER ══
//
// Il vérifie les DEUX FAITS qu'on peut établir mécaniquement :
//
//   ① LE LIEN EXISTE-T-IL EN BASE dans les deux sens, ou pointe-t-il dans le vide ?
//     Une clé étrangère qui désigne une ligne supprimée, une table de liaison à moitié remplie.
//   ② LES DEUX CÔTÉS EN COMPTENT-ILS AUTANT ?
//     Si A voit 12 B et que les B ne voient que 9 A, il manque trois lignes quelque part.
//
// Il NE PEUT PAS vérifier que l'écran AFFICHE ce lien : c'est du JSX, pas de la donnée. Le
// rapport dit donc « la donnée permet de l'afficher des deux côtés », et c'est à la relecture de
// l'écran de dire s'il le fait. C'est exactement la limite qui a laissé passer les trois cas
// ci-dessus — la donnée était saine à chaque fois.
//
//   node scripts/auditer-rattachements.cjs
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')

function connexion() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const url = fs.readFileSync(chemin, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!url) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return new Client({ connectionString: url[1].trim(), ssl: { rejectUnauthorized: false }, statement_timeout: 120000 })
}

/**
 * LES RATTACHEMENTS QUE L'APPLICATION MONTRE, un par onglet « Rattachements ».
 *
 * `de` et `vers` nomment les deux fiches ; `sql` compte les liens réels. Chaque entrée dit aussi
 * OÙ chacun des deux côtés est censé s'afficher, pour que le rapport puisse pointer l'écran à
 * relire plutôt qu'un nom de table.
 */
const LIENS = [
  {
    nom: 'contact ↔ compteur (responsable)',
    colonne: 'compteurs.responsable_contact_id',
    ecranA: 'ContactDetail · Rattachements — liste les compteurs',
    ecranB: 'CompteurDetail · Rattachements — carte Contacts',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from compteurs cp
            left join contacts ct on ct.id = cp.responsable_contact_id
           where cp.responsable_contact_id is not null`,
  },
  {
    nom: 'contact ↔ compteur (conseil syndical)',
    colonne: 'compteurs.contact_conseil_syndical_id',
    ecranA: 'ContactDetail · Rattachements — liste les compteurs',
    ecranB: 'CompteurDetail · Rattachements — carte Contacts',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from compteurs cp
            left join contacts ct on ct.id = cp.contact_conseil_syndical_id
           where cp.contact_conseil_syndical_id is not null`,
  },
  {
    nom: 'contact ↔ compte',
    colonne: 'contacts_comptes',
    ecranA: 'ContactDetail · Rattachements — liste les comptes',
    ecranB: 'CompteDetail · onglet Contacts',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null or cp.id is null)::int as pointe_dans_le_vide
            from contacts_comptes cc
            left join contacts ct on ct.id = cc.contact_id
            left join comptes cp on cp.id = cc.compte_id`,
  },
  {
    nom: 'contrat ↔ compteur',
    colonne: 'contrats_compteurs',
    ecranA: 'ContratDetail · Périmètre — liste les compteurs',
    ecranB: 'CompteurDetail · onglet Contrats — chronologie',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null or cp.id is null)::int as pointe_dans_le_vide
            from contrats_compteurs x
            left join contrats ct on ct.id = x.contrat_id
            left join compteurs cp on cp.id = x.compteur_id`,
  },
  {
    nom: 'mandat ↔ compteur',
    colonne: 'mandats_compteurs',
    ecranA: 'MandatDetail · Périmètre couvert',
    ecranB: 'CompteurDetail · onglet Mandats',
    sql: `select count(*)::int as liens,
                 count(*) filter (where m.id is null or cp.id is null)::int as pointe_dans_le_vide
            from mandats_compteurs x
            left join mandats m on m.id = x.mandat_id
            left join compteurs cp on cp.id = x.compteur_id`,
  },
  {
    nom: 'recommandation ↔ compteur',
    colonne: 'recommandations_compteurs',
    ecranA: 'RecommandationDetail · Rattachements — carte Périmètre',
    ecranB: 'CompteurDetail · Couverture (Reco en cours)',
    sql: `select count(*)::int as liens,
                 count(*) filter (where r.id is null or cp.id is null)::int as pointe_dans_le_vide
            from recommandations_compteurs x
            left join recommandations r on r.id = x.recommandation_id
            left join compteurs cp on cp.id = x.compteur_id`,
  },
  {
    nom: 'opportunité ↔ compteur',
    colonne: 'opportunites_compteurs',
    ecranA: 'OpportuniteDetail · Rattachements',
    ecranB: 'CompteurDetail — AUCUN ÉCRAN NE LE MONTRE',
    sql: `select count(*)::int as liens,
                 count(*) filter (where o.id is null or cp.id is null)::int as pointe_dans_le_vide
            from opportunites_compteurs x
            left join opportunites o on o.id = x.opportunite_id
            left join compteurs cp on cp.id = x.compteur_id`,
  },
  {
    nom: 'contrat ↔ signataire',
    colonne: 'contrats.contact_signataire_id',
    ecranA: 'ContratDetail · champ Signataire (lien vers le contact)',
    ecranB: 'ContactDetail — AUCUN ÉCRAN NE LE MONTRE',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from contrats c
            left join contacts ct on ct.id = c.contact_signataire_id
           where c.contact_signataire_id is not null`,
  },
  {
    nom: 'mandat ↔ signataire',
    colonne: 'mandats.contact_signataire_id',
    ecranA: 'MandatDetail · carte Signataire (lien vers le contact)',
    ecranB: 'ContactDetail — AUCUN ÉCRAN NE LE MONTRE',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from mandats m
            left join contacts ct on ct.id = m.contact_signataire_id
           where m.contact_signataire_id is not null`,
  },
  {
    nom: 'requête ↔ contact',
    colonne: 'requetes.contact_id',
    ecranA: 'RequeteDetail · Rattachements',
    ecranB: 'ContactDetail — AUCUN ÉCRAN NE LE MONTRE',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from requetes r
            left join contacts ct on ct.id = r.contact_id
           where r.contact_id is not null`,
  },
  {
    nom: 'tâche ↔ contact',
    colonne: 'actions.contact_id',
    ecranA: 'ActionDetail · champ Contact (lien vers le contact)',
    ecranB: 'ContactDetail · Activité — les tâches y figurent',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from actions a
            left join contacts ct on ct.id = a.contact_id
           where a.contact_id is not null`,
  },
  {
    nom: 'suivi de contrat ↔ contact principal',
    colonne: 'suivis_contrats.contact_principal_id',
    ecranA: 'SuiviContratDetail · Rattachements',
    ecranB: 'ContactDetail — AUCUN ÉCRAN NE LE MONTRE',
    sql: `select count(*)::int as liens,
                 count(*) filter (where ct.id is null)::int as pointe_dans_le_vide
            from suivis_contrats s
            left join contacts ct on ct.id = s.contact_principal_id
           where s.contact_principal_id is not null`,
  },
  {
    nom: 'compteur ↔ compte',
    colonne: 'compteurs.compte_id',
    ecranA: 'CompteurDetail · Rattachements — Hiérarchie',
    ecranB: 'CompteDetail · onglet Compteurs',
    sql: `select count(*)::int as liens,
                 count(*) filter (where cp.id is null)::int as pointe_dans_le_vide
            from compteurs c
            left join comptes cp on cp.id = c.compte_id`,
  },
]

/**
 * LES INCOHÉRENCES DE PÉRIMÈTRE : un lien valide, mais qui traverse deux clients différents.
 *
 * Ce ne sont pas des liens cassés — ils s'affichent, ils s'ouvrent — mais ils racontent une
 * histoire impossible : un responsable qui n'est pas au client dont il gère le compteur, un
 * contrat rattaché à un compte et couvrant les compteurs d'un autre.
 */
const TRAVERSEES = [
  {
    nom: 'responsable de compteur non rattaché au compte du compteur',
    sql: `select count(*)::int as n from compteurs cp
           join contacts ct on ct.id = cp.responsable_contact_id
          where not exists (select 1 from contacts_comptes cc
                             where cc.contact_id = ct.id and cc.compte_id = cp.compte_id)`,
  },
  {
    nom: 'conseil syndical non rattaché au compte du compteur',
    sql: `select count(*)::int as n from compteurs cp
           join contacts ct on ct.id = cp.contact_conseil_syndical_id
          where not exists (select 1 from contacts_comptes cc
                             where cc.contact_id = ct.id and cc.compte_id = cp.compte_id)`,
  },
  {
    nom: 'contrat couvrant un compteur d’un AUTRE compte que le sien',
    sql: `select count(*)::int as n from contrats_compteurs x
           join contrats ct on ct.id = x.contrat_id
           join compteurs cp on cp.id = x.compteur_id
          where ct.compte_id is not null and ct.compte_id <> cp.compte_id`,
  },
  {
    nom: 'mandat couvrant un compteur d’un AUTRE compte que le sien',
    sql: `select count(*)::int as n from mandats_compteurs x
           join mandats m on m.id = x.mandat_id
           join compteurs cp on cp.id = x.compteur_id
          where m.compte_id is not null and m.compte_id <> cp.compte_id`,
  },
  {
    nom: 'recommandation couvrant un compteur d’un AUTRE compte que le sien',
    sql: `select count(*)::int as n from recommandations_compteurs x
           join recommandations r on r.id = x.recommandation_id
           join compteurs cp on cp.id = x.compteur_id
          where r.compte_id is not null and r.compte_id <> cp.compte_id`,
  },
  {
    nom: 'signataire de contrat non rattaché au compte du contrat',
    sql: `select count(*)::int as n from contrats c
           join contacts ct on ct.id = c.contact_signataire_id
          where c.compte_id is not null
            and not exists (select 1 from contacts_comptes cc
                             where cc.contact_id = ct.id and cc.compte_id = c.compte_id)`,
  },
]

async function main() {
  const client = connexion()
  await client.connect()
  try {
    console.log('')
    console.log('LES LIENS, ET CE QUE CHAQUE CÔTÉ EN MONTRE')
    console.log('─'.repeat(100))

    let casses = 0
    let sansReciproque = 0
    for (const lien of LIENS) {
      const { rows } = await client.query(lien.sql)
      const { liens, pointe_dans_le_vide: vide } = rows[0]
      const muet = lien.ecranB.includes('AUCUN ÉCRAN')
      if (vide > 0) casses++
      if (muet && liens > 0) sansReciproque++

      const etat = vide > 0 ? '  CASSÉ ' : muet ? ' UN SENS' : '   ok   '
      console.log(`${etat} ${lien.nom}`)
      console.log(`         ${String(liens).padStart(6)} lien(s) · ${lien.colonne}`)
      if (vide > 0) console.log(`         ${vide} pointe(nt) une ligne qui n'existe plus`)
      console.log(`         A : ${lien.ecranA}`)
      console.log(`         B : ${lien.ecranB}`)
      console.log('')
    }

    console.log('LES LIENS QUI TRAVERSENT DEUX CLIENTS')
    console.log('─'.repeat(100))
    let traversees = 0
    for (const t of TRAVERSEES) {
      const { rows } = await client.query(t.sql)
      const n = rows[0].n
      if (n > 0) traversees += n
      console.log(`${n > 0 ? '  À VOIR' : '   ok  '} ${String(n).padStart(6)}  ${t.nom}`)
    }

    console.log('')
    console.log('─'.repeat(100))
    console.log(`liens cassés (pointent dans le vide) : ${casses}`)
    console.log(`liens qu'un seul écran montre        : ${sansReciproque}`)
    console.log(`liens qui traversent deux clients    : ${traversees}`)
    console.log('')
    console.log("RAPPEL : ce script lit la DONNÉE. Qu'un écran affiche bien le lien reste à voir")
    console.log('à l’œil — c’est cette limite qui a laissé passer les trois cas de septembre.')
    console.log('')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message)
  process.exit(1)
})
