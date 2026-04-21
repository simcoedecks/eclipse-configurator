import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { computeFinalPricing, formatCurrencyUSD, type CustomLineItem } from '../../../shared/lib/pricingMath';
import { logActivity } from '../../lib/crmHelpers';
import { Plus, Trash2, Edit3, Check, X, Save, Percent, Tag as TagIcon, FileText, Sparkles, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import ProductCatalog from './ProductCatalog';

interface Props { submission: any }

/**
 * Suggested custom line items — common things that need to be added to a
 * pergola proposal that aren't in the configurator (permits, electrical,
 * concrete, custom fabrication, rush fees, loyalty discounts, etc.).
 */
const SUGGESTIONS: Array<{ label: string; amount?: number; kind: 'add' | 'discount'; icon: string }> = [
  { label: 'Permit Fee', amount: 350, kind: 'add', icon: '📄' },
  { label: 'Electrical Rough-In', amount: 1200, kind: 'add', icon: '⚡' },
  { label: 'Concrete Pad (12\'×16\')', amount: 2800, kind: 'add', icon: '🧱' },
  { label: 'Site Prep / Demolition', amount: 0, kind: 'add', icon: '🚜' },
  { label: 'Rush Production Fee', amount: 1500, kind: 'add', icon: '⚡' },
  { label: 'Custom Fabrication', amount: 0, kind: 'add', icon: '🔨' },
  { label: 'Delivery (out-of-area)', amount: 450, kind: 'add', icon: '🚚' },
  { label: 'Loyalty Discount', amount: 500, kind: 'discount', icon: '🎁' },
  { label: 'Referral Credit', amount: 500, kind: 'discount', icon: '💸' },
  { label: 'Seasonal Promo', amount: 1000, kind: 'discount', icon: '🏷️' },
];

function emptyItem(): CustomLineItem {
  return { id: '', name: '', description: '', amount: 0, quantity: 1, kind: 'add' };
}

export default function PricingEditor({ submission }: Props) {
  const [items, setItems] = useState<CustomLineItem[]>(submission.customLineItems || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState<CustomLineItem>(emptyItem());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Reset when submission changes
  useEffect(() => {
    setItems(submission.customLineItems || []);
    setDirty(false);
  }, [submission.id]);

  const pb = submission.pricingBreakdown || {};
  const finalPricing = useMemo(() => computeFinalPricing(pb, items), [pb, items]);
  const originalFinal = useMemo(() => computeFinalPricing(pb, submission.customLineItems || []), [pb, submission.customLineItems]);

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = items
        .filter(i => i.name.trim() && Math.abs(i.amount) > 0)
        .map(i => ({
          id: i.id || Math.random().toString(36).slice(2, 10),
          name: i.name.trim(),
          description: i.description?.trim() || '',
          amount: Math.abs(Number(i.amount) || 0),
          quantity: i.quantity || 1,
          kind: i.kind || 'add',
        }));
      await setDoc(doc(db, 'submissions', submission.id), { customLineItems: cleaned }, { merge: true });
      await logActivity(submission.id, 'manual', `Updated pricing — ${cleaned.length} custom line item${cleaned.length === 1 ? '' : 's'}, new total: ${formatCurrencyUSD(computeFinalPricing(pb, cleaned).total)}`);
      toast.success('Pricing saved — customer proposal updated');
      setItems(cleaned);
      setDirty(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to save pricing');
    } finally { setSaving(false); }
  };

  const addItem = (from: Partial<CustomLineItem>) => {
    const next: CustomLineItem = {
      id: Math.random().toString(36).slice(2, 10),
      name: from.name || '',
      description: from.description || '',
      amount: from.amount ?? 0,
      quantity: from.quantity ?? 1,
      kind: from.kind || 'add',
    };
    setItems([...items, next]);
    setDirty(true);
    setEditingId(next.id);
  };

  const updateItem = (id: string, patch: Partial<CustomLineItem>) => {
    setItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
    setDirty(true);
  };

  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim() || !newItem.amount) return;
    addItem(newItem);
    setNewItem(emptyItem());
  };

  return (
    <div className="space-y-5">
      {/* Original configurator items — read-only reference */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2 flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Configurator Line Items (Read-Only)
        </h3>
        <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-3 py-2 bg-slate-100 text-[10px] uppercase tracking-wider font-bold text-gray-500">
            <div>Item</div><div className="text-center">Qty</div><div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-slate-200">
            <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-3 py-2">
              <div className="font-semibold text-luxury-black">Bespoke Pergola</div>
              <div className="text-center text-gray-500">1</div>
              <div className="text-right font-semibold">{formatCurrencyUSD(pb.basePrice || 0)}</div>
            </div>
            {(pb.itemizedAccessories || []).map((a: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px] gap-2 px-3 py-2">
                <div className="text-gray-700 pl-4 text-[13px]">↳ {a.name}</div>
                <div className="text-center text-gray-500">{a.quantity || 1}</div>
                <div className="text-right text-gray-700">{formatCurrencyUSD(a.cost || 0)}</div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 bg-slate-50 text-[11px] text-gray-500 italic border-t border-slate-200">
            These line items come from the customer's configuration and can't be edited directly. To make changes, add adjustments below.
          </div>
        </div>
      </section>

      {/* Custom line items — editable */}
      <section>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Custom Line Items &amp; Adjustments
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatalogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white rounded-lg text-xs font-bold hover:bg-luxury-black/90"
            >
              <Package className="w-3.5 h-3.5" />
              Browse Catalog
            </button>
            {dirty && (
              <>
                <span className="text-[10px] text-amber-700 font-semibold">Unsaved</span>
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-luxury-black rounded-lg text-xs font-bold hover:bg-luxury-gold/90 disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</> : <><Save className="w-3 h-3" />Save</>}
                </button>
              </>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-3 border border-dashed border-slate-300 rounded-lg">
            No custom line items. Add charges, discounts, or extras below — they'll appear on the customer's proposal.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_60px_100px_40px] gap-2 px-3 py-2 bg-slate-100 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <div>Name / Description</div>
              <div className="text-center">Unit $</div>
              <div className="text-center">Qty</div>
              <div className="text-right">Total</div>
              <div></div>
            </div>
            <div className="divide-y divide-slate-200 bg-white">
              {items.map(item => {
                const isEditing = editingId === item.id;
                const signed = item.kind === 'discount' ? -1 : 1;
                const rowTotal = signed * item.amount * (item.quantity || 1);
                return (
                  <div key={item.id} className={`grid grid-cols-[1fr_100px_60px_100px_40px] gap-2 px-3 py-2 items-center ${item.kind === 'discount' ? 'bg-emerald-50/30' : ''}`}>
                    {isEditing ? (
                      <>
                        <div className="space-y-1">
                          <input
                            value={item.name}
                            onChange={(e) => updateItem(item.id, { name: e.target.value })}
                            placeholder="Line item name"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            autoFocus
                          />
                          <input
                            value={item.description || ''}
                            onChange={(e) => updateItem(item.id, { description: e.target.value })}
                            placeholder="Optional description (shown on proposal)"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                              <input type="radio" name={`kind-${item.id}`} checked={item.kind !== 'discount'} onChange={() => updateItem(item.id, { kind: 'add' })} />
                              <span>Charge</span>
                            </label>
                            <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                              <input type="radio" name={`kind-${item.id}`} checked={item.kind === 'discount'} onChange={() => updateItem(item.id, { kind: 'discount' })} />
                              <span className="text-emerald-700 font-semibold">Discount</span>
                            </label>
                          </div>
                        </div>
                        <input type="number" value={item.amount} onChange={(e) => updateItem(item.id, { amount: Math.max(0, Number(e.target.value) || 0) })} className="px-2 py-1 border border-slate-300 rounded text-sm text-center" />
                        <input type="number" value={item.quantity || 1} onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="px-2 py-1 border border-slate-300 rounded text-sm text-center" />
                        <div className={`text-right font-bold text-sm ${item.kind === 'discount' ? 'text-emerald-700' : 'text-luxury-black'}`}>{formatCurrencyUSD(rowTotal)}</div>
                        <button onClick={() => setEditingId(null)} className="text-luxury-gold hover:bg-luxury-gold/10 rounded p-1" title="Done">
                          <Check className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.kind === 'discount' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase tracking-wider"><Percent className="w-2.5 h-2.5" />Disc</span>}
                            <p className="text-sm font-semibold text-luxury-black truncate">{item.name || <em className="text-gray-400">Untitled</em>}</p>
                          </div>
                          {item.description && <p className="text-[11px] text-gray-500 truncate">{item.description}</p>}
                        </div>
                        <div className="text-center text-sm text-gray-700">{formatCurrencyUSD(item.amount)}</div>
                        <div className="text-center text-sm text-gray-500">{item.quantity || 1}</div>
                        <div className={`text-right font-bold text-sm ${item.kind === 'discount' ? 'text-emerald-700' : 'text-luxury-black'}`}>{formatCurrencyUSD(rowTotal)}</div>
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditingId(item.id)} className="text-slate-500 hover:text-luxury-gold hover:bg-slate-100 rounded p-1" title="Edit">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded p-1" title="Remove">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick add row */}
        <form onSubmit={handleQuickAdd} className="mt-3 p-3 bg-luxury-paper border border-luxury-cream rounded-lg">
          <div className="flex items-center gap-2">
            <input
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Quick add… (e.g. Permit Fee)"
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-md text-sm"
            />
            <input
              type="number"
              value={newItem.amount || ''}
              onChange={(e) => setNewItem({ ...newItem, amount: Number(e.target.value) || 0 })}
              placeholder="$"
              className="w-24 px-3 py-1.5 border border-slate-200 rounded-md text-sm"
            />
            <select
              value={newItem.kind}
              onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as 'add' | 'discount' })}
              className="px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
            >
              <option value="add">Charge</option>
              <option value="discount">Discount</option>
            </select>
            <button type="submit" disabled={!newItem.name.trim() || !newItem.amount} className="inline-flex items-center gap-1 px-3 py-1.5 bg-luxury-black text-white rounded-md text-xs font-bold hover:bg-luxury-black/90 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />Add
            </button>
          </div>
        </form>

        {/* Suggested adjustments */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1.5 flex items-center gap-1">
            <TagIcon className="w-3 h-3" />Common adjustments
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                onClick={() => addItem({ name: s.label, amount: s.amount || 0, kind: s.kind })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-semibold transition-colors ${
                  s.kind === 'discount'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-luxury-gold/30 bg-luxury-gold/10 text-luxury-black hover:bg-luxury-gold/20'
                }`}
              >
                <span>{s.icon}</span>
                {s.label}
                {s.amount ? <span className="text-gray-400">· {formatCurrencyUSD(s.kind === 'discount' ? -s.amount : s.amount)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Final totals */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Updated Totals</h3>
        <div className="border-2 border-luxury-gold/30 rounded-lg overflow-hidden">
          <div className="bg-white divide-y divide-slate-100">
            <div className="flex justify-between px-4 py-2 text-sm">
              <span className="text-gray-600">Configurator subtotal</span>
              <span className="font-semibold">{formatCurrencyUSD(finalPricing.basePrice + finalPricing.accessoriesTotal)}</span>
            </div>
            {finalPricing.customTotal !== 0 && (
              <div className="flex justify-between px-4 py-2 text-sm">
                <span className="text-gray-600">Custom adjustments</span>
                <span className={`font-semibold ${finalPricing.customTotal < 0 ? 'text-emerald-700' : ''}`}>
                  {finalPricing.customTotal < 0 ? '' : '+'}{formatCurrencyUSD(finalPricing.customTotal)}
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-2 text-sm bg-slate-50">
              <span className="font-semibold">Subtotal</span>
              <span className="font-bold">{formatCurrencyUSD(finalPricing.subtotal)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 text-sm">
              <span className="text-gray-500">HST ({(finalPricing.hstRate * 100).toFixed(0)}%)</span>
              <span>{formatCurrencyUSD(finalPricing.hst)}</span>
            </div>
          </div>
          <div className="flex justify-between items-baseline px-4 py-3 bg-luxury-gold/10 border-t-2 border-luxury-gold/30">
            <span className="text-sm font-bold uppercase tracking-widest">New Total</span>
            <span className="text-2xl font-serif text-luxury-gold font-medium">{formatCurrencyUSD(finalPricing.total)}</span>
          </div>
          {Math.abs(finalPricing.total - originalFinal.total) > 0.01 && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800">
              {finalPricing.total > originalFinal.total
                ? `+${formatCurrencyUSD(finalPricing.total - originalFinal.total)} vs previous total`
                : `−${formatCurrencyUSD(originalFinal.total - finalPricing.total)} vs previous total`}
            </div>
          )}
        </div>
        <p className="text-[11px] text-gray-500 italic mt-2 leading-relaxed">
          Changes you save here show up instantly on the customer's interactive proposal page. The original PDF attachment stays as a historical snapshot.
        </p>
      </section>

      {catalogOpen && (
        <ProductCatalog
          onClose={() => setCatalogOpen(false)}
          existingNames={items.map(i => i.name)}
          onAdd={(p) => addItem(p)}
        />
      )}
    </div>
  );
}
