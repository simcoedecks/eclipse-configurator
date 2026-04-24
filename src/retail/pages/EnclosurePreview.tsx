import { useMemo, useState, Suspense } from 'react';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';

/**
 * STANDALONE PREVIEW — /preview/enclosures
 *
 * Demonstrates the proposed two-axis enclosure system (Closure × Screen
 * Overlay) using the actual PergolaVisualizer / 3D framework that drives
 * the live configurator. No changes to any live state — this page owns
 * its own local state and embeds the same visualizer used everywhere
 * else in the app.
 *
 * Today's renderer doesn't have bespoke meshes for Sliding Door or a
 * per-bay Motorized Guillotine. Until those are built, we approximate
 * with existing primitives so you can see the framework working:
 *   - 'wall'       → real Privacy Wall mesh (sectionChoices)
 *   - 'door'       → Privacy Wall mesh with a glass-blue color (placeholder)
 *   - 'guillotine' → Motorized Screen mesh with a slate color (placeholder)
 *   - 'open'       → no mesh
 * Screen overlay (when compatible) → Motorized Screen mesh on the front side.
 *
 * The data model, per-section UI, pricing, and 3D layer ordering are the
 * real proposal — only the door/guillotine textures are placeholders.
 */

type Closure = 'open' | 'wall' | 'door' | 'guillotine';
type Bay = { closure: Closure; screen: boolean };

const CLOSURES: { id: Closure; label: string; emoji: string; color: string; blocksScreen?: boolean }[] = [
  { id: 'open',       label: 'Open',          emoji: '◻', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'wall',       label: 'Privacy Wall',  emoji: '▮', color: 'bg-stone-100 text-stone-800 border-stone-300', blocksScreen: true },
  { id: 'door',       label: 'Sliding Door',  emoji: '⇄', color: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'guillotine', label: 'Guillotine',    emoji: '⇅', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
];

// Placeholder retail pricing — these become real tables when we build
const PRICE: Record<Closure, number> = { open: 0, wall: 2800, door: 4200, guillotine: 5100 };
const SCREEN_PRICE_PER_BAY = 2150;

export default function EnclosurePreview() {
  // Demo pergola: 30' × 20' × 9', 3-bay front side
  const WIDTH = 30;
  const DEPTH = 20;
  const HEIGHT = 9;

  const [bays, setBays] = useState<Bay[]>([
    { closure: 'door',       screen: true  },
    { closure: 'open',       screen: true  },
    { closure: 'guillotine', screen: true  },
  ]);

  const setBayClosure = (i: number, c: Closure) => {
    setBays(bs => bs.map((b, idx) => idx === i
      ? { closure: c, screen: c === 'wall' ? false : b.screen }
      : b));
  };
  const toggleBayScreen = (i: number) => {
    setBays(bs => bs.map((b, idx) => idx === i
      ? { ...b, screen: b.closure === 'wall' ? false : !b.screen }
      : b));
  };

  const total = bays.reduce((s, b) => s + PRICE[b.closure] + (b.screen ? SCREEN_PRICE_PER_BAY : 0), 0);

  // Translate the proposed two-axis model into today's PergolaVisualizer
  // primitives so we can render something useful. Doors/guillotines fall
  // back to wall/screen meshes with stand-in colors until we build the
  // real components.
  const visProps = useMemo(() => {
    // Map each bay to a legacy sectionChoice the visualizer understands.
    // Doors and walls both become 'wall'; guillotines become 'screen'.
    const frontSections = bays.map(b => {
      if (b.closure === 'wall')       return 'wall';
      if (b.closure === 'door')       return 'wall'; // placeholder — will get its own mesh
      if (b.closure === 'guillotine') return 'screen'; // placeholder — will get its own mesh
      return b.screen ? 'screen' : 'open';
    }) as Array<'open' | 'screen' | 'wall'>;

    return {
      width: WIDTH,
      depth: DEPTH,
      height: HEIGHT,
      accessories: new Set<string>(),
      frameColor: '#0A0A0A',
      louverColor: '#F6F6F6',
      louverAngle: 0,
      screenDrop: 100,
      guillotineOpen: 50,
      // If ANY bay has a door → tint the "wall" color glass-blue so the
      // door placeholders read as glass. Otherwise use the standard
      // stone wall color. This is the most honest preview possible
      // without new 3D components.
      wallColor: bays.some(b => b.closure === 'door') ? '#82A0C2' : '#57534e',
      houseWallColor: '#e2e8f0',
      houseWall: 'none' as const,
      houseWalls: new Set<'back'|'front'|'left'|'right'>(),
      houseWallLengths: {},
      houseWallAnchors: {},
      houseWallExtensions: {},
      sectionChoices: { front: frontSections },
      maxLouverSpanOverride: 13,
      maxBaySpanOverride: 20,
      forceMiddleXPost: false,
      forceMiddleZPost: false,
    };
  }, [bays]);

  return (
    <div className="min-h-screen bg-luxury-paper">
      {/* Header mirrors the configurator's luxury aesthetic */}
      <header className="bg-white border-b border-luxury-cream sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse Pergola" className="h-8 object-contain" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold border-l border-luxury-cream pl-3">
              Design Preview · Enclosure Stacking
            </span>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 rounded">
            Mockup · not wired up
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Intro */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8">
          <h1 className="text-2xl font-serif text-luxury-black mb-2">Stacked Enclosures — Two-Axis Model</h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
            The proposed system treats each bay as two independent choices: a <strong>closure</strong>
            (open / privacy wall / sliding door / motorized guillotine) plus an optional <strong>motorized
            screen overlay</strong>. A wall is opaque so it blocks the screen overlay; everything else stacks
            (screens drop outboard of glass closures so both are visible).
          </p>
          <p className="text-[11px] text-slate-500 italic mt-3">
            The 3D visualizer below uses the real PergolaVisualizer. Doors and guillotines are rendered
            with placeholder meshes (tinted wall + screen) until we build their bespoke components —
            the data model, pricing, and per-bay geometry all run through today's engine.
          </p>
        </section>

        {/* Live 3D preview */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream overflow-hidden">
          <div className="p-6 border-b border-luxury-cream flex items-center justify-between">
            <div>
              <h2 className="text-lg font-serif text-luxury-black">Live 3D Preview</h2>
              <p className="text-xs text-slate-500 mt-1">
                {WIDTH}' × {DEPTH}' × {HEIGHT}' pergola, 3-bay front side · uses real PergolaVisualizer
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold">Front-Side Subtotal</p>
              <p className="text-2xl font-serif text-luxury-black">${total.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-[480px] bg-[#f1f5f9]">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-400">Loading 3D…</div>}>
              <PergolaVisualizer {...visProps} view="perspective" />
            </Suspense>
          </div>
        </section>

        {/* Per-bay picker — styled to match Phase 3 of the live configurator */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8">
          <h2 className="text-lg font-serif text-luxury-black mb-1">Per-Section · Front</h2>
          <p className="text-xs text-slate-500 mb-6">
            Each bay gets its own closure + screen overlay. Watch the 3D preview above update in real time as you pick options.
          </p>

          <div className="space-y-3">
            {bays.map((bay, i) => {
              const closurePrice = PRICE[bay.closure];
              const screenPrice = bay.screen && bay.closure !== 'wall' ? SCREEN_PRICE_PER_BAY : 0;
              const bayTotal = closurePrice + screenPrice;
              return (
                <div key={i} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Bay {i + 1} · 10' span</p>
                    <p className="text-sm font-mono text-slate-700">
                      {bayTotal > 0 ? `$${bayTotal.toLocaleString()}` : <span className="text-slate-400">—</span>}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                      {CLOSURES.map(c => {
                        const isSelected = bay.closure === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setBayClosure(i, c.id)}
                            className={`flex flex-col items-start px-3 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="text-base">{c.emoji}</span>{c.label}
                            </span>
                            {c.id !== 'open' && (
                              <span className="opacity-60 text-[10px] mt-0.5">+${PRICE[c.id].toLocaleString()}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <label className={`flex items-center gap-2 text-xs font-medium whitespace-nowrap pl-2 md:border-l md:border-slate-200 md:pl-4 ${bay.closure === 'wall' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={bay.screen && bay.closure !== 'wall'}
                        disabled={bay.closure === 'wall'}
                        onChange={() => toggleBayScreen(i)}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span>
                        Motorized Screen
                        <span className="block text-[10px] text-slate-400 font-normal">+${SCREEN_PRICE_PER_BAY.toLocaleString()}</span>
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Compatibility matrix */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8">
          <h2 className="text-lg font-serif text-luxury-black mb-4">Compatibility</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  <th className="p-2 font-bold text-[11px] uppercase tracking-widest text-slate-500">Closure</th>
                  <th className="p-2 font-bold text-[11px] uppercase tracking-widest text-slate-500 text-center">+ Motorized Screen</th>
                  <th className="p-2 font-bold text-[11px] uppercase tracking-widest text-slate-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CLOSURES.map(c => (
                  <tr key={c.id}>
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-2 px-2 py-1 rounded border ${c.color}`}>
                        <span>{c.emoji}</span><span className="font-medium">{c.label}</span>
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      {c.blocksScreen
                        ? <span className="text-rose-500 font-bold">✗</span>
                        : <span className="text-emerald-600 font-bold">✓</span>}
                    </td>
                    <td className="p-2 text-slate-600 text-[13px]">
                      {c.id === 'open' && 'Screen drops straight down — most common'}
                      {c.id === 'wall' && 'Opaque panel — screen would be invisible behind it'}
                      {c.id === 'door' && 'Screen drops in front of the sliding door'}
                      {c.id === 'guillotine' && 'Screen drops outboard; insect barrier when window is open'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Itemized quote output */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8">
          <h2 className="text-lg font-serif text-luxury-black mb-4">Itemized Quote Output</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {bays.flatMap((bay, i) => {
                const rows: { label: string; cost: number }[] = [];
                if (bay.closure !== 'open') {
                  const c = CLOSURES.find(x => x.id === bay.closure)!;
                  rows.push({ label: `${c.label} · Front · Bay ${i + 1} (10')`, cost: PRICE[bay.closure] });
                }
                if (bay.screen && bay.closure !== 'wall') {
                  rows.push({ label: `Motorized Screen · Front · Bay ${i + 1} (10')`, cost: SCREEN_PRICE_PER_BAY });
                }
                return rows.map((r, k) => (
                  <tr key={`${i}-${k}`}>
                    <td className="py-2.5 text-slate-700">{r.label}</td>
                    <td className="py-2.5 text-right font-mono text-slate-700">${r.cost.toLocaleString()}</td>
                  </tr>
                ));
              })}
              <tr className="bg-luxury-paper">
                <td className="py-3 font-bold text-luxury-black uppercase tracking-widest text-xs">Front-Side Subtotal</td>
                <td className="py-3 text-right font-bold font-mono text-luxury-black">${total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-4 italic">
            Exactly how this would surface in the CRM line items, customer proposal, and PDF — one line per closure + one line per screen overlay, per bay.
          </p>
        </section>

        {/* Limitations */}
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-amber-900 mb-2">What's Approximated in This Preview</h2>
          <ul className="text-[13px] text-amber-900/90 space-y-1.5 list-disc pl-5">
            <li>Sliding Door renders as a Privacy Wall tinted glass-blue. A real door mesh with a frame + split glass panels is ~2-3 hours of Three.js work.</li>
            <li>Motorized Guillotine renders with the existing Motorized Screen mesh. A real guillotine frame with vertical glass panels is ~1-2 hours (we already have one component on the front — needs to be generalized).</li>
            <li>The Per-Section panel in the live configurator currently has three states (open/screen/wall). The proposed model splits that into closure buttons + a screen checkbox — demonstrated above.</li>
          </ul>
        </section>

      </div>
    </div>
  );
}
