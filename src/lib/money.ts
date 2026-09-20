/** `$5` for whole dollars, `$4.50` otherwise. Stakes are stored in cents. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;

  return `$${cents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}
