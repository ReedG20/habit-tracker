import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { env } from '../_generated/server';

/**
 * The text checks: the wording check before a commitment is signed and
 * location check-ins. Cheap and fast, since both sit in front of the user.
 */
const VERIFICATION_MODEL = 'google/gemini-2.5-flash-lite';

export function verificationModel() {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter(VERIFICATION_MODEL);
}

/**
 * Photo proof (`judgePhotos`). Money rides on these verdicts, and a lite model
 * once approved a laptop screen as "the gym", so photos get a full Flash.
 */
const PHOTO_MODEL = 'google/gemini-3.8-flash';

export function photoModel() {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter(PHOTO_MODEL, { reasoning: { effort: 'minimal' } });
}

/**
 * Proof ideas for a commitment's name (`commitmentIdeas.checkName`). It runs
 * in the background while the user types, so it can afford a model that
 * follows the method rules more closely than the one judging proof.
 */
const IDEAS_MODEL = 'google/gemini-3.1-flash-lite';

export function ideasModel() {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter(IDEAS_MODEL, { reasoning: { effort: 'none' } });
}
