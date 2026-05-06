import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Users, FileCheck2, Layers, Edit3, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../shared/hooks/useTheme';

/**
 * Eclipse Pro landing page — contractor-facing entry point.
 *
 * URL: /pro
 *
 * Visually distinct from the homeowner site (defaults to dark, tools-y
 * feel) so a homeowner who lands here by mistake immediately knows it's
 * not for them. Single-CTA: 'Start a New Quote' → /pro/quote.
 *
 * Supports both light + dark mode via the shared useTheme hook so
 * contractors who prefer a lighter UI can toggle.
 */
export default function Pro() {
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${isDark ? 'bg-[#0a0a0a] text-white' : 'bg-[#FAF9F6] text-luxury-black'}`}>
      {/* Header */}
      <header className={`border-b px-6 py-5 ${isDark ? 'border-white/10' : 'border-luxury-black/10'}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Eclipse Pergola"
              className={`h-9 object-contain ${isDark ? 'brightness-0 invert' : ''}`}
            />
            <div className={`border-l pl-3 ${isDark ? 'border-white/15' : 'border-luxury-black/15'}`}>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Pro Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-white/70 hover:text-luxury-gold' : 'hover:bg-luxury-black/5 text-luxury-black/60 hover:text-luxury-gold'}`}
              aria-label="Toggle light/dark mode"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <a
              href="https://eclipsepergola.netlify.app"
              className={`text-xs uppercase tracking-widest font-bold hover:text-luxury-gold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}
            >
              ← Homeowner site
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-luxury-gold mb-5">For Contractors &amp; Dealers</p>
              <h1 className={`text-4xl lg:text-6xl font-serif mb-6 leading-[1.05] ${isDark ? 'text-white' : 'text-luxury-black'}`}>
                Build a quote for your client in&nbsp;under five&nbsp;minutes.
              </h1>
              <p className={`text-base lg:text-lg mb-10 max-w-xl leading-relaxed ${isDark ? 'text-white/70' : 'text-luxury-black/70'}`}>
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
                  className={`text-sm hover:text-luxury-gold underline-offset-4 hover:underline ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}
                >
                  Questions? Email us
                </a>
              </div>
            </div>

            {/* Feature grid */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              <Feature isDark={isDark} icon={<Building2 className="w-4 h-4" />} title="Co-Branded" desc="Your logo on every quote." />
              <Feature isDark={isDark} icon={<Users className="w-4 h-4" />} title="Two-Tier Edit" desc="You and the client both get edit links." />
              <Feature isDark={isDark} icon={<FileCheck2 className="w-4 h-4" />} title="30-Day Lock" desc="Quotes valid for 30 days." />
              <Feature isDark={isDark} icon={<Edit3 className="w-4 h-4" />} title="Live Sync" desc="Changes update the CRM in real-time." />
              <Feature isDark={isDark} icon={<Layers className="w-4 h-4" />} title="Multi-Pergola" desc="Quote multiple units in one project." />
              <Feature isDark={isDark} icon={<ArrowRight className="w-4 h-4" />} title="No Login" desc="No password to remember." />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`border-t px-6 py-6 ${isDark ? 'border-white/10' : 'border-luxury-black/10'}`}>
        <div className={`max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-[11px] ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
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

function Feature({ icon, title, desc, isDark }: { icon: React.ReactNode; title: string; desc: string; isDark: boolean }) {
  return (
    <div className={`border rounded-xl p-4 transition-colors ${isDark ? 'bg-white/[0.03] border-white/10 hover:border-luxury-gold/30' : 'bg-white border-luxury-black/10 hover:border-luxury-gold/40 shadow-sm'}`}>
      <div className="w-7 h-7 rounded-lg bg-luxury-gold/15 text-luxury-gold flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-luxury-black'}`}>{title}</p>
      <p className={`text-[11px] mt-0.5 leading-snug ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`}>{desc}</p>
    </div>
  );
}
