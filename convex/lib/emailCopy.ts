import { dayOfWeek } from './days';

/**
 * The two emails a friend ever gets from Ante: a heads-up when they're named,
 * and one note if the commitment is missed. Pure, so the words can be tested.
 * Everything the user typed is escaped before it goes into HTML.
 */

export type EmailContent = { subject: string; html: string; text: string };

export type HeadsUpInput = {
  userName: string;
  friendName: string;
  title: string;
  /** "every day", "3 times a week", "by Sun, Oct 4, 9pm". */
  cadence: string;
  subject: 'habit' | 'goal';
  optOutUrl: string;
};

export type LossInput = {
  userName: string;
  friendName: string;
  title: string;
  subject: 'habit' | 'goal';
  /** Habits: the run that ended, and in what unit. */
  streak?: number;
  unit?: 'day' | 'week';
  /** Habits: the day missed, or the first day of the week that came up short. */
  missedPeriod?: string;
  /** Goals: when it was due. */
  dueLabel?: string;
  /** Replies reach the user directly (their address is on Reply-To). */
  replyable: boolean;
  optOutUrl: string;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Where a friend's reply goes: straight to the user, unless their address is
 * Apple's private relay, which only accepts mail from registered senders.
 */
export function replyToFor(email: string): string | undefined {
  if (email.length === 0 || email.endsWith('@privaterelay.appleid.com')) return undefined;
  return email;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Subjects are plain text, but a newline in one would break the header. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function headsUpEmail(input: HeadsUpInput): EmailContent {
  const { userName, friendName, title, cadence } = input;
  const miss =
    input.subject === 'habit' ? `${userName} breaks the streak` : `${userName} misses the deadline`;

  const subject = oneLine(`${userName} put you on the hook`);
  const paragraphs = [
    `Hi ${friendName},`,
    `${userName} just made a commitment on Ante, and named you as the person who finds out if they don’t keep it:`,
  ];
  const after = [
    `You don’t need to do anything. If ${miss}, we’ll email you once, so you can check in.`,
    `They picked you because you’re someone they don’t want to let down.`,
  ];

  return {
    subject,
    text: [
      ...paragraphs,
      `${title} (${cadence})`,
      ...after,
      '— Ante',
      footerText(userName, input.optOutUrl),
    ].join('\n\n'),
    html: layout(
      [
        ...paragraphs.map(paragraph),
        card(title, cadence),
        ...after.map(paragraph),
        paragraph('— Ante'),
      ].join(''),
      footerHtml(userName, input.optOutUrl),
    ),
  };
}

export function lossEmail(input: LossInput): EmailContent {
  const { userName, friendName, title } = input;

  let subject: string;
  let what: string;
  if (input.subject === 'goal') {
    subject = `${userName} missed their deadline`;
    what =
      input.dueLabel === undefined
        ? `${userName} committed to “${title}” and didn’t send proof in time.`
        : `${userName} committed to “${title}” by ${input.dueLabel}, and didn’t send proof in time.`;
  } else {
    const streak = input.streak ?? 0;
    const unit = input.unit ?? 'day';
    const when = missedLabel(input.missedPeriod, unit);
    if (streak >= 2) {
      subject = `${userName} broke a ${streak}-${unit} streak`;
      what = `${userName} asked us to tell you if they slipped on “${title}”. After ${streak} ${unit}s in a row, they missed ${when}.`;
    } else {
      subject = `${userName} missed “${title}”`;
      what = `${userName} asked us to tell you if they slipped on “${title}”. They missed ${when}.`;
    }
  }

  const paragraphs = [
    `Hi ${friendName},`,
    what,
    `No lecture needed. A quick “saw the email, what happened?” goes a long way. Better yet, offer to do it with them next time.`,
  ];
  if (input.replyable) {
    paragraphs.push(`Just hit reply: it goes straight to ${userName}.`);
  }
  paragraphs.push('— Ante');

  return {
    subject: oneLine(subject),
    text: [...paragraphs, footerText(userName, input.optOutUrl)].join('\n\n'),
    html: layout(paragraphs.map(paragraph).join(''), footerHtml(userName, input.optOutUrl)),
  };
}

/** "on Tuesday", or "the week starting Sep 21" for a weekly habit that came up short. */
function missedLabel(period: string | undefined, unit: 'day' | 'week'): string {
  if (period === undefined) return unit === 'day' ? 'a day' : 'a week';
  if (unit === 'week') {
    const [, month, day] = period.split('-').map(Number);
    const monthName = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    return `their target for the week starting ${monthName} ${day}`;
  }
  return `on ${WEEKDAYS[dayOfWeek(period)]}`;
}

function footerText(userName: string, optOutUrl: string): string {
  return `You’re getting this because ${userName} added your email on Ante. Don’t want to hear about ${userName}’s commitments? Opt out: ${optOutUrl}`;
}

function footerHtml(userName: string, optOutUrl: string): string {
  const name = escapeHtml(userName);
  return `You’re getting this because ${name} added your email on Ante. Don’t want to hear about ${name}’s commitments? <a href="${escapeHtml(optOutUrl)}" style="color:#6B6B76;">Opt out</a>.`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#111113;">${escapeHtml(text)}</p>`;
}

function card(title: string, cadence: string): string {
  return `<div style="margin:0 0 16px;padding:16px 20px;border-radius:16px;background:#F0F0F3;">
<div style="font-size:18px;line-height:24px;font-weight:600;color:#111113;">${escapeHtml(title)}</div>
<div style="margin-top:4px;font-size:14px;line-height:20px;color:#4121FF;">${escapeHtml(cadence)}</div>
</div>`;
}

function layout(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="font-size:20px;font-weight:700;color:#4121FF;margin:0 0 24px;">Ante</div>
${body}
<p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#6B6B76;">${footer}</p>
</div></body></html>`;
}
