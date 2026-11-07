export function addonQuantity(value: string): number | undefined {
  if (value === '') return 0;
  if (!/^\d+$/.test(value)) return undefined;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= 10 ? quantity : undefined;
}
