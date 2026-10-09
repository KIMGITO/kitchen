import { Plus_Jakarta_Sans, Inter, DM_Sans, Playfair_Display } from 'next/font/google';
import type { FontKey } from './theme';

/**
 * Professional pairing: Inter (body / UI) + Plus Jakarta Sans (headings / prices).
 * Weights are trimmed for performance — only what the type scale uses.
 * Each font maps to a CSS variable consumed by tailwind.config.ts
 * (`font-sans` -> var(--font-inter), `font-heading` -> var(--font-jakarta)`).
 */
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-jakarta', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-inter', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-dmSans', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-playfair', display: 'swap' });

export const fontVariables: Record<FontKey, string> = {
  jakarta: jakarta.variable, inter: inter.variable, dmSans: dmSans.variable, playfair: playfair.variable,
};
export const allFontClassNames = Object.values(fontVariables).join(' ');

/** Always loaded so `font-sans` / `font-heading` utilities never dangle, even when a kitchen picks another display font. */
export const baseFontClassNames = `${inter.variable} ${jakarta.variable}`;

