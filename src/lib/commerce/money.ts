/** All money is integer minor units (cents/cents-of-shilling). Never floats. */
export function formatMoney(minor: number, currency = 'KES', locale = 'en-KE'): string {
  const major = minor / 100;
  const hasFraction = minor % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2,
  }).format(major);
}
