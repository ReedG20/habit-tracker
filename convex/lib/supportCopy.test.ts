import { describe, expect, test } from 'vitest';

import { cardOnFile, supportCaseEmail, type SupportCaseInput } from './supportCopy';

const input: SupportCaseInput = {
  kind: 'contest',
  userName: 'Alice',
  userEmail: 'alice@example.com',
  userId: 'u1',
  stakeId: 's1',
  title: 'Run <5k>',
  subject: 'habit',
  amountCents: 2500,
  card: 'Visa ••4242',
  status: 'charged',
  runLabel: '23 days in a row, missed 2026-09-30',
  contractTerms: 'I will run every day. If I miss a day, $25 is charged to my card.',
  proofs: [
    {
      when: '2026-09-30',
      method: 'photo',
      status: 'rejected',
      reason: 'No shoes.',
      photoUrls: ['https://example.convex.cloud/api/storage/abc'],
    },
  ],
  paymentUrl: 'https://dashboard.stripe.com/test/payments/pi_1',
  reason: 'proof_should_count',
  note: 'I was <b>running</b>.',
};

describe('supportCaseEmail', () => {
  test('carries what support needs to decide, with user text escaped', () => {
    const email = supportCaseEmail(input);

    expect(email.subject).toBe('Charge contested in the app: $25, Alice, “Run <5k>”');
    expect(email.text).toContain('Reason: My proof should have counted');
    expect(email.text).toContain('Payment: https://dashboard.stripe.com/test/payments/pi_1');
    expect(email.text).toContain('2026-09-30 · photo · rejected · “No shoes.”');
    expect(email.html).toContain('I was &lt;b&gt;running&lt;/b&gt;.');
    expect(email.html).not.toContain('<b>running</b>');
    expect(email.html).toContain('<img src="https://example.convex.cloud/api/storage/abc"');
  });

  test('says so when there is no contract or proof', () => {
    const email = supportCaseEmail({
      ...input,
      kind: 'dispute',
      contractTerms: undefined,
      proofs: [],
      reason: undefined,
      note: undefined,
    });

    expect(email.subject).toMatch(/^Chargeback opened/);
    expect(email.text).toContain('No signed contract on file.');
    expect(email.text).toContain('No proof on file.');
    expect(email.text).not.toContain('Reason:');
  });
});

describe('cardOnFile', () => {
  test('names the card the way the app does', () => {
    expect(cardOnFile({ cardBrand: 'visa', cardLast4: '4242' })).toBe('Visa ••4242');
    expect(cardOnFile({ cardBrand: 'amex', cardLast4: '0005' })).toBe('Amex ••0005');
    expect(cardOnFile({})).toBe('your card');
  });
});
