import { describe, expect, it } from 'vitest';

import { EvmAddress } from '../address';

const VALID = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';

describe('EvmAddress', () => {
  it('normalises to lowercase so two spellings of one account are one value', () => {
    const upper = EvmAddress.parse(VALID);
    const lower = EvmAddress.parse(VALID.toLowerCase());

    expect(upper?.value).toBe(VALID.toLowerCase());
    expect(upper?.equals(lower as EvmAddress)).toBe(true);
  });

  it('accepts surrounding whitespace, because addresses arrive pasted', () => {
    expect(EvmAddress.parse(`  ${VALID}\n`)?.value).toBe(VALID.toLowerCase());
  });

  it.each([
    ['no 0x prefix', VALID.slice(2)],
    ['one digit short', VALID.slice(0, -1)],
    ['one digit long', `${VALID}a`],
    ['a non-hex character', `${VALID.slice(0, -1)}z`],
    ['empty', ''],
    ['a bare 0x', '0x'],
  ])('refuses %s', (_label, raw) => {
    expect(EvmAddress.parse(raw)).toBeNull();
  });

  it('shortens to the span people actually compare', () => {
    expect(EvmAddress.parse(VALID)?.short()).toBe('0x2c75…5c23');
  });
});
