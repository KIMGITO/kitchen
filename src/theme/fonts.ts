import { Plus_Jakarta_Sans, Inter, DM_Sans, Playfair_Display } from 'next/font/google';
import type { FontKey } from './theme';

const jakarta  = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const inter    = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const dmSans   = DM_Sans({ subsets: ['latin'], variable: '--font-dmSans', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });

export const fontVariables: Record<FontKey, string> = {
  jakarta: jakarta.variable, inter: inter.variable, dmSans: dmSans.variable, playfair: playfair.variable,
};
export const allFontClassNames = Object.values(fontVariables).join(' ');
