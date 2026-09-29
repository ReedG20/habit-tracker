/**
 * Which habits have their prove screen open right now. That screen shows the
 * verdict itself, so the toasts and a tapped "timer stopped" notification
 * leave those habits alone rather than saying it twice.
 */
const open = new Map<string, number>();

/** Marks the habit's prove screen open; call the returned function on close. */
export function watchProof(habitId: string): () => void {
  open.set(habitId, (open.get(habitId) ?? 0) + 1);
  return () => {
    const count = (open.get(habitId) ?? 1) - 1;
    if (count <= 0) open.delete(habitId);
    else open.set(habitId, count);
  };
}

export function isProofOpen(habitId: string): boolean {
  return open.has(habitId);
}
