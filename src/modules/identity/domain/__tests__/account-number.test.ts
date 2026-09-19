import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_NUMBER_LENGTH,
  AccountNumber,
  formatAccountNumber,
} from '../account-number';

describe('AccountNumber', () => {
  it('accepts ten digits with a non-zero lead', () => {
    expect(AccountNumber.parseOrThrow('1234567890').value).toBe('1234567890');
  });

  /* A leading zero survives a spreadsheet as nine digits, which would make
     0123456789 and 123456789 the same account written two ways. */
  it('refuses a leading zero', () => {
    expect(AccountNumber.parse('0123456789').ok).toBe(false);
  });

  it('refuses anything that is not exactly ten digits', () => {
    for (const bad of ['', '123456789', '12345678901', '12345678ab', '１２３４５６７８９０']) {
      expect(AccountNumber.parse(bad).ok).toBe(false);
    }
  });

  /* The number is *displayed* grouped, so somebody copying it off their own
     dashboard will paste the spaces along with it. Refusing that would be
     refusing our own formatting back. */
  it('accepts its own display form', () => {
    const grouped = formatAccountNumber('1234567890');
    expect(grouped).toBe('1234 567 890');
    expect(AccountNumber.parseOrThrow(grouped).value).toBe('1234567890');
    expect(AccountNumber.parseOrThrow('1234-567-890').value).toBe('1234567890');
  });

  it('leaves a value it cannot group alone rather than mangling it', () => {
    expect(formatAccountNumber('nonsense')).toBe('nonsense');
  });

  describe('candidate', () => {
    it('always produces something parse accepts', () => {
      // Including the ends, which is where an off-by-one lands: the bottom of
      // the range must not carry a leading zero and the top must not be eleven
      // digits. A source returning exactly 1 breaks the [0, 1) contract, and is
      // here because a broken random source should not be a sign-up outage.
      for (const fraction of [0, 0.5, 0.999999999, 1, -1, Number.NaN]) {
        const drawn = AccountNumber.candidate(() => fraction);
        expect(drawn.value).toHaveLength(ACCOUNT_NUMBER_LENGTH);
        expect(AccountNumber.parse(drawn.value).ok).toBe(true);
      }
    });

    it('spans the whole ten-digit range', () => {
      expect(AccountNumber.candidate(() => 0).value).toBe('1000000000');
      expect(AccountNumber.candidate(() => 0.999999999999).value).toBe('9999999999');
    });

    it('is a bijection over the draw, so two draws differ', () => {
      const first = AccountNumber.candidate(() => 0.25);
      const second = AccountNumber.candidate(() => 0.75);
      expect(first.equals(second)).toBe(false);
      expect(first.equals(AccountNumber.candidate(() => 0.25))).toBe(true);
    });
  });
});
