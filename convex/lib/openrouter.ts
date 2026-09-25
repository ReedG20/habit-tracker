import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../_generated/server';

/**
 * The one model every check shares: photo proof and the wording check before
 * a commitment is signed. Cheap and fast, since both sit in front of the user.
 */
const VERIFICATION_MODEL = 'google/gemini-2.5-flash-lite';

export function verificationModel() {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter(VERIFICATION_MODEL);
}
