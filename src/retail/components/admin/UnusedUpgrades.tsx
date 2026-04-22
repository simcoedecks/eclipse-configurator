import { ACCESSORIES } from '../../../shared/lib/accessories';
import { SCREEN_PRICES, calculateScreenPrice, formatCurrency } from '../../../shared/lib/pricing';

interface Props {
  submission: any;
}

/**
 * Shows accessories/upgrades the customer DIDN'T select — with their
 * calculated prices — so the sales team can surface them as optional
 * upsell opportunities.
 *
 * Computes the list from:
 *   submission.configuration.accessoryIds  (newer submissions)
 *   or falls back to matching submission.configuration.accessories by name
 */
export default function UnusedUpgrades({ submission }: Props) {
  const cfg = submission?.configuration || {};
  const width = Number(cfg.width) || 0;
  const depth = Number(cfg.depth) || 0;
  const height = Number(cfg.height) || 9;

  if (!width || !depth || !height) return null;

  // Figure out what the customer DID pick
  const selectedIds = new Set<string>();
  if (Array.isArray(cfg.accessoryIds)) {
    for (const id of cfg.accessoryIds) selectedIds.add(id);
  } else if (Array.isArray(cfg.accessories)) {
    // Legacy: names were saved but not IDs. Match by name prefix.
    for (const name of cfg.accessories) {
      const acc = ACCESSORIES.find(a => {
        const bareName = String(name).split(' × ')[0];
        return a.name === bareName;
      });
      if (acc) selectedIds.add(acc.id);
    }
  }

  // Calculate each unused accessory's price at this configuration
  const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
  const unused = ACCESSORIES
    .filter(a => !selectedIds.has(a.id))
    .map(a => {
      let price = 0;
      if (a.type === 'flat') price = a.price;
      else if (a.type === 'sqft') price = a.price * (width * depth);
      else if (a.type === 'screen_width') {
        const bays = Math.ceil(width / 13);
        price = calculateScreenPrice(width, height, bays);
      }
      else if (a.type === 'screen_depth') {
        const bays = Math.ceil(depth / 20);
        price = calculateScreenPrice(depth, height, bays);
      }
      else if (a.type === 'wall_width') price = width * height * wallUnitPrice;
      else if (a.type === 'wall_depth') price = depth * height * wallUnitPrice;
      return { id: a.id, name: a.name, description: a.description, price };
    })
    // Hide items we can't meaningfully quote (no matching price table entry)
    .filter(a => a.price > 0);

  if (unused.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-2">
        Customer selected every available add-on — no upsell opportunities here.
      </div>
    );
  }

  // Group roughly by type
  const screens = unused.filter(a => a.id.startsWith('screen_'));
  const walls = unused.filter(a => a.id.startsWith('wall_'));
  const others = unused.filter(a => !a.id.startsWith('screen_') && !a.id.startsWith('wall_'));

  const Group = ({ label, items }: { label: string; items: typeof unused }) => (
    items.length > 0 ? (
      <div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1.5">{label}</p>
        <ul className="space-y-1">
          {items.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-slate-100 last:border-b-0">
              <div className="min-w-0">
                <p className="text-luxury-black truncate">{a.name}</p>
                {a.description && <p className="text-[11px] text-gray-500 truncate">{a.description}</p>}
              </div>
              <span className="font-bold text-luxury-gold whitespace-nowrap">+{formatCurrency(a.price)}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null
  );

  return (
    <div className="space-y-3">
      <Group label="Motorized Screens" items={screens} />
      <Group label="Privacy Walls" items={walls} />
      <Group label="Other Upgrades" items={others} />
      <p className="text-[10px] italic text-gray-400 pt-1">
        Prices computed for this pergola's {width}' × {depth}' × {height}' dimensions. Show to customer as optional upgrades.
      </p>
    </div>
  );
}
