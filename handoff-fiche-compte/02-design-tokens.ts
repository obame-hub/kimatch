/**
 * KiWee OS — jetons de design
 * Extrait du design de référence. Ces valeurs sont normatives : ne pas arrondir.
 */

export const colors = {
  // ── Fonds ────────────────────────────────────────────────────────────────
  appBg:        '#f6f6f4',  // fond de l'application
  surface:      '#ffffff',  // cartes, panneaux
  surfaceSubtle:'#fbfbfa',  // en-têtes de tableau, zones dépliées
  surfaceMuted: '#f0efec',  // pastilles neutres, pistes de barres
  surfaceSunken:'#f4f3ef',  // lignes de référence, contrat actuel

  // ── Bordures ─────────────────────────────────────────────────────────────
  border:       '#e7e6e2',  // bordure standard
  borderStrong: '#e0dfdb',  // boutons, champs
  borderSubtle: '#f0efec',  // séparateurs internes
  borderFaint:  '#f5f4f1',  // séparateurs très légers

  // ── Texte ────────────────────────────────────────────────────────────────
  text:         '#16181d',  // texte principal
  textBody:     '#3f4249',  // paragraphes
  textMuted:    '#5c5f66',  // labels
  textSubtle:   '#83868f',  // méta
  textFaint:    '#a3a5a0',  // suréclaircies, uppercase labels
  textGhost:    '#c0c2bd',  // indices clavier

  // ── Accents ──────────────────────────────────────────────────────────────
  green:        '#0d7a5f',  // action principale, validé, économies
  greenDark:    '#095c47',
  greenLight:   '#eaf4f0',
  greenBorder:  '#d3e5de',
  greenTint:    '#f4faf7',

  amber:        '#b57a24',  // attention, échéances
  amberDark:    '#8a6420',
  amberLight:   '#fdf9f0',
  amberBorder:  '#f0e4cd',

  gold:         '#c8940a',  // électricité
  goldLight:    '#fdf1c8',

  red:          '#c2452d',  // critique, signaux, surcoût
  redLight:     '#fbeae5',

  blue:         '#3b5f8a',  // comptes
  blueLight:    '#eef0f4',

  gasBlue:      '#4a7fa5',  // gaz
  gasBlueLight: '#e9f1f7',

  purple:       '#7c5bb0',  // contacts

  ink:          '#16181d',  // boutons pleins sombres
  inkHover:     '#2c2f36',
} as const;

/** Couleur + icône par type d'objet — identique partout dans le CRM. */
export const objectTypes = {
  compte:   { color: '#3b5f8a', bg: '#eef0f4', label: 'Compte',         icon: 'building' },
  site:     { color: '#0d7a5f', bg: '#eaf4f0', label: 'Site',           icon: 'map-pin' },
  contact:  { color: '#7c5bb0', bg: '#f2eefa', label: 'Contact',        icon: 'person' },
  elec:     { color: '#c8940a', bg: '#fdf1c8', label: 'Électricité',    icon: 'bolt' },
  gaz:      { color: '#4a7fa5', bg: '#e9f1f7', label: 'Gaz',            icon: 'flame' },
  reco:     { color: '#b57a24', bg: '#fdf9f0', label: 'Recommandation', icon: 'star' },
  mandat:   { color: '#8a6420', bg: '#fdf9f0', label: 'Mandat',         icon: 'shield' },
  signal:   { color: '#c2452d', bg: '#fbeae5', label: 'Signal',         icon: 'alert-bolt' },
  tache:    { color: '#9a7b1f', bg: '#fdf9f0', label: 'Tâche',          icon: 'check' },
  marche:   { color: '#0f7a72', bg: '#eaf4f0', label: 'Marché',         icon: 'trend' },
  contrat:  { color: '#5c5f66', bg: '#f0efec', label: 'Contrat',        icon: 'document' },
} as const;

export const fonts = {
  /** Interface. */
  sans: "'Instrument Sans', system-ui, sans-serif",
  /** TOUTE donnée chiffrée : SIRET, PDL, montants, dates, kVA, MWh. */
  mono: "'JetBrains Mono', monospace",
  googleFontsHref:
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700' +
    '&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
} as const;

/** Échelle typographique réelle du design — en px, valeurs non arrondies. */
export const fontSize = {
  micro:  '8.5px',  // légendes de graphiques, mentions
  tiny:   '9px',    // labels uppercase de champ
  xs:     '10px',   // labels de section uppercase
  sm:     '10.5px', // méta, sous-titres
  base:   '11px',   // corps dense
  md:     '11.5px', // boutons, corps de liste
  lg:     '12px',   // corps standard, valeurs
  xl:     '12.5px', // titres de carte
  h4:     '13px',
  h3:     '14px',
  h2:     '15px',
  h1:     '19px',   // titre d'onglet
  display:'23px',   // grands chiffres de KPI
} as const;

export const fontWeight = { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 } as const;

/** Espacement — le design travaille en pas impairs, garde-les tels quels. */
export const space = {
  1: '3px', 2: '5px', 3: '6px', 4: '7px', 5: '9px', 6: '11px',
  7: '12px', 8: '13px', 9: '14px', 10: '15px', 11: '17px', 12: '19px',
  13: '21px', 14: '22px', 15: '26px', 16: '30px',
} as const;

export const radius = {
  xs: '4px', sm: '6px', md: '8px', lg: '9px', xl: '11px',
  '2xl': '12px', '3xl': '14px', '4xl': '16px', '5xl': '18px', pill: '20px', full: '9999px',
} as const;

export const shadow = {
  card:     '0 1px 3px rgba(0,0,0,.03)',
  cardOpen: '0 3px 10px rgba(0,0,0,.05)',
  raised:   '0 4px 12px rgba(0,0,0,.07)',
  panel:    '0 8px 26px rgba(0,0,0,.13)',
  overlay:  '0 24px 60px rgba(0,0,0,.30)',
  toast:    '0 6px 20px rgba(0,0,0,.25)',
  green:    '0 4px 14px rgba(13,122,95,.32)',
} as const;

export const motion = {
  fast:   '.13s ease',   // hover, changement de couleur
  base:   '.16s ease',   // apparition de blocs
  medium: '.2s ease',    // accordéons, rotation de chevron
  slide:  '.3s cubic-bezier(.3,1.1,.4,1)',      // transition de vue
  spring: '.32s cubic-bezier(.4,1.3,.5,1)',     // pastille d'onglet glissante
  bar:    '.45s cubic-bezier(.3,1.2,.4,1)',     // croissance de barre
} as const;

/** Keyframes à déclarer une fois globalement. */
export const keyframes = `
@keyframes fadeSlide { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:none } }
@keyframes floatUp   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
@keyframes slideInR  { from { opacity:0; transform:translateX(46px) } to { opacity:1; transform:none } }
@keyframes slideInL  { from { opacity:0; transform:translateX(-46px) } to { opacity:1; transform:none } }
@keyframes barGrow   { from { transform:scaleX(0) } to { transform:scaleX(1) } }
@keyframes vGrow     { from { transform:scaleY(0) } to { transform:scaleY(1) } }
@keyframes toastIn   { from { opacity:0; transform:translate(-50%,8px) } to { opacity:1; transform:translate(-50%,0) } }
@keyframes softPulse { 0%,100% { box-shadow:0 0 0 0 rgba(13,122,95,.25) } 50% { box-shadow:0 0 0 9px rgba(13,122,95,0) } }
`;

export const layout = {
  navbarWidth:   '56px',   // navbar verticale réduite, icônes seules
  leftPanel:     '300px',
  activityPanel: '340px',
  topbarHeight:  '44px',
  tabbarHeight:  '38px',
  touchTarget:   '44px',   // minimum tactile mobile
  grid: 'grid-template-columns: 300px minmax(0,1fr) 340px',
} as const;

/** Extension de la config Tailwind. */
export const tailwindExtend = {
  colors: {
    kw: {
      bg: colors.appBg, surface: colors.surface, subtle: colors.surfaceSubtle,
      muted: colors.surfaceMuted, border: colors.border, 'border-strong': colors.borderStrong,
      ink: colors.text, body: colors.textBody, label: colors.textMuted,
      meta: colors.textSubtle, faint: colors.textFaint,
      green: colors.green, 'green-dark': colors.greenDark, 'green-light': colors.greenLight,
      amber: colors.amber, 'amber-light': colors.amberLight,
      gold: colors.gold, 'gold-light': colors.goldLight,
      red: colors.red, 'red-light': colors.redLight,
      blue: colors.blue, gas: colors.gasBlue, purple: colors.purple,
    },
  },
  fontFamily: { sans: ['Instrument Sans', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
  fontSize, borderRadius: radius, boxShadow: shadow,
};
