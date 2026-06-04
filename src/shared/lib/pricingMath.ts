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
  /** When true, the line item is shown as "TBD" in the proposal and
   *  excluded from subtotal math. Admin uses this to flag items whose
   *  price will be finalized after a site visit. */
  tbd?: boolean;
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

/**
 * Global pre-tax margin markup, applied silently at quote-creation time to the
 * three core products only: the pergola (baked into calculateBasePrice — two
 * copies, Home.tsx for the configurator and pricing.ts for the admin), the
 * motorized screens (calculateScreenPrice), and the privacy walls
 * (wallSqftPrice). It is deliberately NOT applied to bolt-on accessories
 * (heater, fan, lighting, sensors) or woodgrain finishes, and NOT multiplied
 * into the subtotal here — doing so would double-mark and break the invariant
 * that the subtotal equals the sum of the line items the customer sees. Every
 * pricing site imports this one constant, so changing the rate updates them all.
 */
export const GLOBAL_MARKUP = 1.05;

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
    // TBD items don't contribute a number to the subtotal — they're
    // listed informationally on the proposal and priced after site
    // visit. Skip them here.
    if (item.tbd) return s;
    const qty = item.quantity || 1;
    const unit = item.amount;
    const signed = item.kind === 'discount' ? -Math.abs(unit) : unit;
    return s + signed * qty;
  }, 0);
  const additionalPergolasTotal = (additionalPergolas || []).reduce((s, p) => s + computeAdditionalPergolaPrice(p), 0);
  const rawSubtotal = basePrice + accessoriesTotal + customTotal + additionalPergolasTotal;
  // The 5% GLOBAL_MARKUP is already baked into basePrice at quote-creation time
  // (see calculateBasePrice), so the stored basePrice includes it. Do NOT
  // re-apply it here or the base would be double-marked and the subtotal would
  // no longer equal the sum of the line items shown on the proposal.
  const subtotal = rawSubtotal;
  const hst = subtotal * HST_RATE;
  const total = subtotal + hst;
  return { basePrice, accessoriesTotal, customTotal, additionalPergolasTotal, subtotal, hst, total, hstRate: HST_RATE };
}

export function formatCurrencyUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
