/**
 * Shapes the charts render.
 *
 * These live with the charts, not with whatever supplies the data. A candle is a
 * candle whether it comes from a demo fixture, a database or a websocket — and
 * the dependency rule forbids `shared/` from importing `app/`, which is what
 * caught this when the ported charts still pointed at the dashboard's fixtures.
 *
 * The data modules now conform to these rather than the other way round.
 */

export interface Candle {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

export interface BookLevel {
  readonly price: number;
  readonly size: number;
  readonly total: number;
}
