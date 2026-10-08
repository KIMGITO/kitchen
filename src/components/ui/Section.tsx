'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'plain' | 'alt' | 'tint' | 'brand';
type Side = 'left' | 'right' | 'center';
type Corner = 'tl' | 'tr' | 'br' | 'bl';
export type RadiusSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' |'5xl' | 'full';
export type BlurLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface SectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'color'
> {
  children: ReactNode;
  className?: string;

  tone?: Tone;
  /** Any CSS color. Overrides the tone background. */
  bgColor?: string;
  /** Any CSS color. Overrides the tone text color. */
  textColor?: string;

  /** Direct image URL (must open as a plain image in the browser). */
  imageUrl?: string;
  imagePosition?: string; // e.g. 'center', 'top', '30% 70%'
  /** Dark scrim over the image, 0-90. */
  overlay?: number;

  /** Blurred area. On mobile any side becomes 'full'. */
  blur?: 'none' | 'left' | 'right' | 'full';
  blurLevel?: BlurLevel; // 1-9
  /** Text position on md+. Always centered on mobile. */
  align?: Side;

  /** Corner size. true = 'xl'. Fluid, so it looks consistent on all screens. */
  rounded?: boolean | RadiusSize;
  /** Which corners to round. Default 'all'. e.g. 'br' or ['tl', 'br'] */
  corners?: 'all' | Corner | Corner[];
  /** Inset the card from the screen edges so the corners show.
   *  Default: true when all corners are rounded, otherwise false. */
  inset?: boolean;
}

const tones: Record<Tone, { bg: string; text: string }> = {
  plain: { bg: 'bg-surface-alt', text: 'text-ink-muted' },
  alt: { bg: 'bg-surface', text: 'text-ink-muted' },
  tint: { bg: 'bg-tint', text: 'text-ink-muted' },
  brand: { bg: 'bg-brand', text: 'text-brand-contrast' },
};


export const RADIUS: Record<RadiusSize, string> = {
  sm: 'clamp(12px, 1vw + 8px, 18px)',
  md: 'clamp(18px, 1.5vw + 12px, 28px)',
  lg: 'clamp(28px, 2.5vw + 16px, 44px)',
  xl: 'clamp(40px, 3.8vw + 20px, 64px)',
  '2xl': 'clamp(56px, 5.2vw + 24px, 92px)',
  '3xl': 'clamp(76px, 7vw + 28px, 128px)',
  '4xl': 'clamp(100px, 9vw + 32px, 176px)',
  '5xl': 'clamp(128px, 12vw + 40px, 240px)',
  full: '9999px',
};

/**
 * Creates custom per-corner border-radius string.
 * CSS order: top-left top-right bottom-right bottom-left
 */
export function getAsymmetricRadius(
  base: RadiusSize,
  featuredCorner: { corner: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; size: RadiusSize }
): string {
  const baseVal = RADIUS[base];
  const featuredVal = RADIUS[featuredCorner.size];

  switch (featuredCorner.corner) {
    case 'bottom-right':
      return `${baseVal} ${baseVal} ${featuredVal} ${baseVal}`;
    case 'bottom-left':
      return `${baseVal} ${baseVal} ${baseVal} ${featuredVal}`;
    case 'top-right':
      return `${baseVal} ${featuredVal} ${baseVal} ${baseVal}`;
    case 'top-left':
      return `${featuredVal} ${baseVal} ${baseVal} ${baseVal}`;
  }
}

const BLUR_PX: Record<BlurLevel, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 9,
  5: 12,
  6: 16,
  7: 20,
  8: 26,
  9: 32,
};

// Side masks only from md up. Below md there is no mask, so the blur is full.
const masks = {
  left: 'md:[mask-image:linear-gradient(to_right,black_0%,black_40%,transparent_75%)]',
  right:
    'md:[mask-image:linear-gradient(to_left,black_0%,black_40%,transparent_75%)]',
  full: '',
} as const;

const alignments: Record<Side, string> = {
  center: 'md:justify-center md:text-center',
  left: 'md:justify-start md:text-left',
  right: 'md:justify-end md:text-right',
};

export function Section({
  tone = 'plain',
  bgColor,
  textColor,
  imageUrl,
  imagePosition = 'center',
  overlay = 0,
  blur = 'none',
  blurLevel = 5,
  align,
  rounded = false,
  corners = 'all',
  inset,
  className,
  style,
  children,
  ...rest
}: SectionProps) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [imageUrl]);

  const showImage = Boolean(imageUrl) && !imgFailed;
  const blurSide = showImage && blur !== 'none' ? blur : null;

  // ---- Rounding
  const size: RadiusSize | null = rounded
    ? rounded === true
      ? 'xl'
      : rounded
    : null;
  const active: Corner[] =
    corners === 'all'
      ? ['tl', 'tr', 'br', 'bl']
      : Array.isArray(corners)
        ? corners
        : [corners];
  const r = size ? RADIUS[size] : '0px';
  const has = (c: Corner) => (size && active.includes(c) ? r : '0px');
  const isInset = inset ?? (Boolean(size) && active.length === 4);

  const radiusStyle: CSSProperties = {
    borderTopLeftRadius: has('tl'),
    borderTopRightRadius: has('tr'),
    borderBottomRightRadius: has('br'),
    borderBottomLeftRadius: has('bl'),
  };

  // ---- Alignment
  const resolvedAlign: Side =
    align ?? (blur === 'left' || blur === 'right' ? blur : 'center');

  // ---- Colors
  const t = tones[tone];
  const surfaceStyle: CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : null),
    ...(textColor ? { color: textColor } : null),
    ...radiusStyle,
  };

  const imgBase = 'absolute inset-0 h-full w-full object-cover';
  const imgStyle: CSSProperties = { objectPosition: imagePosition };
  const scrim = Math.min(Math.max(overlay, 0), 90) / 100;

  return (
    <section
      className={cn(isInset && 'px-4 py-4 sm:px-6', className)}
      style={style}
      {...rest}
    >
      <div
        className={cn(
          'relative isolate overflow-hidden',
          !bgColor && t.bg,
          !textColor && t.text,
          isInset && 'mx-auto max-w-6xl',
        )}
        style={surfaceStyle}
      >
        {showImage && (
          <>
            {/* Sharp base */}
            <img
              src={imageUrl}
              alt=""
              aria-hidden
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onError={() => {
                console.warn('[Section] Image failed to load:', imageUrl);
                setImgFailed(true);
              }}
              className={cn(imgBase, 'z-0')}
              style={imgStyle}
            />

            {/* Blurred copy */}
            {blurSide && (
              <div
                aria-hidden
                className={cn('absolute inset-0 z-[1]', masks[blurSide])}
              >
                <img
                  src={imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={cn(imgBase, 'scale-110')}
                  style={{
                    ...imgStyle,
                    filter: `blur(${BLUR_PX[blurLevel]}px)`,
                  }}
                />
              </div>
            )}

            {scrim > 0 && (
              <div
                aria-hidden
                className="absolute inset-0 z-[2] bg-black"
                style={{ opacity: scrim }}
              />
            )}
          </>
        )}

        <div
          className={cn(
            'relative z-[3] mx-auto flex w-full max-w-6xl justify-center px-4 py-10 text-center',
            'sm:px-6 sm:py-14 md:py-16',
            isInset && 'sm:px-10',
            alignments[resolvedAlign],
          )}
        >
          <div
            className={cn(
              'w-full',
              resolvedAlign !== 'center' && 'md:max-w-xl',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
