// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES COULEURS DE LA CARTE, DÉFINIES UNE FOIS
//
// Deux pages sortent maintenant du même passage — `carte.html` et `explorateur.html` — et elles
// doivent se ressembler : c'est le même outil, vu de deux angles. Recopier le thème dans les deux
// fichiers les ferait diverger à la première retouche, et personne ne s'en apercevrait avant de les
// ouvrir côte à côte.
//
// Le vert vient du thème de Kimatch : la carte parle de Kimatch, elle en porte la couleur plutôt
// qu'une teinte de tableau de bord générique. Les neutres sont tirés vers le vert — choisis, pas
// hérités d'un gris de départ. Les sémantiques (sûr / flou / absent) restent distinctes de l'accent :
// un état n'est pas une marque.
//
// Les trois blocs sont nécessaires et aucun n'est redondant : `:root` porte le clair, le bloc
// `prefers-color-scheme` sert le réglage « système », et `[data-theme="dark"]` gagne sur les deux
// quand quelqu'un choisit explicitement.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const SOMBRE = `
    --accent: #4FC4A5; --accent-doux: #12302A; --accent-bord: #21473E;
    --fond: #0E1413; --surface: #151D1B; --encre: #E7EEEB; --encre-douce: #A6B2AD;
    --encre-pale: #74807A; --ligne: #232E2B; --trame: #1A2422;
    --sur: #4FC4A5; --flou: #DCB25E; --flou-doux: #2A2312;
    --absent: #F0908A; --absent-doux: #321A18;`

const theme = `
  :root {
    --accent:      #0A6B57;
    --accent-doux: #E3F0EB;
    --accent-bord: #B7D8CD;

    --fond:        #F6F8F7;
    --surface:     #FFFFFF;
    --encre:       #101715;
    --encre-douce: #48544F;
    --encre-pale:  #7B857F;
    --ligne:       #E0E6E2;
    --trame:       #F1F4F2;

    --sur:         #0A6B57;
    --flou:        #8A5A00;
    --flou-doux:   #FBF2DE;
    --absent:      #A3281E;
    --absent-doux: #FBEBE8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {${SOMBRE}
    }
  }
  :root[data-theme="dark"] {${SOMBRE}
  }
`

/** Les polices, et le repli qui tient si Google Fonts ne répond pas. */
const POLICES =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">'

const TEXTE = '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

module.exports = { theme, POLICES, TEXTE, MONO }
