import type { Config } from 'tailwindcss';
import { defaultColors, defaultText, radius, shadows } from './src/theme/theme';

const rgbVar = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(Object.keys(defaultColors).map((k) => [k, rgbVar(k)])),
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      fontSize: Object.fromEntries(
        Object.keys(defaultText).map((k) => [k, [
          `var(--text-${k}-size)`,
          { lineHeight: `var(--text-${k}-lh)`, letterSpacing: `var(--text-${k}-tracking)`, fontWeight: `var(--text-${k}-weight)` },
        ]]),
      ),
      borderRadius: Object.fromEntries(Object.keys(radius).map((k) => [k, `var(--radius-${k})`])),
      boxShadow: Object.fromEntries(Object.keys(shadows).map((k) => [k, `var(--shadow-${k})`])),
    },
  },
  plugins: [],
};
export default config;
