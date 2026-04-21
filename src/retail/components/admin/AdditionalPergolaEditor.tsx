import { useState, useEffect, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { logActivity } from '../../lib/crmHelpers';
import { formatCurrencyUSD, type AdditionalPergolaItem, computeAdditionalPergolaPrice } from '../../../shared/lib/pricingMath';
import { calculateBasePrice } from '../../../shared/lib/pricing';
import { COLORS } from '../../../shared/lib/colors';
import { Plus, Trash2, Edit3, Save, X, Ruler, Sparkles, Building2, Loader2, Calculator, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props { submission: any }

function emptyPergola(): AdditionalPergolaItem {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: '',
    width: 12,
    depth: 16,
    height: 9,
    frameColor: 'Midnight Onyx',
    louverColor: 'Moonstone White',
    notes: '',
    price: 0,
    lineItems: [],
  };
}

export default function AdditionalPergolaEditor({ submission }: Props) {
  const [pergolas, setPergolas] = useState<AdditionalPergolaItem[]>(submission.additionalPergolas || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setPergolas(submission.additionalPergolas || []);
    setDirty(false);
    setEditingId(null);
  }, [submission.id]);

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = pergolas
        .filter(p => p.label.trim())
        .map(p => ({
          id: p.id,
          label: p.label.trim(),
          width: p.width || 0,
          depth: p.depth || 0,
          height: p.height || 0,
          frameColor: p.frameColor || '',
          louverColor: p.louverColor || '',
          notes: p.notes || '',
          price: Number(p.price) || 0,
          lineItems: p.lineItems || [],
        }));
      await setDoc(doc(db, 'submissions', submission.id), { additionalPergolas: cleaned }, { merge: true });
      const totalExtra = cleaned.reduce((s, p) => s + computeAdditionalPergolaPrice(p), 0);
      await logActivity(
        submission.id,
        'manual',
        `Updated additional pergolas — ${cleaned.length} extra ${cleaned.length === 1 ? 'pergola' : 'pergolas'} (+${formatCurrencyUSD(totalExtra)})`
      );
      setPergolas(cleaned);
      setDirty(false);
      toast.success('Saved — customer proposal updated');
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to save');
    } finally { setSaving(false); }
  };

  const addPergola = () => {
    const p = emptyPergola();
    p.label = `Pergola #${pergolas.length + 2}`;
    setPergolas([...pergolas, p]);
    setEditingId(p.id);
    setDirty(true);
  };

  const updatePergola = (id: string, patch: Partial<AdditionalPergolaItem>) => {
    setPergolas(pergolas.map(p => p.id === id ? { ...p, ...patch } : p));
    setDirty(true);
  };

  const removePergola = (id: string) => {
    if (!confirm('Remove this additional pergola?')) return;
    setPergolas(pergolas.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
    setDirty(true);
  };

  const autoCalc = (p: AdditionalPergolaItem) => {
    const base = calculateBasePrice(p.depth || 0, p.width || 0);
    if (base != null) {
      updatePergola(p.id, { price: Math.round(base) });
      toast.success(`Base price auto-calculated: ${formatCurrencyUSD(base)}`);
    } else {
      toast.error('Dimensions out of range for auto-calculation');
    }
  };

  const total = pergolas.reduce((s, p) => s + computeAdditionalPergolaPrice(p), 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            Additional Pergolas
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Add a second or third pergola to the same project. Each has its own dimensions, colors, and price.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addPergola} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white rounded-lg text-xs font-bold hover:bg-luxury-black/90">
            <Plus className="w-3.5 h-3.5" />Add Pergola
          </button>
          {dirty && (
            <>
              <span className="text-[10px] text-amber-700 font-semibold">Unsaved</span>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-luxury-black rounded-lg text-xs font-bold hover:bg-luxury-gold/90 disabled:opacity-50">
                {saving ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</> : <><Save className="w-3 h-3" />Save</>}
              </button>
            </>
          )}
        </div>
      </div>

      {pergolas.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-300 rounded-lg bg-slate-50">
          <Building2 className="w-6 h-6 mx-auto text-slate-400 mb-2" />
          <p className="text-xs text-gray-500 italic">No additional pergolas yet. Click "Add Pergola" to include another one on this proposal.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pergolas.map((p, idx) => {
            const isEditing = editingId === p.id;
            const rowTotal = computeAdditionalPergolaPrice(p);
            return (
              <div key={p.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                <div className="px-3 py-2 bg-luxury-gold/10 border-b border-luxury-gold/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-luxury-gold text-luxury-black font-bold text-xs flex items-center justify-center">
                      {idx + 2}
                    </div>
                    {isEditing ? (
                      <input
                        value={p.label}
                        onChange={(e) => updatePergola(p.id, { label: e.target.value })}
                        placeholder="Pergola name (e.g. Pool Area)"
                        className="px-2 py-0.5 border border-slate-300 rounded text-sm font-semibold bg-white"
                        autoFocus
                      />
                    ) : (
                      <div>
                        <p className="font-semibold text-luxury-black text-sm">{p.label || <em className="text-gray-400">Untitled Pergola</em>}</p>
                        <p className="text-[10px] text-gray-500">
                          {p.width}' × {p.depth}' × {p.height}' · {p.frameColor} frame · {p.louverColor} louvers
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-luxury-gold">{formatCurrencyUSD(rowTotal)}</span>
                    {isEditing ? (
                      <button onClick={() => setEditingId(null)} className="p-1 text-luxury-gold hover:bg-luxury-gold/20 rounded" title="Done">
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => setEditingId(p.id)} className="p-1 text-slate-500 hover:text-luxury-gold hover:bg-slate-100 rounded" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => removePergola(p.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="p-3 space-y-3">
                    {/* Dimensions */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1 flex items-center gap-1">
                        <Ruler className="w-3 h-3" />Dimensions (feet)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <input type="number" value={p.width || ''} onChange={(e) => updatePergola(p.id, { width: Number(e.target.value) || 0 })} placeholder="Width" className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm text-center" />
                          <p className="text-[9px] text-gray-400 text-center mt-0.5">Width</p>
                        </div>
                        <div>
                          <input type="number" value={p.depth || ''} onChange={(e) => updatePergola(p.id, { depth: Number(e.target.value) || 0 })} placeholder="Depth" className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm text-center" />
                          <p className="text-[9px] text-gray-400 text-center mt-0.5">Depth</p>
                        </div>
                        <div>
                          <input type="number" value={p.height || ''} onChange={(e) => updatePergola(p.id, { height: Number(e.target.value) || 0 })} placeholder="Height" className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm text-center" />
                          <p className="text-[9px] text-gray-400 text-center mt-0.5">Height</p>
                        </div>
                      </div>
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Frame Color</label>
                        <select value={p.frameColor || ''} onChange={(e) => updatePergola(p.id, { frameColor: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                          {COLORS.filter(c => c.type !== 'wood').map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          {COLORS.filter(c => c.type === 'wood').map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Louver Color</label>
                        <select value={p.louverColor || ''} onChange={(e) => updatePergola(p.id, { louverColor: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                          {COLORS.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Price + auto-calc */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Price (excl. HST)</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            value={p.price || ''}
                            onChange={(e) => updatePergola(p.id, { price: Number(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded text-sm font-bold"
                          />
                        </div>
                        <button onClick={() => autoCalc(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white rounded text-xs font-bold hover:bg-luxury-black/90">
                          <Calculator className="w-3.5 h-3.5" />
                          Auto-calc
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Auto-calc uses the configurator's base pricing for the dimensions above. You can still adjust the final number, and add accessories via the line items section.
                      </p>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Notes (optional)</label>
                      <textarea
                        value={p.notes || ''}
                        onChange={(e) => updatePergola(p.id, { notes: e.target.value })}
                        placeholder="Location details, accessories, install notes…"
                        rows={2}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pergolas.length > 0 && (
        <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-luxury-gold/30">
          <span className="text-xs uppercase tracking-widest font-bold text-luxury-gold">Additional Pergolas Total</span>
          <span className="text-lg font-serif text-luxury-gold font-bold">{formatCurrencyUSD(total)}</span>
        </div>
      )}
    </section>
  );
}
