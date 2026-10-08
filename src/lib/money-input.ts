/** Form value in whole shillings -> minor units. Returns null for invalid/fractional input. */
export function shillingsToMinor(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n * 100;
}
export const minorToShillings = (minor: number) => String(Math.round(minor / 100));
export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
