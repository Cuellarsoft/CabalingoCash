/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        marca: {
          50: '#effaf6', 100: '#d8f3e8', 200: '#b3e6d3', 300: '#7fd2b7', 400: '#48b694',
          500: '#259a79', 600: '#167c62', 700: '#136351', 800: '#124f42', 900: '#104137', 950: '#07241f',
        },
        tinta: { DEFAULT: '#0f1f1b', suave: '#4b5b57', tenue: '#8a9894' },
        papel: '#f6f7f4',
      },
      boxShadow: { tarjeta: '0 1px 2px rgba(16,40,34,.06), 0 1px 1px rgba(16,40,34,.04)' },
    },
  },
  plugins: [],
};
