import type { EmailAddress } from '../domain/email-address';
import { TOKEN_LIFETIME_MS } from '../domain/verification-token';
import type { OutboundEmail } from './ports';

/**
 * Outbound message content.
 *
 * In the application layer rather than in the mail adapter, because the *wording*
 * of a security email is a product decision — it tells someone whether to be
 * alarmed — and it should be reviewable next to the rule that sends it. The adapter
 * below this owns only the transport.
 *
 * Every message ships both `text` and `html`. A text part is not a nicety: mail
 * clients that block HTML, screen readers, and spam filters all read it, and a
 * message with no text part scores worse in every filter that looks.
 */

/**
 * The site's name, made safe to place inside markup.
 *
 * The name comes from the deployment's environment rather than from this file, so
 * it can hold any character — and an `&` or a `<` in it would otherwise break the
 * element it sits in.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders a lifetime the way a person would say it. */
function humanDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/**
 * Minimal, inline-styled HTML.
 *
 * Mail clients strip `<style>` blocks and understand roughly 2003-era CSS, so this
 * is deliberately a table-free, inline-styled document rather than anything the
 * site's design system produces. A verification mail that renders as unstyled text
 * still works; one that renders as broken layout looks like a phishing attempt.
 */
function layout(
  siteName: string,
  heading: string,
  body: string,
  action: { label: string; url: string },
): string {
  const name = escapeHtml(siteName);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5faf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.02em;">${name}</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5f55;">${body}</p>
      <a href="${action.url}" style="display:inline-block;background:#0a7f59;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px;font-weight:500;">${action.label}</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5f7469;">
        If the button does not work, paste this into your browser:<br />
        <span style="word-break:break-all;color:#0a7f59;">${action.url}</span>
      </p>
      <hr style="border:none;border-top:1px solid #dfeae4;margin:28px 0 16px;" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#5f7469;">
        ${name} is a fictional exchange built for design and demonstration.
        We will never ask you for your password or a verification code by email.
      </p>
    </div>
  </body>
</html>`;
}

export function renderVerificationEmail(input: {
  to: EmailAddress;
  url: string;
  siteName: string;
}): OutboundEmail {
  const validFor = humanDuration(TOKEN_LIFETIME_MS['email-verification']);

  return {
    to: input.to,
    subject: `Confirm your ${input.siteName} email address`,
    text: [
      `Confirm your email address`,
      ``,
      `Open this link to confirm the address on your ${input.siteName} account:`,
      input.url,
      ``,
      `The link is valid for ${validFor} and can be used once.`,
      `If you did not create an account, you can ignore this message.`,
      ``,
      `${input.siteName} will never ask you for your password or a verification code by email.`,
    ].join('\n'),
    html: layout(
      input.siteName,
      'Confirm your email address',
      `Open the link below to confirm the address on your ${escapeHtml(input.siteName)} account. It is valid for ${validFor} and can be used once. If you did not create an account, you can ignore this message.`,
      { label: 'Confirm email address', url: input.url },
    ),
  };
}

export function renderPasswordResetEmail(input: {
  to: EmailAddress;
  url: string;
  siteName: string;
}): OutboundEmail {
  const validFor = humanDuration(TOKEN_LIFETIME_MS['password-reset']);

  return {
    to: input.to,
    subject: `Reset your ${input.siteName} password`,
    text: [
      `Reset your password`,
      ``,
      `Open this link to choose a new password:`,
      input.url,
      ``,
      `The link is valid for ${validFor} and can be used once.`,
      // The reassurance matters: someone who did not request this needs to know
      // whether they have to act. They do not — nothing has changed yet.
      `If you did not request this, you can ignore this message. Your password has not changed.`,
      ``,
      `${input.siteName} will never ask you for your password or a verification code by email.`,
    ].join('\n'),
    html: layout(
      input.siteName,
      'Reset your password',
      `Open the link below to choose a new password. It is valid for ${validFor} and can be used once. If you did not request this, you can ignore this message — your password has not changed.`,
      { label: 'Choose a new password', url: input.url },
    ),
  };
}
