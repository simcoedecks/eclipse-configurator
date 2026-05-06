import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Users, FileCheck2, Layers, Edit3 } from 'lucide-react';

/**
 * Eclipse Pro landing page — contractor-facing entry point.
 *
 * URL: /pro
 *
 * Visually distinct from the homeowner site (darker, tools-y feel) so
 * a homeowner who lands here by mistake immediately knows it's not for
 * them. Single-CTA: 'Start a New Quote' → /pro/quote.
 */
export default function Pro() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse Pergola" className="h-9 object-contain brightness-0 invert" />
            <div className="border-l border-white/15 pl-3">
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Pro Portal</p>
            </div>
          </div>
          <a href="https://eclipsepergola.netlify.app" className="text-xs text-white/60 hover:text-luxury-gold uppercase tracking-widest font-bold">
            ← Homeowner site
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-5">For Contractors &amp; Dealers</p>
              <h1 className="text-4xl lg:text-6xl font-serif text-white mb-6 leading-[1.05]">
                Build a quote for your client in&nbsp;under five&nbsp;minutes.
              </h1>
              <p className="text-base lg:text-lg text-white/70 mb-10 max-w-xl leading-relaxed">
                Co-brand with your business, walk through the design with your client, and send them a polished proposal — all from one link.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => navigate('/pro/quote')}
                  className="group inline-flex items-center gap-2 bg-luxury-gold text-luxury-black px-8 py-4 rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-luxury-gold/90 transition-all"
                >
                  Start a New Quote
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <a
                  href="mailto:info@eclipsepergola.ca?subject=Eclipse%20Pro%20-%20Question"
                  className="text-sm text-white/60 hover:text-luxury-gold underline-offset-4 hover:underline"
                >
                  Questions? Email us
                </a>
              </div>
            </div>

            {/* Feature grid */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              <Feature icon={<Building2 className="w-4 h-4" />} title="Co-Branded" desc="Your logo on every quote." />
              <Feature icon={<Users className="w-4 h-4" />} title="Two-Tier Edit" desc="You and the client both get edit links." />
              <Feature icon={<FileCheck2 className="w-4 h-4" />} title="30-Day Lock" desc="Quotes valid for 30 days." />
              <Feature icon={<Edit3 className="w-4 h-4" />} title="Live Sync" desc="Changes update the CRM in real-time." />
              <Feature icon={<Layers className="w-4 h-4" />} title="Multi-Pergola" desc="Quote multiple units in one project." />
              <Feature icon={<ArrowRight className="w-4 h-4" />} title="No Login" desc="No password to remember." />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/40">
          <p>© Eclipse Pergola Inc. — Pro Portal</p>
          <div className="flex items-center gap-5">
            <a href="mailto:info@eclipsepergola.ca" className="hover:text-luxury-gold">info@eclipsepergola.ca</a>
            <a href="tel:2898552977" className="hover:text-luxury-gold">289-855-2977</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-luxury-gold/30 transition-colors">
      <div className="w-7 h-7 rounded-lg bg-luxury-gold/15 text-luxury-gold flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-xs font-bold text-white">{title}</p>
      <p className="text-[11px] text-white/50 mt-0.5 leading-snug">{desc}</p>
    </div>
  );
}
