/**
 * The chat panel's backdrop, and the date rules that go with it.
 *
 * ── Why a wallpaper at all ─────────────────────────────────────────────────────
 * It is the one piece of WhatsApp's look that is doing work rather than
 * decoration: a patterned ground makes the bubbles read as objects sitting on a
 * surface, which is what separates a conversation from a list of paragraphs. Flat
 * panels make short messages look like form errors.
 *
 * ── Inline, tiled, and theme-coloured ──────────────────────────────────────────
 * A data URI rather than a file, because it is under a kilobyte and a separate
 * request for a background that must be there on first paint is a visible flash.
 * It is drawn with `currentColor` and set at a low opacity, so it takes the
 * theme's foreground colour in both light and dark rather than needing two assets.
 */

/**
 * URL-encoded, not base64.
 *
 * `#` inside an SVG data URI terminates the URL and takes the rest of the pattern
 * with it — silently, leaving a blank background nobody can explain. Encoding the
 * handful of reserved characters is enough and keeps the source readable, which
 * base64 would not.
 */
function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${svg
    .replace(/\n\s*/g, '')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/&/g, '%26')}")`;
}

const DOODLES = `
<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'
     fill='none' stroke='currentColor' stroke-width='1.4' stroke-linecap='round'>
  <circle cx='18' cy='20' r='7'/>
  <path d='M44 14h14v12H50l-4 5v-5h-2z'/>
  <path d='M78 16l4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z'/>
  <path d='M12 54c4-6 10-6 14 0s10 6 14 0'/>
  <rect x='54' y='48' width='14' height='14' rx='3'/>
  <path d='M88 50v14M81 57h14'/>
  <circle cx='22' cy='92' r='5'/>
  <path d='M44 86l6 12h-12z'/>
  <path d='M74 88h16v10H80l-3 4v-4h-3z'/>
  <path d='M104 30c3 3 3 7 0 10'/>
  <path d='M104 96c-3-3-3-7 0-10'/>
</svg>`;

export const CHAT_WALLPAPER = svgUrl(DOODLES);

/**
 * A stable key for the UTC day an instant falls in.
 *
 * UTC, and that is load-bearing rather than tidy. This component is server-rendered
 * before it hydrates, so a label computed in the *host's* zone differs from one
 * computed in the reader's — 23:30 UTC is "today" on the server and "yesterday" in
 * consoles render UTC for the same reason; see `_console/data/format`.
 */
export function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** `Today`, `Yesterday`, or the date — the separator WhatsApp puts between days. */
export function dayLabelFor(iso: string, now: Date): string {
  const key = utcDayKey(iso);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return DAY_LABEL.format(new Date(`${key}T00:00:00.000Z`));
}
