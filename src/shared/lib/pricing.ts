export const SCREEN_PRICES: Record<number, Record<number, number>> = {
  8: { 7: 3969.70, 8: 4124.85, 9: 4333.50, 10: 4579.60, 11: 4777.55, 12: 4884.55, 13: 5103.90, 14: 5312.55, 15: 5408.85, 16: 5617.50, 17: 5788.70, 18: 5938.50, 19: 6125.75, 20: 6313.00 },
  9: { 7: 4039.25, 8: 4183.70, 9: 4397.70, 10: 4643.80, 11: 4847.10, 12: 4948.75, 13: 5162.75, 14: 5371.40, 15: 5478.40, 16: 5692.40, 17: 5842.20, 18: 6034.80, 19: 6222.05, 20: 6409.30 },
  10: { 7: 4108.80, 8: 4263.95, 9: 4467.25, 10: 4708.00, 11: 4916.65, 12: 5029.00, 13: 5232.30, 14: 5446.30, 15: 5604.45, 16: 5756.60, 17: 5917.10, 18: 6077.60, 19: 6264.85, 20: 6452.10 },
  11: { 7: 4162.30, 8: 4328.15, 9: 4531.45, 10: 4772.20, 11: 4986.20, 12: 5087.85, 13: 5301.85, 14: 5515.85, 15: 5654.95, 16: 5820.08, 17: 5986.65, 18: 6141.80, 19: 6329.05, 20: 6516.30 }
};

export function getMarkup(area: number): number {
  if (area <= 99) return 1.15;
  if (area <= 119) return 1.10;
  return 1.05;
}

export function calculateLouverCount(width: number, depth: number): number {
  const postSize = 7.25 / 12;
  const maxLouverSpan = 13;
  const maxDepthSpan = 20;
  const numBaysX = Math.ceil(width / maxLouverSpan);
  const numBaysZ = Math.ceil(depth / maxDepthSpan);

  const louverBayWidthZ = ((depth - postSize) / numBaysZ) - postSize;
  const targetSpacing = 7.75 / 12;
  const louverMargin = 0.1;
  const louverArea = louverBayWidthZ - (louverMargin * 2 + (8.5 / 12));
  const louverCountPerBay = Math.max(2, Math.round(louverArea / targetSpacing) + 1);

  return numBaysX * numBaysZ * louverCountPerBay;
}

export function calculateScreenPrice(length: number, height: number, numBays: number): number {
  const base = Math.floor(length / numBays);
  const remainder = length % numBays;

  let total = 0;
  for (let i = 0; i < numBays; i++) {
    const screenLength = base + (i < remainder ? 1 : 0);
    total += SCREEN_PRICES[height]?.[screenLength] || 0;
  }

  return total * 1.05; // 5% markup for screens
}

export function getScreenDescription(length: number, numBays: number) {
  if (numBays === 1) return `Includes 1 screen (${length}')`;

  const base = Math.floor(length / numBays);
  const remainder = length % numBays;

  if (remainder === 0) {
    return `Includes ${numBays} screens (${base}' each)`;
  } else {
    return `Includes ${numBays} screens (${remainder} at ${base + 1}', ${numBays - remainder} at ${base}')`;
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Standalone base-price calculator — replicates the same logic used in the
 * retail configurator so the admin can auto-calculate the price for an
 * additional pergola added to an existing project. Returns null for
 * out-of-range dimensions.
 */
export function calculateBasePrice(depth: number, width: number): number | null {
  // Note: the configurator swaps width/depth internally; match that here
  const d = width;
  const w = depth;
  if (d < 7 || d > 100 || w < 8 || w > 40) return null;

  const area = d * w;
  const sections = Math.ceil(d / 13) * Math.ceil(w / 20);

  let price = 0;
  if (sections > 1) {
    price = 140 * area + 2000 * sections;
  } else if (area <= 99) {
    price = 165 * area + 2000;
  } else if (area <= 120) {
    price = 150 * area + 2000;
  } else {
    price = 130 * area + 2000;
  }
  return price * getMarkup(area);
}
