import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { env } from '../_generated/server';

/**
 * The one vision call both proof checks share: habits send a single photo,
 * goals send several. Each caller owns its system prompt.
 */

const VERIFICATION_MODEL = 'google/gemini-2.5-flash-lite';

export const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Long enough for a slow model response, short enough that a stuck card is a nuisance rather than a lockout. */
export const EXPIRE_AFTER_MS = 2 * 60 * 1000;

export const FAILED_REASON = "Couldn't verify the photo. Try again.";
export const TIMED_OUT_REASON = 'Verification timed out. Try again.';

const verdictSchema = z.object({
  verdict: z.enum(['approve', 'reject']),
  reason: z.string(),
});

export type Verdict = z.infer<typeof verdictSchema>;

export async function judgePhotos(args: {
  systemPrompt: string;
  imageUrls: string[];
  text: string;
}): Promise<Verdict> {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  const { output } = await generateText({
    model: openrouter(VERIFICATION_MODEL),
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
