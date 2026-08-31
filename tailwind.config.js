/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ══ LES COULEURS DE LA MAQUETTE DE MICHEL ══════════════════════════════════════════
         *
         * Branchees sur les variables de src/index.css, donc composables en opacite :
         * `bg-km-green/10` fonctionne. Les valeurs sont les siennes au chiffre pres.
         *
         * Le vert ne sert QU'aux actions positives, aux selections et aux reperes importants —
         * c'est la regle de son dossier, et c'est ce qui l'empeche de devenir un fond. */
        km: {
          text: 'rgb(var(--km-text) / <alpha-value>)',
          muted: 'rgb(var(--km-muted) / <alpha-value>)',
          faint: 'rgb(var(--km-faint) / <alpha-value>)',
          bg: 'rgb(var(--km-bg) / <alpha-value>)',
          side: 'rgb(var(--km-side) / <alpha-value>)',
          'side-bas': 'rgb(var(--km-side-bas) / <alpha-value>)',
          'side-line': 'rgb(var(--km-side-line) / <alpha-value>)',
          'side-text': 'rgb(var(--km-side-text) / <alpha-value>)',
          'side-muted': 'rgb(var(--km-side-muted) / <alpha-value>)',
          'side-faint': 'rgb(var(--km-side-faint) / <alpha-value>)',
          surface: 'rgb(var(--km-surface) / <alpha-value>)',
          soft: 'rgb(var(--km-soft) / <alpha-value>)',
          line: 'rgb(var(--km-line) / <alpha-value>)',
          'line-soft': 'rgb(var(--km-line-soft) / <alpha-value>)',
          'green-line': 'rgb(var(--km-green-line) / <alpha-value>)',
          'green-tint': 'rgb(var(--km-green-tint) / <alpha-value>)',
          'amber-line': 'rgb(var(--km-amber-line) / <alpha-value>)',
          elec: 'rgb(var(--km-elec) / <alpha-value>)',
          'elec-soft': 'rgb(var(--km-elec-soft) / <alpha-value>)',
          gaz: 'rgb(var(--km-gaz) / <alpha-value>)',
          'gaz-soft': 'rgb(var(--km-gaz-soft) / <alpha-value>)',
          violet: 'rgb(var(--km-violet) / <alpha-value>)',
          green: 'rgb(var(--km-green) / <alpha-value>)',
          'green-soft': 'rgb(var(--km-green-soft) / <alpha-value>)',
          blue: 'rgb(var(--km-blue) / <alpha-value>)',
          'blue-soft': 'rgb(var(--km-blue-soft) / <alpha-value>)',
          amber: 'rgb(var(--km-amber) / <alpha-value>)',
          'amber-soft': 'rgb(var(--km-amber-soft) / <alpha-value>)',
          red: 'rgb(var(--km-red) / <alpha-value>)',
          'red-soft': 'rgb(var(--km-red-soft) / <alpha-value>)',
        },
        // Neutre principal — remappé sur la palette KiWee (chaud, quasi-noir) fournie par William.
        // Valeurs pilotées par variables CSS (voir index.css) pour basculer en mode sombre.
        navy: {
          50: 'rgb(var(--color-navy-50) / <alpha-value>)',
          100: 'rgb(var(--color-navy-100) / <alpha-value>)',
          200: 'rgb(var(--color-navy-200) / <alpha-value>)',
          300: 'rgb(var(--color-navy-300) / <alpha-value>)',
          400: 'rgb(var(--color-navy-400) / <alpha-value>)',
          500: 'rgb(var(--color-navy-500) / <alpha-value>)',
          600: 'rgb(var(--color-navy-600) / <alpha-value>)',
          700: 'rgb(var(--color-navy-700) / <alpha-value>)',
          800: 'rgb(var(--color-navy-800) / <alpha-value>)',
          900: 'rgb(var(--color-navy-900) / <alpha-value>)',
          950: 'rgb(var(--color-navy-950) / <alpha-value>)',
        },
        ink: {
          50: '#f5f5f6',
          100: '#e4e4e6',
          200: '#c8c8cc',
          300: '#a0a0a6',
          400: '#8b8e96',
          500: '#5c5f66',
          600: '#3c3c42',
          700: '#2c2f36',
          800: '#1c1e24',
          900: '#16181d',
          950: '#0e0f13',
        },
        // Vert de marque KiWee.
        kiwi: {
          50: '#eaf4f0',
          100: '#d3e5de',
          200: '#a8d4c2',
          300: '#5fae8f',
          400: '#199b78',
          500: '#0d7a5f',
          600: '#0d7a5f',
          700: '#095c47',
          800: '#074a39',
          900: '#063d2f',
          950: '#042920',
        },
        // Ambre/or — gaz, alertes tièdes.
        amber: {
          50: '#fdf9f0',
          100: '#f6efdf',
          200: '#f3e3c8',
          300: '#e0c690',
          400: '#d1a355',
          500: '#b0763c',
          600: '#8a6420',
          700: '#8a5a1c',
          800: '#6f4a17',
          900: '#5c3c1d',
        },
        // Bleu — comptes/immeubles.
        sky: {
          50: '#f0f3f8',
          100: '#eef0f4',
          200: '#d7dde6',
          300: '#a9b8cc',
          400: '#5f7ea3',
          500: '#3b5f8a',
          600: '#2f4d70',
          700: '#243c58',
        },
        // Violet — contacts.
        // LA COULEUR DE L'OPPORTUNITE, relevee dans « Fiche Opportunite.dc.html » (William) :
        // #a8317f pour l'accent, le degrade #8c2168 → #c14e9c pour les pastilles et les boutons,
        // #fdf5fa / #fbeaf4 / #f0cfe3 pour les fonds et bordures claires. Chaque objet du CRM a sa
        // teinte chez William — bleu pour le compte, violet pour le contact, vert pour le site :
        // celle-ci manquait, et la fiche opportunite en etait donc grise.
        opp: {
          50: '#fdf5fa',
          100: '#fbeaf4',
          200: '#f0cfe3',
          300: '#e8c3dc',
          400: '#c14e9c',
          500: '#a8317f',
          600: '#8c2168',
        },
        violet: {
          50: '#f6f2fa',
          100: '#f1edf7',
          200: '#e2d9ef',
          300: '#c3aee0',
          400: '#9a78c4',
          500: '#7c5bb0',
          600: '#63478d',
        },
        // Jetons du handoff design "Fiche Compte" (William, 30/07/2026) — namespace dedie kw.*
        // pour ne pas entrer en collision avec navy/ink/kiwi/amber/sky/violet deja utilises
        // partout ailleurs dans l'app.
        kw: {
          bg: 'rgb(var(--kw-bg) / <alpha-value>)',
          surface: 'rgb(var(--kw-surface) / <alpha-value>)',
          subtle: 'rgb(var(--kw-subtle) / <alpha-value>)',
          muted: 'rgb(var(--kw-muted) / <alpha-value>)',
          sunken: 'rgb(var(--kw-sunken) / <alpha-value>)',
          // L'APLAT DES BLOCS DU RAPPORT CLIENT. Naoëlle, 25/08/2026 : « un gris plus clair, quasi
          // blanc gris ». #f4f3ef (sunken) faisait des blocs trop presents sur un document imprime,
          // #fbfbfa (subtle) disparait completement. Celui-ci se voit sans peser : c'est exactement
          // ce qu'on demande a un fond qui ne fait que delimiter.
          bloc: 'rgb(var(--kw-bloc) / <alpha-value>)',
          border: 'rgb(var(--kw-border) / <alpha-value>)',
          'border-strong': 'rgb(var(--kw-border-strong) / <alpha-value>)',
          'border-subtle': 'rgb(var(--kw-border-subtle) / <alpha-value>)',
          'border-faint': 'rgb(var(--kw-border-faint) / <alpha-value>)',
          ink: 'rgb(var(--kw-ink) / <alpha-value>)',
          body: 'rgb(var(--kw-body) / <alpha-value>)',
          label: 'rgb(var(--kw-label) / <alpha-value>)',
          meta: 'rgb(var(--kw-meta) / <alpha-value>)',
          faint: 'rgb(var(--kw-faint) / <alpha-value>)',
          ghost: 'rgb(var(--kw-ghost) / <alpha-value>)',
          green: 'rgb(var(--kw-green) / <alpha-value>)',
          'green-dark': 'rgb(var(--kw-green-dark) / <alpha-value>)',
          'green-light': 'rgb(var(--kw-green-light) / <alpha-value>)',
          'green-border': 'rgb(var(--kw-green-border) / <alpha-value>)',
          'green-tint': 'rgb(var(--kw-green-tint) / <alpha-value>)',
          amber: 'rgb(var(--kw-amber) / <alpha-value>)',
          'amber-dark': 'rgb(var(--kw-amber-dark) / <alpha-value>)',
          'amber-light': 'rgb(var(--kw-amber-light) / <alpha-value>)',
          'amber-border': 'rgb(var(--kw-amber-border) / <alpha-value>)',
          gold: 'rgb(var(--kw-gold) / <alpha-value>)',
          'gold-light': 'rgb(var(--kw-gold-light) / <alpha-value>)',
          red: 'rgb(var(--kw-red) / <alpha-value>)',
          'red-light': 'rgb(var(--kw-red-light) / <alpha-value>)',
          blue: 'rgb(var(--kw-blue) / <alpha-value>)',
          'blue-light': 'rgb(var(--kw-blue-light) / <alpha-value>)',
          gas: 'rgb(var(--kw-gas) / <alpha-value>)',
          'gas-light': 'rgb(var(--kw-gas-light) / <alpha-value>)',
          purple: 'rgb(var(--kw-purple) / <alpha-value>)',
        },
      },
      /* INTER, la police de la maquette de Michel. « Instrument Sans » reste en repli le temps
         que la refonte passe sur tous les ecrans : sans elle, un ecran encore ancien perdrait sa
         metrique et se decalerait, ce qui se voit plus qu'un changement de police assume. */
      fontFamily: {
        sans: ['Inter', '"Instrument Sans"', 'system-ui', 'ui-sans-serif', 'sans-serif'],
        display: ['Inter', '"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'kiwi-gradient': 'linear-gradient(135deg, #199b78 0%, #0d7a5f 100%)',
        'amber-gradient': 'linear-gradient(135deg, #e0c690 0%, #b0763c 100%)',
        'glow-radial': 'radial-gradient(circle at top left, rgba(13,122,95,0.25), transparent 60%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Un fondu SANS transformation : c'est le voile des fenêtres modales, et une transformation
        // sur lui en ferait le référentiel de ses propres descendants fixed.
        'km-fade': { from: { opacity: '0' }, to: { opacity: '1' } },
        'km-fade-slide': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
        'kw-float-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        'kw-slide-in-r': { from: { opacity: '0', transform: 'translateX(46px)' }, to: { opacity: '1', transform: 'none' } },
        'kw-slide-in-l': { from: { opacity: '0', transform: 'translateX(-46px)' }, to: { opacity: '1', transform: 'none' } },
        'kw-bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'kw-v-grow': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        'km-toast-in': { from: { opacity: '0', transform: 'translate(-50%, 8px)' }, to: { opacity: '1', transform: 'translate(-50%, 0)' } },
        'km-soft-pulse': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(13,122,95,.25)' }, '50%': { boxShadow: '0 0 0 9px rgba(13,122,95,0)' } },
        // Tableau de bord (maquette William, 11/08/2026) : montee des cartes, reflet qui balaie
        // les tuiles d'indicateurs, et pastille « en direct » du fil du portefeuille.
        'km-card-rise': { from: { opacity: '0', transform: 'translateY(9px)' }, to: { opacity: '1', transform: 'none' } },
        'km-sheen': { '0%': { transform: 'translateX(-130%) skewX(-18deg)' }, '60%, 100%': { transform: 'translateX(340%) skewX(-18deg)' } },
        'km-live-pulse': { '0%, 100%': { boxShadow: '0 0 0 3px rgba(13,122,95,.14)' }, '50%': { boxShadow: '0 0 0 5px rgba(13,122,95,.05)' } },
        'km-hub-pop': { from: { opacity: '0', transform: 'translateY(-7px) scale(.965)' }, to: { opacity: '1', transform: 'none' } },
        'km-hub-row': { from: { opacity: '0', transform: 'translateX(6px)' }, to: { opacity: '1', transform: 'none' } },
        'km-hero-rise': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        'km-glow-pulse': { '0%, 100%': { opacity: '.42' }, '50%': { opacity: '.72' } },
        // FRISE DE STATUT DE L'OPPORTUNITE (maquette du 23/08/2026). `ringPulse` fait respirer le
        // jalon courant, `stripeMove` fait defiler les hachures du segment qui reste a franchir :
        // c'est ce qui distingue « l'etape en cours » d'une frise inerte.
        'km-opp-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168,49,127,.30)' },
          '50%': { boxShadow: '0 0 0 12px rgba(168,49,127,0)' },
        },
        'km-stripe': { to: { backgroundPosition: '36px 0' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'km-fade': 'kw-fade .12s ease both',
        'km-fade-slide': 'kw-fade-slide .16s ease both',
        'kw-float-up': 'kw-float-up .16s ease both',
        'kw-slide-in-r': 'kw-slide-in-r .3s cubic-bezier(.3,1.1,.4,1) both',
        'kw-slide-in-l': 'kw-slide-in-l .3s cubic-bezier(.3,1.1,.4,1) both',
        'kw-bar-grow': 'kw-bar-grow .45s cubic-bezier(.3,1.2,.4,1) both',
        'kw-v-grow': 'kw-v-grow .45s cubic-bezier(.3,1.2,.4,1) both',
        'km-toast-in': 'kw-toast-in .2s ease both',
        'km-soft-pulse': 'kw-soft-pulse 1.6s ease infinite',
        'km-card-rise': 'kw-card-rise .4s ease-out both',
        'km-opp-pulse': 'kw-opp-pulse 2s ease-out infinite',
        'km-stripe': 'kw-stripe 1.1s linear infinite',
        'km-sheen': 'kw-sheen 5.5s ease-in-out infinite',
        'km-hub-pop': 'kw-hub-pop .17s cubic-bezier(.2,.9,.3,1.1) both',
        'km-hub-row': 'kw-hub-row .2s ease-out both',
        'km-hero-rise': 'kw-hero-rise .4s cubic-bezier(.3,1.1,.4,1) both',
        'km-glow-pulse': 'kw-glow-pulse 5s ease-in-out infinite',
        'km-live-pulse': 'kw-live-pulse 2.2s ease-in-out infinite',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'kw-card': '0 1px 3px rgba(0,0,0,.03)',
        'kw-card-open': '0 3px 10px rgba(0,0,0,.05)',
        'kw-raised': '0 4px 12px rgba(0,0,0,.07)',
        'kw-panel': '0 8px 26px rgba(0,0,0,.13)',
        'kw-overlay': '0 24px 60px rgba(0,0,0,.30)',
        'kw-toast': '0 6px 20px rgba(0,0,0,.25)',
        'kw-green': '0 4px 14px rgba(13,122,95,.32)',
        /* Ses trois ombres, et elles sont volontairement discretes : une carte se detache par sa
           bordure, pas par son ombre. La coque de l'application est la seule a porter du relief. */
        /* ══ LES OMBRES : PLUS LARGES, PLUS BASSES, MOINS OPAQUES ════════════════════════
         *
         * Une ombre courte et contrastee (2 px de flou) dessine un LISERE sous l'element : c'est
         * le relief des interfaces de 2010, on voit le trait. Une ombre de 2026 est une nappe —
         * grand rayon, faible opacite, legerement descendue — qui pose l'element sans se montrer.
         *
         * La teinte reste celle de la marque (un vert tres sombre, pas un gris neutre) : c'est ce
         * qui empeche l'ombre de grisailler un fond legerement vert. */
        'km-card': '0 1px 2px rgba(25,40,33,.04), 0 4px 14px rgba(25,40,33,.045)',
        'km-metric': '0 1px 2px rgba(25,40,33,.03), 0 6px 22px rgba(25,40,33,.05)',
        'km-shell': '0 24px 70px rgba(26,43,34,.10)',
        /* L'ombre d'un menu flottant : plus marquee, parce qu'elle doit detacher le menu du
           contenu qu'il recouvre. */
        'km-pop': '0 2px 6px rgba(25,40,33,.06), 0 12px 34px rgba(25,40,33,.13)',
        /* La lueur sous un bouton d'action : elle porte la couleur du bouton, pas un gris. */
        'km-green': '0 4px 14px rgba(13,122,95,.28)',
      },
      borderRadius: {
        xl: '0.875rem',
        'kw-xs': '4px', 'kw-sm': '6px', 'kw-md': '8px', 'kw-lg': '9px', 'kw-xl': '11px',
        'kw-2xl': '12px', 'kw-3xl': '14px', 'kw-4xl': '16px', 'kw-5xl': '18px', 'kw-pill': '20px',
        /* ══ LES RAYONS, RELEVES LE 31/08/2026 ═══════════════════════════════════════════
         *
         * Naoelle : « rien de carre comme dans les annees 2000, il faut que l'app soit rendu
         * UI/UX 2026 ».
         *
         * L'echelle etait 6 / 8 / 9 / 10 / 18 px : relevee de la maquette, mais cette maquette
         * datait d'avant. A ces valeurs un bouton lit comme un rectangle a coins casses — l'oeil
         * voit encore l'angle. Le seuil ou une forme cesse d'etre carree et devient une forme
         * douce se situe vers 10 px sur un controle de 32 px de haut, et vers 14 sur une carte.
         *
         * ON MONTE, ON N'ARRONDIT PAS TOUT. Un rayon uniforme de 20 px sur tout ce qui bouge
         * donne un jouet, pas un outil : la hierarchie des formes disparait avec celle des
         * tailles. L'ecart entre les niveaux est CONSERVE — petit controle, controle, carte,
         * panneau, coque — il est seulement decale vers le haut. */
        'km-sm': '8px', 'km': '10px', 'km-md': '12px', 'km-lg': '16px', 'km-xl': '22px',
        'km-pill': '9999px',
      },
      fontSize: {
        'kw-micro': '8.5px', 'kw-tiny': '9px', 'kw-xs': '10px', 'kw-sm': '10.5px', 'kw-base': '11px',
        'kw-md': '11.5px', 'kw-lg': '12px', 'kw-xl': '12.5px', 'kw-h4': '13px', 'kw-h3': '14px',
        'kw-h2': '15px', 'kw-h1': '19px', 'kw-display': '23px',
        /* ══ L'ECHELLE DE TEXTE : SES PROPORTIONS, SA REGLE ════════════════════════════════
         *
         * Sa maquette ecrit en 8, 9 et 10 px — mais son propre dossier l'interdit : « texte
         * courant de 13 a 14 px ; libelles secondaires de 11 a 12 px ; aucune information
         * essentielle sous 11 px en production ».
         *
         * La maquette est une planche dessinee a echelle reduite : ses tailles absolues ne sont
         * pas des consignes, sa HIERARCHIE en est une. On garde donc les rapports entre les
         * niveaux et on remonte le tout au-dessus de son plancher de 11 px. */
        /* ══ CORRECTION DU 31/08/2026, APRES AVOIR CASSE LES ECRANS DENSES ═════════════════
         *
         * J'avais collapse huit tailles en trois EN LES REMONTANT TOUTES : 8,5 px devenait 11,
         * 9 px devenait 11, 10,5 devenait 13. Le raisonnement etait bon en principe — son dossier
         * interdit le texte sous 11 px — mais faux en pratique.
         *
         * CE QUI S'EST PASSE. Une carte de kanban empile six informations dans 200 px de large.
         * Remonter chacune de 8,5 a 11 px gonfle la carte de 30 %, le texte passe a la ligne, et
         * un nom de fournisseur en police a chasse fixe occupe quatre lignes. Constate en
         * production sur l'ecran Pricing : les colonnes etaient illisibles.
         *
         * LA REGLE DES 11 PX VAUT POUR L'INFORMATION ESSENTIELLE — c'est le mot de son dossier.
         * Un libelle de colonne dans une carte n'est pas de l'information essentielle : c'est une
         * etiquette qui accompagne une valeur, elle-meme lisible. La densite est une decision de
         * design a part entiere, et l'ecraser au nom d'un plancher casse ce qu'on voulait proteger.
         *
         * L'echelle retrouve donc sa granularite. Les tailles NOMMEES pour la refonte gardent le
         * plancher de 11 px la ou l'information compte : titre de page, nom de ligne, valeur
         * d'indicateur, corps de tableau. */
        /* ══ CHAQUE TAILLE PORTE SON INTERLIGNE — CORRECTION DU 31/08/2026 ════════════════
         *
         * Naoelle : « la police est trop grande ou trop rapprochee ou pas assez aeree, ou
         * grossiere ; le rendu n'est pas classe du tout depuis les dernieres mises a jour ».
         *
         * LA CAUSE ETAIT L'INTERLIGNE, PAS LA TAILLE. Une taille declaree en chaine simple ne
         * transporte AUCUN interligne : Tailwind laisse alors celui du parent, qui vaut 1,5 fois
         * la taille HERITEE et non la taille reelle. Un libelle de 11 px dans un bloc en 13 px
         * heritait donc d'un interligne calcule sur 13 — et un titre de 28 px d'un interligne
         * calcule sur 13, soit moins que sa propre hauteur de caractere. D'ou le sentiment de
         * texte tasse : ce n'etait pas la taille, c'etait l'espace entre les lignes.
         *
         * Chaque niveau declare maintenant le sien, en couple [taille, interligne]. Les rapports
         * suivent la meme regle du bas en haut : environ 1,45 pour le texte courant, resserre a
         * 1,25 sur les grandes tailles ou un interligne large disloque le titre.
         *
         * LE TITRE DE PAGE DESCEND DE 28 A 24 PX. C'est le « trop grande » : sur une page de
         * liste, le titre etait plus haut que la valeur des indicateurs qu'il surplombe, et
         * ecrasait tout le reste. 24 px le laisse dominer sans hurler.
         */
        'km-micro': ['8.5px', { lineHeight: '12px' }],   /* etiquette dans un espace dense */
        'km-tiny':  ['9px',   { lineHeight: '13px' }],
        'km-xs':    ['10px',  { lineHeight: '14px' }],
        'km-label': ['11px',  { lineHeight: '15px', letterSpacing: '0.005em' }],
        'km-body':  ['13px',  { lineHeight: '19px' }],   /* texte courant, cellule de tableau */
        'km-name':  ['14px',  { lineHeight: '20px', letterSpacing: '-0.004em' }],
        'km-lead':  ['13px',  { lineHeight: '20px' }],   /* la phrase sous le titre de page */
        'km-title': ['16px',  { lineHeight: '22px', letterSpacing: '-0.012em' }], /* titre de fiche */
        'km-metric':['20px',  { lineHeight: '25px', letterSpacing: '-0.02em' }],
        /* LA GRANDE VALEUR CHIFFREE — le seul chiffre d'un bandeau ou d'une tuile de synthese.
           Les valeurs chiffrees etaient ecrites en 18, 19, 20, 22, 25 et 27 px selon l'ecran : six
           tailles pour deux roles. Elles se rangent en deux niveaux, km-metric et celui-ci. */
        'km-metric-lg': ['26px', { lineHeight: '30px', letterSpacing: '-0.022em' }],
        'km-h1':    ['24px',  { lineHeight: '30px', letterSpacing: '-0.022em' }], /* titre de page */
      },
      spacing: {
        'kw-1': '3px', 'kw-2': '5px', 'kw-3': '6px', 'kw-4': '7px', 'kw-5': '9px', 'kw-6': '11px',
        'kw-7': '12px', 'kw-8': '13px', 'kw-9': '14px', 'kw-10': '15px', 'kw-11': '17px', 'kw-12': '19px',
        'kw-13': '21px', 'kw-14': '22px', 'kw-15': '26px', 'kw-16': '30px',
        'kw-navbar': '56px', 'kw-left-panel': '300px', 'kw-activity-panel': '340px',
        'kw-topbar': '44px', 'kw-tabbar': '38px', 'kw-touch': '44px',
      },
    },
  },
  plugins: [],
}
