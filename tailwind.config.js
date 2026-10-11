export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Public Sans"', 'system-ui', 'sans-serif'], serif: ['"Source Serif 4"', 'Georgia', 'serif'] },
      colors: {
        brand: { 50: '#eef5fb', 100: '#d8e8f6', 600: '#1f5f99', 700: '#184b7a' },
        cream: '#fffaf2',
        sun: { 100: '#fff3bf', 300: '#ffe066' },
        coral: { 100: '#ffe3d6', 600: '#c2410c' },
        mint: { 100: '#d9f5e8', 600: '#0f766e' },
        grape: { 100: '#ece4fb', 600: '#6d28d9' },
      },
    },
  },
  plugins: [],
};
