import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Mail, Phone, MapPin, Calendar, FileText, Download, Loader2, CheckCircle2, Shield, Clock } from 'lucide-react';
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

        {/* Next Steps CTA */}
        <section className="bg-luxury-black text-white rounded-2xl p-8 lg:p-12 text-center">
          <h2 className="text-2xl lg:text-3xl font-serif mb-3">Ready to move forward?</h2>
          <p className="text-sm text-white/70 mb-6 max-w-xl mx-auto">
            Reach out to book your site visit and finalize your design. Once we confirm the specifications, we'll get your pergola into production.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="mailto:info@eclipsepergola.ca" className="inline-flex items-center justify-center gap-2 bg-luxury-gold text-luxury-black px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-luxury-gold/90">
              <Mail className="w-4 h-4" />
              Email Us
            </a>
            <a href="tel:2898552977" className="inline-flex items-center justify-center gap-2 bg-white/10 text-white px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-white/20 border border-white/20">
              <Phone className="w-4 h-4" />
              289-855-2977
            </a>
          </div>
          <p className="text-[11px] text-white/40 mt-6 italic">
            Interactive acceptance &amp; e-signature coming soon. Questions? Just reply to the email this proposal came with.
          </p>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-6">
          <p>© Eclipse Pergola Inc. — Proposal #{data.id.slice(0, 8).toUpperCase()}</p>
        </footer>
      </div>
    </div>
  );
}
