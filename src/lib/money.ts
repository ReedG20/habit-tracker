/** `$5` for whole dollars, `$4.50` otherwise. Stakes are stored in cents. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;

  return `$${cents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/** "Visa ••4242", or "your card" when Stripe didn't say. */
export function cardLabel(card: { cardBrand?: string; cardLast4?: string }): string {
  if (card.cardLast4 === undefined) return 'your card';
  const brand =
    card.cardBrand === undefined || card.cardBrand === 'unknown'
      ? 'Card'
      : card.cardBrand === 'amex'
        ? 'Amex'
        : card.cardBrand.charAt(0).toUpperCase() + card.cardBrand.slice(1);
  return `${brand} ••${card.cardLast4}`;
}
