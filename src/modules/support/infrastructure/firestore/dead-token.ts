/**
 * Whether a failed send means the token itself is finished.
 *
 * ── `invalid-argument` is two different failures ──────────────────────────────
 * FCM answers `INVALID_ARGUMENT` for a malformed token *and* for a malformed
 * message. Reading every one as a dead token — which the sender used to — means a
 * single bad payload deletes every registration it was addressed to, and nothing
 * about that is visible afterwards: the devices simply stop existing, and every
 * later push reaches nobody. So only the answer that names the token counts.
 *
 * Its own file, with no imports, so the rule can be tested without loading the
 * Firebase Admin SDK.
 */
export function isDeadTokenError(
  error: { readonly code?: string; readonly message?: string } | undefined,
): boolean {
  const code = error?.code ?? '';
  if (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  ) {
    return true;
  }
  return code === 'messaging/invalid-argument' && /registration token/i.test(error?.message ?? '');
}
