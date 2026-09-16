/**
 * Country dialling codes, by ISO-3166-1 alpha-2.
 *
 * ── Written down, like the country names next door ────────────────────────────
 * Reference data, not a computation. `Intl` has no dialling codes at all, and the
 * alternative — a phone-number library — is megabytes of metadata to fill one
 * field with three characters somebody can retype.
 *
 * ── Deliberately incomplete ───────────────────────────────────────────────────
 * This table holds the codes that could be stated with confidence, not one row per
 * ISO code. A missing entry means the form offers no prefix and the person types
 * their own; a *wrong* entry means a number that silently cannot be dialled, which
 * nobody would notice until it mattered. The same rule the rest of this codebase
 * follows about locations and prices: leaving a gap is honest, filling it with a
 * guess is not. Adding a country here is a one-line change when somebody can
 * confirm the code.
 *
 * Several countries share a code — `+1` covers the North American Numbering Plan,
 * `+7` covers Russia and Kazakhstan — so this maps one way only. There is no
 * inverse lookup, because there is no single answer to give.
 */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  // North America and the Caribbean (NANP members share +1)
  US: '+1', CA: '+1', DO: '+1', JM: '+1', TT: '+1', PR: '+1', BS: '+1', BB: '+1',
  MX: '+52', CU: '+53', GT: '+502', SV: '+503', HN: '+504', NI: '+505', CR: '+506',
  PA: '+507', BZ: '+501', HT: '+509',

  // South America
  BR: '+55', AR: '+54', CL: '+56', CO: '+57', PE: '+51', VE: '+58', EC: '+593',
  BO: '+591', PY: '+595', UY: '+598', GY: '+592', SR: '+597',

  // Western and Northern Europe
  GB: '+44', IE: '+353', FR: '+33', DE: '+49', IT: '+39', ES: '+34', PT: '+351',
  NL: '+31', BE: '+32', LU: '+352', CH: '+41', AT: '+43', SE: '+46', NO: '+47',
  DK: '+45', FI: '+358', IS: '+354', MC: '+377', LI: '+423', AD: '+376', SM: '+378',
  MT: '+356', GI: '+350', FO: '+298', GL: '+299',

  // Central and Eastern Europe
  PL: '+48', CZ: '+420', SK: '+421', HU: '+36', RO: '+40', BG: '+359', GR: '+30',
  HR: '+385', SI: '+386', RS: '+381', BA: '+387', ME: '+382', MK: '+389', AL: '+355',
  LT: '+370', LV: '+371', EE: '+372', UA: '+380', BY: '+375', MD: '+373', RU: '+7',
  CY: '+357', TR: '+90',

  // Middle East
  AE: '+971', SA: '+966', QA: '+974', KW: '+965', BH: '+973', OM: '+968', IL: '+972',
  JO: '+962', LB: '+961', IQ: '+964', IR: '+98', SY: '+963', YE: '+967', PS: '+970',

  // Africa
  NG: '+234', GH: '+233', KE: '+254', ZA: '+27', EG: '+20', MA: '+212', DZ: '+213',
  TN: '+216', LY: '+218', SD: '+249', SS: '+211', ET: '+251', TZ: '+255', UG: '+256',
  RW: '+250', BI: '+257', ZM: '+260', ZW: '+263', MZ: '+258', AO: '+244', CM: '+237',
  CI: '+225', SN: '+221', ML: '+223', BF: '+226', NE: '+227', TG: '+228', BJ: '+229',
  GN: '+224', GM: '+220', SL: '+232', LR: '+231', BW: '+267', NA: '+264', MW: '+265',
  MU: '+230', MG: '+261', CD: '+243', CG: '+242', GA: '+241', TD: '+235', CF: '+236',
  SO: '+252', DJ: '+253', ER: '+291', LS: '+266', SZ: '+268', SC: '+248', CV: '+238',
  GW: '+245', ST: '+239', GQ: '+240', KM: '+269', MR: '+222',

  // Asia
  CN: '+86', JP: '+81', KR: '+82', KP: '+850', IN: '+91', PK: '+92', BD: '+880',
  LK: '+94', NP: '+977', BT: '+975', MV: '+960', AF: '+93', MM: '+95', TH: '+66',
  VN: '+84', KH: '+855', LA: '+856', MY: '+60', SG: '+65', ID: '+62', PH: '+63',
  BN: '+673', TL: '+670', TW: '+886', HK: '+852', MO: '+853', MN: '+976', KZ: '+7',
  UZ: '+998', TM: '+993', TJ: '+992', KG: '+996', AZ: '+994', GE: '+995', AM: '+374',

  // Oceania
  AU: '+61', NZ: '+64', FJ: '+679', PG: '+675', SB: '+677', VU: '+678', WS: '+685',
  TO: '+676', NC: '+687', PF: '+689',
};

/**
 * The dialling code for a country, or null when this table cannot say.
 *
 * Null is a real answer and the caller has to render it as one — an empty field
 * somebody fills in themselves, never a `+` with a guess after it.
 */
export function dialCodeFor(country: string | null | undefined): string | null {
  if (!country) return null;
  return DIAL_CODES[country.trim().toUpperCase()] ?? null;
}
