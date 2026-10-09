import type { Config } from 'tailwindcss';
import { defaultColors, defaultText, radius, shadows } from './src/theme/theme';

const rgbVar = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(Object.keys(defaultColors).map((k) => [k, rgbVar(k)])),
      fontFamily: {
        // Spec mapping: `font-sans` -> Inter, `font-heading` -> Plus Jakarta Sans.
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        // Theme-aware aliases: resolve to the kitchen's chosen fonts via :root
        // (`--font-display` / `--font-body` are set in theme/resolve.ts).
        display: ['var(--font-display)', 'var(--font-jakarta)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: Object.fromEntries(
        Object.keys(defaultText).map((k) => [k, [
          `var(--text-${k}-size)`,
          { lineHeight: `var(--text-${k}-lh)`, letterSpacing: `var(--text-${k}-tracking)`, fontWeight: `var(--text-${k}-weight)` },
        ]]),
      ),
      // Raw mobile-only px spec sizes for `text-[15px]`, `text-[16px]`, `text-[18px]`.
      // Mirrors the type primitive px tokens in theme.ts.
      text: {
        '15px': 'var(--text-15px-size)',
        '16px': 'var(--text-16px-size)',
        '18px': 'var(--text-18px-size)',
      },
      borderRadius: Object.fromEntries(Object.keys(radius).map((k) => [k, `var(--radius-${k})`])),
      boxShadow: Object.fromEntries(Object.keys(shadows).map((k) => [k, `var(--shadow-${k})`])),
    },
  },
  plugins: [],
};
export default config;
