import { useEffect, useState, useRef, Suspense, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Mail, Phone, MapPin, Calendar, FileText, Download, Loader2, CheckCircle2, Shield, Clock, PenLine, X, Eraser } from 'lucide-react';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import { COLORS } from '../../shared/lib/colors';

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
      <header className="bg-white border-b border-luxury-cream sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="Eclipse Pergola" className="h-8 object-contain" />
          {data.pdfUrl && (
            <a
              href={data.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={data.pdfFilename || undefined}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-widest font-bold text-luxury-black border border-luxury-black/20 rounded hover:bg-luxury-black hover:text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </a>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Cover */}
        <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream p-8 lg:p-12">
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

          <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
            Thank you for choosing Eclipse Pergola. Below is your personalized proposal,
            based on the configuration you designed. Every pergola is built to order —
            motorized, engineered, and installed for all-season Canadian weather.
          </p>
        </section>

        {/* 3D Visualizer */}
        {(cfg.width || cfg.depth) && (
          <section className="bg-white rounded-2xl shadow-sm border border-luxury-cream overflow-hidden">
            <div className="p-6 border-b border-luxury-cream">
              <h2 className="text-lg font-serif text-luxury-black">Your Design</h2>
              <p className="text-xs text-gray-500 mt-1">
                {cfg.width}' × {cfg.depth}' × {cfg.height}' • {cfg.frameColor} frame • {cfg.louverColor} louvers
              </p>
            </div>
            <div className="h-[420px] bg-[#f1f5f9]">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-gray-400">Loading 3D preview…</div>}>
                <PergolaVisualizer
                  width={Number(cfg.width) || 12}
                  depth={Number(cfg.depth) || 16}
                  height={Number(cfg.height) || 9}
                  accessories={new Set<string>(items.map((i: any) => i.id).filter(Boolean))}
                  frameColor={frameHex}
                  louverColor={louverHex}
                  louverAngle={0}
                  screenDrop={100}
                  guillotineOpen={50}
                  wallColor={frameHex}
                  houseWallColor="#e2e8f0"
                  houseWall="none"
                  view="perspective"
                />
              </Suspense>
            </div>
          </section>
        )}

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

            {/* Totals */}
            <div className="pt-5 mt-5 border-t border-luxury-cream space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{fmt(pb.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">HST (13%)</span>
                <span className="font-medium">{fmt(pb.hst)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 mt-3 border-t-2 border-luxury-gold">
                <span className="text-sm font-bold uppercase tracking-widest text-luxury-black">Total Investment</span>
                <span className="text-3xl font-serif text-luxury-gold">{fmt(pb.total)}</span>
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
                Accept this proposal to reserve your place in our production queue. We'll reach out to schedule your site visit within 2 business days.
              </p>
              <button
                onClick={() => setShowSignModal(true)}
                className="inline-flex items-center justify-center gap-2 bg-luxury-gold text-luxury-black px-8 py-4 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-luxury-gold/90 mb-4"
              >
                <PenLine className="w-4 h-4" />
                Accept &amp; Sign Proposal
              </button>
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
          totalAmount={pb.total}
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
