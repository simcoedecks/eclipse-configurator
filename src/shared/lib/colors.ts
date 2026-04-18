export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  ral: string;
  type: 'solid' | 'wood';
  isStandard: boolean;
}

export const COLORS: ColorOption[] = [
  { id: 'ral9005', name: 'Midnight Onyx', hex: '#0A0A0A', ral: 'RAL 9005', type: 'solid', isStandard: true },
  { id: 'ral9016', name: 'Moonstone White', hex: '#F6F6F6', ral: 'RAL 9016', type: 'solid', isStandard: true },
  { id: 'ral9006', name: 'Platinum Mist', hex: '#A5A5A5', ral: 'RAL 9006', type: 'solid', isStandard: false },
  { id: 'ral7016', name: 'Graphite Slate', hex: '#383E42', ral: 'RAL 7016', type: 'solid', isStandard: false },
  { id: 'ral8017', name: 'Espresso Bronze', hex: '#44322D', ral: 'RAL 8017', type: 'solid', isStandard: false },
  { id: 'ral9001', name: 'Champagne Linen', hex: '#F1EBD9', ral: 'RAL 9001', type: 'solid', isStandard: false },
  { id: 'woodgrain', name: 'Walnut Grain', hex: '#8B5A2B', ral: 'Woodgrain', type: 'wood', isStandard: false },
];

export function getColorName(hex: string): string {
  const color = COLORS.find(c => c.hex === hex);
  return color ? `${color.name} (${color.ral})` : hex;
}
