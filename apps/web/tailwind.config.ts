import type { Config } from 'tailwindcss';

/**
 * Couchlist palette.
 *
 * Deliberately narrow: a near-black background, one blue accent, two greys.
 * Posters and banners are meant to supply the colour on screen.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#080B0F',
        card: '#0E1319',
        border: '#1D2630',
        primary: '#5B7CFA',
        'primary-hover': '#7894FF',
        'text-primary': '#F4F4F5',
        'text-secondary': '#939AA5',
      },
      fontFamily: {
        sans: ['Trebuchet MS', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '1.1rem',
        '2xl': '1.35rem',
      },
    },
  },
  plugins: [],
};

export default config;
