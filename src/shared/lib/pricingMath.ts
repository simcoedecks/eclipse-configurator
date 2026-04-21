/**
 * Merges configurator-generated pricing with admin-added custom line items
 * and additional pergolas and produces a single source of truth for
 * subtotal / HST / total. Used by both the admin pricing editor, the
 * public proposal page, and the downloadable PDF.
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

export interface AdditionalPergolaItem {
  id: string;
  label: string;
  width?: number;
  depth?: number;
  height?: number;
  frameColor?: string;
  louverColor?: string;
  notes?: string;
  /** Line items for this extra pergola (the pergola itself + accessories) */
  lineItems?: Array<{ id: string; name: string; cost: number; quantity?: number }>;
  /** Pre-computed total for this pergola (excluding HST) — preferred if set */
  price?: number;
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
  additionalPergolasTotal: number;
  subtotal: number;
  hst: number;
  total: number;
  hstRate: number;
}

const HST_RATE = 0.13;

export function computeAdditionalPergolaPrice(p: AdditionalPergolaItem): number {
  if (typeof p.price === 'number') return p.price;
  if (Array.isArray(p.lineItems)) {
    return p.lineItems.reduce((s, i) => s + (i.cost || 0) * (i.quantity || 1), 0);
  }
  return 0;
}

export function computeFinalPricing(
  pb: PricingBreakdown | null | undefined,
  customLineItems: CustomLineItem[] = [],
  additionalPergolas: AdditionalPergolaItem[] = []
): FinalPricing {
  const basePrice = pb?.basePrice || 0;
  const accessoriesTotal = (pb?.itemizedAccessories || []).reduce((s, a) => s + (a.cost || 0), 0);
  const customTotal = (customLineItems || []).reduce((s, item) => {
    const qty = item.quantity || 1;
    const unit = item.amount;
    const signed = item.kind === 'discount' ? -Math.abs(unit) : unit;
    return s + signed * qty;
  }, 0);
  const additionalPergolasTotal = (additionalPergolas || []).reduce((s, p) => s + computeAdditionalPergolaPrice(p), 0);
  const subtotal = basePrice + accessoriesTotal + customTotal + additionalPergolasTotal;
  const hst = subtotal * HST_RATE;
  const total = subtotal + hst;
  return { basePrice, accessoriesTotal, customTotal, additionalPergolasTotal, subtotal, hst, total, hstRate: HST_RATE };
}

export function formatCurrencyUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
