import { describe, it, expect } from 'vitest';
import { formatPrice } from './price';

describe('formatPrice', () => {
  it('formats zero as a currency string', () => {
    expect(formatPrice(0, 'GBP', 'en-GB')).toBe('£0.00');
  });
  it('converts minor units to major', () => {
    expect(formatPrice(1500, 'USD', 'en-US')).toBe('$15.00');
  });
  it('handles non-round amounts', () => {
    expect(formatPrice(999, 'EUR', 'en-IE')).toBe('€9.99');
  });
});
