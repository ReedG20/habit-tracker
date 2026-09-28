import { describe, expect, test } from 'vitest';

import { headsUpEmail, lossEmail, replyToFor } from './emailCopy';

const OPT_OUT = 'https://example.convex.site/email/opt-out?t=abc';

describe('friend emails', () => {
  test('the heads-up says what they signed up for and how to leave', () => {
    const email = headsUpEmail({
      userName: 'Reed',
      friendName: 'Sam',
      title: 'Meditate',
      cadence: 'every day',
      subject: 'habit',
      optOutUrl: OPT_OUT,
    });
    expect(email.subject).toBe('Reed put you on the hook');
    expect(email.text).toContain('If Reed breaks the streak, we’ll email you once');
    expect(email.text).toContain('Meditate (every day)');
    expect(email.html).toContain(OPT_OUT);
  });

  test('a broken streak names the run and the day', () => {
    const email = lossEmail({
      userName: 'Reed',
      friendName: 'Sam',
      title: 'Meditate',
      subject: 'habit',
      streak: 23,
      unit: 'day',
      missedPeriod: '2026-09-22',
      replyable: true,
      optOutUrl: OPT_OUT,
    });
    expect(email.subject).toBe('Reed broke a 23-day streak');
    expect(email.text).toContain('After 23 days in a row, they missed on Tuesday.');
    expect(email.text).toContain('Just hit reply: it goes straight to Reed.');
  });

  test('a short run and a missed goal read honestly, and replies are only offered when they work', () => {
    expect(
      lossEmail({
        userName: 'Reed',
        friendName: 'Sam',
        title: 'Read',
        subject: 'habit',
        streak: 1,
        unit: 'week',
        missedPeriod: '2026-09-21',
        replyable: false,
        optOutUrl: OPT_OUT,
      }),
    ).toMatchObject({
      subject: 'Reed missed “Read”',
      text: expect.not.stringContaining('hit reply'),
    });
    expect(
      lossEmail({
        userName: 'Reed',
        friendName: 'Sam',
        title: 'Ship it',
        subject: 'goal',
        dueLabel: 'Sun 9pm',
        replyable: true,
        optOutUrl: OPT_OUT,
      }).text,
    ).toContain('committed to “Ship it” by Sun 9pm, and didn’t send proof in time.');
  });

  test('everything the user typed is escaped in HTML', () => {
    const email = headsUpEmail({
      userName: 'Reed',
      friendName: '<b>Sam</b>',
      title: '<script>alert(1)</script>',
      cadence: 'every day',
      subject: 'habit',
      optOutUrl: OPT_OUT,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<b>Sam</b>');
  });

  test('replies skip Apple’s private relay', () => {
    expect(replyToFor('reed@example.com')).toBe('reed@example.com');
    expect(replyToFor('abc123@privaterelay.appleid.com')).toBeUndefined();
    expect(replyToFor('')).toBeUndefined();
  });
});
