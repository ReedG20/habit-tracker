import { describe, expect, test } from 'vitest';

import {
  PICTURE_OF_A_PICTURE_REASON,
  type PhotoVerdict,
  settlePhotoVerdict,
  UNRELATED_REASON,
} from './lib/vision';

const approved: PhotoVerdict = {
  seen: 'A squat rack and dumbbells in a gym.',
  relatesToCommitment: true,
  pictureOfAPicture: false,
  verdict: 'approve',
  reason: "You're at the squat rack.",
};

describe('settlePhotoVerdict', () => {
  test('passes a grounded approval through', () => {
    expect(settlePhotoVerdict(approved)).toEqual({
      verdict: 'approve',
      reason: "You're at the squat rack.",
    });
  });

  // The real case: a laptop screen approved as "the gym".
  test('rejects an approval of a photo the model said is unrelated', () => {
    expect(
      settlePhotoVerdict({
        ...approved,
        seen: 'A laptop screen showing a code editor and a chat window.',
        relatesToCommitment: false,
        reason: "You've captured a great shot that clearly shows you at the gym.",
      }),
    ).toEqual({ verdict: 'reject', reason: UNRELATED_REASON });
  });

  test('rejects an approval of a picture on a screen', () => {
    expect(
      settlePhotoVerdict({
        ...approved,
        seen: 'A phone showing a photo of a gym.',
        pictureOfAPicture: true,
      }),
    ).toEqual({ verdict: 'reject', reason: PICTURE_OF_A_PICTURE_REASON });
  });

  test("keeps the model's own wording when it already rejected", () => {
    expect(
      settlePhotoVerdict({
        ...approved,
        relatesToCommitment: false,
        verdict: 'reject',
        reason: 'That looks like a desk, not a gym.',
      }),
    ).toEqual({ verdict: 'reject', reason: 'That looks like a desk, not a gym.' });
  });

  test('a reject stays a reject', () => {
    expect(settlePhotoVerdict({ ...approved, verdict: 'reject', reason: 'No.' })).toEqual({
      verdict: 'reject',
      reason: 'No.',
    });
  });
});
