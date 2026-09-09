/**
 * Result — expected failures as values.
 *
 * The rule this type enforces: a failure the caller can reasonably anticipate
 * (asset not listed, feed stale, input invalid) is part of a function's return
 * type, so the compiler forces the caller to handle it. `throw` is reserved for
 * bugs and infrastructure faults — things no caller can sensibly recover from.
 *
 * This keeps use cases honest. A use case that can fail says so in its
 * signature rather than in a comment.
 */

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Maps the success value, leaving a failure untouched. */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Unwraps a result, throwing on failure.
 *
 * Only for call sites that have already proved the result is `ok`, and for
 * tests. Reaching the throw is a bug, which is exactly why it throws.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Called unwrap() on a failed Result: ${JSON.stringify(result.error)}`);
}
