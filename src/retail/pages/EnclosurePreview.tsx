import { useState } from 'react';

/**
 * STANDALONE PREVIEW — /preview/enclosures
 *
 * This is a UI mockup of the proposed two-axis enclosure system
 * (Closure × Screen Overlay) that adds sliding doors and motorized
 * guillotine windows alongside the existing motorized screen and
 * privacy wall. It does NOT touch any live configurator state — it's
 * isolated local component state so you can click through the
 * interactions before we commit to building it.
 */

type Closure = 'open' | 'wall' | 'door' | 'guillotine';
type Bay = { closure: Closure; screen: boolean };

const CLOSURES: { id: Closure; label: string; emoji: string; color: string; blocksScreen?: boolean }[] = [
  { id: 'open',       label: 'Open',       emoji: '◻',  color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'wall',       label: 'Privacy Wall', emoji: '▮', color: 'bg-stone-100 text-stone-800 border-stone-300', blocksScreen: true },
  { id: 'door',       label: 'Sliding Door', emoji: '⇄', color: 'bg-sky-50 text-sky-800 border-sky-200' },
  { id: 'guillotine', label: 'Guillotine',  emoji: '⇅',  color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
];

// Rough retail pricing (per bay, 10' @ 9ft height) — placeholders for the preview only
const PRICE: Record<Closure, number> = { open: 0, wall: 2800, door: 4200, guillotine: 5100 };
const SCREEN_PRICE_PER_BAY = 2150;

export default function EnclosurePreview() {
  // 30' × 10', 3 bays on the front, per-section enabled
  const [bays, setBays] = useState<Bay[]>([
    { closure: 'door',       screen: true  },
    { closure: 'open',       screen: true  },
    { closure: 'guillotine', screen: true  },
  ]);

  // Side-wide demo (for Phase 3 button states)
  const [sideClosure, setSideClosure] = useState<Closure>('open');
  const [sideScreen, setSideScreen] = useState(false);

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

  return (
    <div className="min-h-screen bg-luxury-paper py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">

        <header className="flex items-start justify-between gap-4 border-b border-luxury-cream pb-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-1">Design Preview</p>
            <h1 className="text-2xl font-serif text-luxury-black">Stacked Enclosures — Two-Axis Model</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
              Closure (one of: open / wall / door / guillotine) + optional motorized screen overlay.
              A privacy wall is opaque so it blocks the screen overlay — everything else stacks.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 rounded">
            Mockup · not wired up
          </span>
        </header>

        {/* Compatibility matrix */}
        <section className="bg-white rounded-xl border border-luxury-cream p-6">
          <h2 className="text-sm font-bold text-luxury-black uppercase tracking-widest mb-4">Compatibility</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
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
                      {c.id === 'guillotine' && 'Screen drops outboard of the window; insect barrier when window is open'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Side-wide Phase 3 mockup */}
        <section className="bg-white rounded-xl border border-luxury-cream p-6">
          <h2 className="text-sm font-bold text-luxury-black uppercase tracking-widest mb-1">Phase 3 · Side-Wide Controls (Front side)</h2>
          <p className="text-xs text-slate-500 mb-4">One closure per side + optional screen overlay. The closure buttons are mutually exclusive; the screen checkbox stacks.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Closure</p>
              <div className="grid grid-cols-2 gap-2">
                {CLOSURES.map(c => {
                  const isSelected = sideClosure === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSideClosure(c.id);
                        if (c.id === 'wall') setSideScreen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><span>{c.emoji}</span>{c.label}</span>
                      {c.id !== 'open' && <span className="opacity-60">${PRICE[c.id].toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">Overlay</p>
              <button
                onClick={() => { if (sideClosure !== 'wall') setSideScreen(v => !v); }}
                disabled={sideClosure === 'wall'}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  sideClosure === 'wall'
                    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    : sideScreen
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${sideScreen && sideClosure !== 'wall' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                    {sideScreen && sideClosure !== 'wall' && <span className="text-[10px]">✓</span>}
                  </span>
                  Motorized Screen
                </span>
                <span className="opacity-60">+${SCREEN_PRICE_PER_BAY.toLocaleString()}/bay</span>
              </button>
              {sideClosure === 'wall' && (
                <p className="text-[10px] text-rose-600 mt-1.5 italic">Screen overlay unavailable with opaque privacy wall.</p>
              )}
            </div>
          </div>
        </section>

        {/* Per-section panel mockup */}
        <section className="bg-white rounded-xl border border-luxury-cream p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-bold text-luxury-black uppercase tracking-widest">Per-Section Panel · Front (30' ÷ 3 bays)</h2>
              <p className="text-xs text-slate-500 mt-1">Each bay gets its own closure + screen overlay. This replaces today's 3-state segment control.</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold">Line-Item Total</p>
              <p className="text-xl font-serif text-luxury-black">${total.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-3">
            {bays.map((bay, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Bay {i + 1} · 10'</p>
                  <p className="text-[11px] font-mono text-slate-500">
                    {PRICE[bay.closure] > 0 && `$${PRICE[bay.closure].toLocaleString()}`}
                    {bay.screen && bay.closure !== 'wall' && <span className="text-slate-400"> + ${SCREEN_PRICE_PER_BAY.toLocaleString()} screen</span>}
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="grid grid-cols-4 gap-1">
                    {CLOSURES.map(c => {
                      const isSelected = bay.closure === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setBayClosure(i, c.id)}
                          className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <span className="mr-1">{c.emoji}</span>{c.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className={`flex items-center gap-2 text-xs font-medium whitespace-nowrap ${bay.closure === 'wall' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={bay.screen && bay.closure !== 'wall'}
                      disabled={bay.closure === 'wall'}
                      onChange={() => toggleBayScreen(i)}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    Motorized Screen
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Itemized quote preview */}
        <section className="bg-white rounded-xl border border-luxury-cream p-6">
          <h2 className="text-sm font-bold text-luxury-black uppercase tracking-widest mb-4">Itemized Quote Output</h2>
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
                    <td className="py-2 text-slate-700">{r.label}</td>
                    <td className="py-2 text-right font-mono text-slate-700">${r.cost.toLocaleString()}</td>
                  </tr>
                ));
              })}
              <tr className="bg-slate-50">
                <td className="py-3 font-bold text-luxury-black uppercase tracking-widest text-xs">Front Side Subtotal</td>
                <td className="py-3 text-right font-bold font-mono text-luxury-black">${total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-3 italic">
            Exactly how this would appear in the CRM line items, customer proposal, and PDF — one line per closure + one line per screen overlay, per bay.
          </p>
        </section>

        {/* Layer stacking diagram */}
        <section className="bg-white rounded-xl border border-luxury-cream p-6">
          <h2 className="text-sm font-bold text-luxury-black uppercase tracking-widest mb-4">3D Layer Order (outside → inside)</h2>
          <div className="flex items-center gap-2 overflow-x-auto py-2">
            {[
              { label: 'Motorized Screen', detail: 'outermost, ~4" outboard', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
              { label: 'Closure', detail: 'wall / door / guillotine', color: 'bg-slate-100 text-slate-800 border-slate-300' },
              { label: 'Pergola Opening', detail: 'post-to-post bay', color: 'bg-white text-slate-500 border-slate-200' },
            ].map((l, i, arr) => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`shrink-0 rounded-lg border px-4 py-3 text-center ${l.color}`}>
                  <p className="text-xs font-bold">{l.label}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{l.detail}</p>
                </div>
                {i < arr.length - 1 && <span className="text-slate-300 text-lg">→</span>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 italic">
            The screen sits outboard of the closure so both are visible in 3D. Same zOffset pattern used by today's motorized screens — extending it is essentially free.
          </p>
        </section>

      </div>
    </div>
  );
}
