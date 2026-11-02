import 'server-only';
import { createLogger } from '@couchlist/shared';
import { config } from '../config';
import { recordMailAttempt } from './health';

/**
 * Outbound email.
 *
 * There are two transports and the choice is explicit, never implied:
 *
 *  - `log`: development. The message is written to the server log, clearly
 *    labelled as not sent. Nothing pretends an email was delivered.
 *  - `resend`: production. Requires RESEND_API_KEY and MAIL_FROM.
 *
 * If a production deploy has no provider configured, `sendMail` reports a
 * failure instead of silently succeeding, so a signup cannot leave someone
 * waiting for a code that was never going to arrive.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text only: a verification code does not need HTML. */
  text: string;
}

export type MailResult =
  | { delivered: true; transport: 'resend' }
  | { delivered: false; transport: 'log'; reason: 'development_transport' }
  | { delivered: false; transport: 'none'; reason: 'not_configured' | 'provider_error'; detail?: string };

const logger = createLogger({ service: 'web' });

export function mailTransport(): 'resend' | 'log' | 'none' {
  const { RESEND_API_KEY, MAIL_FROM, MAIL_TRANSPORT } = config();
  if (MAIL_TRANSPORT === 'log') return 'log';
  if (RESEND_API_KEY.trim() && MAIL_FROM.trim()) return 'resend';
  // No provider: development logs, production refuses.
  return config().isProduction ? 'none' : 'log';
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = mailTransport();

  if (transport === 'log') {
    // Deliberately loud and unambiguous in the log.
    logger.warn('mail_not_sent_development_transport', {
      to: message.to,
      subject: message.subject,
      body: message.text,
      note: 'MAIL_TRANSPORT=log - this message was printed, not emailed.',
    });
    return { delivered: false, transport: 'log', reason: 'development_transport' };
  }

  if (transport === 'none') {
    recordMailAttempt({
      at: new Date(),
      ok: false,
      detail: 'RESEND_API_KEY and MAIL_FROM are not set, so nothing was sent.',
    });
    logger.error('mail_provider_not_configured', {
      to: message.to,
      subject: message.subject,
      note: 'Set RESEND_API_KEY and MAIL_FROM, or MAIL_TRANSPORT=log for local development.',
    });
    return { delivered: false, transport: 'none', reason: 'not_configured' };
  }

  const { RESEND_API_KEY, MAIL_FROM } = config();
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('mail_provider_rejected', {
        status: response.status,
        // The address is not logged with the body, to keep logs clean of PII.
        detail: detail.slice(0, 500),
      });
      recordMailAttempt({ at: new Date(), ok: false, status: response.status, detail: detail.slice(0, 500) });
      return {
        delivered: false,
        transport: 'none',
        reason: 'provider_error',
        detail: `Provider responded ${response.status}`,
      };
    }

    logger.info('mail_sent', { subject: message.subject });
    recordMailAttempt({ at: new Date(), ok: true });
    return { delivered: true, transport: 'resend' };
  } catch (error) {
    logger.error('mail_send_failed', { message: (error as Error).message });
    recordMailAttempt({ at: new Date(), ok: false, detail: (error as Error).message });
    return {
      delivered: false,
      transport: 'none',
      reason: 'provider_error',
      detail: (error as Error).message,
    };
  }
}

/* ------------------------------ templates ------------------------------- */

export function verificationEmail(code: string, minutes: number): Omit<MailMessage, 'to'> {
  return {
    subject: `Your Couchlist code: ${code}`,
    text: [
      `Your Couchlist verification code is ${code}.`,
      '',
      `It expires in ${minutes} minutes. If you did not create a Couchlist account, you can ignore this email.`,
    ].join('\n'),
  };
}

export function passwordResetEmail(url: string, minutes: number): Omit<MailMessage, 'to'> {
  return {
    subject: 'Reset your Couchlist password',
    text: [
      'Use this link to choose a new Couchlist password:',
      '',
      url,
      '',
      `The link expires in ${minutes} minutes and can be used once.`,
      'If you did not ask to reset your password, you can ignore this email.',
    ].join('\n'),
  };
}
