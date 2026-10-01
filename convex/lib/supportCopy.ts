import type { ContestReason } from './chargeReviewSchema';
import { escapeHtml, type EmailContent } from './emailCopy';
import { formatMoney } from './reminderCopy';

/**
 * The email support gets about a money charge: a user contesting it in the
 * app, a chargeback, or Stripe's early fraud warning. It carries everything
 * needed to decide without opening five dashboards: what was signed, how the
 * run ended, the proof and its verdicts, and a link to the payment. Pure, so
 * the words can be tested.
 */

export type SupportCaseKind = 'contest' | 'dispute' | 'fraud_warning';

export type SupportProof = {
  /** "2026-09-30" for a habit's day, or when a goal's proof was sent. */
  when: string;
  method: string;
  status: string;
  reason?: string;
  photoUrls: string[];
};

export type SupportCaseInput = {
  kind: SupportCaseKind;
  userName: string;
  userEmail: string;
  userId: string;
  stakeId: string;
  title: string;
  subject: 'habit' | 'goal';
  amountCents: number;
  card: string;
  status: string;
  /** "Sep 30, 2026, 12:05 AM CDT", in the user's zone. */
  lostLabel?: string;
  /** A habit's run: "23 days in a row, missed 2026-09-30". */
  runLabel?: string;
  contractTerms?: string;
  signedLabel?: string;
  proofs: SupportProof[];
  paymentUrl?: string;
  reason?: ContestReason;
  note?: string;
};

export const CONTEST_REASON_LABELS: Record<ContestReason, string> = {
  proof_should_count: 'My proof should have counted',
  did_it_not_recorded: 'I did it, but it wasn’t recorded',
  app_problem: 'A reminder or the app let me down',
  dont_recognize: 'I don’t recognize this charge',
  other: 'Something else',
};

const HEADLINES: Record<SupportCaseKind, string> = {
  contest: 'Charge contested in the app',
  dispute: 'Chargeback opened',
  fraud_warning: 'Early fraud warning, refunded automatically',
};

const NEXT_STEPS: Record<SupportCaseKind, string> = {
  contest:
    'Refund it in Stripe if we got it wrong (the app updates on its own), or reply to the user. To close it without a refund, run chargeReviews:decline with a short response.',
  dispute:
    'Answer it in Stripe with the contract, the run and the proof below. Money stakes are now off for this user; clear users.moneyBlocked to turn them back on.',
  fraud_warning:
    'The charge was refunded so it can’t become a chargeback. Money stakes are now off for this user; clear users.moneyBlocked to turn them back on.',
};

export function supportCaseEmail(input: SupportCaseInput): EmailContent {
  const amount = formatMoney(input.amountCents);
  const subject = oneLine(
    `${HEADLINES[input.kind]}: ${amount}, ${input.userName}, “${input.title}”`,
  );

  const facts: [string, string][] = [
    ['User', `${input.userName} <${input.userEmail || 'no email'}>`],
    ['User id', input.userId],
    ['Stake id', input.stakeId],
    [input.subject === 'habit' ? 'Habit' : 'Goal', input.title],
    ['Amount', `${amount} on ${input.card}`],
    ['Status', input.status],
  ];
  if (input.lostLabel !== undefined) facts.push(['Missed', input.lostLabel]);
  if (input.runLabel !== undefined) facts.push(['Run', input.runLabel]);
  if (input.paymentUrl !== undefined) facts.push(['Payment', input.paymentUrl]);

  const said: [string, string][] = [];
  if (input.reason !== undefined) said.push(['Reason', CONTEST_REASON_LABELS[input.reason]]);
  if (input.note !== undefined && input.note.length > 0) said.push(['Note', input.note]);

  const contract =
    input.contractTerms === undefined
      ? 'No signed contract on file.'
      : `“${input.contractTerms}”${input.signedLabel === undefined ? '' : ` (signed ${input.signedLabel})`}`;

  const proofLines =
    input.proofs.length === 0
      ? ['No proof on file.']
      : input.proofs.map((proof) =>
          [
            `${proof.when} · ${proof.method} · ${proof.status}`,
            proof.reason === undefined ? '' : ` · “${proof.reason}”`,
            ...proof.photoUrls.map((url) => `\n  ${url}`),
          ].join(''),
        );

  const text = [
    HEADLINES[input.kind],
    facts.map(([label, value]) => `${label}: ${value}`).join('\n'),
    said.length === 0 ? null : said.map(([label, value]) => `${label}: ${value}`).join('\n'),
    `Contract: ${contract}`,
    `Proof, newest first:\n${proofLines.join('\n')}`,
    NEXT_STEPS[input.kind],
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#111113;">
<h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(HEADLINES[input.kind])}</h2>
${table(facts)}
${said.length === 0 ? '' : table(said)}
<p style="margin:16px 0 8px;font-weight:600;">Contract</p>
<p style="margin:0;">${escapeHtml(contract)}</p>
<p style="margin:16px 0 8px;font-weight:600;">Proof, newest first</p>
${
  input.proofs.length === 0
    ? '<p style="margin:0;">No proof on file.</p>'
    : input.proofs.map(proofHtml).join('')
}
<p style="margin:24px 0 0;color:#6B6B76;">${escapeHtml(NEXT_STEPS[input.kind])}</p>
</body></html>`;

  return { subject, text, html };
}

/** "Visa ••4242", or "your card" when Stripe didn't say. Same as the app's `cardLabel`. */
export function cardOnFile(card: { cardBrand?: string; cardLast4?: string }): string {
  if (card.cardLast4 === undefined) return 'your card';
  const brand =
    card.cardBrand === undefined || card.cardBrand === 'unknown'
      ? 'Card'
      : card.cardBrand === 'amex'
        ? 'Amex'
        : card.cardBrand.charAt(0).toUpperCase() + card.cardBrand.slice(1);
  return `${brand} ••${card.cardLast4}`;
}

function table(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 16px 2px 0;color:#6B6B76;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:2px 0;">${linkify(value)}</td></tr>`,
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:0 0 12px;">${cells}</table>`;
}

function proofHtml(proof: SupportProof): string {
  const verdict = proof.reason === undefined ? '' : ` · “${escapeHtml(proof.reason)}”`;
  const photos = proof.photoUrls
    .map(
      (url) =>
        `<a href="${escapeHtml(url)}"><img src="${escapeHtml(url)}" width="120" style="margin:4px 4px 0 0;border-radius:8px;" alt="Proof photo"></a>`,
    )
    .join('');
  return `<div style="margin:0 0 12px;">${escapeHtml(`${proof.when} · ${proof.method} · ${proof.status}`)}${verdict}<div>${photos}</div></div>`;
}

function linkify(value: string): string {
  return value.startsWith('https://')
    ? `<a href="${escapeHtml(value)}">${escapeHtml(value)}</a>`
    : escapeHtml(value);
}

/** Subjects are plain text, but a newline in one would break the header. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
