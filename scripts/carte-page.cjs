// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA CARTE DES DONNÉES, EN PAGE CONSULTABLE
//
// Naoëlle, 08/09/2026 : « et où est-ce que ce sera visible ? est-ce qu'on peut le faire dans un
// fichier excel ou sheet dans un drive avec un bouton synchroniser […] ou fais quelque chose du
// genre meilleur que ça si tu y penses. »
//
// Les CSV répondent à la première moitié : on les dépose dans le Drive, ils s'ouvrent en Sheet, et
// `npm run carte` est le bouton synchroniser.
//
// CETTE PAGE EST LA MOITIÉ « MIEUX QUE ÇA ». Un tableur de 2 071 lignes répond bien à « trie-moi
// les colonnes jamais lues », mal à la question qu'on se pose vraiment devant une migration :
// « qui lit `contrats.date_fin` ? » — il faut ouvrir le fichier, trouver l'onglet, filtrer deux
// colonnes. Ici on tape « date_fin » et la réponse est là. Une adresse, rien à installer, lisible
// sur un téléphone, et toujours à jour puisque c'est la même commande qui l'écrit.
//
// Elle est produite PAR le même passage que les CSV : les deux ne peuvent donc pas divergre.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Échappe ce qui part dans du HTML. Les noms de table sont sûrs, les libellés le sont moins. */
const h = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const nombre = (n) => Number(n).toLocaleString('fr-FR')

/**
 * @param {object} donnees
 * @param {Array} donnees.colonnes  lignes de 1-par-colonne
 * @param {Array} donnees.tables    lignes de 2-par-table
 * @param {Array} donnees.trous     lignes de 4-angles-morts
 */
function pageCarte({ colonnes, tables, trous, genereLe }) {
  /* LES LISTES D'ÉCRANS SONT INTERNÉES. Sur 2 071 lignes il n'existe que 90 listes distinctes —
     « Toute l'app », « Nouveautes », « Contrat Detail, Contrats »… Les stocker une fois et n'en
     garder que l'indice fait passer la charge de 345 Ko à moins d'un tiers, sans rien perdre. */
  const dico = []
  const indice = new Map()
  const interner = (v) => {
    const s = v || ''
    if (!indice.has(s)) {
      indice.set(s, dico.length)
      dico.push(s)
    }
    return indice.get(s)
  }
  /* LA CHAÎNE VIDE EST INTERNÉE LA PREMIÈRE, ET C'EST UNE NÉCESSITÉ, PAS UN DÉTAIL.
     Le commentaire précédent affirmait qu'elle l'était « d'office » et fixait `DICO_VIDE = 0` sans
     rien faire : l'indice 0 tombait sur la première liste d'écrans rencontrée, donc AUCUNE colonne
     n'avait l'indice 0, et la tuile annonçait « 2 071 libellés retrouvés » au lieu de 90. Un
     commentaire qui affirme ce que le code ne fait pas est plus coûteux qu'un code sans commentaire :
     il détourne la relecture. */
  const DICO_VIDE = interner('')
  // [table, colonne, type, obligatoire, lecture(0|1|2), ecriture(0|1), écrans, libellé, fichiers]
  const LECTURE = { non: 0, oui: 1, 'oui (select *)': 2 }
  const lignes = colonnes.map((c) => [
    c[0], c[2], c[3], c[4] ? 1 : 0,
    LECTURE[c[5]] ?? 0,
    c[6] === 'oui' ? 1 : 0,
    interner(c[7]),
    interner(c[9]),
    interner(c[10]),
  ])
  const avecLibelle = lignes.filter((l) => l[7] !== DICO_VIDE).length

  const totalColonnes = lignes.length
  const jamais = lignes.filter((l) => l[4] === 0 && l[5] === 0).length
  const explicites = lignes.filter((l) => l[4] === 1).length
  const etoiles = lignes.filter((l) => l[4] === 2).length
  const tablesJamais = tables.filter((t) => t[9] === 'JAMAIS CITÉE PAR LE CODE')

  const payload = JSON.stringify({ dico, lignes })
  void DICO_VIDE

  return `<title>Carte des données Kimatch</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
  :root {
    /* Le vert de Kimatch, relevé dans son propre thème : la carte parle de Kimatch, elle en porte
       la couleur plutôt qu'une teinte de tableau de bord générique. */
    --accent:      #0A6B57;
    --accent-doux: #E3F0EB;
    --accent-bord: #B7D8CD;

    /* Neutres tirés vers le vert : choisis, pas hérités d'un gris de départ. */
    --fond:        #F6F8F7;
    --surface:     #FFFFFF;
    --encre:       #101715;
    --encre-douce: #48544F;
    --encre-pale:  #7B857F;
    --ligne:       #E0E6E2;
    --trame:       #F1F4F2;

    /* Sémantiques, distinctes de l'accent : un état n'est pas une marque. */
    --sur:         #0A6B57;
    --flou:        #8A5A00;
    --flou-doux:   #FBF2DE;
    --absent:      #A3281E;
    --absent-doux: #FBEBE8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --accent: #4FC4A5; --accent-doux: #12302A; --accent-bord: #21473E;
      --fond: #0E1413; --surface: #151D1B; --encre: #E7EEEB; --encre-douce: #A6B2AD;
      --encre-pale: #74807A; --ligne: #232E2B; --trame: #1A2422;
      --sur: #4FC4A5; --flou: #DCB25E; --flou-doux: #2A2312;
      --absent: #F0908A; --absent-doux: #321A18;
    }
  }
  :root[data-theme="dark"] {
    --accent: #4FC4A5; --accent-doux: #12302A; --accent-bord: #21473E;
    --fond: #0E1413; --surface: #151D1B; --encre: #E7EEEB; --encre-douce: #A6B2AD;
    --encre-pale: #74807A; --ligne: #232E2B; --trame: #1A2422;
    --sur: #4FC4A5; --flou: #DCB25E; --flou-doux: #2A2312;
    --absent: #F0908A; --absent-doux: #321A18;
  }

  * { box-sizing: border-box; }
  body {
    background: var(--fond); color: var(--encre);
    font-family: "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.55; -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; }

  header { border-bottom: 2px solid var(--encre); padding-bottom: 18px; }
  .eyebrow {
    font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: .12em;
    text-transform: uppercase; color: var(--accent); margin: 0 0 10px;
  }
  h1 { font-size: clamp(28px, 5vw, 42px); line-height: 1.05; margin: 0; font-weight: 700;
       letter-spacing: -.02em; text-wrap: balance; }
  .chapeau { max-width: 66ch; margin: 14px 0 0; color: var(--encre-douce); font-size: 16px; }

  /* ── Les quatre nombres : ce qu'on vient chercher avant de fouiller ── */
  .tuiles { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); margin-top: 26px; }
  @media (min-width: 720px) { .tuiles { grid-template-columns: repeat(5, 1fr); } }
  .tuile { background: var(--surface); border: 1px solid var(--ligne); border-radius: 5px; padding: 13px 15px; }
  .tuile { display: flex; flex-direction: column; }
  .tuile .k { font-family: "JetBrains Mono", monospace; font-size: 10.5px; letter-spacing: .07em;
              text-transform: uppercase; color: var(--encre-pale); margin: 0;
              /* Deux lignes réservées : « Nommées par le code » en prend deux, « Colonnes » une.
                 Sans cette réserve, les quatre nombres ne sont pas sur la même ligne de base. */
              min-height: 2.6em; }
  .tuile .v { font-size: 27px; font-weight: 700; line-height: 1.1; margin: 5px 0 0;
              font-variant-numeric: tabular-nums; }
  .tuile .d { margin: 3px 0 0; font-size: 12.5px; color: var(--encre-pale); }
  .tuile.flou .v { color: var(--flou); }
  .tuile.absent .v { color: var(--absent); }

  /* ── La barre de travail, collée en haut : on cherche en gardant les résultats sous les yeux ── */
  .barre {
    position: sticky; top: 0; z-index: 5; margin-top: 26px; padding: 12px 0;
    background: var(--fond); border-bottom: 1px solid var(--ligne);
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  }
  .barre input[type=search] {
    flex: 1 1 260px; min-width: 0; font: inherit; font-family: "JetBrains Mono", monospace;
    font-size: 14px; padding: 9px 12px; border: 1px solid var(--ligne);
    border-radius: 5px; background: var(--surface); color: var(--encre);
  }
  .barre input[type=search]:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .filtres { display: flex; border: 1px solid var(--ligne); border-radius: 5px; overflow: hidden; }
  .filtres button {
    font: inherit; font-size: 13px; font-weight: 600; padding: 8px 12px; border: 0;
    background: var(--surface); color: var(--encre-douce); cursor: pointer; white-space: nowrap;
  }
  .filtres button + button { border-left: 1px solid var(--ligne); }
  .filtres button[aria-pressed="true"] { background: var(--accent); color: var(--surface); }
  .compte { font-family: "JetBrains Mono", monospace; font-size: 12.5px; color: var(--encre-pale);
            font-variant-numeric: tabular-nums; }

  /* ── Les résultats, groupés par table : les colonnes d'une même table se lisent ensemble ── */
  #resultats { margin-top: 4px; }
  .groupe { margin-top: 22px; }
  .groupe > h2 {
    font-family: "JetBrains Mono", monospace; font-size: 15px; font-weight: 700; margin: 0 0 7px;
    display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;
  }
  .groupe > h2 .meta { font-family: "Source Sans 3", sans-serif; font-size: 12.5px;
                       font-weight: 400; color: var(--encre-pale); }
  .cadre { background: var(--surface); border: 1px solid var(--ligne); border-radius: 5px; overflow-x: auto; }
  table { width: 100%; min-width: 640px; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--ligne); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  thead th {
    font-family: "JetBrains Mono", monospace; font-size: 10.5px; letter-spacing: .06em;
    text-transform: uppercase; color: var(--encre-pale); font-weight: 500; background: var(--trame);
    white-space: nowrap;
  }
  td.col { font-family: "JetBrains Mono", monospace; font-size: 13.5px; font-weight: 500; white-space: nowrap; }
  td.type { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--encre-pale); white-space: nowrap; }
  /* Le libellé est du français, pas du code : il porte la fonte de texte, ce qui le distingue de la
     colonne technique juste à sa gauche sans avoir besoin d'un séparateur. */
  td.lib { font-size: 13.5px; font-weight: 600; }
  td.ou { font-size: 13px; color: var(--encre-douce); }
  td.fic { font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: var(--encre-pale); }
  .obl { font-family: "JetBrains Mono", monospace; font-size: 10px; color: var(--flou);
         border: 1px solid var(--flou); border-radius: 2px; padding: 0 3px; margin-left: 6px; }

  /* Une pastille par état : la forme dit l'état autant que le mot, pour le repérer sans lire. */
  .p { font-family: "JetBrains Mono", monospace; font-size: 10.5px; font-weight: 500;
       letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 3px;
       border: 1px solid transparent; white-space: nowrap; display: inline-block; }
  .p.lue  { background: var(--accent-doux); color: var(--sur); border-color: var(--accent-bord); }
  .p.flou { background: var(--flou-doux); color: var(--flou); border-color: var(--flou); }
  .p.non  { background: var(--absent-doux); color: var(--absent); border-color: var(--absent); }
  .p.ecr  { background: transparent; color: var(--encre-douce); border-color: var(--ligne); }

  .vide { margin-top: 30px; padding: 22px; text-align: center; color: var(--encre-pale);
          border: 1px dashed var(--ligne); border-radius: 5px; }
  .plus { margin-top: 18px; text-align: center; }
  .plus button { font: inherit; font-weight: 600; font-size: 14px; padding: 9px 18px;
                 border: 1px solid var(--ligne); border-radius: 5px; background: var(--surface);
                 color: var(--encre); cursor: pointer; }

  details.trous { margin-top: 44px; background: var(--surface); border: 1px solid var(--ligne); border-radius: 5px; }
  details.trous > summary { cursor: pointer; padding: 14px 16px; font-weight: 600; }
  details.trous .dedans { padding: 0 16px 16px; }
  details.trous p { max-width: 70ch; color: var(--encre-douce); font-size: 14px; }
  code { font-family: "JetBrains Mono", monospace; font-size: .88em; background: var(--accent-doux);
         color: var(--sur); padding: 1px 4px; border-radius: 3px; }
  footer { margin-top: 46px; padding-top: 18px; border-top: 1px solid var(--ligne);
           font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: var(--encre-pale); line-height: 1.75; }
</style>

<div class="page">
  <header>
    <p class="eyebrow">Kimatch · relevé du ${h(genereLe)}</p>
    <h1>Carte des données</h1>
    <p class="chapeau">
      Chaque colonne de la base, et l'endroit de l'application qui la lit ou l'écrit. Dérivée du
      schéma vivant et des ${nombre(totalColonnes)} colonnes croisées avec le code — pas tenue à la
      main, donc pas périmée : <code>npm run carte</code> la réécrit.
    </p>
  </header>

  <div class="tuiles">
    <div class="tuile">
      <p class="k">Colonnes</p><p class="v">${nombre(totalColonnes)}</p>
      <p class="d">sur ${nombre(tables.length)} tables et vues</p>
    </div>
    <div class="tuile">
      <p class="k">Nommées par le code</p><p class="v">${nombre(explicites)}</p>
      <p class="d">on sait exactement qui les lit</p>
    </div>
    <div class="tuile flou">
      <p class="k">Lues en select(*)</p><p class="v">${nombre(etoiles)}</p>
      <p class="d">la table est lue en entier</p>
    </div>
    <div class="tuile absent">
      <p class="k">Jamais touchées</p><p class="v">${nombre(jamais)}</p>
      <p class="d">${nombre(tablesJamais.length)} tables entières inutilisées</p>
    </div>
    <div class="tuile">
      <p class="k">Libellé retrouvé</p><p class="v">${nombre(avecLibelle)}</p>
      <p class="d">le nom du champ tel qu'il s'affiche</p>
    </div>
  </div>

  <div class="barre">
    <input type="search" id="q" placeholder="date_fin, contrats, docusign, Contrat Detail…"
           aria-label="Chercher une table, une colonne ou un écran" autocomplete="off">
    <div class="filtres" role="group" aria-label="Filtrer par état">
      <button type="button" data-f="tout" aria-pressed="true">Tout</button>
      <button type="button" data-f="lue" aria-pressed="false">Lues</button>
      <button type="button" data-f="flou" aria-pressed="false">select(*)</button>
      <button type="button" data-f="non" aria-pressed="false">Jamais</button>
      <button type="button" data-f="ecrite" aria-pressed="false">Écrites</button>
    </div>
    <span class="compte" id="compte"></span>
  </div>

  <div id="resultats"></div>
  <div class="plus" id="plus" hidden><button type="button">Voir la suite</button></div>

  <details class="trous">
    <summary>Là où la carte est muette — ${nombre(trous.length)} points</summary>
    <div class="dedans">
      <p>
        Une carte qui invente est pire qu'une carte incomplète, parce que rien ne la contredit.
        Voici donc ce qu'elle ne sait pas.
      </p>
      <p>
        <strong>${nombre(trous.filter((t) => t[0] === 'select(*)').length)} requêtes en
        <code>select('*')</code></strong> : la table est lue en entier, et l'on ne peut pas savoir
        laquelle de ses colonnes sert vraiment à l'écran. Ces colonnes portent la pastille
        <span class="p flou">select(*)</span> — une lecture certaine, une utilisation supposée.
        C'est un choix du code, pas un défaut : <code>fetchContrats</code> lit <code>*</code> pour
        qu'une colonne ajoutée par migration arrive sans qu'on touche au code.
      </p>
      <p>
        <strong>${nombre(trous.filter((t) => t[0] === 'fonction RPC').length)} fonctions SQL</strong>
        appelées par l'application : leurs colonnes vivent dans le corps de la fonction, pas dans
        l'appel. <strong>${nombre(trous.filter((t) => t[0] === 'constante non résolue').length)}
        sélections</strong> passent par une variable calculée à l'exécution.
      </p>
      <p>
        Enfin, « qui lit cette colonne » se lit au niveau de l'ÉCRAN et non du champ affiché : le
        lien entre une colonne et son libellé à l'écran n'est pas déductible du code. La colonne
        « Fichiers » est, elle, toujours exacte — c'est la réponse à retenir en cas de doute.
      </p>
    </div>
  </details>

  <footer>
    Écrite par <b>scripts/cartographier-donnees.cjs</b> — schéma lu dans Supabase, usages relevés
    dans <b>src/</b> et <b>api/</b>.<br>
    « Toute l'app » désigne un fichier atteint par plus de 60 % des écrans : la recherche globale, la
    téléphonie et le profil sont montés dans la mise en page, donc partout.
  </footer>
</div>

<script>
const DONNEES = ${payload};
const PAR_PAGE = 400;
const etat = { q: '', f: 'tout', montre: PAR_PAGE };

const boite = document.getElementById('resultats');
const compte = document.getElementById('compte');
const plus = document.getElementById('plus');

function garde(l) {
  if (etat.f === 'lue' && l[4] !== 1) return false;
  if (etat.f === 'flou' && l[4] !== 2) return false;
  if (etat.f === 'non' && !(l[4] === 0 && l[5] === 0)) return false;
  if (etat.f === 'ecrite' && l[5] !== 1) return false;
  if (!etat.q) return true;
  const q = etat.q;
  // Le libellé est cherché comme le reste : « Référence fournisseur » doit trouver sa colonne.
  return (l[0] + ' ' + l[1] + ' ' + DONNEES.dico[l[6]] + ' ' + DONNEES.dico[l[7]]).toLowerCase().includes(q);
}

const echapper = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * La liste des écrans, coupée à six.
 *
 * Une colonne lue par quarante écrans produisait une cellule de huit centimètres de haut, qui
 * chassait tout le reste du tableau hors de l'écran. Six suffisent pour reconnaître de quoi il
 * s'agit ; le reste est au survol, et la colonne « Fichiers » porte la réponse exacte de toute
 * façon. « Toute l'app » n'est jamais coupé : c'est déjà un résumé.
 */
function ecrans(valeur) {
  if (!valeur) return '';
  const parts = valeur.split(', ');
  if (parts.length <= 6) return echapper(valeur);
  const reste = parts.length - 6;
  return '<span title="' + echapper(valeur) + '">' + echapper(parts.slice(0, 6).join(', '))
    + ' <span style="color:var(--encre-pale)">+ ' + reste + ' autre' + (reste > 1 ? 's' : '') + '</span></span>';
}

function pastille(l) {
  if (l[4] === 1) return '<span class="p lue">lue</span>';
  if (l[4] === 2) return '<span class="p flou">select(*)</span>';
  return '<span class="p non">jamais lue</span>';
}

function rendre() {
  const gardees = DONNEES.lignes.filter(garde);
  compte.textContent = gardees.length.toLocaleString('fr-FR') + ' colonne'
    + (gardees.length > 1 ? 's' : '');

  if (gardees.length === 0) {
    boite.innerHTML = '<p class="vide">Aucune colonne ne correspond. Essayez un nom de table, de colonne ou d\\u2019\\u00e9cran.</p>';
    plus.hidden = true;
    return;
  }

  const tranche = gardees.slice(0, etat.montre);
  // Le regroupement par table se fait sur la tranche affichée : les colonnes d'une même table se
  // lisent ensemble, et l'en-tête rappelle combien d'entre elles sortent du filtre en cours.
  const groupes = new Map();
  for (const l of tranche) {
    if (!groupes.has(l[0])) groupes.set(l[0], []);
    groupes.get(l[0]).push(l);
  }
  const totalParTable = new Map();
  for (const l of gardees) totalParTable.set(l[0], (totalParTable.get(l[0]) || 0) + 1);

  let html = '';
  for (const [table, lignes] of groupes) {
    const n = totalParTable.get(table);
    html += '<section class="groupe"><h2>' + echapper(table)
      + '<span class="meta">' + n + ' colonne' + (n > 1 ? 's' : '')
      + (n > lignes.length ? ' \\u00b7 ' + lignes.length + ' affich\\u00e9es' : '') + '</span></h2>'
      + '<div class="cadre"><table><thead><tr>'
      + '<th>Colonne</th><th>Libellé à l’écran</th><th>Type</th><th>Lecture</th><th>\\u00c9criture</th>'
      + '<th>O\\u00f9 dans l\\u2019app</th><th>Fichiers</th>'
      + '</tr></thead><tbody>';
    for (const l of lignes) {
      html += '<tr>'
        + '<td class="col">' + echapper(l[1]) + (l[3] ? '<span class="obl">requis</span>' : '') + '</td>'
        + '<td class="lib">' + echapper(DONNEES.dico[l[7]]) + '</td>'
        + '<td class="type">' + echapper(l[2]) + '</td>'
        + '<td>' + pastille(l) + '</td>'
        + '<td>' + (l[5] ? '<span class="p ecr">\\u00e9crite</span>' : '') + '</td>'
        + '<td class="ou">' + ecrans(DONNEES.dico[l[6]]) + '</td>'
        + '<td class="fic">' + echapper(DONNEES.dico[l[8]]) + '</td>'
        + '</tr>';
    }
    html += '</tbody></table></div></section>';
  }
  boite.innerHTML = html;
  plus.hidden = gardees.length <= etat.montre;
}

document.getElementById('q').addEventListener('input', (e) => {
  etat.q = e.target.value.trim().toLowerCase();
  etat.montre = PAR_PAGE;
  rendre();
});

for (const b of document.querySelectorAll('.filtres button')) {
  b.addEventListener('click', () => {
    etat.f = b.dataset.f;
    etat.montre = PAR_PAGE;
    for (const autre of document.querySelectorAll('.filtres button')) {
      autre.setAttribute('aria-pressed', String(autre === b));
    }
    rendre();
  });
}

plus.querySelector('button').addEventListener('click', () => {
  etat.montre += PAR_PAGE;
  rendre();
});

// LA PAGE S'OUVRE PLEINE. Un écran vide en attente d'une frappe ne montrerait pas ce qu'il sait
// faire : les 400 premières colonnes sont là dès le chargement.
rendre();
</script>
`
}

module.exports = { pageCarte }
