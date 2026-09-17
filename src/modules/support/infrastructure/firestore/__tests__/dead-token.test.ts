import { describe, expect, it } from 'vitest';

import { isDeadTokenError } from '../dead-token';

describe('isDeadTokenError', () => {
  it('forgets a token FCM no longer knows', () => {
    expect(isDeadTokenError({ code: 'messaging/registration-token-not-registered' })).toBe(true);
    expect(isDeadTokenError({ code: 'messaging/invalid-registration-token' })).toBe(true);
  });

  it('forgets a malformed token, which FCM reports as an invalid argument', () => {
    expect(
      isDeadTokenError({
        code: 'messaging/invalid-argument',
        message: 'The registration token is not a valid FCM registration token',
      }),
    ).toBe(true);
  });

  it('keeps every registration when the message, not the token, was refused', () => {
    // The failure that used to delete every device a push was addressed to.
    expect(
      isDeadTokenError({
        code: 'messaging/invalid-argument',
        message: 'Invalid JSON payload received. Unknown name "urgency"',
      }),
    ).toBe(false);
  });

  it('keeps the registration through an outage or a credentials fault', () => {
    expect(isDeadTokenError({ code: 'messaging/server-unavailable' })).toBe(false);
    expect(isDeadTokenError({ code: 'messaging/third-party-auth-error' })).toBe(false);
    expect(isDeadTokenError(undefined)).toBe(false);
  });
});
