import type { LocationDto, LocationSource } from '@/modules/presence';

/**
 * Presentation helpers for a location.
 *
 * No directive: the server page renders the first board and the client island
 * re-renders it on every refresh, so both sides run these and both must produce
 * the same string. That constraint is why the locale below is pinned rather than
 * taken from the environment — the same rule, and the same reason, as the UTC
 * timezone pinned in `shared/lib/format.ts`.
 */

/**
 * The flag for an ISO-3166-1 alpha-2 code.
 *
 * Pure arithmetic on code points: each letter maps to its regional indicator
 * symbol, and a pair of those is rendered as a flag by the platform. No lookup
 * table to fall out of date, and a code with no flag degrades to two harmless
 * letters rather than a missing-glyph box.
 */
export function countryFlag(code: string | null): string {
  if (code === null || !/^[A-Za-z]{2}$/.test(code)) return '';

  const base = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => letter.charCodeAt(0) + base),
  );
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string | null): string {
  if (code === null) return 'Unknown';
  try {
    return countryNames.of(code.toUpperCase()) ?? code;
  } catch {
    // `of` throws on a structurally invalid code rather than returning undefined.
    return code;
  }
}

/**
 * The place, as specifically as the fix actually supports.
 *
 * Assembled from what is present rather than from a fixed template, because the
 * precision varies per visitor: joining `[city, region, country]` unconditionally
 * would render a country-only fix as ", , DE".
 */
export function placeLabel(location: LocationDto): string {
  const parts = [location.city, location.region, countryName(location.country)].filter(
    (part): part is string => Boolean(part),
  );

  // A region is redundant when the city already names the place, and both together
  // read as noise in a narrow column: "Austin, Texas, United States".
  if (parts.length === 3) return `${parts[0]}, ${parts[2]}`;
  return parts.join(', ');
}

/**
 * How a fix was obtained, in words an operator can act on.
 *
 * The wording matters more than it looks. A device fix is *self-reported* — it
 * arrives in a request body the client composes — so an operator comparing it
 * against a connection-derived one needs to know which of the two the visitor
 * could have chosen. Labelling both "location" would hide exactly the distinction
 * that makes the comparison worth making.
 */
export const SOURCE_LABEL: Record<LocationSource, string> = {
  device: 'Device',
  edge: 'Network',
  network: 'IP lookup',
};

export const SOURCE_DETAIL: Record<LocationSource, string> = {
  device: 'Reported by the browser after the visitor granted permission — precise, and self-reported.',
  edge: 'Derived from the connection by the network in front of us. Not chosen by the visitor.',
  network: 'Resolved from the connecting IP address. Approximate, and wrong behind a VPN.',
};
