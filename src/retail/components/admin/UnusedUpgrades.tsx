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

  // Phase 3 + Phase 4 accessory IDs — the user-facing "add-ons" list
  // on the configurator. We exclude "extras" (LED, audio, in-lite)
  // that aren't in the primary configurator flow.
  const PHASE_3_4_IDS = new Set([
    'screen_front', 'screen_back', 'screen_left', 'screen_right',
    'wall_front', 'wall_back', 'wall_left', 'wall_right',
    'sensor', 'app_control', 'fan', 'heater',
  ]);

  // Match configurator logic: a side only splits into multiple screen bays
  // if there's an actual middle post (i.e. the side is longer than the
  // max bay span override). Otherwise it's a single bay regardless of
  // louver bay count.
  const maxBay = Number(cfg.maxBaySpanOverride) || 20;
  const screenBaysX = width > maxBay ? Math.ceil(width / 13) : 1;
  const screenBaysZ = depth > maxBay ? Math.ceil(depth / 20) : 1;

  // Calculate each unused accessory's price at this configuration
  const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
  const unused = ACCESSORIES
    .filter(a => PHASE_3_4_IDS.has(a.id) && !selectedIds.has(a.id))
    .map(a => {
      let price = 0;
      if (a.type === 'flat') price = a.price;
      else if (a.type === 'sqft') price = a.price * (width * depth);
      else if (a.type === 'screen_width') {
        price = calculateScreenPrice(width, height, screenBaysX);
      }
      else if (a.type === 'screen_depth') {
        price = calculateScreenPrice(depth, height, screenBaysZ);
      }
      else if (a.type === 'wall_width') price = width * height * wallUnitPrice;
      else if (a.type === 'wall_depth') price = depth * height * wallUnitPrice;
      return { id: a.id, name: a.name, description: a.description, price, imageUrl: a.imageUrl };
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
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">{label}</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map(a => (
            <div key={a.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col">
              <div className="w-full h-24 bg-luxury-paper overflow-hidden relative">
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 italic">No image</div>
                )}
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-luxury-gold text-luxury-black text-[10px] font-bold rounded-full">
                  +{formatCurrency(a.price)}
                </span>
              </div>
              <div className="p-2 flex-1">
                <p className="text-[11px] font-semibold text-luxury-black leading-tight mb-0.5">{a.name}</p>
                {a.description && <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">{a.description}</p>}
              </div>
            </div>
          ))}
        </div>
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
