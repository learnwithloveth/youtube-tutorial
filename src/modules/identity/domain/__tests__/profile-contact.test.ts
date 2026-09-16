import { describe, expect, it } from 'vitest';

import { toUserId } from '@/shared/kernel/ids';

import { Profile } from '../profile';

/**
 * Country of residence and phone number on a profile.
 *
 * The rules worth pinning down are the refusals: a national number with no
 * dialling code cannot be dialled by anyone who does not already know where its
 * owner lives, and this context deliberately does not guess that.
 */

const USER = toUserId('11111111-1111-4111-8111-111111111111');
const NOW = new Date('2026-09-16T12:00:00.000Z');

function profile() {
  return Profile.empty(USER, NOW);
}

describe('country of residence', () => {
  it('is stored upper-cased, whatever case it arrives in', () => {
    const it_ = profile();
    expect(it_.update({ country: 'ch' }, NOW)).toEqual([]);
    expect(it_.country).toBe('CH');
  });

  it('refuses anything that is not two letters', () => {
    const it_ = profile();
    expect(it_.update({ country: 'Switzerland' }, NOW)).toEqual(['country-invalid']);
    expect(it_.country).toBeNull();
  });

  it('is cleared by an empty string, and left alone by undefined', () => {
    const it_ = profile();
    it_.update({ country: 'CH' }, NOW);

    it_.update({ displayName: 'Ada' }, NOW);
    expect(it_.country).toBe('CH');

    it_.update({ country: '' }, NOW);
    expect(it_.country).toBeNull();
  });
});

describe('phone number', () => {
  it('keeps an international number, dropping the spacing people type', () => {
    const it_ = profile();
    expect(it_.update({ phone: '+41 79 123 45 67' }, NOW)).toEqual([]);
    expect(it_.phone).toBe('+41791234567');
  });

  it('accepts brackets and dashes as written', () => {
    const it_ = profile();
    it_.update({ phone: '+1 (415) 555-0132' }, NOW);
    expect(it_.phone).toBe('+14155550132');
  });

  it('refuses a national number with no dialling code', () => {
    const it_ = profile();
    // The rule that matters: 079 123 45 67 is a different phone in every country,
    // and nothing here is entitled to decide which one was meant.
    expect(it_.update({ phone: '079 123 45 67' }, NOW)).toEqual(['phone-invalid']);
    expect(it_.phone).toBeNull();
  });

  it('refuses something that is not a number at all', () => {
    expect(profile().update({ phone: '+41 CALL-ME' }, NOW)).toEqual(['phone-invalid']);
  });

  it('refuses more than the fifteen digits E.164 allows', () => {
    expect(profile().update({ phone: `+${'9'.repeat(16)}` }, NOW)).toEqual(['phone-invalid']);
  });

  it('leaves every field untouched when one of them is refused', () => {
    const it_ = profile();
    const problems = it_.update({ displayName: 'Ada Lovelace', phone: 'nonsense' }, NOW);

    expect(problems).toEqual(['phone-invalid']);
    // All or nothing: a form that reported one bad field and silently saved the
    // others would leave somebody unsure what was stored.
    expect(it_.displayName).toBeNull();
  });
});
