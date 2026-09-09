/**
 * How long a page holding prices may be served before it is regenerated.
 *
 * The refresh job records new observations about once a minute, so regenerating
 * on the same cadence keeps a served page at most one cycle behind while still
 * letting every visitor be answered from cache rather than from the database.
 *
 * This is deliberately shorter than `MAX_TICKER_AGE_SECONDS` (five minutes). The
 * staleness label a page carries is computed when that page is generated, so the
 * regeneration interval has to sit well inside the freshness window — otherwise
 * a page could keep asserting "live" for longer than the quote on it is entitled
 * to that word.
 */
export const PRICED_PAGE_REVALIDATE_SECONDS = 60;

/** Pages with no market data: content changes only when the code does. */
export const STATIC_PAGE_REVALIDATE_SECONDS = 3600;
