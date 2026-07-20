/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutre principal — remappé sur la palette KiWee (chaud, quasi-noir) fournie par William.
        navy: {
          50: '#f6f6f4',
          100: '#e7e6e2',
          200: '#e0dfdb',
          300: '#c9cbc6',
          400: '#a3a5a0',
          500: '#83868f',
          600: '#5c5f66',
          700: '#3f424a',
          800: '#16181d',
          900: '#101216',
          950: '#0a0b0d',
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
        violet: {
          50: '#f6f2fa',
          100: '#f1edf7',
          200: '#e2d9ef',
          300: '#c3aee0',
          400: '#9a78c4',
          500: '#7c5bb0',
          600: '#63478d',
        },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'ui-sans-serif', 'sans-serif'],
        display: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
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
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
}
