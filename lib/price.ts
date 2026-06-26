// Shared pricing types + display formatting (web).
export type PricingType = 'free' | 'one_time' | 'subscription';
export type BillingInterval = 'month' | 'year';

/** Format minor currency units (pence/cents) as a localized currency string. */
export function formatPrice(amountMinor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
