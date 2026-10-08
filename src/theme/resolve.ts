import { z } from 'zod';
import {
  defaultTheme, FONT_KEYS, OVERRIDABLE_COLORS, CONTRAST_PAIRS, imageMask,
  type ColorRole, type Theme, type ThemeOverrides,
} from './theme';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const overridable = z.enum(OVERRIDABLE_COLORS as [ColorRole, ...ColorRole[]]);

/** Validates untrusted JSON from the database / settings form. Unknown keys are dropped. */
export const overridesSchema = z.object({
  colors: z.record(overridable, hex).optional(),
  fonts: z.object({
    display: z.enum(FONT_KEYS).optional(),
    body: z.enum(FONT_KEYS).optional(),
  }).optional(),
  imageMask: z.enum(Object.keys(imageMask) as [keyof typeof imageMask, ...(keyof typeof imageMask)[]]).optional(),
}).strip();

function channels(hexColor: string): string {
  const n = parseInt(hexColor.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function luminance(hexColor: string): number {
  const n = parseInt(hexColor.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_CONTRAST = 4.5;

/** Returns human-readable problems; empty array = acceptable. Run on save AND on resolve. */
export function checkContrast(colors: Theme['colors']): string[] {
  return CONTRAST_PAIRS
    .filter(([fg, bg]) => contrastRatio(colors[fg], colors[bg]) < MIN_CONTRAST)
    .map(([, , label]) => `${label} needs a contrast ratio of at least ${MIN_CONTRAST}:1`);
}

export function resolveTheme(raw: unknown): Theme {
  const parsed = overridesSchema.safeParse(raw ?? {});
  const o: ThemeOverrides = parsed.success ? (parsed.data as ThemeOverrides) : {};
  const merged: Theme = {
    ...defaultTheme,
    colors: { ...defaultTheme.colors, ...(o.colors ?? {}) } as Theme['colors'],
    fonts: { ...defaultTheme.fonts, ...(o.fonts ?? {}) } as Theme['fonts'],
    imageMask: o.imageMask ?? defaultTheme.imageMask,
  };
  // Never ship unreadable branding: fall back to platform defaults.
  if (checkContrast(merged.colors).length > 0) merged.colors = { ...defaultTheme.colors };
  return merged;
}

/** CSS variable block injected once in the root layout. */
export function themeToCss(theme: Theme): string {
  const vars: string[] = [];
  for (const [k, v] of Object.entries(theme.colors)) vars.push(`--color-${k}: ${channels(v)};`);
  for (const [role, key] of Object.entries(theme.fonts)) vars.push(`--font-${role}: var(--font-${key});`);
  for (const [name, t] of Object.entries(theme.text)) {
    vars.push(`--text-${name}-size: ${t.size};`);
    vars.push(`--text-${name}-weight: ${t.weight};`);
    vars.push(`--text-${name}-lh: ${t.lineHeight};`);
    vars.push(`--text-${name}-tracking: ${t.tracking};`);
  }
  for (const [k, v] of Object.entries(theme.radius)) vars.push(`--radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(theme.shadows)) vars.push(`--shadow-${k}: ${v};`);
  return `:root{${vars.join('')}}`;
}
