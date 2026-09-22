// ════════════════════════════════════════════════════════════════════════════════════════════════
// L'EXPLORATEUR : ON CHOISIT UN OBJET, ON VOIT SES CHAMPS, ON FILTRE
//
// William, 14/09/2026 : « j'aurai besoin d'une plateforme sur laquelle je peux naviguer. Le but
// premier est de choisir l'objet que je veux puis ça affiche tous les champs avec plein de filtres
// (type de champ, en ligne ou non, utilisé ou non…), et un champ de recherche. »
//
// ══ POURQUOI UNE SECONDE PAGE PLUTÔT QU'UN ONGLET DANS LA PREMIÈRE ════════════════════════════
//
// `carte.html` répond à « qui touche à cette colonne ? » : on arrive par un nom de champ, la page
// déroule les 2 158 lignes et on cherche dedans. La question posée ici part de l'autre bout — on
// sait de quel OBJET on parle, on veut son inventaire complet et le trier.
//
// Les deux tiennent mal dans une seule page : un tableau qui déroule tout ne peut pas en même temps
// être l'inventaire d'un objet, et une navigation par objet cache le balayage global. Deux pages,
// deux entrées, les mêmes données — écrites par le même passage, donc jamais en désaccord.
//
// ══ CE QUE « EN LIGNE OU NON » VEUT DIRE ICI, ET POURQUOI IL Y A DEUX FILTRES ══════════════════
//
// « Visible » et « Utilisé » ne sont pas la même question, et les confondre coûte cher dans les deux
// sens : `recommandations.date_cloture_manuelle` ne s'affiche nulle part et décide qu'un dossier
// reste clos ; d'autres champs s'affichent et ne servent plus à rien. Les deux filtres sont donc
// séparés, et c'est leur CROISEMENT qui répond à « qu'est-ce qu'on peut supprimer » — d'où le bouton
// « ni vu ni utilisé », qui est le seul raccourci vraiment actionnable de la page.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const { theme, POLICES, TEXTE, MONO } = require('./carte-theme.cjs')

const h = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const nombre = (n) => Number(n || 0).toLocaleString('fr-FR')

/**
 * @param {object} donnees
 * @param {Array} donnees.catalogue  lignes de 6-catalogue-des-champs (sans l'en-tête)
 * @param {Array} donnees.tables     lignes de 2-par-table
 * @param {string} donnees.genereLe
 */
function pageExplorateur({ catalogue, tables, genereLe }) {
  /* L'INTERNEMENT, ICI AUSSI. Les mêmes phrases reviennent des milliers de fois — « antérieur au
     dépôt — créé dans Supabase au moment de la reprise Salesforce » pèse 78 octets et sert 1 016
     fois. Les stocker une fois divise le poids de la page par trois sans rien perdre. */
  const dico = []
  const indice = new Map()
  const interner = (v) => {
    const s = v == null ? '' : String(v)
    if (!indice.has(s)) {
      indice.set(s, dico.length)
      dico.push(s)
    }
    return indice.get(s)
  }
  interner('')

  const metaTable = new Map(tables.map((t) => [t[0], t]))

  /* LES FAMILLES SONT UN OUTIL DE NAVIGATION, PAS UNE VÉRITÉ DU SCHÉMA. 170 entrées à plat, triées
     alphabétiquement, mettent `types_roles` entre `types_requetes` et `utilisateurs` : on parcourt
     trente listes de référence pour trouver la table métier d'à côté. Les trois familles ci-dessous
     sont déduites du nom et de la nature — c'est grossier, et c'est suffisant pour que l'œil trouve
     `contrats` en une seconde. */
  const famille = (nom, nature) => {
    if (nature === 'vue') return 2
    if (/^(statuts|types|etapes|referentiel|coefficients|formules)_/.test(nom)) return 1
    return 0
  }

  const objets = []
  const indexObjet = new Map()
  for (const l of catalogue) {
    if (indexObjet.has(l[0])) continue
    const meta = metaTable.get(l[0]) ?? []
    indexObjet.set(l[0], objets.length)
    objets.push([l[0], l[1] === 'vue' ? 1 : 0, Number(meta[2] || 0), 0, famille(l[0], l[1])])
  }

  const types = []
  const indexType = new Map()
  const typeIdx = (t) => {
    if (!indexType.has(t)) {
      indexType.set(t, types.length)
      types.push(t)
    }
    return indexType.get(t)
  }

  const TROIS = { non: 0, oui: 1, probable: 2 }
  const origineCode = (comment) => {
    if (comment.startsWith('migration')) return 0
    if (comment.startsWith('antérieur')) return 2
    return 1
  }

  const champs = catalogue.map((l) => {
    const o = indexObjet.get(l[0])
    objets[o][3]++
    return [
      o,
      l[2],
      interner(l[3]),
      typeIdx(l[4]),
      l[5] === 'obligatoire' ? 1 : 0,
      interner(l[6]),
      interner(l[7]),
      interner(l[8]),
      interner(l[9]),
      interner(l[10]),
      TROIS[l[11]] ?? 0,
      interner(l[12]),
      TROIS[l[13]] ?? 0,
      interner(l[14]),
      interner(l[15]),
      /^libre/.test(l[6]) ? 0 : 1,
      origineCode(l[10] ?? ''),
    ]
  })

  const payload = JSON.stringify({ dico, objets, champs, types })
  const nbVisibles = champs.filter((c) => c[12] === 1).length
  const nbProd = champs.filter((c) => c[10] === 1).length
  const nbMort = champs.filter((c) => c[10] === 0 && c[12] === 0).length

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Explorateur des objets Kimatch</title>
${POLICES}
<style>
${theme}
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--fond); color: var(--encre);
    font-family: ${TEXTE}; font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }

  /* ── Deux colonnes : la liste des objets ne bouge pas, l'inventaire défile ── */
  .app { display: grid; grid-template-columns: 1fr; min-height: 100%; }
  @media (min-width: 940px) { .app { grid-template-columns: 300px 1fr; } }

  .cote {
    background: var(--surface); border-right: 1px solid var(--ligne);
    display: flex; flex-direction: column;
  }
  @media (min-width: 940px) { .cote { position: sticky; top: 0; height: 100vh; } }
  /* Sur téléphone la liste des objets se replie : elle ferait trois écrans avant le contenu. */
  @media (max-width: 939px) {
    .cote { border-right: 0; border-bottom: 1px solid var(--ligne); }
    .cote[data-repliee="oui"] .corps-cote { display: none; }
  }
  .marque { padding: 16px 18px 12px; border-bottom: 1px solid var(--ligne); }
  .marque .eyebrow { font-family: ${MONO}; font-size: 10px; letter-spacing: .12em;
                     text-transform: uppercase; color: var(--accent); margin: 0 0 4px; }
  .marque h1 { font-size: 19px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
  .marque .quand { margin: 3px 0 0; font-size: 12px; color: var(--encre-pale); }
  .bascule { display: none; }
  @media (max-width: 939px) {
    .bascule { display: block; margin-top: 10px; font: inherit; font-size: 13px; font-weight: 600;
               padding: 7px 12px; border: 1px solid var(--ligne); border-radius: 5px;
               background: var(--fond); color: var(--encre); cursor: pointer; width: 100%; }
  }
  .corps-cote { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .chercher-objet { padding: 12px 14px 8px; }
  .chercher-objet input {
    width: 100%; font: inherit; font-family: ${MONO}; font-size: 13px; padding: 8px 10px;
    border: 1px solid var(--ligne); border-radius: 5px; background: var(--fond); color: var(--encre);
  }
  .chercher-objet input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  nav { overflow-y: auto; padding: 0 8px 18px; flex: 1; min-height: 0; }
  @media (max-width: 939px) { nav { max-height: 46vh; } }
  .famille { font-family: ${MONO}; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
             color: var(--encre-pale); padding: 14px 10px 5px; }
  .objet {
    display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left;
    font: inherit; font-family: ${MONO}; font-size: 13px; padding: 6px 10px; border: 0;
    border-radius: 5px; background: transparent; color: var(--encre); cursor: pointer;
  }
  .objet:hover { background: var(--trame); }
  .objet[aria-current="true"] { background: var(--accent); color: #fff; font-weight: 700; }
  .objet[data-o="-1"] { font-family: ${TEXTE}; font-weight: 600; margin-bottom: 4px; }
  .objet .n { margin-left: auto; font-size: 11px; color: var(--encre-pale); font-variant-numeric: tabular-nums; }
  .objet[aria-current="true"] .n { color: rgba(255,255,255,.8); }

  /* ── Le panneau principal ── */
  .principal { padding: 22px 20px 70px; max-width: 1400px; min-width: 0; }
  .titre h2 { font-family: ${MONO}; font-size: 25px; margin: 0; font-weight: 700; letter-spacing: -.02em;
              overflow-wrap: anywhere; }
  .titre .sous { margin: 6px 0 0; color: var(--encre-douce); font-size: 14px; }
  .chiffres { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; }
  .chip { font-family: ${MONO}; font-size: 11px; padding: 4px 9px; border-radius: 999px;
          border: 1px solid var(--ligne); background: var(--surface); color: var(--encre-douce); }
  .chip b { color: var(--encre); font-variant-numeric: tabular-nums; }

  .filtres {
    position: sticky; top: 0; z-index: 4; margin: 18px 0 0; padding: 12px 0;
    background: var(--fond); border-bottom: 1px solid var(--ligne);
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  }
  .filtres input[type=search] {
    flex: 1 1 240px; min-width: 0; font: inherit; font-family: ${MONO}; font-size: 13.5px;
    padding: 8px 11px; border: 1px solid var(--ligne); border-radius: 5px;
    background: var(--surface); color: var(--encre);
  }
  .filtres select {
    font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid var(--ligne);
    border-radius: 5px; background: var(--surface); color: var(--encre); max-width: 190px;
  }
  .filtres select[data-actif="oui"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .filtres input:focus-visible, .filtres select:focus-visible, .raccourci:focus-visible,
  .objet:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .raccourci { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 11px;
               border: 1px solid var(--absent); border-radius: 5px; background: var(--absent-doux);
               color: var(--absent); cursor: pointer; white-space: nowrap; }
  .raccourci[aria-pressed="true"] { background: var(--absent); color: #fff; }
  .vider { font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid var(--ligne);
           border-radius: 5px; background: var(--surface); color: var(--encre-douce); cursor: pointer; }
  .compte { font-family: ${MONO}; font-size: 12px; color: var(--encre-pale); margin-left: auto;
            font-variant-numeric: tabular-nums; }

  .cadre { background: var(--surface); border: 1px solid var(--ligne); border-radius: 6px;
           overflow-x: auto; margin-top: 14px; }
  table { width: 100%; min-width: 760px; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--ligne); vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  thead th { font-family: ${MONO}; font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
             color: var(--encre-pale); font-weight: 500; background: var(--trame); white-space: nowrap;
             position: sticky; top: 0; }
  td.col { font-family: ${MONO}; font-size: 13.5px; font-weight: 500; white-space: nowrap; }
  td.lib { font-size: 13.5px; font-weight: 600; }
  td.type { font-family: ${MONO}; font-size: 11.5px; color: var(--encre-pale); white-space: nowrap; }
  /* LA CELLULE DES VALEURS EST BORNÉE EN HAUTEUR, pas seulement en largeur. Sans ça, un champ à
     dix-sept valeurs faisait une ligne de tableau de 120 pixels et on ne voyait plus que quatre
     champs par écran — l'inventaire d'un objet ne se parcourait plus. Trois lignes suffisent à
     reconnaître un vocabulaire ; le détail les donne toutes. */
  td.val { font-family: ${MONO}; font-size: 11.5px; color: var(--encre-douce); max-width: 340px; }
  td.val > span.serre { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
                        overflow: hidden; }
  td.date { font-family: ${MONO}; font-size: 11.5px; color: var(--encre-pale); white-space: nowrap; }
  td.grp { font-family: ${MONO}; font-size: 12px; color: var(--accent); white-space: nowrap; }
  .obl { font-family: ${MONO}; font-size: 9.5px; color: var(--flou); border: 1px solid var(--flou);
         border-radius: 2px; padding: 0 3px; margin-left: 6px; }

  .p { font-family: ${MONO}; font-size: 10px; font-weight: 500; letter-spacing: .05em;
       text-transform: uppercase; padding: 2px 6px; border-radius: 3px; border: 1px solid transparent;
       white-space: nowrap; display: inline-block; }
  .p.oui  { background: var(--accent-doux); color: var(--sur); border-color: var(--accent-bord); }
  .p.flou { background: var(--flou-doux); color: var(--flou); border-color: var(--flou); }
  .p.non  { background: var(--absent-doux); color: var(--absent); border-color: var(--absent); }

  tr.champ { cursor: pointer; }
  tr.champ:hover td { background: var(--trame); }
  tr.champ:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  tr.detail > td { background: var(--trame); padding: 12px 14px; }
  .bd { display: grid; grid-template-columns: 1fr; gap: 1px; padding: 5px 0; }
  @media (min-width: 760px) { .bd { grid-template-columns: 230px 1fr; gap: 14px; } }
  .bd + .bd { border-top: 1px solid var(--ligne); }
  .bt { font-family: ${MONO}; font-size: 10px; letter-spacing: .05em; text-transform: uppercase;
        color: var(--encre-pale); }
  .bv { font-size: 13px; color: var(--encre-douce); overflow-wrap: anywhere; }

  .vide { margin-top: 26px; padding: 24px; text-align: center; color: var(--encre-pale);
          border: 1px dashed var(--ligne); border-radius: 6px; }
  .plus { margin-top: 16px; text-align: center; }
  .plus button { font: inherit; font-weight: 600; font-size: 14px; padding: 9px 18px;
                 border: 1px solid var(--ligne); border-radius: 5px; background: var(--surface);
                 color: var(--encre); cursor: pointer; }
  .note { margin-top: 30px; font-size: 13px; color: var(--encre-pale); max-width: 76ch; }
  .note b { color: var(--encre-douce); }
  code { font-family: ${MONO}; font-size: .88em; background: var(--accent-doux); color: var(--sur);
         padding: 1px 4px; border-radius: 3px; }
</style>

<div class="app">
  <aside class="cote" id="cote" data-repliee="oui">
    <div class="marque">
      <p class="eyebrow">Kimatch · relevé du ${h(genereLe)}</p>
      <h1>Explorateur des objets</h1>
      <p class="quand">${nombre(objets.length)} objets · ${nombre(champs.length)} champs</p>
      <button type="button" class="bascule" id="bascule" aria-expanded="false">Choisir un objet</button>
    </div>
    <div class="corps-cote">
      <div class="chercher-objet">
        <input type="search" id="qObjet" placeholder="contrats, compteurs, statuts…"
               aria-label="Chercher un objet" autocomplete="off">
      </div>
      <nav id="objets" aria-label="Les objets"></nav>
    </div>
  </aside>

  <main class="principal">
    <div class="titre" id="titre"></div>

    <div class="filtres">
      <input type="search" id="q" placeholder="nom du champ, libellé, valeur (ACTIF, Syndic…)"
             aria-label="Chercher un champ" autocomplete="off">
      <select id="fType" aria-label="Type de champ"></select>
      <select id="fVisible" aria-label="Visible dans l'interface">
        <option value="">Visible : tous</option>
        <option value="1">Visible à l'écran</option>
        <option value="2">Visibilité probable</option>
        <option value="0">Jamais affiché</option>
      </select>
      <select id="fProd" aria-label="Utilisé en production">
        <option value="">Utilisé : tous</option>
        <option value="1">Utilisé en prod</option>
        <option value="2">Usage probable</option>
        <option value="0">Inutilisé</option>
      </select>
      <select id="fValeurs" aria-label="Valeurs possibles">
        <option value="">Valeurs : toutes</option>
        <option value="1">Liste fermée</option>
        <option value="0">Saisie libre</option>
      </select>
      <select id="fOblig" aria-label="Obligatoire">
        <option value="">Saisie : toutes</option>
        <option value="1">Obligatoire</option>
        <option value="0">Facultatif</option>
      </select>
      <select id="fOrigine" aria-label="Origine du champ">
        <option value="">Origine : toutes</option>
        <option value="0">Créé par migration</option>
        <option value="1">Daté au plus tard</option>
        <option value="2">Socle Salesforce</option>
      </select>
      <button type="button" class="raccourci" id="fMort" aria-pressed="false"
              title="Ni affiché nulle part, ni utilisé par une règle, une formule ou l'application">
        Ni vu ni utilisé
      </button>
      <button type="button" class="vider" id="vider">Tout remettre à zéro</button>
      <span class="compte" id="compte"></span>
    </div>

    <div id="resultats"></div>
    <div class="plus" id="plus" hidden><button type="button">Voir la suite</button></div>

    <p class="note">
      <b>« Visible » et « utilisé » sont deux questions différentes.</b> Un champ peut être invisible
      et vital — une clôture manuelle qu'aucun écran n'affiche et qu'un déclencheur lit à chaque
      enregistrement — ou affiché et mort. Seul le croisement des deux, le bouton
      <b>« ni vu ni utilisé »</b>, désigne ce qu'on peut envisager de supprimer : ${nombre(nbMort)}
      champs aujourd'hui. Et <b>« probable » n'est jamais un fait</b> : c'est une présomption, tirée
      d'une table lue en entier ou d'une fonction SQL qui cite le champ sans qu'on puisse prouver
      qu'elle parle de celui-là. Cliquez une ligne : le détail dit toujours d'où vient la réponse.
      Régénéré par <code>npm run carte</code>.
    </p>
  </main>
</div>

<script>
const D = ${payload};
const PAR_PAGE = 300;
const etat = { objet: -1, q: '', type: '', visible: '', prod: '', valeurs: '', oblig: '',
               origine: '', mort: false, montre: PAR_PAGE, qObjet: '' };

const $ = (id) => document.getElementById(id);
const boite = $('resultats');
const echapper = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const nb = (n) => Number(n || 0).toLocaleString('fr-FR');

const FAMILLES = ['Objets métier', 'Listes de référence', 'Vues'];

// ── LA LISTE DES OBJETS ─────────────────────────────────────────────────────────────────────────

function rendreObjets() {
  const q = etat.qObjet;
  /* LA SORTIE D'UN OBJET DOIT EXISTER. Sans cette entrée, on entre dans contrats et on ne peut
     plus qu'en changer : la vue d'ensemble et la recherche sur TOUTE la base — celle qui répond à
     « d'où vient cette valeur que je vois dans un export ? » — devenaient inatteignables une fois
     le premier clic donné. Elles n'étaient joignables qu'en rechargeant la page. */
  let html = '<button type="button" class="objet" data-o="-1" aria-current="'
    + (etat.objet === -1) + '">Tous les objets<span class="n">' + D.champs.length + '</span></button>';
  for (let f = 0; f < 3; f++) {
    const dedans = [];
    for (let i = 0; i < D.objets.length; i++) {
      const o = D.objets[i];
      if (o[4] !== f) continue;
      if (q && !o[0].toLowerCase().includes(q)) continue;
      dedans.push(i);
    }
    if (!dedans.length) continue;
    dedans.sort((a, b) => D.objets[a][0].localeCompare(D.objets[b][0]));
    html += '<p class="famille">' + FAMILLES[f] + ' · ' + dedans.length + '</p>';
    for (const i of dedans) {
      const o = D.objets[i];
      html += '<button type="button" class="objet" data-o="' + i + '" aria-current="'
        + (etat.objet === i) + '">' + echapper(o[0])
        + '<span class="n">' + o[3] + '</span></button>';
    }
  }
  if (!html) html = '<p class="famille">Aucun objet de ce nom</p>';
  $('objets').innerHTML = html;
}

// ── LE FILTRE ───────────────────────────────────────────────────────────────────────────────────

function garde(c) {
  if (etat.objet >= 0 && c[0] !== etat.objet) return false;
  if (etat.mort && !(c[10] === 0 && c[12] === 0)) return false;
  if (etat.type !== '' && c[3] !== Number(etat.type)) return false;
  if (etat.visible !== '' && c[12] !== Number(etat.visible)) return false;
  if (etat.prod !== '' && c[10] !== Number(etat.prod)) return false;
  if (etat.valeurs !== '' && c[15] !== Number(etat.valeurs)) return false;
  if (etat.oblig !== '' && c[4] !== Number(etat.oblig)) return false;
  if (etat.origine !== '' && c[16] !== Number(etat.origine)) return false;
  if (!etat.q) return true;
  /* LA RECHERCHE PORTE SUR CE QU'ON A EN MAIN QUAND ON CHERCHE : le nom technique, le nom affiché,
     les valeurs, et le nom de l'objet. On tombe sur un « EN_NEGOCIATION » dans un export ou un
     message Slack sans savoir de quel champ il vient — taper la valeur donne le champ. */
  return (D.objets[c[0]][0] + ' ' + c[1] + ' ' + D.dico[c[2]] + ' ' + D.dico[c[5]] + ' ' + D.dico[c[13]])
    .toLowerCase().includes(etat.q);
}

// ── L'AFFICHAGE ─────────────────────────────────────────────────────────────────────────────────

function pastille(v) {
  if (v === 1) return '<span class="p oui">oui</span>';
  if (v === 2) return '<span class="p flou">probable</span>';
  return '<span class="p non">non</span>';
}

/** Les valeurs, coupées à six : trente valeurs rendent une cellule plus haute que l'écran. */
function apercuValeurs(v) {
  if (!v) return '';
  const p = v.split(' | ');
  if (p.length <= 6) return '<span class="serre">' + echapper(v) + '</span>';
  return '<span class="serre">' + echapper(p.slice(0, 6).join(' | '))
    + ' <span style="color:var(--encre-pale)">+ ' + (p.length - 6) + '</span></span>';
}

function bloc(titre, valeur) {
  if (!valeur) return '';
  return '<div class="bd"><span class="bt">' + titre + '</span><span class="bv">'
    + echapper(valeur) + '</span></div>';
}

function rendreTitre(gardees) {
  if (etat.objet < 0) {
    $('titre').innerHTML = '<h2>Tous les objets</h2>'
      + '<p class="sous">Choisissez un objet à gauche pour son inventaire complet, ou cherchez '
      + 'directement un champ ou une valeur dans toute la base.</p>'
      + '<div class="chiffres"><span class="chip"><b>' + nb(D.objets.length) + '</b> objets</span>'
      + '<span class="chip"><b>' + nb(D.champs.length) + '</b> champs</span>'
      + '<span class="chip"><b>' + nb(${nbVisibles}) + '</b> visibles à l\\u2019écran</span>'
      + '<span class="chip"><b>' + nb(${nbProd}) + '</b> utilisés en prod</span></div>';
    return;
  }
  const o = D.objets[etat.objet];
  const tous = D.champs.filter((c) => c[0] === etat.objet);
  const v = tous.filter((c) => c[12] === 1).length;
  const p = tous.filter((c) => c[10] === 1).length;
  const l = tous.filter((c) => c[15] === 1).length;
  $('titre').innerHTML = '<h2>' + echapper(o[0]) + '</h2>'
    + '<p class="sous">' + (o[1] ? 'Une vue : elle ne stocke rien, elle recompose ce que d\\u2019autres tables portent.'
        : 'Une table.') + '</p>'
    + '<div class="chiffres">'
    + '<span class="chip"><b>' + nb(tous.length) + '</b> champs</span>'
    + (o[1] ? '' : '<span class="chip" title="Estimation du planificateur Postgres, à moins d\\u20191 % près. Un comptage exact sur 171 tables coûterait trop cher à l\\u2019instance."><b>≈ ' + nb(o[2]) + '</b> lignes en base</span>')
    + '<span class="chip"><b>' + nb(v) + '</b> visibles</span>'
    + '<span class="chip"><b>' + nb(p) + '</b> utilisés en prod</span>'
    + '<span class="chip"><b>' + nb(l) + '</b> à liste fermée</span>'
    + '<span class="chip">' + nb(gardees.length) + ' affichés par les filtres</span>'
    + '</div>';
}

function ligne(c, avecObjet) {
  const id = (D.objets[c[0]][0] + '.' + c[1]).replace(/[^a-zA-Z0-9_.]/g, '');
  let html = '<tr class="champ" data-id="' + id + '" tabindex="0" role="button" aria-expanded="false">'
    + (avecObjet ? '<td class="grp">' + echapper(D.objets[c[0]][0]) + '</td>' : '')
    + '<td class="col">' + echapper(c[1]) + (c[4] ? '<span class="obl">requis</span>' : '') + '</td>'
    + '<td class="lib">' + echapper(D.dico[c[2]]) + '</td>'
    + '<td class="type">' + echapper(D.types[c[3]]) + '</td>'
    + '<td class="val">' + apercuValeurs(D.dico[c[5]]) + '</td>'
    + '<td class="date">' + echapper(D.dico[c[8]] || '\\u2014') + '</td>'
    + '<td>' + pastille(c[10]) + '</td>'
    + '<td>' + pastille(c[12]) + '</td>'
    + '</tr>';
  html += '<tr class="detail" id="d-' + id + '" hidden><td colspan="' + (avecObjet ? 8 : 7) + '">'
    + bloc('Valeurs possibles', D.dico[c[5]])
    + bloc('D\\u2019où viennent ces valeurs', D.dico[c[6]])
    + bloc('Créé par', D.dico[c[7]])
    + bloc('Comment on le sait', D.dico[c[9]])
    + bloc('Ce qui s\\u2019en sert en production', D.dico[c[11]])
    + bloc('Où dans l\\u2019interface', D.dico[c[13]])
    + bloc('Fichiers', D.dico[c[14]])
    + '</td></tr>';
  return html;
}

function rendre() {
  const gardees = D.champs.filter(garde);
  rendreTitre(gardees);
  $('compte').textContent = nb(gardees.length) + (gardees.length > 1 ? ' champs' : ' champ');

  if (!gardees.length) {
    boite.innerHTML = '<p class="vide">Aucun champ ne correspond. Essayez de retirer un filtre, '
      + 'ou cherchez dans tous les objets.</p>';
    $('plus').hidden = true;
    return;
  }

  const avecObjet = etat.objet < 0;
  const tranche = gardees.slice(0, etat.montre);
  let corps = '';
  for (const c of tranche) corps += ligne(c, avecObjet);

  boite.innerHTML = '<div class="cadre"><table><thead><tr>'
    + (avecObjet ? '<th>Objet</th>' : '')
    + '<th>Nom API</th><th>Nom à l\\u2019écran</th><th>Type</th><th>Valeurs possibles</th>'
    + '<th>Créé le</th><th>En prod</th><th>Visible</th>'
    + '</tr></thead><tbody>' + corps + '</tbody></table></div>';
  $('plus').hidden = gardees.length <= etat.montre;
}

// ── LES COMMANDES ───────────────────────────────────────────────────────────────────────────────

/* LE TYPE DE CHAMP EST CONSTRUIT DEPUIS LES DONNÉES, pas écrit à la main : une colonne d'un type
   nouveau apparaîtrait sinon dans le tableau sans jamais apparaître dans son propre filtre. */
(function remplirTypes() {
  const compte = new Map();
  for (const c of D.champs) compte.set(c[3], (compte.get(c[3]) || 0) + 1);
  const ordre = [...compte.keys()].sort((a, b) => D.types[a].localeCompare(D.types[b]));
  let html = '<option value="">Type : tous</option>';
  for (const t of ordre) html += '<option value="' + t + '">' + echapper(D.types[t]) + ' (' + compte.get(t) + ')</option>';
  $('fType').innerHTML = html;
})();

const SELECTS = [['fType', 'type'], ['fVisible', 'visible'], ['fProd', 'prod'],
                 ['fValeurs', 'valeurs'], ['fOblig', 'oblig'], ['fOrigine', 'origine']];
for (const [id, cle] of SELECTS) {
  $(id).addEventListener('change', (e) => {
    etat[cle] = e.target.value;
    e.target.dataset.actif = e.target.value === '' ? 'non' : 'oui';
    etat.montre = PAR_PAGE;
    rendre();
  });
}

$('q').addEventListener('input', (e) => {
  etat.q = e.target.value.trim().toLowerCase();
  etat.montre = PAR_PAGE;
  rendre();
});

$('qObjet').addEventListener('input', (e) => {
  etat.qObjet = e.target.value.trim().toLowerCase();
  rendreObjets();
});

$('fMort').addEventListener('click', () => {
  etat.mort = !etat.mort;
  $('fMort').setAttribute('aria-pressed', String(etat.mort));
  etat.montre = PAR_PAGE;
  rendre();
});

$('vider').addEventListener('click', () => {
  Object.assign(etat, { q: '', type: '', visible: '', prod: '', valeurs: '', oblig: '',
                        origine: '', mort: false, montre: PAR_PAGE });
  $('q').value = '';
  for (const [id] of SELECTS) { $(id).value = ''; $(id).dataset.actif = 'non'; }
  $('fMort').setAttribute('aria-pressed', 'false');
  rendre();
});

$('objets').addEventListener('click', (e) => {
  const b = e.target.closest('.objet');
  if (!b) return;
  choisir(Number(b.dataset.o));
});

$('bascule').addEventListener('click', () => {
  const cote = $('cote');
  const replie = cote.dataset.repliee === 'oui';
  cote.dataset.repliee = replie ? 'non' : 'oui';
  $('bascule').setAttribute('aria-expanded', String(replie));
});

/* L'OBJET CHOISI VIT DANS L'ADRESSE. Sans ça, « regarde le champ X de contrats » s'envoie en
   expliquant où cliquer ; avec, on colle un lien. Le retour arrière du navigateur marche aussi,
   ce qui est le réflexe qu'on a dans une liste dont on est sorti par erreur.

   ══ MAIS L'ADRESSE EST UN CONFORT, PAS UNE CONDITION ══════════════════════════════════════════

   William, 14/09/2026, en ouvrant « comptes » depuis un panneau de prévisualisation :
   « Uncaught SecurityError: Failed to execute 'pushState' on 'History' […] in a document with
   origin 'https://www.claudeusercontent.com' and URL 'about:srcdoc'. »

   Un document about:srcdoc — une page injectée dans un cadre plutôt que chargée depuis une
   adresse — N'A PAS D'ADRESSE À RÉÉCRIRE, et le navigateur refuse. L'exception remontait avant
   rendreObjets() : le clic ne faisait donc RIEN DU TOUT, et la page paraissait cassée alors que
   seule la mise à jour de l'adresse l'était.

   Un lien partageable ne vaut pas de casser la navigation là où il n'a de toute façon aucun sens.
   L'échec est donc absorbé, et il est absorbé ICI plutôt qu'autour de l'appel de choisir : le
   reste de la fonction doit s'exécuter exactement pareil. */
function choisir(i, sansHistorique) {
  etat.objet = i;
  etat.montre = PAR_PAGE;
  if (!sansHistorique) {
    const cible = i < 0 ? '#' : '#' + D.objets[i][0];
    try {
      if (location.hash !== cible) history.pushState(null, '', cible);
    } catch (e) {
      // Page injectée dans un cadre : pas d'adresse à écrire, et rien à réparer.
    }
  }
  // Sur téléphone, choisir un objet doit refermer la liste : sinon on reste devant elle.
  if (window.matchMedia('(max-width: 939px)').matches) {
    $('cote').dataset.repliee = 'oui';
    $('bascule').setAttribute('aria-expanded', 'false');
  }
  rendreObjets();
  rendre();
  window.scrollTo({ top: 0 });
}

function depuisAdresse() {
  /* LE TOUT PREMIER AFFICHAGE PASSE PAR ICI : rien de ce qui s'y trouve n'a le droit de jeter, sinon
     la page reste blanche. Une adresse mal formée — un %E9 isolé collé depuis un mail — suffit à
     faire échouer decodeURIComponent. */
  let nom = '';
  try {
    nom = decodeURIComponent(location.hash.replace(/^#/, ''));
  } catch (e) {
    nom = '';
  }
  const i = nom ? D.objets.findIndex((o) => o[0] === nom) : -1;
  choisir(i, true);
}
window.addEventListener('popstate', depuisAdresse);

boite.addEventListener('click', (e) => {
  const l = e.target.closest('tr.champ');
  if (l) basculerDetail(l);
});
boite.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const l = e.target.closest('tr.champ');
  if (!l) return;
  e.preventDefault();
  basculerDetail(l);
});
function basculerDetail(l) {
  const d = document.getElementById('d-' + l.dataset.id);
  if (!d) return;
  d.hidden = !d.hidden;
  l.setAttribute('aria-expanded', String(!d.hidden));
}

$('plus').querySelector('button').addEventListener('click', () => {
  etat.montre += PAR_PAGE;
  rendre();
});

// La barre oblique met le curseur dans la recherche, comme partout ailleurs.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('q').focus();
  }
});

depuisAdresse();
</script>
`
}

module.exports = { pageExplorateur }
