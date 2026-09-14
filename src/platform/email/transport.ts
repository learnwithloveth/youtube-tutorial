import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { smtpConfig } from '@/platform/env';
import { logger } from '@/platform/observability/logger';

/**
 * Sending mail, as a platform capability.
 *
 * ── Why this is not in a module ────────────────────────────────────────────────
 * Two contexts need to send email and neither may import the other: identity sends
 * verification and reset links, and the ledger sends receipts. The *transport* is
 * the same TCP connection and the same pool in both cases, while the *port* each
 * one declares is its own — identity's takes an `EmailAddress` value object, the
 * ledger's takes a plain string, and neither should learn the other's vocabulary.
 *
 * So the connection lives here, beside the database client, and each module wires
 * an adapter over it. That is the same shape as `platform/db`: the foundation owns
 * the resource, the module owns what it means.
 *
 * ── The connection is pooled, and created once ─────────────────────────────────
 * A transporter per message opens a TCP connection and runs the SMTP handshake
 * every time, which on a serverless instance handling a burst is both slow and a
 * good way to exhaust a provider's connection limit.
 */

export interface MailMessage {
  /** A plain address. Each module validates in its own vocabulary before calling. */
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

class SmtpTransport implements MailTransport {
  private transporter: Transporter | null = null;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      secure: boolean;
      user?: string | undefined;
      password?: string | undefined;
      from: string;
    },
  ) {}

  private transport(): Transporter {
    if (this.transporter) return this.transporter;

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      // Mailpit listens without TLS; a real provider will not. Driven by config
      // rather than by sniffing the hostname, so there is no path where a
      // production send silently downgrades.
      secure: this.config.secure,
      ...(this.config.user
        ? { auth: { user: this.config.user, pass: this.config.password ?? '' } }
        : {}),
      pool: true,
      maxConnections: 3,
      // A hung mail server must not hold a request handler open indefinitely.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    const info = await this.transport().sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    // The message id is the handle for tracing a delivery in the provider's logs.
    // The recipient is not logged here — callers log a masked form, and duplicating
    // it unmasked would defeat that.
    logger.debug({ event: 'email_dispatched', module: 'platform', messageId: info.messageId });
  }
}

/**
 * Writes messages to the log instead of sending them.
 *
 * The fallback when no SMTP host is configured, so a fresh clone with no mail
 * server still completes a signup and prints the verification link rather than
 * failing at the last step. Never selected when a host *is* set.
 */
class LoggingTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    logger.warn({
      event: 'email_not_sent_no_transport',
      module: 'platform',
      recipient: maskAddress(message.to),
      subject: message.subject,
      // The body carries the link, which is the whole point of printing it: without
      // a transport this is the only way to complete the flow locally.
      body: message.text,
    });
  }
}

/**
 * One transport per process.
 *
 * Module-level rather than per-request, unlike the database client — a pooled SMTP
 * connection is exactly the thing that should outlive a request, and it holds no
 * per-caller state to leak between them.
 */
let cached: MailTransport | null = null;

export function mailTransport(): MailTransport {
  if (cached !== null) return cached;

  const config = smtpConfig();
  cached = config === null ? new LoggingTransport() : new SmtpTransport(config);
  return cached;
}

/** `a••@example.com`. Enough to recognise an address without printing one. */
export function maskAddress(address: string): string {
  const [local = '', domain] = address.split('@');
  if (domain === undefined) return '•••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
