import { describe, expect, it } from 'vitest';

import { nameFrom } from '../google-client';

/**
 * The name out of a Google id_token.
 *
 * Its own test because the rest of the client is a network exchange, and this is
 * the one part with a decision in it: what to do when Google sends a whole name
 * instead of two halves.
 */
describe('nameFrom', () => {
  it('prefers the two halves Google usually sends', () => {
    expect(nameFrom({ given_name: 'Ada', family_name: 'Lovelace', name: 'Ada Lovelace' })).toEqual([
      'Ada',
      'Lovelace',
    ]);
  });

  /* An imperfect guess, and better than putting a whole name in the first-name box.
     Both are corrected in the same place — Settings. */
  it('splits a whole name on the last space', () => {
    expect(nameFrom({ name: 'Ada King Lovelace' })).toEqual(['Ada King', 'Lovelace']);
  });

  it('gives a one-word name as the first, and invents no last', () => {
    expect(nameFrom({ name: 'Prince' })).toEqual(['Prince', undefined]);
  });

  it('keeps whichever half arrived on its own', () => {
    expect(nameFrom({ given_name: 'Ada' })).toEqual(['Ada', undefined]);
    expect(nameFrom({ family_name: 'Lovelace' })).toEqual([undefined, 'Lovelace']);
  });

  it('treats blank and non-string claims as nothing at all', () => {
    expect(nameFrom({ given_name: '   ', family_name: '', name: '  ' })).toEqual([
      undefined,
      undefined,
    ]);
    expect(nameFrom({ given_name: 42, name: null })).toEqual([undefined, undefined]);
    expect(nameFrom({})).toEqual([undefined, undefined]);
  });

  it('collapses the whitespace a pasted name arrives with', () => {
    expect(nameFrom({ given_name: '  Ada  ', family_name: ' King  Lovelace ' })).toEqual([
      'Ada',
      'King Lovelace',
    ]);
  });
});
