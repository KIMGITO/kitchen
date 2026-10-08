/**
 * Single source of design truth — MODERN REFINEMENT (v2).
 *
 * Rules:
 * - Components never contain hex values, font names or ad-hoc text styles.
 * - They use Tailwind utilities generated from these tokens
 *   (bg-brand, text-ink-muted, font-display, text-h1, rounded-lg, shadow-card ...).
 * - Kitchens override a validated subset via tenant_themes.overrides (see resolve.ts).
 *
 * Naming: kebab-case roles so Tailwind classes read naturally:
 *   bg-surface / bg-surface-alt / text-ink-muted / border-line ...
 */

export const FONT_KEYS = ['jakarta', 'inter', 'dmSans', 'playfair'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** Colour roles. Hex only; converted to RGB channels for Tailwind alpha support. */
export const defaultColors = {
  brand: '#0B4D3C', // deep emerald — hero, nav, primary buttons
  'brand-contrast': '#FFFFFF',
  'brand-soft': '#E3EFE8', // soft emerald wash for selected / hover states
  accent: '#F6A91A', // warm amber — the one primary call-to-action
  'accent-contrast': '#1A1A1A',
  'accent-soft': '#FDF1D7', // soft amber wash
  surface: '#FFFFFF', // cards, sheets
  'surface-alt': '#F6F5F0', // warm canvas — page background
  tint: '#E7F0D8', // pale green section band
  'tint-alt': '#F1F4EC', // quieter green-tinted surface
  ink: '#141917', // primary body text
  'ink-muted': '#3E4641', // secondary body text
  'ink-soft': '#68736D', // captions, subtle labels
  line: '#E4E7E1', // dividers / borders
  'line-soft': '#EDEEE9',
  promo: '#E8512B', // promotions / secondary CTA
  'promo-soft': '#FDE9E1',
  danger: '#C62828',
  'danger-soft': '#F9E3E3',
  success: '#1B7F4B',
  'success-soft': '#DFF0E6',
} as const;
export type ColorRole = keyof typeof defaultColors;

/** Roles a kitchen may change. Everything else is platform-controlled. */
export const OVERRIDABLE_COLORS: readonly ColorRole[] = [
  'brand',
  'brand-contrast',
  'accent',
  'accent-contrast',
  'tint',
  'tint-alt',
  'promo',
];

/** Contrast pairs checked for readable text on backgrounds. */
export const CONTRAST_PAIRS: [ColorRole, ColorRole, string][] = [
  ['brand-contrast', 'brand', 'Text on brand colour'],
  ['accent-contrast', 'accent', 'Text on accent colour'],
  ['ink-muted', 'tint-alt', 'Text on tinted surfaces'],
  ['ink', 'surface-alt', 'Text on warm surfaces'],
  ['ink-soft', 'surface-alt', 'Captions on warm surfaces'],
  ['ink-muted', 'surface', 'Text on white'],
];

export const defaultFonts = { display: 'jakarta', body: 'inter' } as const satisfies Record<string, FontKey>;
export type FontRole = keyof typeof defaultFonts;

export interface TextStyle {
  font: FontRole;
  size: string;
  weight: number;
  lineHeight: string;
  tracking: string;
}

/**
 * Modern type scale.
 * Display / h1 use fluid clamp so hero headlines scale from mobile → desktop.
 * Body keeps generous 1.6 line-height for readability.
 */
export const defaultText = {
  display: { font: 'display', size: 'clamp(2.75rem, 6vw + 0.75rem, 4.75rem)', weight: 800, lineHeight: '1.02', tracking: '-0.03em' },
  h1: { font: 'display', size: 'clamp(1.875rem, 3vw + 1rem, 2.875rem)', weight: 800, lineHeight: '1.08', tracking: '-0.022em' },
  h2: { font: 'display', size: 'clamp(1.375rem, 1.8vw + 0.8rem, 2rem)', weight: 750, lineHeight: '1.15', tracking: '-0.018em' },
  h3: { font: 'display', size: '1.1875rem', weight: 700, lineHeight: '1.32', tracking: '-0.012em' },
  body: { font: 'body', size: '1rem', weight: 400, lineHeight: '1.65', tracking: '-0.002em' },
  'body-lg': { font: 'body', size: '1.125rem', weight: 400, lineHeight: '1.65', tracking: '-0.005em' },
  label: { font: 'body', size: '0.875rem', weight: 650, lineHeight: '1.35', tracking: '-0.002em' },
  caption: { font: 'body', size: '0.8125rem', weight: 500, lineHeight: '1.45', tracking: '0' },
  price: { font: 'display', size: '1.0625rem', weight: 750, lineHeight: '1.2', tracking: '-0.008em' },
  eyebrow: { font: 'body', size: '0.75rem', weight: 700, lineHeight: '1.3', tracking: '0.08em' },
} as const satisfies Record<string, TextStyle>;
export type TextRole = keyof typeof defaultText;

/** Back-compat aliases so `text-bodyLg` still resolves during migration. */
export const textAliases: Record<string, TextRole> = {
  bodyLg: 'body-lg',
};

export const radius = { sm: '0.5rem', md: '0.75rem', lg: '1.125rem', xl: '1.75rem', pill: '9999px' } as const;
export const shadows = {
  card: '0 1px 2px rgb(20 25 23 / 0.05), 0 8px 28px -12px rgb(20 25 23 / 0.18)',
  raised: '0 12px 44px -12px rgb(20 25 23 / 0.28), 0 2px 8px rgb(20 25 23 / 0.08)',
  glow: '0 0 0 6px rgb(246 169 26 / 0.18)',
} as const;
export const imageMask = { none: 'none', blob: 'url(#blob-mask)' } as const;

export const defaultTheme = {
  colors: defaultColors as Record<ColorRole, string>,
  fonts: defaultFonts as Record<FontRole, FontKey>,
  text: defaultText,
  radius,
  shadows,
  imageMask: 'none' as keyof typeof imageMask,
};
export type Theme = typeof defaultTheme;

/** Shape stored in tenant_themes.overrides. */
export interface ThemeOverrides {
  colors?: Partial<Record<ColorRole, string>>;
  fonts?: Partial<Record<FontRole, FontKey>>;
  imageMask?: keyof typeof imageMask;
}

