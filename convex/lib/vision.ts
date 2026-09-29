import { generateText, Output } from 'ai';
import { z } from 'zod';

import { verificationModel } from './openrouter';

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

export async function judgePhotos(args: {
  systemPrompt: string;
  imageUrls: string[];
  text: string;
}): Promise<Verdict> {
  const { output } = await generateText({
    model: verificationModel(),
    maxOutputTokens: 300,
    output: Output.object({ schema: verdictSchema }),
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
