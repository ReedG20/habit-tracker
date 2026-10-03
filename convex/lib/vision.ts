import { generateText, Output } from 'ai';
import { z } from 'zod';

import { photoModel, verificationModel } from './openrouter';

/**
 * The one vision call both photo checks share: habits send a single photo,
 * goals send several. Each caller owns its system prompt. Location check-ins
 * judge text instead (`judgeText`).
 */

export const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Long enough for a slow model response, short enough that a stuck card is a nuisance rather than a lockout. */
export const EXPIRE_AFTER_MS = 2 * 60 * 1000;

export const FAILED_REASON = "Couldn't verify the photo. Try again.";
export const TIMED_OUT_REASON = 'Verification timed out. Try again.';

export const verdictSchema = z.object({
  verdict: z.enum(['approve', 'reject']),
  reason: z.string(),
});

export type Verdict = z.infer<typeof verdictSchema>;

/**
 * What the photo model fills in, in this order: it describes the photo and
 * answers the two questions that decide it before it gives a verdict, so the
 * verdict follows from what it saw rather than the reason being written to
 * fit a verdict already given.
 */
export const photoVerdictSchema = z.object({
  /** One plain sentence on what is literally in the frame. */
  seen: z.string(),
  /** Whether what is in the frame has anything to do with the commitment. */
  relatesToCommitment: z.boolean(),
  /** A screen or print showing a picture of the thing, in place of the thing itself. */
  pictureOfAPicture: z.boolean(),
  verdict: z.enum(['approve', 'reject']),
  reason: z.string(),
});

export type PhotoVerdict = z.infer<typeof photoVerdictSchema>;

export const UNRELATED_REASON =
  "That photo doesn't show this. Take one with the real thing in the frame.";
export const PICTURE_OF_A_PICTURE_REASON =
  "That's a picture on a screen or a print. Take a photo of the real thing.";

/**
 * The model's answers, held to its own findings: it can't approve a photo it
 * said is unrelated or a picture of a picture, however its verdict came out.
 */
export function settlePhotoVerdict(output: PhotoVerdict): Verdict {
  if (output.pictureOfAPicture) {
    return {
      verdict: 'reject',
      reason: output.verdict === 'reject' ? output.reason : PICTURE_OF_A_PICTURE_REASON,
    };
  }
  if (!output.relatesToCommitment) {
    return {
      verdict: 'reject',
      reason: output.verdict === 'reject' ? output.reason : UNRELATED_REASON,
    };
  }
  return { verdict: output.verdict, reason: output.reason };
}

export async function judgePhotos(args: {
  systemPrompt: string;
  imageUrls: string[];
  text: string;
}): Promise<Verdict> {
  return settlePhotoVerdict(await askPhotoModel(args));
}

/** The model's raw answers, before `settlePhotoVerdict`. Exported for `scripts/eval-photo-proof.ts`. */
export async function askPhotoModel(args: {
  systemPrompt: string;
  imageUrls: string[];
  text: string;
}): Promise<PhotoVerdict> {
  const { output } = await generateText({
    model: photoModel(),
    temperature: 0,
    maxOutputTokens: 2000,
    output: Output.object({ schema: photoVerdictSchema }),
    instructions: args.systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          ...args.imageUrls.map((url) => ({ type: 'image' as const, image: url })),
          { type: 'text' as const, text: args.text },
        ],
      },
    ],
  });

  return output;
}

/**
 * A verdict on text alone, for proof that isn't a photo. `schema` extends the
 * shared verdict with whatever else the caller needs back.
 */
export async function judgeText<T extends Verdict>(args: {
  systemPrompt: string;
  text: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { output } = await generateText({
    model: verificationModel(),
    maxOutputTokens: 300,
    output: Output.object({ schema: args.schema }),
    instructions: args.systemPrompt,
    messages: [{ role: 'user', content: args.text }],
  });

  return output;
}
