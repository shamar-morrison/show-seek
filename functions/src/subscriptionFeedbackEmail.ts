/**
 * Subscription-cancellation feedback emails, sent via Resend's HTTP API.
 *
 * Provider-agnostic on purpose: the signature carries no RevenueCat (or
 * Polar) types so other webhooks can reuse the same helper later.
 */

export type SubscriptionFeedbackReason = 'cancelled' | 'expired';

export interface SendSubscriptionFeedbackEmailOptions {
  email: string;
  reason: SubscriptionFeedbackReason;
}

export const FEEDBACK_FROM_EMAIL = 'ShowSeek <feedback@show-seek.app>';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface FeedbackCopy {
  subject: string;
  text: string;
  html: string;
}

const CANCELLED_TEXT = [
  "Hey, I noticed you cancelled your ShowSeek subscription. You'll keep your premium features until your current billing period ends, no rush there.",
  "I built ShowSeek myself and I'd genuinely like to know what didn't work for you, whether it was a missing feature, a bug, price, or just not needing it anymore. If you've got a minute, just reply to this email and let me know.",
  'Thanks for giving it a try.',
  '— Shamar',
].join('\n\n');

const EXPIRED_TEXT = [
  "Hey, your ShowSeek premium access ended today. If you ever want to come back, everything's right where you left it.",
  "If there's anything that would've made you stick around, I'd really like to hear it, just reply to this email. I read every one.",
  '— Shamar',
].join('\n\n');

const toHtml = (text: string): string =>
  text
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('\n');

const FEEDBACK_COPY: Record<SubscriptionFeedbackReason, FeedbackCopy> = {
  cancelled: {
    subject: 'Sorry to see you go — mind telling me why?',
    text: CANCELLED_TEXT,
    html: toHtml(CANCELLED_TEXT),
  },
  expired: {
    subject: 'Your ShowSeek premium just ended',
    text: EXPIRED_TEXT,
    html: toHtml(EXPIRED_TEXT),
  },
};

export const sendCancellationFeedbackEmail = async (
  options: SendSubscriptionFeedbackEmailOptions
): Promise<{ id?: string }> => {
  const to = options.email.trim();
  if (!to) {
    throw new Error('sendCancellationFeedbackEmail: email is required');
  }

  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('sendCancellationFeedbackEmail: RESEND_API_KEY is not configured');
  }

  const copy = FEEDBACK_COPY[options.reason];

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FEEDBACK_FROM_EMAIL,
      to: [to],
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `sendCancellationFeedbackEmail: Resend request failed with status ${response.status}${
        detail ? ` — ${detail.slice(0, 500)}` : ''
      }`
    );
  }

  try {
    const data = (await response.json()) as { id?: unknown };
    return { id: typeof data.id === 'string' ? data.id : undefined };
  } catch {
    return {};
  }
};
