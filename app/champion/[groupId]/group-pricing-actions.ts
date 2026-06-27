'use server';

import { createClient } from '@/lib/supabase/server';
import type { PricingType, BillingInterval } from '@/lib/price';

export interface SetGroupPricingInput {
  groupId: string;
  pricingType: PricingType;
  priceAmount: number;          // minor units
  priceCurrency: string;        // ISO 4217
  billingInterval: BillingInterval | null;
}

/** Set a group's pricing. Authorization is enforced inside the SQL RPC
 *  (champion of the group OR superuser). */
export async function setGroupPricing(input: SetGroupPricingInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_group_pricing', {
    p_group: input.groupId,
    p_type: input.pricingType,
    p_amount: input.pricingType === 'free' ? 0 : Math.max(0, Math.round(input.priceAmount)),
    p_currency: input.priceCurrency,
    p_interval: input.pricingType === 'subscription' ? input.billingInterval : null,
  });
  if (error) throw new Error(error.message);
}
