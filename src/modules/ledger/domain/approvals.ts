/**
 * How many operator signatures a withdrawal needs.
 *
 * ── There is no ladder any more ────────────────────────────────────────────────
 * This file replaced `limits.ts`, which held a tier ladder, a daily withdrawal cap
 * in USD and a dual-control threshold. All three are gone: this deployment places
 * no ceiling on what an account may withdraw, and no withdrawal is large enough to
 * need a second operator. One signature releases anything.
 *
 * The constant stays rather than being inlined because `Withdrawal.approve` takes
 * the number it must reach, and a literal `1` scattered across four call sites is
 * the thing that makes a future policy change miss one of them.
 */
export const APPROVALS_REQUIRED = 1;
