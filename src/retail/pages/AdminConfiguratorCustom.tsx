import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { COLORS } from '../../shared/lib/colors';
import { ACCESSORIES } from '../../shared/lib/accessories';
import {
  emptySection,
  layoutSections,
  priceCustomConfig,
  formatCAD,
  type PergolaSection,
  type CustomConfig,
  type LouverOrientation,
} from '../../shared/lib/customSections';
import MultiSectionPreview from '../../shared/components/MultiSectionPreview';
import { logActivity } from '../lib/crmHelpers';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  Box,
  Eye,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

/**
 * Phase 1.1 — Multi-section custom pergola builder.
 *
 * Sections lay out left-to-right sharing the back wall. All sections share
 * height + frame/louver colors + flat-priced accessories.
 *
 * Saves to a Firestore submission's `configuration` field (with isCustom:true
 * and a `sections` array) when ?submissionId=... is in the URL. Without a
 * submissionId the builder works as a sandbox (preview + price only).
 */
export default function AdminConfiguratorCustom() {
  const navigate = useNavigate();
  const submissionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('submissionId') || undefined
    : undefined;

  const [submission, setSubmission] = useState<any>(null);
  const [sections, setSections] = useState<PergolaSection[]>([emptySection()]);
  const [height, setHeight] = useState<number>(9);
  const [frameColorId, setFrameColorId] = useState<string>('ral9005'); // Midnight Onyx
  const [louverColorId, setLouverColorId] = useState<string>('ral9016'); // Moonstone White
  const [accessoryIds, setAccessoryIds] = useState<string[]>([]);
  const [accessoryQuantities, setAccessoryQuantities] = useState<Record<string, number>>({});
  const [view, setView] = useState<'persp' | 'top'>('persp');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState<boolean>(!!submissionId);
  const [dirty, setDirty] = useState(false);

  const frameColor = useMemo(
    () => COLORS.find((c) => c.id === frameColorId) || COLORS[0],
    [frameColorId]
  );
  const louverColor = useMemo(
    () => COLORS.find((c) => c.id === louverColorId) || COLORS[1],
    [louverColorId]
  );

  // ── Load existing custom config from submission, if any ──────────────────
  useEffect(() => {
    if (!submissionId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'submissions', submissionId));
        if (!snap.exists()) {
          toast.error('Submission not found — starting fresh');
          setLoading(false);
          return;
        }
        const sub: any = { id: snap.id, ...snap.data() };
        setSubmission(sub);
        const cfg = sub.configuration || {};
        if (cfg.isCustom && Array.isArray(cfg.sections) && cfg.sections.length > 0) {
          setSections(cfg.sections);
          setHeight(cfg.height || 9);
          if (cfg.frameColor) {
            const fc = COLORS.find((c) => c.name === cfg.frameColor);
            if (fc) setFrameColorId(fc.id);
          }
          if (cfg.louverColor) {
            const lc = COLORS.find((c) => c.name === cfg.louverColor);
            if (lc) setLouverColorId(lc.id);
          }
          if (Array.isArray(cfg.accessoryIds)) setAccessoryIds(cfg.accessoryIds);
          if (cfg.accessoryQuantities && typeof cfg.accessoryQuantities === 'object') {
            setAccessoryQuantities(cfg.accessoryQuantities);
          }
        }
      } catch (e: any) {
        console.error(e);
        toast.error('Failed to load submission');
      } finally {
        setLoading(false);
      }
    })();
  }, [submissionId]);

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, emptySection()]);
    setDirty(true);
  }, []);

  const removeSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }, []);

  const updateSection = useCallback((id: string, patch: Partial<PergolaSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  }, []);

  const toggleAccessory = useCallback((id: string) => {
    setAccessoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setDirty(true);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setAccessoryQuantities((prev) => ({ ...prev, [id]: Math.max(1, qty) }));
    setDirty(true);
  }, []);

  // ── Derived: full custom config + price ──────────────────────────────────
  const customConfig: CustomConfig = useMemo(
    () => ({
      isCustom: true,
      sections,
      height,
      frameColor: frameColor.name,
      frameColorHex: frameColor.hex,
      louverColor: louverColor.name,
      louverColorHex: louverColor.hex,
      accessoryIds,
      accessoryQuantities,
    }),
    [sections, height, frameColor, louverColor, accessoryIds, accessoryQuantities]
  );

  const pricing = useMemo(() => priceCustomConfig(customConfig), [customConfig]);
  const layout = useMemo(() => layoutSections(sections), [sections]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!submissionId) {
      toast.error('No submission attached. Open this from a CRM record to save.');
      return;
    }
    if (sections.length === 0) {
      toast.error('Add at least one section.');
      return;
    }
    setSaving(true);
    try {
      // Build a configuration shape that's compatible with the rest of the
      // app: width/depth = bounding box of all sections, plus the new
      // sections array + isCustom flag for code that knows to read them.
      const configuration: any = {
        isCustom: true,
        sections,
        height,
        width: layout.totalWidth,
        depth: layout.maxDepth,
        frameColor: frameColor.name,
        louverColor: louverColor.name,
        accessoryIds,
        accessoryQuantities,
        accessories: accessoryIds.map((id) => {
          const acc = ACCESSORIES.find((a) => a.id === id);
          if (!acc) return id;
          const qty = accessoryQuantities[id] || 1;
          return qty > 1 ? `${acc.name} × ${qty}` : acc.name;
        }),
        totalPrice: formatCAD(pricing.total),
      };
      const pricingBreakdown = {
        basePrice: pricing.basePrice,
        itemizedAccessories: pricing.itemizedAccessories,
        subtotal: pricing.subtotal,
        hst: pricing.hst,
        total: pricing.total,
        discount: 0,
        discountPercentage: 0,
        discountedSubtotal: pricing.subtotal,
      };
      await setDoc(
        doc(db, 'submissions', submissionId),
        { configuration, pricingBreakdown },
        { merge: true }
      );
      try {
        await logActivity(
          submissionId,
          'manual',
          `Saved custom multi-section design: ${sections.length} section${sections.length === 1 ? '' : 's'} · ${formatCAD(pricing.total)}`
        );
      } catch {
        /* activity logging is best-effort */
      }
      setDirty(false);
      toast.success('Saved — proposal updated');
    } catch (e: any) {
      console.error(e);
      toast.error(`Save failed: ${e?.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-paper">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-luxury-paper flex flex-col">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/configurator')}
            className="p-2 text-gray-500 hover:text-luxury-black hover:bg-slate-100 rounded-lg"
            title="Back to chooser"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold">Admin · Custom Builder</p>
            <h1 className="text-lg font-serif text-luxury-black leading-tight">
              {submission?.name ? `${submission.name}` : 'Multi-section pergola'}
            </h1>
            {submission?.email && (
              <p className="text-[11px] text-gray-500">{submission.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Total</p>
            <p className="text-lg font-bold text-luxury-black">{formatCAD(pricing.total)}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !submissionId || !dirty}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-luxury-gold text-luxury-black rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-luxury-gold/90 disabled:opacity-50"
            title={!submissionId ? 'Open this builder from a CRM record to save' : ''}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-0 overflow-hidden">
        {/* ── Sidebar ────────────────────────────────────────────────── */}
        <aside className="bg-white border-r border-slate-200 overflow-y-auto p-5 space-y-6">
          {/* Sections */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Sections</h2>
              <button
                onClick={addSection}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30 rounded-lg text-[11px] font-bold hover:bg-luxury-gold hover:text-white"
              >
                <Plus className="w-3 h-3" /> Add Section
              </button>
            </div>
            <div className="space-y-2.5">
              {sections.map((s, idx) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  index={idx}
                  canRemove={sections.length > 1}
                  onChange={(patch) => updateSection(s.id, patch)}
                  onRemove={() => removeSection(s.id)}
                />
              ))}
              {sections.length === 0 && (
                <p className="text-xs text-gray-400 italic">No sections yet — click Add Section.</p>
              )}
            </div>
            <div className="mt-3 px-3 py-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 flex items-center gap-2">
              <Box className="w-3.5 h-3.5" />
              Footprint: <span className="font-semibold text-slate-800">{layout.totalWidth}'</span> wide ×
              <span className="font-semibold text-slate-800">{layout.maxDepth}'</span> deep
            </div>
          </section>

          {/* Shared controls */}
          <section>
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-3">Shared</h2>
            <label className="block mb-3">
              <span className="block text-[11px] font-semibold text-luxury-black mb-1">Height (ft)</span>
              <input
                type="number"
                min={7}
                max={14}
                step={0.5}
                value={height}
                onChange={(e) => { setHeight(Number(e.target.value) || 9); setDirty(true); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold"
              />
            </label>
            <ColorSelect
              label="Frame Color"
              valueId={frameColorId}
              onChange={(id) => { setFrameColorId(id); setDirty(true); }}
            />
            <ColorSelect
              label="Louver Color"
              valueId={louverColorId}
              onChange={(id) => { setLouverColorId(id); setDirty(true); }}
            />
          </section>

          {/* Accessories — flat-priced only in Phase 1 */}
          <section>
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-3">Accessories</h2>
            <p className="text-[11px] text-gray-400 italic mb-2">
              Flat-priced items only. Edge-bound items (screens / privacy walls) can be added from the CRM Pricing tab after saving.
            </p>
            <div className="space-y-1.5">
              {ACCESSORIES.filter((a) => a.type === 'flat').map((acc) => {
                const checked = accessoryIds.includes(acc.id);
                const qty = accessoryQuantities[acc.id] || 1;
                return (
                  <label
                    key={acc.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      checked ? 'bg-luxury-gold/10 border-luxury-gold/40' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccessory(acc.id)}
                      className="rounded text-luxury-gold focus:ring-luxury-gold"
                    />
                    <span className="flex-1 text-xs font-semibold text-luxury-black">{acc.name}</span>
                    <span className="text-[11px] text-gray-500">{formatCAD(acc.price)}</span>
                    {checked && acc.quantifiable && (
                      <input
                        type="number"
                        min={1}
                        max={acc.maxQuantity || 4}
                        value={qty}
                        onChange={(e) => setQty(acc.id, Number(e.target.value))}
                        className="w-12 px-1 py-0.5 text-xs border border-slate-200 rounded text-center"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          {/* Price breakdown */}
          <section className="bg-luxury-paper border border-slate-200 rounded-lg p-4">
            <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Price Summary</h2>
            <div className="space-y-1 text-xs">
              {pricing.perSection.map((p, i) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-slate-600">Section {i + 1}</span>
                  <span className="font-medium text-slate-900">
                    {p.price === null ? <span className="text-rose-500">out of range</span> : formatCAD(p.price)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-600">Base price</span>
                <span className="font-medium">{formatCAD(pricing.basePrice)}</span>
              </div>
              {pricing.accessories > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Accessories</span>
                  <span className="font-medium">{formatCAD(pricing.accessories)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-medium">{formatCAD(pricing.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">HST (13%)</span>
                <span className="font-medium">{formatCAD(pricing.hst)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold">
                <span>Total</span>
                <span className="text-luxury-gold">{formatCAD(pricing.total)}</span>
              </div>
            </div>
          </section>

          {!submissionId && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>Sandbox mode.</strong> Open this builder from a CRM record (Edit Configuration → Custom) to save changes.
            </div>
          )}
        </aside>

        {/* ── 3D Preview ─────────────────────────────────────────────── */}
        <main className="relative bg-slate-100 min-h-[400px] lg:min-h-0">
          <div className="absolute top-3 left-3 z-10 inline-flex items-center bg-white/90 backdrop-blur rounded-lg border border-slate-200 shadow-sm">
            <button
              onClick={() => setView('persp')}
              className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest rounded-l-lg ${
                view === 'persp' ? 'bg-luxury-black text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3 h-3 inline mr-1" /> 3D
            </button>
            <button
              onClick={() => setView('top')}
              className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest rounded-r-lg ${
                view === 'top' ? 'bg-luxury-black text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Top
            </button>
          </div>
          <div className="absolute inset-0">
            <MultiSectionPreview
              sections={sections}
              height={height}
              frameColor={frameColor.hex}
              louverColor={louverColor.hex}
              view={view}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────
function SectionCard({
  section,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  section: PergolaSection;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<PergolaSection>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/40">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest font-bold text-luxury-black">
          Section {index + 1}
        </span>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30"
          title={canRemove ? 'Remove section' : 'At least one section required'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] font-semibold text-gray-500 mb-1">Width (ft)</span>
          <input
            type="number"
            min={8}
            max={40}
            step={0.5}
            value={section.width}
            onChange={(e) => onChange({ width: Number(e.target.value) || 0 })}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-luxury-gold"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold text-gray-500 mb-1">Depth (ft)</span>
          <input
            type="number"
            min={7}
            max={100}
            step={0.5}
            value={section.depth}
            onChange={(e) => onChange({ depth: Number(e.target.value) || 0 })}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-luxury-gold"
          />
        </label>
      </div>
      <div>
        <span className="block text-[10px] font-semibold text-gray-500 mb-1">Louver Direction</span>
        <div className="grid grid-cols-2 gap-1.5">
          <OrientationButton
            active={section.louverOrientation === 'depth'}
            onClick={() => onChange({ louverOrientation: 'depth' })}
            label="Parallel to Depth"
            glyph="‖‖‖"
          />
          <OrientationButton
            active={section.louverOrientation === 'width'}
            onClick={() => onChange({ louverOrientation: 'width' })}
            label="Parallel to Width"
            glyph="≡≡≡"
          />
        </div>
      </div>
    </div>
  );
}

function OrientationButton({
  active,
  onClick,
  label,
  glyph,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded border text-[10px] font-semibold leading-tight transition-colors ${
        active
          ? 'bg-luxury-black text-white border-luxury-black'
          : 'bg-white border-slate-200 text-slate-600 hover:border-luxury-gold'
      }`}
    >
      <span className={`text-base ${active ? 'text-luxury-gold' : 'text-slate-400'}`}>{glyph}</span>
      <span>{label}</span>
    </button>
  );
}

function ColorSelect({
  label,
  valueId,
  onChange,
}: {
  label: string;
  valueId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] font-semibold text-luxury-black mb-1">{label}</span>
      <div className="grid grid-cols-4 gap-1.5">
        {COLORS.map((c) => {
          const active = c.id === valueId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`group flex flex-col items-center gap-1 p-1.5 rounded border transition-all ${
                active ? 'border-luxury-gold ring-2 ring-luxury-gold/30' : 'border-slate-200 hover:border-luxury-gold/50'
              }`}
              title={`${c.name} (${c.ral})`}
            >
              <span
                className="w-7 h-7 rounded border border-slate-300"
                style={{ background: c.hex }}
              />
              <span className="text-[9px] leading-tight text-slate-700 line-clamp-2 text-center">
                {c.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </label>
  );
}
