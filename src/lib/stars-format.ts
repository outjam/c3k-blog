export const formatStarsFromCents = (starsCents: number): string => {
  const normalized = Number.isFinite(starsCents) ? Math.max(0, starsCents) : 0;
  return (normalized / 100).toFixed(2);
};

export const starsCentsToInvoiceStars = (starsCents: number): number => {
  const normalized = Math.max(0, Math.round(starsCents));
  return Math.max(1, Math.ceil(normalized / 100));
};
