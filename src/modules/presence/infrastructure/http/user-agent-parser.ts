import 'server-only';

import type { AgentSummary } from '../../domain/presence';
import type { AgentParser } from '../../application/ports';

/**
 * Reduces a user-agent string to a device class and a browser family.
 *
 * ── The output is the point ────────────────────────────────────────────────────
 * This exists so the raw string never gets past it. A modern user-agent is a
 * 150-character fingerprint with a build number in it; the console needs "Mobile ·
 * Safari" and storing the rest would be collecting a tracking vector to render two
 * words. Everything below throws information away on purpose.
 *
 * ── The order of the tests is the substance ────────────────────────────────────
 * User agents are a museum of compatibility lies. Every Chromium browser claims to
 * be Safari, every browser claims to be Mozilla, and Edge claims to be Chrome. The
 * only way to read one is to test for the most specific claim first and stop —
 * which is why these are ordered lists and not a lookup table.
 */

interface Rule {
  readonly pattern: RegExp;
  readonly label: string;
}

/**
 * Automated clients, checked before anything else.
 *
 * A crawler is not a person and must not be counted as one on a board that says
 * "active visitors" — half the traffic to a public exchange is bots, and folding
 * them in makes the number meaningless rather than impressive.
 */
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|axios|node-fetch|go-http|postman|insomnia/i;

/** Most specific claim first. Everything below Chrome also says "Chrome". */
const BROWSERS: readonly Rule[] = [
  { pattern: /\bEdg(?:e|A|iOS)?\//, label: 'Edge' },
  { pattern: /\bOPR\/|\bOpera[ /]/, label: 'Opera' },
  { pattern: /\bSamsungBrowser\//, label: 'Samsung Internet' },
  { pattern: /\bYaBrowser\//, label: 'Yandex' },
  { pattern: /\bDuckDuckGo\//, label: 'DuckDuckGo' },
  { pattern: /\bBrave\//, label: 'Brave' },
  { pattern: /\bVivaldi\//, label: 'Vivaldi' },
  // FxiOS is Firefox on iOS, where the engine underneath is actually WebKit.
  { pattern: /\bFirefox\/|\bFxiOS\//, label: 'Firefox' },
  // CriOS is Chrome on iOS, for the same reason.
  { pattern: /\bCriOS\/|\bChrome\/|\bChromium\//, label: 'Chrome' },
  // Only reached once every Chromium browser above has been ruled out, which is
  // the only way this test means Safari rather than "any WebKit descendant".
  { pattern: /\bVersion\/[\d.]+.*\bSafari\//, label: 'Safari' },
];

export class UserAgentParser implements AgentParser {
  parse(userAgent: string | null): AgentSummary | null {
    if (userAgent === null) return null;

    const value = userAgent.trim();
    if (value.length === 0 || value.length > 1024) return null;

    if (BOT.test(value)) return { device: 'bot', browser: null };

    return { device: deviceOf(value), browser: browserOf(value) };
  }
}

function deviceOf(value: string): AgentSummary['device'] {
  if (/\biPad\b/i.test(value)) return 'tablet';
  // Android's own convention: a tablet omits the "Mobile" token that a phone
  // carries. There is no positive tablet marker to test for.
  if (/\bAndroid\b/i.test(value) && !/\bMobile\b/i.test(value)) return 'tablet';
  if (/\bTablet\b|\bKindle\b|\bPlayBook\b|\bSilk\b/i.test(value)) return 'tablet';

  if (/\bMobi|\biPhone\b|\biPod\b|\bAndroid\b|\bWindows Phone\b|\bIEMobile\b/i.test(value)) {
    return 'mobile';
  }

  if (/\bWindows NT\b|\bMacintosh\b|\bX11\b|\bLinux\b|\bCrOS\b/i.test(value)) {
    return 'desktop';
  }

  // An unrecognised string is `unknown`, not `desktop`. Guessing the most common
  // answer would quietly fold every new device class into the desktop count.
  return 'unknown';
}

function browserOf(value: string): string | null {
  for (const rule of BROWSERS) {
    if (rule.pattern.test(value)) return rule.label;
  }
  return null;
}
