/**
 * Formats an exact decimal string as USD.
 *
 * Splits the string rather than `Number(value).toLocaleString()`. For the amounts
 * on these pages a float would round identically, so the reason is not arithmetic
 * — it is that a `Number()` anywhere on the money path is the line a later edit
 * copies somewhere it does matter. The rule is easier to keep when there are no
 * exceptions to it.
 *
 * Directive-free so Server Components and Client Components can share it.
 */
export function usd(decimal: string): string {
  const [whole = '0', fraction = '00'] = decimal.split('.');
  const negative = whole.startsWith('-');
  const digits = (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${digits}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
