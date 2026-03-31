/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './templates/**/*.html',
    './static/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#edf7f3',
          100: '#d0ece3',
          200: '#a3d7c8',
          300: '#70bfa9',
          400: '#4da389',
          500: '#408A71',
          600: '#347360',
          700: '#285c4c',
          800: '#1c4437',
          900: '#122d23',
          950: '#091a14',
        },
      },
    },
  },
  plugins: [],
}
