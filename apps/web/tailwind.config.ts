import type { Config } from 'tailwindcss';

/**
 * Couchlist palette.
 *
 * The hex values live in globals.css as custom properties; this file only
 * names them. One place to change a colour, and the token names match the
 * approved design reference.
 *
 * A cosy little cinema corner: charcoal surfaces, soft white text, one
 * cinema-red for primary actions, and a brighter red reserved for small
 * details and accent text.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--cl-bg)',
        surface: 'var(--cl-surface)',
        hover: 'var(--cl-hover)',
        active: 'var(--cl-active)',
        line: 'var(--cl-line)',
        text: 'var(--cl-text)',
        muted: 'var(--cl-muted)',
        selected: 'var(--cl-selected)',
        'selected-hover': 'var(--cl-selected-hover)',
        'selected-fg': 'var(--cl-selected-fg)',
        accent: 'var(--cl-accent)',
        'accent-soft': 'var(--cl-accent-soft)',
        focus: 'var(--cl-focus)',
        popcorn: 'var(--cl-popcorn)',

        'warn-bg': 'var(--cl-warn-bg)',
        'warn-text': 'var(--cl-warn-text)',
        'warn-line': 'var(--cl-warn-line)',
        'danger-bg': 'var(--cl-danger-bg)',
        'danger-text': 'var(--cl-danger-text)',
        'danger-line': 'var(--cl-danger-line)',
        'voted-bg': 'var(--cl-voted-bg)',
        'voted-text': 'var(--cl-voted-text)',
        'voted-line': 'var(--cl-voted-line)',

        // Driven by the [data-category] attribute, so one pill component
        // renders every category.
        'category-bg': 'var(--category-bg)',
        'category-text': 'var(--category-text)',
        'category-line': 'var(--category-line)',
      },
      fontFamily: {
        sans: ['ui-rounded', 'SF Pro Rounded', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
      },
      fontSize: {
        // The reference's scale: body 14, secondary 12, nothing smaller than 11.
        xs: ['11px', '1.45'],
        sm: ['12px', '1.5'],
        base: ['14px', '1.45'],
        lg: ['16px', '1.4'],
        xl: ['21px', '1.25'],
        '2xl': ['24px', '1.2'],
      },
      borderRadius: {
        pill: '24px',
        card: '15px',
        field: '14px',
      },
      boxShadow: {
        primary: '0 3px 12px #cb344926',
        /*
         * A soft lift rather than a hard drop shadow. Enough to make a
         * control feel pressable on a dark surface without the page turning
         * into a pile of floating cards.
         */
        pop: '0 2px 0 0 var(--cl-line), 0 6px 14px -6px rgba(0, 0, 0, 0.55)',
        'pop-red': '0 2px 0 0 #9c2538, 0 8px 18px -8px rgba(203, 52, 73, 0.75)',
        tile: '0 2px 0 0 rgba(0, 0, 0, 0.35)',
      },
      minHeight: {
        row: '64px',
      },
    },
  },
  plugins: [],
};

export default config;
