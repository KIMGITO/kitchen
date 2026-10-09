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
  brand: '#0B4D3C', // Deep Teal Green — header, tab bar, selected states, brand art
  'brand-contrast': '#FFFFFF',
  'brand-soft': '#DCE9E2', // soft emerald wash for selected / hover states
  accent: '#F6A91A', // Warm Amber — ONLY Order / Add to cart / Checkout, stars, promo tags
  'accent-contrast': '#161A17', // Near Black text on amber
  'accent-soft': '#FDF1D7', // soft amber wash
  surface: '#F7F6F1', // Soft Warm White — item cards, sheets
  'surface-alt': '#F7F6F1', // Soft Warm White — app canvas
  tint: '#E7F0D8', // pale green section band
  'tint-alt': '#F1F4EC', // quieter green-tinted surface
  ink: '#161A17', // Near Black Ink — headings, prices, body
  'ink-muted': '#252B27', // body text (still near black)
  'ink-soft': '#4B6A5C', // subtle dark green — tags, delivery times, captions
  line: '#D9D6CA', // warm gray — dividers / borders
  'line-soft': '#E7E4D9',
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
  /** Phone size. */
  size: string;
  /** Tablet / desktop size (>= 768px). Weight stays identical across breakpoints. */
  sizeLg?: string;
  weight: number;
  lineHeight: string;
  tracking: string;
}

/**
 * Scale: mobile / desktop. Weights are identical across breakpoints; nothing below 400.
 *  h1 24 -> 44 (700) · h2 18 -> 30 (600) · body 14 -> 16 (400) · UI 14 -> 16 (500) · caption 12 -> 13 (400)
 *  type primitives additionally need fixed mobile px tokens: 15px (1.875rem), 16px (1rem), 18px (1.125rem)
 */
export const defaultText = {
  display: { font: 'display', size: '2.25rem', sizeLg: '4rem', weight: 700, lineHeight: '1.05', tracking: '-0.03em' },
  h1: { font: 'display', size: '1.5rem', sizeLg: '2.75rem', weight: 700, lineHeight: '1.12', tracking: '-0.02em' },
  h2: { font: 'display', size: '1.125rem', sizeLg: '1.875rem', weight: 600, lineHeight: '1.2', tracking: '-0.015em' },
  h3: { font: 'display', size: '1rem', sizeLg: '1.1875rem', weight: 600, lineHeight: '1.35', tracking: '-0.01em' },
  body: { font: 'body', size: '0.875rem', sizeLg: '1rem', weight: 400, lineHeight: '1.6', tracking: '0' },
  'body-lg': { font: 'body', size: '1rem', sizeLg: '1.125rem', weight: 400, lineHeight: '1.6', tracking: '0' },
  label: { font: 'body', size: '0.875rem', sizeLg: '1rem', weight: 500, lineHeight: '1.35', tracking: '0' },
  caption: { font: 'body', size: '0.75rem', sizeLg: '0.8125rem', weight: 400, lineHeight: '1.45', tracking: '0' },
  price: { font: 'display', size: '0.875rem', sizeLg: '1rem', weight: 700, lineHeight: '1.2', tracking: '-0.005em' },
  eyebrow: { font: 'body', size: '0.75rem', sizeLg: '0.75rem', weight: 600, lineHeight: '1.3', tracking: '0.08em' },
  '15px': { font: 'body', size: '0.9375rem', sizeLg: '1rem', weight: 600, lineHeight: '1.2', tracking: '0' },
  '16px': { font: 'body', size: '1rem', sizeLg: '1.125rem', weight: 600, lineHeight: '1.2', tracking: '0' },
  '18px': { font: 'display', size: '1.125rem', sizeLg: '1.5rem', weight: 700, lineHeight: '1.2', tracking: '-0.01em' },
} as const satisfies Record<string, TextStyle>;
export type TextRole = keyof typeof defaultText;

/** Back-compat aliases so `text-bodyLg` still resolves during migration. */
export const textAliases: Record<string, TextRole> = {
  bodyLg: 'body-lg',
};

/** Raw mobile-only px spec sizes used by the type/UI primitives. */
export const textPixels = { '15px': '1.875rem', '16px': '1rem', '18px': '1.125rem' } as const;


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

export interface ThemeOverrides {
  colors?: Partial<Record<ColorRole, string>>;
  fonts?: Partial<Record<FontRole, FontKey>>;
  imageMask?: keyof typeof imageMask;
}

