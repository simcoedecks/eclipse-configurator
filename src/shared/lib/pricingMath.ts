/**
 * Merges configurator-generated pricing with admin-added custom line items
 * and produces a single source of truth for subtotal / HST / total.
 * Used by both the admin pricing editor and the public proposal page.
 */

export interface CustomLineItem {
  id: string;
  name: string;
  description?: string;
  /** Positive = charge, negative = discount/credit */
  amount: number;
  quantity?: number;
  /** "add" (default) adds to subtotal. "discount" subtracts. */
  kind?: 'add' | 'discount';
}

export interface PricingBreakdown {
  basePrice?: number;
  subtotal?: number;
  hst?: number;
  total?: number;
  itemizedAccessories?: Array<{ id?: string; name: string; cost: number; quantity?: number }>;
}

export interface FinalPricing {
  basePrice: number;
  accessoriesTotal: number;
  customTotal: number;
  subtotal: number;
  hst: number;
  total: number;
  hstRate: number;
}

const HST_RATE = 0.13;

export function computeFinalPricing(
  pb: PricingBreakdown | null | undefined,
  customLineItems: CustomLineItem[] = []
): FinalPricing {
  const basePrice = pb?.basePrice || 0;
  const accessoriesTotal = (pb?.itemizedAccessories || []).reduce((s, a) => s + (a.cost || 0), 0);
  const customTotal = (customLineItems || []).reduce((s, item) => {
    const qty = item.quantity || 1;
    const unit = item.amount;
    const signed = item.kind === 'discount' ? -Math.abs(unit) : unit;
    return s + signed * qty;
  }, 0);
  const subtotal = basePrice + accessoriesTotal + customTotal;
  const hst = subtotal * HST_RATE;
  const total = subtotal + hst;
  return { basePrice, accessoriesTotal, customTotal, subtotal, hst, total, hstRate: HST_RATE };
}

export function formatCurrencyUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
