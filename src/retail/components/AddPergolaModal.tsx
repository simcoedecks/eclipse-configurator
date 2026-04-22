import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Minus, Ruler, Check, Loader2, Calculator } from 'lucide-react';
import { COLORS } from '../../shared/lib/colors';
import { calculateBasePrice, formatCurrency } from '../../shared/lib/pricing';
import type { AdditionalPergolaItem } from '../../shared/lib/pricingMath';

interface Props {
  /** Pergola being edited. Pass null to create a new one. */
  initial?: AdditionalPergolaItem | null;
  /** Project number index (e.g. 2 = "Pergola #2") */
  indexNumber: number;
  /** Dark mode flag — passed from Home */
  isDark?: boolean;
  onClose: () => void;
  onSave: (pergola: AdditionalPergolaItem) => void;
}

function emptyPergola(indexNumber: number): AdditionalPergolaItem {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: `Pergola #${indexNumber}`,
    width: 12,
    depth: 16,
    height: 9,
    frameColor: 'Midnight Onyx',
    louverColor: 'Moonstone White',
    notes: '',
    price: 0,
  };
}

export default function AddPergolaModal({ initial, indexNumber, isDark = false, onClose, onSave }: Props) {
  const [pergola, setPergola] = useState<AdditionalPergolaItem>(initial || emptyPergola(indexNumber));
  const [manualPrice, setManualPrice] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Auto-recalculate price whenever dimensions change, unless user has
  // manually overridden it.
  useEffect(() => {
    if (manualPrice) return;
    setCalculating(true);
    const base = calculateBasePrice(pergola.depth || 0, pergola.width || 0);
    setPergola(prev => ({ ...prev, price: base ? Math.round(base) : 0 }));
    setCalculating(false);
  }, [pergola.width, pergola.depth, manualPrice]);

  const update = (patch: Partial<AdditionalPergolaItem>) => {
    setPergola(prev => ({ ...prev, ...patch }));
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!pergola.label.trim() || !pergola.width || !pergola.depth || !pergola.height) return;
    onSave({ ...pergola, label: pergola.label.trim() });
  };

  const bg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
  const text = isDark ? 'text-white' : 'text-luxury-black';
  const border = isDark ? 'border-white/10' : 'border-luxury-cream';
  const input = isDark
    ? 'bg-white/5 border-white/15 text-white placeholder:text-white/30'
    : 'bg-white border-slate-300 text-luxury-black';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`${bg} rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden flex flex-col border ${border}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b ${border} bg-gradient-to-r from-luxury-gold/10 to-transparent`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={`text-xl font-serif ${text}`}>
                {initial ? 'Edit Pergola' : 'Add Another Pergola'}
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Configure a second (or third, fourth…) pergola for this same project.
              </p>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'text-white/40 hover:bg-white/5' : 'text-gray-400 hover:bg-gray-100'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Label */}
          <div>
            <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Pergola Name
            </label>
            <input
              value={pergola.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="e.g. Pool Area Pergola"
              className={`w-full px-4 py-2.5 border rounded-lg text-base focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${input}`}
              required
              autoFocus={!initial}
            />
          </div>

          {/* Dimensions */}
          <div>
            <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              <Ruler className="w-3 h-3" />
              Dimensions (feet)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['width', 'depth', 'height'] as const).map((dim) => {
                const min = dim === 'width' ? 7 : dim === 'depth' ? 8 : 8;
                const max = dim === 'width' ? 40 : dim === 'depth' ? 100 : 11;
                const val = pergola[dim] || 0;
                return (
                  <div key={dim}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => update({ [dim]: Math.max(min, val - 1) })}
                        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-slate-300 text-luxury-black hover:bg-slate-100'}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={val}
                        onChange={(e) => update({ [dim]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
                        className={`w-full px-2 py-1.5 border rounded-lg text-center font-bold text-sm ${input}`}
                      />
                      <button
                        type="button"
                        onClick={() => update({ [dim]: Math.min(max, val + 1) })}
                        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isDark ? 'border-white/20 text-white hover:bg-white/5' : 'border-slate-300 text-luxury-black hover:bg-slate-100'}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className={`text-[9px] text-center mt-1 uppercase tracking-wider font-bold ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                      {dim}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Frame Color
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {COLORS.filter(c => c.type !== 'wood').map(c => {
                  const selected = pergola.frameColor === c.name;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => update({ frameColor: c.name })}
                      className={`p-1.5 rounded-md border-2 transition-all ${selected ? 'border-luxury-gold scale-105' : isDark ? 'border-white/10 hover:border-white/30' : 'border-slate-200 hover:border-slate-300'}`}
                      title={c.name}
                    >
                      <div className="w-full h-5 rounded-sm shadow-sm" style={{ background: c.hex, border: '1px solid rgba(0,0,0,0.1)' }} />
                      <p className={`text-[8px] font-bold uppercase tracking-tight text-center mt-1 truncate ${isDark ? 'text-white/80' : 'text-luxury-black'}`}>
                        {c.name.split(' ')[0]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Louver Color
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {COLORS.map(c => {
                  const selected = pergola.louverColor === c.name;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => update({ louverColor: c.name })}
                      className={`p-1.5 rounded-md border-2 transition-all ${selected ? 'border-luxury-gold scale-105' : isDark ? 'border-white/10 hover:border-white/30' : 'border-slate-200 hover:border-slate-300'}`}
                      title={c.name}
                    >
                      <div className="w-full h-5 rounded-sm shadow-sm" style={{ background: c.hex, border: '1px solid rgba(0,0,0,0.1)' }} />
                      <p className={`text-[8px] font-bold uppercase tracking-tight text-center mt-1 truncate ${isDark ? 'text-white/80' : 'text-luxury-black'}`}>
                        {c.name.split(' ')[0]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Notes (optional)
            </label>
            <textarea
              value={pergola.notes || ''}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="e.g. Attached to house on left side, over the pool area…"
              rows={2}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${input}`}
            />
          </div>

          {/* Computed price */}
          <div className={`rounded-lg p-4 border-2 border-luxury-gold/30 bg-luxury-gold/5`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-luxury-gold" />
                <span className={`text-[10px] uppercase tracking-widest font-bold text-luxury-gold`}>
                  Estimated Price
                </span>
              </div>
              {manualPrice && (
                <button type="button" onClick={() => setManualPrice(false)} className="text-[11px] text-luxury-gold hover:underline font-semibold">
                  Reset to auto
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xl ${isDark ? 'text-white/60' : 'text-gray-400'}`}>$</span>
                <input
                  type="number"
                  value={pergola.price || ''}
                  onChange={(e) => { setManualPrice(true); update({ price: Number(e.target.value) || 0 }); }}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-2xl font-serif font-medium text-luxury-gold ${input}`}
                />
              </div>
              {calculating && <Loader2 className="w-4 h-4 animate-spin text-luxury-gold" />}
            </div>
            <p className={`text-[11px] mt-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              {manualPrice
                ? '✏️ Manual price. Dimensions won\'t auto-update this.'
                : '✨ Auto-calculated from dimensions. Edit to override.'}
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className={`px-6 py-3 border-t ${border} flex justify-between gap-2`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-lg text-sm font-semibold ${isDark ? 'bg-white/5 text-white/70 hover:bg-white/10' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!pergola.label.trim() || !pergola.width || !pergola.depth || !pergola.height}
            className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-luxury-black rounded-lg text-sm font-bold hover:bg-luxury-gold/90 disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            {initial ? 'Save Changes' : 'Add to Project'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
