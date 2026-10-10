import { describe, expect, it } from 'vitest';
import { clampOffset, clampZoom, coverScale, outputSize, rotatedSize, MAX_ZOOM } from '@/lib/images/crop-math';
import { hardMaxBytes } from '@/lib/images/compress';

describe('crop math', () => {
  it('rotates dimensions on odd quarter turns', () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ w: 400, h: 300 });
    expect(rotatedSize(400, 300, 1)).toEqual({ w: 300, h: 400 });
  });
  it('covers the viewport at zoom 1', () => {
    expect(coverScale(2000, 1000, 0, 400, 400)).toBeCloseTo(0.4);
    expect(coverScale(2000, 1000, 1, 400, 400)).toBeCloseTo(0.4); // rotated to 1000x2000: width-bound, same 0.4
  });
  it('never lets the image pan into empty space', () => {
    const st = { quarter: 0, zoom: 1, ox: 9999, oy: -9999 };
    const c = clampOffset(st, 2000, 1000, 400, 400);
    expect(c.ox).toBeCloseTo((2000 * 0.4 - 400) / 2); // wide image: free horizontally
    expect(c.oy).toBeCloseTo(0);                            // exactly fits vertically
    expect(clampOffset({ ...st, zoom: 2 }, 2000, 1000, 400, 400).oy).toBeLessThan(0);
  });
  it('limits zoom and output size', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM); expect(clampZoom(0.2)).toBe(1);
    const small = outputSize(1600, 4 / 3, 800, 600, { quarter: 0, zoom: 1, ox: 0, oy: 0 }, 400, 300);
    expect(small.w).toBeLessThanOrEqual(800);            // no upscaling past source detail
    const big = outputSize(1600, 4 / 3, 6000, 4500, { quarter: 0, zoom: 1, ox: 0, oy: 0 }, 400, 300);
    expect(big).toEqual({ w: 1600, h: 1200 });
  });
  it('caps stored images at 2 MB (avatars 1 MB)', () => {
    expect(hardMaxBytes('product')).toBe(2 * 1024 * 1024);
    expect(hardMaxBytes('cover')).toBe(2 * 1024 * 1024);
    expect(hardMaxBytes('avatar')).toBe(1024 * 1024);
  });
});
