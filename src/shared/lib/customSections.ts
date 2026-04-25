import { calculateBasePrice } from './pricing';
import { ACCESSORIES } from './accessories';

export type LouverOrientation = 'depth' | 'width';

export interface PergolaSection {
  id: string;
  width: number;
  depth: number;
  /** 'depth' = louvers run parallel to the depth axis (default).
   *  'width' = louvers rotated 90°, running parallel to the width axis. */
  louverOrientation: LouverOrientation;
}

export interface CustomConfig {
  isCustom: true;
  sections: PergolaSection[];
  height: number;
  frameColor: string;       // color name, e.g. 'Midnight Onyx'
  frameColorHex: string;    // hex, e.g. '#0A0A0A'
  louverColor: string;
  louverColorHex: string;
  /** Accessory IDs (flat-priced only in Phase 1). */
  accessoryIds: string[];
  /** Per-accessory quantities, keyed by id. Default 1. */
  accessoryQuantities?: Record<string, number>;
}

let __seq = 0;
export function newSectionId(): string {
  __seq = (__seq + 1) % 1_000_000;
  return `s_${Date.now().toString(36)}_${__seq.toString(36)}`;
}

export function emptySection(): PergolaSection {
  return {
    id: newSectionId(),
    width: 12,
    depth: 16,
    louverOrientation: 'depth',
  };
}

// ─── Layout ────────────────────────────────────────────────────────────────
// Phase 1: sections lay out left-to-right along the X axis sharing the back
// wall (Z = 0). Each section's local origin is its back-left corner.

export interface PlacedSection {
  section: PergolaSection;
  /** X offset (feet) of the section's left edge in the combined coordinate space. */
  offsetX: number;
}

export function layoutSections(sections: PergolaSection[]): {
  placed: PlacedSection[];
  totalWidth: number;
  maxDepth: number;
} {
  let runningX = 0;
  let maxDepth = 0;
  const placed: PlacedSection[] = [];
  for (const s of sections) {
    placed.push({ section: s, offsetX: runningX });
    runningX += s.width;
    if (s.depth > maxDepth) maxDepth = s.depth;
  }
  return { placed, totalWidth: runningX, maxDepth };
}

// ─── Pricing ───────────────────────────────────────────────────────────────

export interface CustomPricingBreakdown {
  /** Sum of each section's base price using the standard formula. */
  basePrice: number;
  /** Accessories total (flat-priced items only in Phase 1). */
  accessories: number;
  itemizedAccessories: { id: string; name: string; quantity: number; cost: number }[];
  perSection: { id: string; price: number | null }[];
  subtotal: number;
  hst: number;
  total: number;
}

export function priceCustomConfig(cfg: CustomConfig): CustomPricingBreakdown {
  const perSection = cfg.sections.map((s) => ({
    id: s.id,
    price: calculateBasePrice(s.depth, s.width),
  }));
  const basePrice = perSection.reduce((sum, p) => sum + (p.price || 0), 0);

  const itemized: { id: string; name: string; quantity: number; cost: number }[] = [];
  let accessories = 0;
  for (const id of cfg.accessoryIds) {
    const acc = ACCESSORIES.find((a) => a.id === id);
    if (!acc) continue;
    const qty = cfg.accessoryQuantities?.[id] || 1;
    // Phase 1: only handle flat-priced accessories. Edge-bound items
    // (screens / walls) are skipped because their geometry on a multi-
    // section pergola is non-trivial. Admin can add them via Pricing tab.
    if (acc.type === 'flat') {
      const cost = acc.price * qty;
      accessories += cost;
      itemized.push({ id, name: acc.name, quantity: qty, cost });
    }
  }

  const subtotal = basePrice + accessories;
  const hst = subtotal * 0.13;
  const total = subtotal + hst;

  return { basePrice, accessories, itemizedAccessories: itemized, perSection, subtotal, hst, total };
}

/** Compact label for a section, used in dropdowns and headers. */
export function sectionLabel(s: PergolaSection, idx: number): string {
  return `Section ${idx + 1} · ${s.width}'×${s.depth}'`;
}

/** Currency formatter — same style as the rest of the app. */
export function formatCAD(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}
