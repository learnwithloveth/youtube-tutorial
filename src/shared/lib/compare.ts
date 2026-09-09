/**
 * Ordering helpers for the exact decimal strings the DTOs carry.
 *
 * Sorting by `Number(a) - Number(b)` is wrong at the top of a market table: a
 * market capitalisation near 1e12, carried to two decimal places, exceeds the
 * range where doubles can distinguish adjacent integers, so two different values
 * can compare equal and the order becomes arbitrary. Comparing digit by digit
 * costs nothing here and is always right.
 */

/** -1, 0 or 1, comparing two decimal strings by value. */
export function compareDecimalStrings(a: string, b: string): number {
  const negativeA = a.startsWith('-');
  const negativeB = b.startsWith('-');
  if (negativeA !== negativeB) return negativeA ? -1 : 1;

  const magnitude = compareMagnitude(negativeA ? a.slice(1) : a, negativeB ? b.slice(1) : b);
  return negativeA ? -magnitude : magnitude;
}

function compareMagnitude(a: string, b: string): number {
  const [wholeA = '0', fractionA = ''] = a.split('.');
  const [wholeB = '0', fractionB = ''] = b.split('.');

  const trimmedA = wholeA.replace(/^0+(?=\d)/, '');
  const trimmedB = wholeB.replace(/^0+(?=\d)/, '');
  if (trimmedA.length !== trimmedB.length) return trimmedA.length < trimmedB.length ? -1 : 1;
  if (trimmedA !== trimmedB) return trimmedA < trimmedB ? -1 : 1;

  const width = Math.max(fractionA.length, fractionB.length);
  const paddedA = fractionA.padEnd(width, '0');
  const paddedB = fractionB.padEnd(width, '0');
  if (paddedA === paddedB) return 0;
  return paddedA < paddedB ? -1 : 1;
}

/** Nulls sort last in both directions — an absent value is not a small one. */
export function compareNullableDecimals(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareDecimalStrings(a, b);
}
