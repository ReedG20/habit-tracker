import { describe, expect, test } from 'vitest';

import { graceEmail, gracePushCopy, graceStory, ONCE_TITLE } from './graceCopy';

const now = Date.UTC(2026, 8, 23, 4); // Wed, Sep 23, 4am UTC
const timeZone = 'UTC';

describe('graceStory', () => {
  test('a waived habit names what it would have cost, and that it happens once', () => {
    const story = graceStory({
      kind: 'waived',
      titles: ['Morning run'],
      stakes: [{ kind: 'money', cents: 2000 }],
      missedPeriod: '2026-09-22',
      now,
      timeZone,
    });
    expect(story).toEqual({
      kicker: 'Missed · Tuesday',
      headline: 'This one’s on us.',
      line: 'You missed Morning run. That would have cost you $20.',
      emphasis: ['Morning run', '$20'],
      once: {
        title: 'We only do this once.',
        body: 'Don’t count on it again. Your $20 is still on the line, and the next miss is charged.',
      },
    });
  });

  test('several habits add up, and a weekly one names its week', () => {
    const story = graceStory({
      kind: 'waived',
      titles: ['Run', 'Read', 'Stretch'],
      stakes: [
        { kind: 'money', cents: 2000 },
        { kind: 'money', cents: 500 },
        { kind: 'friend', name: 'Sam' },
      ],
      missedPeriod: '2026-09-14',
      weekly: true,
      now,
      timeZone,
    });
    expect(story.kicker).toBe('Missed · Week of Sep 14');
    expect(story.line).toBe('You missed Run, Read and Stretch. That would have cost you $25.');
  });

  test('a friend or a lockout says what it would have done instead', () => {
    expect(
      graceStory({
        kind: 'waived',
        titles: ['Read'],
        stakes: [{ kind: 'friend', name: 'Sam' }],
        now,
        timeZone,
      }),
    ).toMatchObject({
      line: 'You missed Read. That’s when Sam would have heard about it.',
      once: {
        body: 'Don’t count on it again. Sam is still on the line, and hears about the next miss.',
      },
    });
    expect(
      graceStory({
        kind: 'waived',
        titles: ['Read'],
        stakes: [{ kind: 'lockout', days: 1 }],
        now,
        timeZone,
      }),
    ).toMatchObject({ line: 'You missed Read. That would have frozen your habits for 1 day.' });
  });

  test('an extended goal says the new deadline and what the next miss costs', () => {
    const story = graceStory({
      kind: 'extended',
      titles: ['Finish the draft'],
      stakes: [{ kind: 'money', cents: 5000 }],
      originalDueAt: Date.UTC(2026, 8, 22, 21),
      extendedTo: Date.UTC(2026, 8, 24, 21),
      now: Date.UTC(2026, 8, 22, 21, 1),
      timeZone,
    });
    expect(story).toEqual({
      kicker: 'Deadline passed · 9pm',
      headline: 'You’ve got until Thu 9pm.',
      line: 'Finish the draft wasn’t proven in time, so we moved your deadline.',
      emphasis: ['Finish the draft'],
      once: {
        title: 'We only do this once.',
        body: 'Don’t count on it again. Miss this deadline and the $50 goes.',
      },
    });
  });
});

describe('gracePushCopy', () => {
  test('says it’s one-time and what the next miss does', () => {
    expect(
      gracePushCopy({
        kind: 'waived',
        titles: ['Morning run'],
        stakes: [{ kind: 'money', cents: 2000 }],
      }),
    ).toEqual({
      title: 'You missed Morning run',
      body: 'We let it go, and only this once. Next miss, your $20 is charged.',
    });
    expect(
      gracePushCopy({
        kind: 'waived',
        titles: ['Run', 'Read'],
        stakes: [
          { kind: 'lockout', days: 3 },
          { kind: 'friend', name: 'Sam' },
        ],
      }),
    ).toEqual({
      title: 'You missed 2 habits',
      body: 'We let it go, and only this once. Next miss, your habits freeze.',
    });
    expect(
      gracePushCopy({
        kind: 'extended',
        titles: ['Finish the draft'],
        stakes: [{ kind: 'friend', name: 'Sam' }],
        extendedTo: Date.UTC(2026, 8, 24, 21),
        now: Date.UTC(2026, 8, 22, 21),
        timeZone,
      }),
    ).toEqual({
      title: 'Deadline passed: Finish the draft',
      body: 'We moved it to Thu 9pm. That’s a one-time thing. Send proof by then or Sam hears about it.',
    });
  });
});

describe('graceEmail', () => {
  test('repeats the one-time warning word for word, and escapes what the user typed', () => {
    const email = graceEmail({
      userName: 'Alex',
      kind: 'waived',
      titles: ['<Run>'],
      stakes: [{ kind: 'money', cents: 2000 }],
      missedPeriod: '2026-09-22',
      now,
      timeZone,
    });
    expect(email.subject).toBe('You missed <Run>');
    expect(email.text).toContain(ONCE_TITLE);
    expect(email.text).toContain(
      'Don’t count on it again. Your $20 is still on the line, and the next miss is charged.',
    );
    expect(email.html).toContain('&lt;Run&gt;');
    expect(email.html).not.toContain('<Run>');
  });
});
