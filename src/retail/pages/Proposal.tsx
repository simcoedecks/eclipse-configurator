import { useEffect, useState, useRef, Suspense, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp, increment, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../shared/firebase';
import { Mail, Phone, MapPin, Calendar, FileText, Download, Loader2, CheckCircle2, Shield, Clock, PenLine, X, Eraser, User } from 'lucide-react';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import { COLORS } from '../../shared/lib/colors';
import { computeFinalPricing, computeAdditionalPergolaPrice } from '../../shared/lib/pricingMath';
import { ACCESSORIES } from '../../shared/lib/accessories';
import { calculateScreenPrice } from '../../shared/lib/pricing';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

/**
 * Top-down plan with dimension lines that run edge-to-edge of the
 * actual rendered pergola. Computes pergola edges using the same
 * orthographic zoom as PergolaVisualizer (zoom = 300 / max(W, D))
 * and the measured canvas container dimensions.
 *
 * Pergola's ortho viewport:
 *   viewportWidth_world  = canvasW / zoom
 *   viewportHeight_world = canvasH / zoom
 *   pergola is centered at origin, so its screen edges are:
 *     left   = canvasW/2 - (width / 2) * zoom
 *     right  = canvasW/2 + (width / 2) * zoom
 *     top    = canvasH/2 - (depth / 2) * zoom
 *     bottom = canvasH/2 + (depth / 2) * zoom
 */
function TopViewWithDimensions({ visProps }: { visProps: any }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const update = () => setRect({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxDim = Math.max(visProps.width, visProps.depth);
  const zoom = 300 / maxDim;            // matches PergolaVisualizer's ortho
  const pergolaW = visProps.width * zoom;
  const pergolaD = visProps.depth * zoom;
  const leftPx = Math.max(0, rect.w / 2 - pergolaW / 2);
  const rightPx = Math.min(rect.w, rect.w / 2 + pergolaW / 2);
  const topPx = Math.max(0, rect.h / 2 - pergolaD / 2);
  const bottomPx = Math.min(rect.h, rect.h / 2 + pergolaD / 2);
  // Offsets from the pergola so lines don't overlap the drawing itself
  const outerOffset = 18; // px

  const ready = rect.w > 0 && rect.h > 0;

  return (
    <div>
      <div className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500 bg-luxury-paper border-b border-luxury-cream">
        Top-Down Plan · Dimensions
      </div>
      <div ref={wrapperRef} className="relative h-[360px] bg-[#f1f5f9]">
        <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>}>
          <PergolaVisualizer {...visProps} view="top" staticMode />
        </Suspense>
        {ready && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Width dimension — sits above the pergola's top edge */}
            <div
              className="absolute"
              style={{
                left: leftPx,
                width: rightPx - leftPx,
                top: Math.max(4, topPx - outerOffset),
                height: 1,
              }}
            >
              <div className="relative w-full h-px bg-luxury-black/70">
                {/* Slash ticks at each end */}
                <div className="absolute left-0 top-1/2 h-3 w-px bg-luxury-black/70" style={{ transform: 'translate(-50%, -50%) rotate(20deg)' }} />
                <div className="absolute right-0 top-1/2 h-3 w-px bg-luxury-black/70" style={{ transform: 'translate(50%, -50%) rotate(20deg)' }} />
                {/* Label centered over the line */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="px-2 py-0.5 bg-[#f1f5f9] text-[11px] font-bold text-luxury-black whitespace-nowrap">
                    {visProps.width}'
                  </span>
                </div>
              </div>
            </div>

            {/* Depth dimension — sits to the left of the pergola */}
            <div
              className="absolute"
              style={{
                top: topPx,
                height: bottomPx - topPx,
                left: Math.max(4, leftPx - outerOffset),
                width: 1,
              }}
            >
              <div className="relative h-full w-px bg-luxury-black/70">
                <div className="absolute top-0 left-1/2 w-3 h-px bg-luxury-black/70" style={{ transform: 'translate(-50%, -50%) rotate(20deg)' }} />
                <div className="absolute bottom-0 left-1/2 w-3 h-px bg-luxury-black/70" style={{ transform: 'translate(-50%, 50%) rotate(20deg)' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="px-2 py-0.5 bg-[#f1f5f9] text-[11px] font-bold text-luxury-black whitespace-nowrap">
                    {visProps.depth}'
                  </span>
                </div>
              </div>
            </div>

            {/* Height callout — anchored to the pergola's top-right corner
                with a leader line so it reads as part of the dimension stack */}
            <div
              className="absolute"
              style={{
                left: rightPx + 4,
                top: Math.max(4, topPx - outerOffset - 2),
              }}
            >
              <span className="px-2 py-0.5 bg-white border border-luxury-gold/60 rounded text-[11px] font-bold text-luxury-black shadow-sm whitespace-nowrap">
                H · {visProps.height}'
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Popular Add-Ons — shown at the bottom of the proposal for items
 * the customer hasn't selected yet. Each item is selectable via a
 * checkbox; a "Request These Upgrades" button opens an email to
 * sales with the customer's name + list of selected items and their
 * calculated prices for this pergola.
 *
 * No Firestore write — the upgrade request flows as an email so it
 * doesn't require a rule change. Sales can then add the items via
 * the CRM Pricing Editor or by having the customer re-accept.
 */
function PopularAddOns({ submission }: { submission: any }) {
  const cfg = submission?.configuration || {};
  const width = Number(cfg.width) || 0;
  const depth = Number(cfg.depth) || 0;
  const height = Number(cfg.height) || 9;
  if (!width || !depth) return null;

  // Work out what's already selected
  const selectedIds = new Set<string>();
  if (Array.isArray(cfg.accessoryIds)) cfg.accessoryIds.forEach((id: string) => selectedIds.add(id));
  else if (Array.isArray(cfg.accessories)) {
    for (const name of cfg.accessories) {
      const bare = String(name).split(' × ')[0];
      const hit = ACCESSORIES.find(a => a.name === bare);
      if (hit) selectedIds.add(hit.id);
    }
  }

  const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
  // Only show accessories actually surfaced on Phase 3 / Phase 4 of
  // the configurator — skip "extras" like LED, audio, in-lite scope/halo
  // and guillotine windows which aren't in the primary add-on list.
  const PHASE_3_4_IDS = new Set([
    // Phase 3 — Privacy & Protection
    'screen_front', 'screen_back', 'screen_left', 'screen_right',
    'wall_front', 'wall_back', 'wall_left', 'wall_right',
    // Phase 4 — Optional Features
    'sensor', 'app_control', 'fan', 'heater',
  ]);
  // Screens only split into multiple bays when there's a physical
  // middle post — matches the live configurator logic. Without this
  // a 20' side would incorrectly price as two 10' screens.
  const maxBay = Number(cfg.maxBaySpanOverride) || 20;
  const screenBaysX = width > maxBay ? Math.ceil(width / 13) : 1;
  const screenBaysZ = depth > maxBay ? Math.ceil(depth / 20) : 1;
  // A side with a structural (house) wall can't have a screen OR a privacy
  // wall upgrade suggested on it — the side is already closed off.
  const houseWallSides = new Set<string>(Array.isArray(cfg.houseWalls) ? cfg.houseWalls : []);
  // A side is "closed" if it already has a structural wall, a motorized
  // screen, a privacy wall, OR has any per-section customization — in
  // any of those cases, don't offer the opposite enclosure as an upsell.
  // Per-section mode on even one bay means the side is being handled
  // bay-by-bay and a side-wide upsell would be wrong/double-counted.
  const closedSides = new Set<string>(houseWallSides);
  for (const id of selectedIds) {
    const m = id.match(/^(screen|wall)_(front|back|left|right)$/);
    if (m) closedSides.add(m[2]);
  }
  const sectionChoices = (cfg.sectionChoices || {}) as Record<string, any[]>;
  for (const side of ['front','back','left','right']) {
    const arr = sectionChoices[side];
    if (Array.isArray(arr) && arr.length > 0) closedSides.add(side);
  }
  const blockedBySide = (id: string) => {
    const m = id.match(/^(screen|wall)_(front|back|left|right)$/);
    return m ? closedSides.has(m[2]) : false;
  };
  const unused = ACCESSORIES
    .filter(a => PHASE_3_4_IDS.has(a.id) && !selectedIds.has(a.id) && !blockedBySide(a.id))
    .map(a => {
      let price = 0;
      if (a.type === 'flat') price = a.price;
      else if (a.type === 'sqft') price = a.price * (width * depth);
      else if (a.type === 'screen_width') price = calculateScreenPrice(width, height, screenBaysX);
      else if (a.type === 'screen_depth') price = calculateScreenPrice(depth, height, screenBaysZ);
      else if (a.type === 'wall_width') price = width * height * wallUnitPrice;
      else if (a.type === 'wall_depth') price = depth * height * wallUnitPrice;
      return { id: a.id, name: a.name, description: a.description, price, imageUrl: a.imageUrl };
    })
    .filter(a => a.price > 0);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);

  if (unused.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const pickedItems = unused.filter(u => picked.has(u.id));
  const pickedTotal = pickedItems.reduce((s, i) => s + i.price, 0);

  const sendRequest = () => {
    if (pickedItems.length === 0) return;
    const subject = `Upgrade Request — ${submission.name || 'Proposal'} ${typeof submission.jobNumber === 'number' ? `(Job #${submission.jobNumber})` : ''}`;
    const body = [
      `Hi Eclipse team,`,
      ``,
      `I'd like to add the following upgrades to my pergola proposal:`,
      ``,
      ...pickedItems.map(i => `  • ${i.name} — $${Math.round(i.price).toLocaleString()}`),
      ``,
      `Upgrade subtotal: $${Math.round(pickedTotal).toLocaleString()}`,
      ``,
      `Proposal link: ${typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''}`,
      ``,
      `Thank you,`,
      `${submission.name || ''}`,
    ].join('\n');
    const mailto = `mailto:info@eclipsepergola.ca?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8 lg:p-12">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-1">Popular Add-Ons</p>
          <h2 className="text-xl font-serif text-luxury-black">Make It Yours</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Upgrades others frequently add after seeing their pergola come together. Select any you'd like us to include and we'll send a revised quote.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {unused.map(item => {
          const isPicked = picked.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={`group text-left rounded-xl border overflow-hidden transition-all flex flex-col ${
                isPicked
                  ? 'border-luxury-gold ring-2 ring-luxury-gold/40 shadow-md'
                  : 'border-luxury-cream bg-white hover:border-luxury-gold/60 hover:shadow-md'
              }`}
            >
              {/* Image — hero area */}
              <div className="relative w-full h-36 bg-luxury-paper overflow-hidden">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 italic">
                    No image
                  </div>
                )}
                {/* Selected indicator */}
                <div className={`absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                  isPicked
                    ? 'bg-luxury-gold border-luxury-gold shadow-lg'
                    : 'bg-white/90 border-white/80 group-hover:border-luxury-gold'
                }`}>
                  {isPicked ? (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-luxury-gold font-bold text-sm">+</span>
                  )}
                </div>
                {/* Price pill overlays the image */}
                <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-luxury-gold text-luxury-black rounded-full text-xs font-bold shadow-sm">
                  +${Math.round(item.price).toLocaleString()}
                </span>
              </div>
              {/* Text body */}
              <div className="p-3 flex-1">
                <p className="text-sm font-semibold text-luxury-black mb-1">{item.name}</p>
                {item.description && (
                  <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{item.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {pickedItems.length > 0 && (
        <div className="mt-6 pt-5 border-t border-luxury-cream flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
              {pickedItems.length} upgrade{pickedItems.length === 1 ? '' : 's'} selected
            </p>
            <p className="text-xl font-serif text-luxury-black mt-0.5">
              +${Math.round(pickedTotal).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={sendRequest}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-luxury-black text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-luxury-black/90"
          >
            {sent ? 'Request sent ✓' : 'Request These Upgrades'}
          </button>
        </div>
      )}
      {pickedItems.length === 0 && (
        <p className="mt-5 text-[11px] italic text-gray-400 text-center">
          Select one or more items above to request a revised quote.
        </p>
      )}
    </section>
  );
}

/** Public customer-facing proposal view — accessed by token in URL.
 *  Phase 1: read-only mirror of the PDF content.
 *  Later phases will add: interactive upgrade toggles, e-signature, admin analytics.
 */
export default function Proposal() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string>('');
  const [showSignModal, setShowSignModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  /** Capture the proposal content area as a multi-page PDF.
   *  Each top-level section is captured separately so page breaks
   *  land between sections (never mid-section). Any section that's
   *  taller than one page is sliced as a last resort.
   *  Clones the content into an off-screen fixed-width container so
   *  the output is perfectly centered regardless of viewport size. */
  const handleDownloadPdf = async () => {
    if (!contentRef.current || generatingPdf) return;
    setGeneratingPdf(true);
    let offscreen: HTMLDivElement | null = null;
    try {
      // Wait longer for the 3D scene to finish its initial render —
      // Three.js + React-Fiber can take 1-2s on first paint.
      await new Promise(r => setTimeout(r, 2000));

      const targetWidth = 800; // CSS px — matches ~portrait A4 at 96dpi
      const source = contentRef.current;

      // BEFORE cloning, snapshot every live <canvas> (the WebGL context
      // doesn't survive cloneNode — the cloned canvas is blank). We'll
      // swap the blank clones with <img> elements holding the pixel data.
      const canvasSnapshots: string[] = [];
      const originalCanvases = source.querySelectorAll('canvas');
      originalCanvases.forEach(canvas => {
        try {
          canvasSnapshots.push(canvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('Could not snapshot canvas for PDF', e);
          canvasSnapshots.push('');
        }
      });

      offscreen = document.createElement('div');
      offscreen.style.position = 'fixed';
      offscreen.style.top = '0';
      offscreen.style.left = '-10000px';
      offscreen.style.width = targetWidth + 'px';
      offscreen.style.background = '#FAF9F6';
      offscreen.style.padding = '0';
      offscreen.style.margin = '0';
      const clone = source.cloneNode(true) as HTMLDivElement;
      clone.style.maxWidth = 'none';
      clone.style.width = '100%';
      clone.style.margin = '0';
      clone.style.padding = '0';
      clone.style.boxSizing = 'border-box';

      // Replace every cloned canvas with an <img> of its snapshot so
      // the 3D preview shows up in the PDF.
      const clonedCanvases = clone.querySelectorAll('canvas');
      clonedCanvases.forEach((clonedCanvas, i) => {
        const dataUrl = canvasSnapshots[i];
        if (!dataUrl) return;
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.display = 'block';
        img.style.width = '100%';
        img.style.height = 'auto';
        // Preserve the parent's aspect by matching the canvas's rendered size
        const originalCanvas = originalCanvases[i] as HTMLCanvasElement;
        if (originalCanvas) {
          const rect = originalCanvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            img.style.aspectRatio = `${rect.width} / ${rect.height}`;
          }
        }
        clonedCanvas.replaceWith(img);
      });

      offscreen.appendChild(clone);
      document.body.appendChild(offscreen);

      // Give cloned images a tick to load (canvas→img conversions are
      // data URLs so they're effectively immediate, but other assets
      // in the clone may still be fetching)
      await new Promise(r => setTimeout(r, 400));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();    // 210mm
      const pdfH = pdf.internal.pageSize.getHeight();   // 297mm
      const margin = 10;                                 // mm around page edges
      const targetMm = pdfW - margin * 2;
      const pageContentH = pdfH - margin * 2;

      // Direct children of the cloned content wrapper are our sections.
      // (Each <section> in Proposal.tsx renders as one of these.)
      const sections = Array.from(clone.children) as HTMLElement[];
      if (sections.length === 0) {
        throw new Error('No content sections found to render.');
      }

      let currentY = margin;
      let onFirstPage = true;
      const gapBetweenSections = 3; // mm of breathing room

      for (let idx = 0; idx < sections.length; idx++) {
        const section = sections[idx];
        // Capture this one section at 2x density
        const dataUrl = await toPng(section, {
          pixelRatio: 2,
          backgroundColor: '#FAF9F6',
          cacheBust: true,
          width: section.scrollWidth,
          height: section.scrollHeight,
        });
        const props = pdf.getImageProperties(dataUrl);
        const scale = targetMm / props.width;
        const scaledH = props.height * scale;

        const fitsOnCurrentPage = scaledH <= (pdfH - margin - currentY);

        if (scaledH <= pageContentH) {
          // Section fits on ONE page — if it doesn't fit in the current
          // remaining space, push to a new page (avoids mid-section break).
          if (!fitsOnCurrentPage && !onFirstPage) {
            pdf.addPage();
            currentY = margin;
          } else if (!fitsOnCurrentPage && onFirstPage) {
            // Still on first page but already over: reset (edge case)
            currentY = margin;
          }
          pdf.addImage(dataUrl, 'PNG', margin, currentY, targetMm, scaledH);
          currentY += scaledH + gapBetweenSections;
          onFirstPage = false;
        } else {
          // Section is taller than a single page — slice it across pages.
          // Start on a fresh page first so the slicing is clean.
          if (currentY > margin) {
            pdf.addPage();
            currentY = margin;
          }
          // Place image and slide up with each new page until it's shown
          let placedY = currentY;
          pdf.addImage(dataUrl, 'PNG', margin, placedY, targetMm, scaledH);
          let remaining = scaledH - (pageContentH - (currentY - margin));
          while (remaining > 0) {
            pdf.addPage();
            placedY -= (pageContentH - 2); // 2mm overlap so content doesn't drop between pages
            pdf.addImage(dataUrl, 'PNG', margin, placedY, targetMm, scaledH);
            remaining -= (pageContentH - 2);
          }
          currentY = margin;
          onFirstPage = false;
          // Force next section onto a fresh page (cleaner visual)
          if (idx < sections.length - 1) {
            pdf.addPage();
          }
        }
      }

      const filename = `Eclipse_Proposal_${(data?.name || 'Customer').replace(/\s+/g, '_')}.pdf`;
      pdf.save(filename);
      toast.success('Proposal PDF downloaded');
    } catch (err: any) {
      console.error('Proposal PDF download failed', err);
      toast.error(`PDF generation failed: ${err?.message || 'unknown error'}`);
    } finally {
      if (offscreen && offscreen.parentNode) {
        offscreen.parentNode.removeChild(offscreen);
      }
      setGeneratingPdf(false);
    }
  };

  /** If the URL has ?auto=1, trigger the download automatically once
   *  the content has rendered. Used by admin to "print" the customer
   *  view from the CRM without manual clicks. */
  useEffect(() => {
    if (loading || !data) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') === '1') {
      // Wait a bit for images / 3D to render, then auto-download
      const t = setTimeout(() => { handleDownloadPdf(); }, 1500);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  useEffect(() => {
    if (!id) {
      setError('Proposal link is invalid.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'submissions', id));
        if (!snap.exists()) {
          setError("We couldn't find this proposal. The link may be invalid or expired.");
        } else {
          setData({ id: snap.id, ...snap.data() });
        }
      } catch (e: any) {
        console.error(e);
        setError('Unable to load this proposal right now. Please try again or contact us.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Customer view tracking. Heartbeats every HEARTBEAT_SECONDS while the tab
  // is visible and increments customerTotalViewSeconds by that same amount,
  // so the stored total reflects actual reading time (not elapsed wall clock).
  // Skipped entirely for admin users (no auth = public customer view).
  useEffect(() => {
    if (!id || loading || error || !data) return;
    // Don't pollute customer stats when admin previews the page.
    if (auth.currentUser) return;

    const HEARTBEAT_SECONDS = 15;
    const submissionRef = doc(db, 'submissions', id);
    const sessionsRef = collection(db, 'submissions', id, 'viewSessions');

    // Aggregate stats on the submission doc (powers the at-a-glance pill
    // in the admin detail header).
    setDoc(
      submissionRef,
      {
        ...(data.customerFirstViewedAt
          ? {}
          : { customerFirstViewedAt: serverTimestamp() }),
        customerLastViewedAt: serverTimestamp(),
        customerViewCount: increment(1),
      },
      { merge: true }
    ).catch(e => console.warn('view-tracking: first-view write failed', e));

    // Per-session row in the activity timeline. Created here, updated by
    // each heartbeat with the current duration so the admin can see exactly
    // how long this individual visit lasted.
    let sessionDocRef: ReturnType<typeof doc> | null = null;
    let durationSec = 0;
    addDoc(sessionsRef, {
      startedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      durationSeconds: 0,
      userAgent: (navigator.userAgent || '').slice(0, 480),
    })
      .then((ref) => { sessionDocRef = ref; })
      .catch((e) => console.warn('view-tracking: session create failed', e));

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const heartbeat = () => {
      durationSec += HEARTBEAT_SECONDS;
      setDoc(
        submissionRef,
        {
          customerLastViewedAt: serverTimestamp(),
          customerTotalViewSeconds: increment(HEARTBEAT_SECONDS),
        },
        { merge: true }
      ).catch(e => console.warn('view-tracking: heartbeat failed', e));
      if (sessionDocRef) {
        updateDoc(sessionDocRef, {
          lastActiveAt: serverTimestamp(),
          durationSeconds: durationSec,
        }).catch(e => console.warn('view-tracking: session heartbeat failed', e));
      }
    };

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(heartbeat, HEARTBEAT_SECONDS * 1000);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
    // Only depend on id + the loaded state. We intentionally do NOT depend on
    // `data` to avoid restarting the timer every time the doc updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, error, !!data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#C5A059] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading your proposal…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-10 mx-auto mb-6 opacity-80" />
          <h1 className="text-xl font-serif text-luxury-black mb-3">Proposal Unavailable</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{error || 'Something went wrong.'}</p>
          <a href="https://eclipsepergola.netlify.app" className="inline-block mt-6 text-xs uppercase tracking-widest font-bold text-luxury-gold hover:underline">
            Visit Eclipse Pergola →
          </a>
        </div>
      </div>
    );
  }

  const cfg = data.configuration || {};
  const pb = data.pricingBreakdown || {};
  const customLineItems = data.customLineItems || [];
  const additionalPergolas = data.additionalPergolas || [];
  const finalPricing = computeFinalPricing(pb, customLineItems, additionalPergolas);
  const customCharges = customLineItems.filter((i: any) => i.kind !== 'discount');
  const customDiscounts = customLineItems.filter((i: any) => i.kind === 'discount');
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
  const fmt = (n: number) => typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : '—';

  const frameHex = COLORS.find(c => c.name === cfg.frameColor)?.hex || '#0A0A0A';
  const louverHex = COLORS.find(c => c.name === cfg.louverColor)?.hex || '#F6F6F6';

  // Group accessories for display
  const items = pb.itemizedAccessories || [];
  const wallCoverages = items.filter((i: any) =>
    i.id?.startsWith('screen_') || i.id?.startsWith('wall_') || i.id?.startsWith('guillotine_')
  );
  const addOns = items.filter((i: any) =>
    !i.id?.startsWith('screen_') && !i.id?.startsWith('wall_') && !i.id?.startsWith('guillotine_') && i.id !== 'louver-upgrade'
  );
  const louverUpgrade = items.find((i: any) => i.id === 'louver-upgrade');

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Header */}
      <header className="bg-white border-b border-luxury-cream sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-8 object-contain" />
          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest font-bold text-luxury-black border border-luxury-black/20 rounded hover:bg-luxury-black hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {generatingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {generatingPdf ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div ref={contentRef} className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Cover */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8 lg:p-12">
          {/* Brand mark — always rendered (unlike the sticky header which
              is hidden in print/PDF) so it appears on downloaded PDFs and
              anywhere the proposal is embedded. */}
          <div className="flex justify-center mb-6 pb-6 border-b border-luxury-cream">
            <img src="/logo.png" alt="Eclipse Pergola" className="h-24 object-contain" crossOrigin="anonymous" />
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8 pb-6 border-b-2 border-luxury-gold">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Your Bespoke Proposal</p>
              <h1 className="text-3xl lg:text-4xl font-serif text-luxury-black">Hello, {data.name}</h1>
              {createdAt && (
                <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Prepared {createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-gray-500 leading-relaxed">
              <p className="font-bold text-luxury-black">Eclipse Aluminum Pergola</p>
              <p>www.eclipsepergola.ca</p>
              <p>info@eclipsepergola.ca</p>
              <p>289-855-2977</p>
            </div>
          </div>

          {/* Customer Information block — mirrors what the admin CRM sees */}
          {(data.name || data.email || data.phone || data.address || data.city) && (
            <div className="mb-6 pb-6 border-b border-luxury-cream grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Prepared For</p>
              </div>
              {data.name && (
                <div className="flex items-start gap-2">
                  <User className="w-3.5 h-3.5 text-luxury-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Name</p>
                    <p className="text-luxury-black font-medium">{data.name}</p>
                  </div>
                </div>
              )}
              {data.email && (
                <div className="flex items-start gap-2">
                  <Mail className="w-3.5 h-3.5 text-luxury-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Email</p>
                    <a href={`mailto:${data.email}`} className="text-luxury-black font-medium hover:text-luxury-gold break-all">{data.email}</a>
                  </div>
                </div>
              )}
              {data.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-luxury-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Phone</p>
                    <a href={`tel:${data.phone}`} className="text-luxury-black font-medium hover:text-luxury-gold">{data.phone}</a>
                  </div>
                </div>
              )}
              {(data.address || data.city) && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-luxury-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Site Address</p>
                    <p className="text-luxury-black font-medium">
                      {data.address && <span>{data.address}<br /></span>}
                      {data.city && <span>{data.city}</span>}
                    </p>
                  </div>
                </div>
              )}
              {typeof data.jobNumber === 'number' && (
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-luxury-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400">Job Number</p>
                    <p className="text-luxury-black font-medium font-mono">#{data.jobNumber}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] text-gray-600 leading-relaxed max-w-3xl space-y-2">
            <p>
              Each custom pergola proposal/quote is prepared based on the information provided
              to Eclipse Pergola Inc. gathered by the professional service provider listed above.
            </p>
            <p>It is the responsibility of the professional estimating to verify accurate site data.</p>
            <p>
              Any pricing details below were generated based on your size selection into the
              Eclipse Pergola 3D Configurator / Order Builder, or using information provided to
              us by phone, email or web quote request.
            </p>
            <p>
              It is the responsibility of the professional to review all measurement details in
              this agreement before approving any orders for production. Once deposit is verified,
              you will automatically receive proof of payment and proof of production timeline
              commencement. This places your bespoke aluminum pergola into manufacturing queue.
              Length and width measurements cannot be changed after this point without change
              order fees.
            </p>
            <p>All pergola RAL colours or Woodgrain Selections must be approved.</p>
            <p>Motorized screen Opacity and Colour Selection must be approved.</p>
            <p>
              Eclipse Pergola provides a two week grace period for design selections to be
              finalized. If colour selection, or fabric selection is not yet verified by the
              customer at time the time of placing your order, an addendum must be approved
              within 2 weeks of approval to maintain delivery schedule. Custom Pergola orders
              are estimated at 6-8 weeks.
            </p>
            <p>
              Payment terms are non-negotiable. All orders must be paid in full before goods
              are released for pickup/ delivery. Delivery Fees vary across North America.
            </p>
            <p>
              Price includes supply only unless otherwise noted. All installation to be completed
              by the Eclipse Authorized professional contractor/service provider listed above.
              On-site assistance provided by Eclipse Pergola for initial installation. Eclipse
              Pergola offers full support on our Pergola System, Enclosure Options, Comfort
              Options, Programing etc. Professionals have access to Training Documents/Instructions,
              Virtual Assembly Configurator, and Installation Videos. It is the responsibility of
              the authorized service provider to uphold manufacturers installation specifications
              on all installations.
            </p>
            <p>
              Pergola Foundations are not included or available through Eclipse Pergola.
              Contractors are responsible to ensure foundations are suitable for mounting in
              accordance with local building department code, and manufacturers mounting
              guidelines. Acceptable Foundations vary Province to Province / State to State.
            </p>
          </div>

        </section>

        {/* 3D Visualizer — Perspective (large) + Front + Top (small) */}
        {(cfg.width || cfg.depth) && (() => {
          const visProps = {
            width: Number(cfg.width) || 12,
            depth: Number(cfg.depth) || 16,
            height: Number(cfg.height) || 9,
            accessories: new Set<string>(items.map((i: any) => i.id).filter(Boolean)),
            frameColor: frameHex,
            louverColor: louverHex,
            louverAngle: 0,
            screenDrop: 100,
            guillotineOpen: 50,
            wallColor: frameHex,
            houseWallColor: '#e2e8f0',
            houseWall: 'none' as const,
            // Thread the saved structure/section/admin config through
            // so the customer-facing proposal matches what they
            // designed (or what the admin customized).
            houseWalls: new Set<'back'|'front'|'left'|'right'>((cfg.houseWalls || []) as any),
            houseWallLengths: cfg.houseWallLengths || {},
            houseWallAnchors: cfg.houseWallAnchors || {},
            houseWallExtensions: cfg.houseWallExtensions || {},
            sectionChoices: cfg.sectionChoices || {},
            maxLouverSpanOverride: cfg.maxLouverSpanOverride,
            maxBaySpanOverride: cfg.maxBaySpanOverride,
            forceMiddleXPost: !!cfg.forceMiddleXPost,
            forceMiddleZPost: !!cfg.forceMiddleZPost,
          };
          return (
            <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream overflow-hidden">
              <div className="p-6 border-b border-luxury-cream">
                <h2 className="text-lg font-serif text-luxury-black">Your Design</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {cfg.width}' × {cfg.depth}' × {cfg.height}' • {cfg.frameColor} frame • {cfg.louverColor} louvers
                </p>
              </div>
              {/* Top row — top-down plan (with dimensions) + front elevation */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-luxury-cream border-b border-luxury-cream">
                <div>
                  <TopViewWithDimensions visProps={visProps} />
                </div>
                <div>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500 bg-luxury-paper border-b border-luxury-cream">
                    Front View
                  </div>
                  <div className="h-[360px] bg-[#f1f5f9]">
                    <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>}>
                      <PergolaVisualizer {...visProps} view="perspective-front" staticMode />
                    </Suspense>
                  </div>
                </div>
              </div>
              {/* Bottom — 3D perspective */}
              <div>
                <div className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-gray-500 bg-luxury-paper border-b border-luxury-cream">
                  3D Perspective
                </div>
                <div className="h-[420px] bg-[#f1f5f9]">
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-400">Loading…</div>}>
                    <PergolaVisualizer {...visProps} view="perspective" />
                  </Suspense>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Pricing Breakdown */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8 lg:p-12">
          <h2 className="text-lg font-serif text-luxury-black mb-6">Investment Breakdown</h2>

          <div className="space-y-5">
            {/* Pergola base */}
            <div className="flex justify-between items-start pb-4 border-b border-luxury-cream">
              <div>
                <p className="font-medium text-luxury-black">Motorized Aluminum Louvered Pergola</p>
                <p className="text-xs text-gray-500 mt-1">Includes motorized louver system &amp; LED perimeter lighting</p>
              </div>
              <span className="font-serif text-luxury-gold text-lg">{fmt(pb.basePrice)}</span>
            </div>

            {louverUpgrade && (
              <div className="flex justify-between items-center pl-5 text-sm">
                <span className="text-gray-700 italic">↳ {louverUpgrade.name}</span>
                <span className="font-medium text-gray-700">{fmt(louverUpgrade.cost)}</span>
              </div>
            )}

            {/* Wall coverages */}
            {wallCoverages.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Wall Coverages</p>
                <div className="space-y-1">
                  {wallCoverages.map((i: any) => (
                    <div key={i.id} className="flex justify-between items-center text-sm py-1">
                      <span className="text-gray-700">{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                      <span className="font-medium text-gray-900">{fmt(i.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add-ons */}
            {addOns.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Add-Ons &amp; Features</p>
                <div className="space-y-1">
                  {addOns.map((i: any) => (
                    <div key={i.id} className="flex justify-between items-center text-sm py-1">
                      <span className="text-gray-700">{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                      <span className="font-medium text-gray-900">{fmt(i.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional pergolas on the same project */}
            {additionalPergolas.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Additional Pergolas</p>
                <div className="space-y-3">
                  {additionalPergolas.map((p: any) => (
                    <div key={p.id} className="border border-luxury-cream rounded-lg p-3">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-semibold text-luxury-black">{p.label}</p>
                          <p className="text-[11px] text-gray-500">
                            {p.width}' × {p.depth}' × {p.height}' • {p.frameColor} frame • {p.louverColor} louvers
                          </p>
                          {p.notes && <p className="text-[11px] text-gray-500 italic mt-1">{p.notes}</p>}
                        </div>
                        <span className="font-serif text-luxury-gold text-lg whitespace-nowrap ml-2">{fmt(computeAdditionalPergolaPrice(p))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom additions (admin-added) */}
            {customCharges.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Additional Items</p>
                <div className="space-y-1">
                  {customCharges.map((i: any) => (
                    <div key={i.id} className="flex justify-between items-start text-sm py-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {i.tbd && (
                            <span className="inline-flex items-center text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              TBD
                            </span>
                          )}
                          <span className="text-gray-700">{i.name}{!i.tbd && i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                        </div>
                        {i.description && <p className="text-[11px] text-gray-400 italic">{i.description}</p>}
                      </div>
                      <span className={`font-medium whitespace-nowrap ml-2 ${i.tbd ? 'text-amber-700 font-bold' : 'text-gray-900'}`}>
                        {i.tbd ? 'TBD' : fmt((i.amount || 0) * (i.quantity || 1))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom discounts */}
            {customDiscounts.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-700 mb-2">Discounts &amp; Credits</p>
                <div className="space-y-1">
                  {customDiscounts.map((i: any) => (
                    <div key={i.id} className="flex justify-between items-start text-sm py-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {i.tbd && (
                            <span className="inline-flex items-center text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              TBD
                            </span>
                          )}
                          <span className="text-emerald-800">{i.name}{!i.tbd && i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                        </div>
                        {i.description && <p className="text-[11px] text-gray-400 italic">{i.description}</p>}
                      </div>
                      <span className={`font-medium whitespace-nowrap ml-2 ${i.tbd ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}>
                        {i.tbd ? 'TBD' : `−${fmt((i.amount || 0) * (i.quantity || 1))}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="pt-5 mt-5 border-t border-luxury-cream space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{fmt(finalPricing.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">HST (13%)</span>
                <span className="font-medium">{fmt(finalPricing.hst)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 mt-3 border-t-2 border-luxury-gold">
                <span className="text-sm font-bold uppercase tracking-widest text-luxury-black">Total Investment</span>
                <span className="text-3xl font-serif text-luxury-gold">{fmt(finalPricing.total)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-luxury-cream space-y-2 text-[11px] italic text-gray-500 leading-relaxed">
            <p>
              Pricing includes installation under normal circumstances. Should any additional work be required, the price will be adjusted to reflect the revised scope.
            </p>
            <p>
              Please note that the configurator is provided for budgetary purposes only. Each pergola must be finalized with a site visit so we can provide an accurate final quote based on the specific site conditions and project details.
            </p>
          </div>
        </section>

        {/* Payment Terms */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8 lg:p-12">
          <h2 className="text-lg font-serif text-luxury-black mb-6">Payment Terms</h2>
          <div className="space-y-3">
            {[
              { pct: '50%', when: 'Due on signing', note: 'Deposit to begin production' },
              { pct: '30%', when: 'Due on pergola delivery', note: 'Prior to installation' },
              { pct: '20%', when: 'Due on screen delivery', note: 'Final payment' },
            ].map((t, i) => (
              <div key={i} className="flex justify-between items-center border-b border-luxury-cream pb-3 last:border-0">
                <div>
                  <p className="font-bold text-luxury-black">{t.pct} {t.when}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
            Payments accepted via wire transfer, Interac e-Transfer to <span className="font-medium text-luxury-black">info@eclipsepergola.ca</span>, cash, or cheque payable to "Eclipse Pergola Inc."<br />
            *Cheque payments add 5 business days for verification. <span className="font-bold">GST/HST: 72135 6426 RT0001</span>
          </p>
        </section>

        {/* Warranty & Trust */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-luxury-black text-white rounded-2xl p-6 flex flex-col items-start">
            <Shield className="w-6 h-6 text-luxury-gold mb-3" />
            <p className="text-luxury-gold font-bold text-sm uppercase tracking-wider">10 Year Warranty</p>
            <p className="text-xs text-white/70 mt-1">Structure &amp; powder coating</p>
          </div>
          <div className="bg-luxury-black text-white rounded-2xl p-6 flex flex-col items-start">
            <Clock className="w-6 h-6 text-luxury-gold mb-3" />
            <p className="text-luxury-gold font-bold text-sm uppercase tracking-wider">5 Year Warranty</p>
            <p className="text-xs text-white/70 mt-1">Motors &amp; electronics</p>
          </div>
          <div className="bg-luxury-black text-white rounded-2xl p-6 flex flex-col items-start">
            <CheckCircle2 className="w-6 h-6 text-luxury-gold mb-3" />
            <p className="text-luxury-gold font-bold text-sm uppercase tracking-wider">6–8 Week Build</p>
            <p className="text-xs text-white/70 mt-1">From cleared deposit</p>
          </div>
        </section>

        {/* Popular Add-Ons — items not already in the quote that the
            customer can request. Computes from ACCESSORIES minus what
            the submission has saved. "Add to my quote" emails the sales
            team with the customer's selections. */}
        <PopularAddOns submission={data} />

        {/* Acceptance Section */}
        {data.acceptance?.signedAt ? (
          <section className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-500 p-8 lg:p-12 text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9 text-white" />
            </div>
            <h2 className="text-2xl lg:text-3xl font-serif text-luxury-black mb-2">Proposal Accepted</h2>
            <p className="text-sm text-gray-600 mb-6">
              Thank you, <span className="font-semibold">{data.acceptance.signedName}</span>. We've received your acceptance and will be in touch shortly to schedule your site visit.
            </p>
            <div className="inline-block bg-white rounded-lg border border-emerald-200 px-6 py-4 text-left">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Signed By</p>
              {data.acceptance.signatureDataUrl ? (
                <img src={data.acceptance.signatureDataUrl} alt="Signature" className="h-14 mx-auto mb-2" />
              ) : (
                <p className="font-serif italic text-2xl text-luxury-black mb-1" style={{ fontFamily: 'Outfit, cursive' }}>
                  {data.acceptance.signedName}
                </p>
              )}
              <p className="text-[11px] text-gray-500">
                {data.acceptance.signedAt?.toDate ? data.acceptance.signedAt.toDate().toLocaleString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit'
                }) : 'Signature on file'}
              </p>
            </div>
          </section>
        ) : (
          <section className="bg-luxury-black text-white rounded-2xl p-8 lg:p-12">
            <div className="text-center">
              <h2 className="text-2xl lg:text-3xl font-serif mb-3">Ready to move forward?</h2>
              <p className="text-sm text-white/70 mb-8 max-w-xl mx-auto">
                Accept this proposal to reserve your place in our production queue, or book a consultation if you'd like to walk through the design together before signing. Either way, we'll reach out within 2 business days.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center max-w-xl mx-auto mb-4">
                <button
                  onClick={() => setShowSignModal(true)}
                  className="inline-flex items-center justify-center gap-2 bg-luxury-gold text-luxury-black px-8 py-4 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-luxury-gold/90 flex-1"
                >
                  <PenLine className="w-4 h-4" />
                  Accept &amp; Sign Proposal
                </button>
                <a
                  href={`mailto:info@eclipsepergola.ca?subject=${encodeURIComponent(
                    `Consultation request — ${data?.name || 'Eclipse Pergola'}`
                  )}&body=${encodeURIComponent(
                    `Hi,\n\nI'd like to schedule a consultation before accepting my pergola proposal.\n\nSome times that work for me:\n  • \n  • \n  • \n\nReference: ${typeof window !== 'undefined' ? window.location.href : ''}\n\nThanks!`
                  )}`}
                  className="inline-flex items-center justify-center gap-2 bg-transparent text-white border border-white/40 hover:border-luxury-gold hover:text-luxury-gold px-8 py-4 rounded-lg font-bold text-sm uppercase tracking-widest transition-colors flex-1"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule a Consultation
                </a>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-2">
                <a href="mailto:info@eclipsepergola.ca" className="inline-flex items-center justify-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-lg text-xs font-medium hover:bg-white/20 border border-white/10">
                  <Mail className="w-3.5 h-3.5" />
                  Questions? Email us
                </a>
                <a href="tel:2898552977" className="inline-flex items-center justify-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-lg text-xs font-medium hover:bg-white/20 border border-white/10">
                  <Phone className="w-3.5 h-3.5" />
                  289-855-2977
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-6">
          <p>© Eclipse Pergola Inc. — Proposal #{data.id.slice(0, 8).toUpperCase()}</p>
        </footer>
      </div>

      {showSignModal && (
        <SignatureModal
          customerName={data.name}
          submissionId={data.id}
          totalAmount={finalPricing.total}
          onClose={() => setShowSignModal(false)}
          onAccepted={(acceptance) => {
            setData({ ...data, acceptance, status: 'accepted' });
            setShowSignModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Signature Modal ────────────────────────────────────────────────────────
function SignatureModal({
  customerName,
  submissionId,
  totalAmount,
  onClose,
  onAccepted,
}: {
  customerName: string;
  submissionId: string;
  totalAmount: number;
  onClose: () => void;
  onAccepted: (acceptance: any) => void;
}) {
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const [typedName, setTypedName] = useState(customerName || '');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Canvas drawing helpers
  const getCanvasPoint = (e: any) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  const startDraw = (e: any) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };
  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasDrawn(true);
  };
  const endDraw = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!typedName.trim()) {
      setError('Please type your full legal name.');
      return;
    }
    if (!acceptedTerms) {
      setError('You must agree to the terms to accept the proposal.');
      return;
    }
    if (mode === 'draw' && !hasDrawn) {
      setError('Please draw your signature before accepting.');
      return;
    }

    setSubmitting(true);
    try {
      const signatureDataUrl = mode === 'draw' && canvasRef.current
        ? canvasRef.current.toDataURL('image/png')
        : null;

      // 1. Hit server endpoint to capture client IP and fire admin email + Pipedrive note
      let signerIp = 'client-recorded';
      let signerUserAgent = navigator.userAgent.slice(0, 500);
      try {
        const res = await fetch('/api/accept-proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId,
            signedName: typedName.trim(),
            acceptedTerms: true,
          }),
        });
        const result = await res.json();
        if (result.success) {
          signerIp = result.signerIp || signerIp;
          signerUserAgent = result.signerUserAgent || signerUserAgent;
        } else {
          console.warn('Accept meta endpoint error (non-fatal):', result.error);
        }
      } catch (e) {
        console.warn('Accept meta endpoint unreachable (non-fatal):', e);
      }

      // 2. Write the signature to Firestore from the client
      // (Firestore rules: allowed only when no prior signature exists)
      try {
        await setDoc(doc(db, 'submissions', submissionId), {
          status: 'accepted',
          pipelineStage: 'accepted',
          acceptance: {
            signedName: typedName.trim(),
            signatureDataUrl,
            signedAt: serverTimestamp(),
            acceptedTerms: true,
            signerIp,
            signerUserAgent,
          },
        }, { merge: true });
      } catch (e: any) {
        console.error('Signature write failed:', e);
        setError('Unable to record your acceptance. Please contact us at info@eclipsepergola.ca to sign.');
        setSubmitting(false);
        return;
      }

      onAccepted({
        signedName: typedName.trim(),
        signatureDataUrl,
        signedAt: { toDate: () => new Date() },
        signerIp,
        signerUserAgent,
        acceptedTerms: true,
      });
    } catch {
      setError('Network error — please check your connection and try again.');
      setSubmitting(false);
    }
  };

  const fmt = (n: number) => typeof n === 'number'
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-luxury-cream">
          <div>
            <h2 className="text-xl font-serif text-luxury-black">Accept Your Proposal</h2>
            <p className="text-xs text-gray-500 mt-1">
              Total: <span className="font-bold text-luxury-gold">{fmt(totalAmount)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Printed Name */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Print Full Legal Name *</label>
            <input
              type="text"
              required
              autoComplete="name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
              placeholder="Your full name"
            />
          </div>

          {/* Mode Toggle */}
          <div>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setMode('type')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors ${mode === 'type' ? 'bg-luxury-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Type Signature
              </button>
              <button
                type="button"
                onClick={() => setMode('draw')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors ${mode === 'draw' ? 'bg-luxury-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Draw Signature
              </button>
            </div>

            {mode === 'type' ? (
              <div className="border-2 border-dashed border-slate-300 rounded-lg py-8 px-4 text-center bg-slate-50">
                {typedName ? (
                  <p className="text-3xl italic text-luxury-black" style={{ fontFamily: "'Outfit', 'Brush Script MT', cursive" }}>
                    {typedName}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Type your name above — it will appear here as your signature</p>
                )}
              </div>
            ) : (
              <div>
                <div className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={160}
                    className="w-full h-40 cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                  {!hasDrawn && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-400 italic">
                      Draw your signature here
                    </div>
                  )}
                </div>
                {hasDrawn && (
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-luxury-gold"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Clear &amp; redraw
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Terms Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-4 h-4 text-luxury-gold focus:ring-luxury-gold border-slate-300 rounded"
            />
            <span className="text-xs text-gray-700 leading-relaxed">
              I, <span className="font-semibold">{typedName || '[your name]'}</span>, accept this proposal for {fmt(totalAmount)} including applicable HST,
              and I agree to the payment terms, warranty, and terms &amp; conditions described above.
              I understand this is an electronic signature with the same legal effect as a handwritten one,
              and that my name, IP address, and timestamp will be recorded.
            </span>
          </label>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-luxury-gold text-luxury-black rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-luxury-gold/90 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Accept &amp; Sign</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
