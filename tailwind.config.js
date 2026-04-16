/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: '#fdf3ff',
        card: '#f3e2ff',
        'card-low': '#f9ecff',
        'card-high': '#ecd4ff',
        white: '#ffffff',
        primary: '#6e12f9',
        'primary-container': '#a855f7',
        secondary: '#006859',
        'secondary-container': '#26fedc',
        tertiary: '#4df2b1',
        text: '#39264c',
        'text-secondary': '#67537c',
        border: 'rgba(103,83,124,0.2)',
        error: '#ba1a1a',
        success: '#006c4a',
        muted: '#67537c',
        bg: '#fdf3ff',
        accent: '#6e12f9',
        inverse: '#ffffff',
      },
    },
  },
  plugins: [],
};
