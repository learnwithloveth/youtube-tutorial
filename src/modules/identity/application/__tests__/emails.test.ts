import { describe, expect, it } from 'vitest';

import { EmailAddress } from '../../domain/email-address';
import { renderPasswordResetEmail, renderVerificationEmail } from '../emails';

const to = EmailAddress.parseOrThrow('ada@example.com');

describe('outbound mail carries the site name it is given', () => {
  it('signs the verification mail with the deployment name, in every part', () => {
    const mail = renderVerificationEmail({
      to,
      url: 'https://example.test/verify-email?token=t',
      siteName: 'YOUTUBE DEMO VIDEO CODE',
    });

    expect(mail.subject).toBe('Confirm your YOUTUBE DEMO VIDEO CODE email address');
    expect(mail.text).toContain('on your YOUTUBE DEMO VIDEO CODE account');
    expect(mail.html).toContain('YOUTUBE DEMO VIDEO CODE is a fictional exchange');
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toContain('Novex');
  });

  it('escapes the name inside the HTML part, where it is now arbitrary text', () => {
    const mail = renderPasswordResetEmail({
      to,
      url: 'https://example.test/reset-password?token=t',
      siteName: 'Ada & Co <Demo>',
    });

    // Plain in the subject and the text part, which are not markup.
    expect(mail.subject).toBe('Reset your Ada & Co <Demo> password');
    expect(mail.text).toContain('Ada & Co <Demo> will never ask you');
    // Escaped in the HTML, so the name cannot open a tag.
    expect(mail.html).toContain('Ada &amp; Co &lt;Demo&gt;');
    expect(mail.html).not.toContain('<Demo>');
  });
});
