/**
 * Limits on what a commitment can say. The wording check enforces the meaning
 * (see `commitmentChecks.ts`); these only stop empty or runaway text, and hold
 * wherever a habit or goal is written.
 */

export const MAX_TITLE_LENGTH = 80;
export const MAX_PROOF_LENGTH = 300;

export function requireCommitmentText(title: string, proof?: string | null): void {
  if (title.trim().length === 0) {
    throw new Error('Give it a name');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Keep the name under ${MAX_TITLE_LENGTH} characters`);
  }
  if (proof !== undefined && proof !== null && proof.length > MAX_PROOF_LENGTH) {
    throw new Error(`Keep the proof under ${MAX_PROOF_LENGTH} characters`);
  }
}
