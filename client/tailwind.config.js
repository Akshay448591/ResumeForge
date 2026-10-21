/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: '#17233A',
        desk: '#F4F6F9',
        cobalt: { DEFAULT: '#2F55D4', dark: '#2443AE', soft: '#E3EAFC' },
        mark: '#FFE45C',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04)',
        pop: '0 12px 28px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.08)',
      },
    },
  },
  plugins: [],
};
