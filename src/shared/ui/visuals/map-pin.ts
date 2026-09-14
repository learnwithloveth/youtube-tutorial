/**
 * The marker shape a map drops on a place.
 *
 * This is Material's `place` glyph — the teardrop Google Maps has used for twenty
 * years — kept as data rather than as a component because it is drawn two ways
 * that cannot share one: the server map scales it into a 1000×500 viewBox with a
 * transform, and the live overlay renders it at a fixed pixel size outside the
 * SVG entirely. What they genuinely share is the outline, so that is what lives
 * here.
 *
 * Directive-free and dependency-free, so both a Server Component and a Client
 * Component can import it without dragging anything across the boundary.
 */

export const MAP_PIN = {
  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',

  /**
   * Trimmed to the glyph's own bounds rather than the 24×24 icon box it ships in.
   *
   * That puts the tip exactly on the bottom edge and the shaft exactly on the
   * horizontal centre, which is what lets the overlay anchor it with a plain
   * `-translate-x-1/2 -translate-y-full` instead of a hand-computed offset. A pin
   * whose *centre* sat on the coordinate would point at nothing.
   */
  viewBox: '5 2 14 20',
  width: 14,
  height: 20,

  /** Where the point actually is, in the untrimmed icon coordinates. */
  tip: { x: 12, y: 22 },

  /** The hole in the head. Drawn as a filled dot, not a cut-out, so the shape
   *  reads the same over dark water as over pale land. */
  eye: { x: 12, y: 9, r: 2.7 },
} as const;
