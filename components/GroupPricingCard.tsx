'use client';

import { useState } from 'react';
import { setGroupPricing } from '@/app/champion/[groupId]/group-pricing-actions';
import { formatPrice, type PricingType, type BillingInterval } from '@/lib/price';

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'];

export interface GroupPricingCardProps {
  groupId: string;
  initialType: PricingType;
  initialAmount: number;        // minor units
  initialCurrency: string;
  initialInterval: BillingInterval | null;
  /** Optional revenue read-out (motions): payment count + collected minor units. */
  payments?: { count: number; collected: number };
}

export function GroupPricingCard(props: GroupPricingCardProps) {
  const [type, setType] = useState<PricingType>(props.initialType);
  const [major, setMajor] = useState((props.initialAmount / 100).toString());
  const [currency, setCurrency] = useState(props.initialCurrency || 'GBP');
  const [interval, setInterval] = useState<BillingInterval>(props.initialInterval ?? 'month');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onSave() {
    setSaving(true); setStatus(null);
    try {
      await setGroupPricing({
        groupId: props.groupId,
        pricingType: type,
        priceAmount: type === 'free' ? 0 : Math.round(parseFloat(major || '0') * 100),
        priceCurrency: currency,
        billingInterval: type === 'subscription' ? interval : null,
      });
      setStatus('Pricing saved.');
    } catch (e) {
      setStatus(`Save failed: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <p className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Pricing</p>

      <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden w-fit mb-4">
        {(['free', 'one_time', 'subscription'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`text-xs font-bold px-3 py-1.5 capitalize ${type === t ? 'bg-accent text-accent-ink' : 'text-muted'}`}
          >
            {t === 'one_time' ? 'One-time' : t}
          </button>
        ))}
      </div>

      {type !== 'free' && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="number" min="0" step="0.01" value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="0.00"
            className="w-28 bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
          <select
            value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="bg-surface-low border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {type === 'subscription' && (
            <div className="flex bg-surface-low border border-white/10 rounded-lg overflow-hidden">
              {(['month', 'year'] as const).map((iv) => (
                <button
                  key={iv} onClick={() => setInterval(iv)}
                  className={`text-xs font-bold px-3 py-1.5 ${interval === iv ? 'bg-accent text-accent-ink' : 'text-muted'}`}
                >
                  {iv === 'month' ? 'Monthly' : 'Annually'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onSave} disabled={saving}
        className="bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 rounded-xl disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save pricing'}
      </button>
      {status && <p className="text-xs text-muted mt-3">{status}</p>}

      {props.payments && (
        <p className="text-xs text-faint mt-4 pt-3 border-t border-white/[0.06]">
          Revenue (motions): {props.payments.count} join{props.payments.count !== 1 ? 's' : ''} ·{' '}
          {formatPrice(props.payments.collected, currency)} collected
        </p>
      )}
    </div>
  );
}
