import { type BasisPoints, Money } from '@/shared/kernel';

/**
 * Conversion estimates for the buy/sell widget.
 *
 * The design computed these inline with `parsed * FEE_RATE` and
 * `netValue / quote.live` — ordinary float arithmetic on money. On a widget
 * whose entire persuasive value is that the numbers look exact, that is the
 * wrong tool: it produces fees like `0.9999999999999999` and quantities whose
 * last digits are noise.
 *
 * This does the same three sums in integer arithmetic and returns `Money`, so
 * the widget formats an exact result instead of rounding a wrong one. It is a
 * pure domain service: no I/O, no framework, and therefore usable in a Client
 * Component as well as on the server.
 */

/** Decimal places an asset quantity is quoted to in the widget. */
export const QUANTITY_SCALE = 8;

const BASIS_POINT_DIVISOR = 10_000n;

export interface ConversionEstimate {
  /** What the user pays, as entered. */
  readonly gross: Money;
  readonly fee: Money;
  /** Gross less fee — the amount actually converted. */
  readonly net: Money;
  /** Asset quantity received, exact, as a decimal string. */
  readonly units: string;
}

export function estimateConversion(
  gross: Money,
  price: Money,
  feeRate: BasisPoints,
): ConversionEstimate {
  const feeMinor = divideHalfUp(gross.minorUnits * BigInt(feeRate.value), BASIS_POINT_DIVISOR);
  const fee = Money.of(feeMinor, gross.currency, gross.scale);
  const net = gross.subtract(fee);

  return { gross, fee, net, units: divideToQuantity(net, price) };
}

/**
 * quantity × price — what a holding is worth.
 *
 * The inverse of `divideToQuantity`, and the operation the ledger needs to value a
 * balance and to check a withdrawal against a limit denominated in USD. It lives
 * here rather than in the ledger because this module owns prices, and because the
 * temptation it removes belongs here too: the obvious implementation is
 * `Number(quantity) * Number(price)`, which puts money through a float at the one
 * moment it is least affordable — deciding how much may leave a platform.
 *
 * Multiplying the two integer amounts and dividing once, at the end, keeps it
 * exact. The intermediate product is large — an 18-decimal ether balance times a
 * cent-scale price is well past `Number.MAX_SAFE_INTEGER` — which is precisely why
 * it is `bigint` and not arithmetic.
 */
export function valueOf(quantity: Money, price: Money, valueScale = 2): Money {
  if (quantity.minorUnits === 0n || price.minorUnits === 0n) {
    return Money.zero(price.currency, valueScale);
  }

  const numerator = quantity.minorUnits * price.minorUnits * 10n ** BigInt(valueScale);
  const denominator = 10n ** BigInt(quantity.scale + price.scale);

  return Money.of(divideHalfUp(numerator, denominator), price.currency, valueScale);
}

/**
 * net / price, carried out entirely in integers.
 *
 * Scaling the numerator up by 10^(priceScale + quantityScale) before dividing is
 * what keeps this exact: the division happens once, at the end, on integers
 * large enough that the result already has all the digits it needs.
 */
function divideToQuantity(net: Money, price: Money): string {
  if (price.minorUnits === 0n) return (0).toFixed(QUANTITY_SCALE);

  const numerator = net.minorUnits * 10n ** BigInt(price.scale + QUANTITY_SCALE);
  const denominator = 10n ** BigInt(net.scale) * price.minorUnits;
  const quantityMinor = divideHalfUp(numerator, denominator);

  const negative = quantityMinor < 0n;
  const digits = (negative ? -quantityMinor : quantityMinor)
    .toString()
    .padStart(QUANTITY_SCALE + 1, '0');
  const whole = digits.slice(0, digits.length - QUANTITY_SCALE);
  const fraction = digits.slice(digits.length - QUANTITY_SCALE);

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}
