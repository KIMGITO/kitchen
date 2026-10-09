# Typography & Themes — how to use them in this app

This app pairs **Inter** (body / UI) with **Plus Jakarta Sans** (headings / prices).
Fonts are loaded once with `next/font/google`, exposed as CSS variables, mapped in
Tailwind, then resolved per-kitchen through the theme engine.

## 1. Font configuration (`src/theme/fonts.ts`)

```ts
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});
```

Weights are trimmed on purpose: Inter 400 (body/captions) + 600 (labels),
Jakarta 500 (card titles) + 600 (section titles) + 700 (heroes/prices).
Only `latin` subset + `display: swap` ship, so there is no layout shift and no
unused font bytes.

## 2. Applying the variables (`src/app/layout.tsx`)

```tsx
import { baseFontClassNames, fontVariables } from '@/theme/fonts';

export default async function RootLayout({ children }) {
  const tenant = await getTenantOptional();
  const theme = tenant?.theme ?? defaultTheme;
  const css = themeToCss(theme);
  // Base pair always present + the kitchen's chosen display/body fonts.
  const fontClasses = [baseFontClassNames, ...Object.values(theme.fonts).map((k) => fontVariables[k])].join(' ');
  return (
    <html lang="en" className={fontClasses}>
      <head><style dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

`baseFontClassNames` guarantees `--font-inter` / `--font-jakarta` exist even when
a kitchen picks e.g. Playfair for display. The `<style>` block sets the
theme-aware aliases `--font-display` / `--font-body` plus the text scale.

## 3. Tailwind mapping (`tailwind.config.ts`)

```ts
fontFamily: {
  // Exact spec mapping:
  sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  heading: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
  // Theme-aware aliases (follow the kitchen's branding choice):
  display: ['var(--font-display)', 'var(--font-jakarta)', 'system-ui', 'sans-serif'],
  body: ['var(--font-body)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
},
```

Use `font-sans` / `font-heading` for fixed spec surfaces (marketing, menu cards,
checkout). Use `font-display` / `font-body` (or the `text-*` theme tokens below)
when the text must follow kitchen branding.

## 4. Which classes do I use?

### A. Fixed spec scale (exact px — marketing, menus, checkout)

| Role | Classes |
|---|---|
| Hero H1 | `font-heading text-5xl font-bold leading-[1.2]` |
| Section H2 | `font-heading text-3xl font-semibold leading-[1.3]` |
| Dish card H3 | `font-heading text-xl font-medium leading-[1.4]` |
| Body / description | `font-sans text-base font-normal leading-[1.5] text-ink-soft` |
| Price & action label | `font-sans text-[15px] font-semibold leading-[1.2]` |
| Caption | `font-sans text-xs font-normal leading-[1.4]` |

Ready-made components: `HeroTitle`, `SectionTitle`, `DishTitle`, `BodyText`,
`PriceLabel`, `Caption` from `@/components/ui/primitives/Typography`.
Live usage: `FeaturedMenuShowcase` in `@/components/examples/FeaturedMenuShowcase`.

### B. Responsive tenant theme scale (dashboards, storefront chrome)

Generated from `src/theme/theme.ts` (`defaultText`), mobile -> desktop:

| Token | Mobile -> desktop | Use for |
|---|---|---|
| `text-display` | 36 -> 64 / 700 | Big marketing hero |
| `text-h1` | 24 -> 44 / 700 | Page titles |
| `text-h2` | 18 -> 30 / 600 | Section titles |
| `text-h3` | 16 -> 19 / 600 | Card titles |
| `text-body` / `text-body-lg` | 14->16 / 16->18 / 400 | Descriptions |
| `text-label` | 14->16 / 500 | Form labels, UI labels |
| `text-price` | 14->16 / 700 Jakarta | Prices |
| `text-caption` | 12->13 / 400 | Hints, timestamps |
| `text-eyebrow` | 12 / 600 uppercase | Kickers |

These already encode the right `font-display` / `font-body`, weight, line-height
and tracking — just add a color (`text-ink`, `text-ink-soft`).

## 5. Themes — how to access and use them

- Source of truth: `src/theme/theme.ts` (`defaultColors`, `defaultFonts`,
  `defaultText`, `radius`, `shadows`). Components must never hard-code hex,
  font names, or ad-hoc sizes — use the tokens.
- Kitchen overrides: validated subset in `tenant_themes.overrides`
  (`src/theme/resolve.ts`): 7 brand colors, display/body font pick, image mask.
  Contrast below 4.5:1 falls back to platform defaults — never ships unreadable.
- Dashboard editing: Settings -> Colours and fonts (Advanced plan) writes through
  the `saveTheme` server action.
- Reading the theme in code:
  - Server components: `const tenant = await getTenant()` → `tenant.theme`,
    `tenant.currency`. Colors: `bg-brand text-brand-contrast border-line …`.
  - CSS variables at runtime: `--color-brand` (as `r g b` channels),
    `--font-display`, `--text-h1-size`, `--radius-lg`, `--shadow-card`, …
- Adding a token: extend `theme.ts`, it flows automatically into
  `tailwind.config.ts` utilities and the `:root` block in `resolve.ts`.

## 6. Performance rules

- Never add font weights without removing one — each weight is a render-blocking file.
- Prefer `<Image>` with `sizes` for dish photos; keep card images warm (`bg-line/40`).
- Body copy always `text-ink-soft` on warm surfaces; headings `text-ink`.
- Respect `prefers-reduced-motion` (already wired in `globals.css`).
