import { describe, expect, it } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import { displayNameFor, initialsFor, MAX_DISPLAY_NAME, Profile } from '../profile';

const USER = 'user-1' as UserId;
const NOW = new Date('2026-09-14T10:00:00.000Z');

describe('profile', () => {
  it('distinguishes "leave it alone" from "clear it"', () => {
    const profile = Profile.empty(USER, NOW);
    expect(profile.update({ displayName: 'Amara Okonkwo', handle: 'amara' }, NOW)).toEqual([]);

    // `undefined` for the handle must not wipe it. A form that grows a third field
    // would otherwise clear the two it did not render.
    profile.update({ displayName: 'Amara O.' }, NOW);
    expect(profile.displayName).toBe('Amara O.');
    expect(profile.handle).toBe('amara');

    // An empty string is the explicit clear.
    profile.update({ displayName: '' }, NOW);
    expect(profile.displayName).toBeNull();
    expect(profile.handle).toBe('amara');
  });

  it('collapses whitespace rather than only trimming it', () => {
    const profile = Profile.empty(USER, NOW);
    // A name pasted out of a document arrives with newlines and runs of spaces, and
    // it is rendered inline in a top bar.
    profile.update({ displayName: '  Amara\n\n   Okonkwo  ' }, NOW);
    expect(profile.displayName).toBe('Amara Okonkwo');
  });

  it('accepts a handle with the @ the interface draws, and lowercases it', () => {
    const profile = Profile.empty(USER, NOW);
    expect(profile.update({ handle: '@Amara_01' }, NOW)).toEqual([]);
    // Stored without the punctuation, so the unique index compares values and not
    // presentation.
    expect(profile.handle).toBe('amara_01');
  });

  it('refuses a handle that would not survive being typed from memory', () => {
    const profile = Profile.empty(USER, NOW);

    for (const bad of ['ab', 'a'.repeat(25), 'amara okonkwo', 'amara.k', 'amará']) {
      expect(profile.update({ handle: bad }, NOW), bad).toEqual(['handle-invalid']);
    }
    // Nothing was written by any of the rejected attempts.
    expect(profile.handle).toBeNull();
  });

  it('refuses an over-long name without applying the rest of the change', () => {
    const profile = Profile.empty(USER, NOW);
    const problems = profile.update(
      { displayName: 'x'.repeat(MAX_DISPLAY_NAME + 1), handle: 'amara' },
      NOW,
    );

    expect(problems).toEqual(['display-name-too-long']);
    // All or nothing: a partially-applied update would save the handle and report
    // failure, leaving the person unsure what happened.
    expect(profile.handle).toBeNull();
    expect(profile.displayName).toBeNull();
  });
});

describe('displayNameFor', () => {
  it('prefers a name, then a handle, then the email local part', () => {
    expect(displayNameFor({ displayName: 'Amara', handle: 'amara', email: 'a@b.com' })).toBe(
      'Amara',
    );
    expect(displayNameFor({ displayName: null, handle: 'amara', email: 'a@b.com' })).toBe(
      '@amara',
    );
    // Never "Unknown": every account has an email, and the part before the `@` is a
    // real, recognisable label with nothing to fill in.
    expect(displayNameFor({ displayName: null, handle: null, email: 'amara@b.com' })).toBe(
      'amara',
    );
  });
});

describe('initialsFor', () => {
  it('takes one letter from each of two words, or two from one', () => {
    expect(initialsFor('Amara Okonkwo')).toBe('AO');
    expect(initialsFor('amara')).toBe('AM');
    // Handles and email local parts are the common input, so their punctuation
    // counts as a word break.
    expect(initialsFor('@amara_okonkwo')).toBe('AO');
    expect(initialsFor('amara.okonkwo')).toBe('AO');
  });
});
