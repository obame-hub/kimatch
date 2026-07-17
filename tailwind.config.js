/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef1f6',
          100: '#d7dee9',
          200: '#aebcd3',
          300: '#8698ba',
          400: '#5c749d',
          500: '#3d5580',
          600: '#2a3f66',
          700: '#1f2f4f',
          800: '#16223b',
          900: '#0f172a',
          950: '#0a0f1c',
        },
        ink: {
          50: '#f5f5f6',
          100: '#e4e4e6',
          200: '#c8c8cc',
          300: '#a0a0a6',
          400: '#78787f',
          500: '#55555c',
          600: '#3c3c42',
          700: '#29292d',
          800: '#1c1c1f',
          900: '#131315',
          950: '#0a0a0b',
        },
        kiwi: {
          50: '#f4fbe9',
          100: '#e4f5c9',
          200: '#caea95',
          300: '#abdd5e',
          400: '#8ecb38',
          500: '#74b524',
          600: '#5c9018',
          700: '#497314',
          800: '#3b5c15',
          900: '#324d17',
          950: '#182b06',
        },
        amber: {
          50: '#fdf7ec',
          100: '#f9ead0',
          200: '#f2d29e',
          300: '#e8b262',
          400: '#df9a3c',
          500: '#c9922e',
          600: '#a97323',
          700: '#8a5a20',
          800: '#70481f',
          900: '#5c3c1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'ui-sans-serif', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'kiwi-gradient': 'linear-gradient(135deg, #b3e457 0%, #74b524 55%, #497314 100%)',
        'amber-gradient': 'linear-gradient(135deg, #e8b262 0%, #c9922e 100%)',
        'glow-radial': 'radial-gradient(circle at top left, rgba(140,203,56,0.35), transparent 60%)',
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
