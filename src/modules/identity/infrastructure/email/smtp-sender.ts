import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { logger } from '@/platform/observability/logger';

import type { EmailSender, OutboundEmail } from '../../application/ports';

/**
 * SMTP mail transport.
 *
 * One adapter for development and production, because Mailpit speaks plain SMTP —
 * the same protocol a real provider does. That is the point of choosing it over a
 * provider SDK for local work: the code path exercised on a laptop is the code path
 * that runs in production, so "it worked locally" means something. Only the host,
 * port and credentials differ, and those come from configuration.
 *
 * ── Connection reuse ────────────────────────────────────────────────────────────
 * The transporter is created once and pooled. Creating one per message would open a
 * TCP connection and run the SMTP handshake for every email, which on a serverless
 * instance handling a burst of signups is both slow and a good way to exhaust a
 * provider's connection limit.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
}

export class SmtpEmailSender implements EmailSender {
  private transporter: Transporter | null = null;

  constructor(private readonly config: SmtpConfig) {}

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

  async send(message: OutboundEmail): Promise<void> {
    const info = await this.transport().sendMail({
      from: this.config.from,
      to: message.to.value,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    // The message id is the handle for tracing a specific delivery in the
    // provider's logs. The recipient is not logged here — the caller logs a masked
    // form, and duplicating it unmasked would defeat that.
    logger.debug({ event: 'email_dispatched', module: 'identity', messageId: info.messageId });
  }
}

/**
 * Writes messages to the log instead of sending them.
 *
 * The fallback when no SMTP host is configured, so a fresh clone with no
 * `docker compose up` still completes a signup and prints the verification link
 * rather than failing at the last step. Never selected when a host *is* set.
 */
export class ConsoleEmailSender implements EmailSender {
  async send(message: OutboundEmail): Promise<void> {
    logger.warn({
      event: 'email_not_sent_no_transport',
      module: 'identity',
      recipient: message.to.masked(),
      subject: message.subject,
      // The body carries the link, which is the whole point of printing it: without
      // a transport this is the only way to complete the flow locally.
      body: message.text,
    });
  }
}
