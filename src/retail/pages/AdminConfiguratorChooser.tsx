import { useNavigate, useLocation } from 'react-router-dom';
import { Square, Layers, ArrowRight } from 'lucide-react';

/**
 * Landing page for /admin/configurator. Lets the admin pick between the
 * standard single-pergola flow (existing) and the new custom multi-section
 * builder. Forwards any ?submissionId= so editing flows still work.
 */
export default function AdminConfiguratorChooser() {
  const navigate = useNavigate();
  const location = useLocation();

  // Preserve the existing query string (e.g. ?submissionId=xxx) when
  // navigating into either sub-flow.
  const search = location.search;

  const goStandard = () => navigate(`/admin/configurator/standard${search}`);
  const goCustom   = () => navigate(`/admin/configurator/custom${search}`);

  return (
    <div className="min-h-screen bg-luxury-paper flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-10">
          <p className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-bold mb-3">
            Admin Configurator
          </p>
          <h1 className="text-3xl lg:text-4xl font-serif text-luxury-black mb-3">
            What kind of pergola are we quoting?
          </h1>
          <p className="text-sm text-gray-600 max-w-xl mx-auto">
            Pick standard for a single rectangular pergola, or custom for a multi-section build with mixed sizes and louver orientations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Standard Size */}
          <button
            onClick={goStandard}
            className="group text-left bg-white rounded-2xl border border-slate-200 hover:border-luxury-gold hover:shadow-xl transition-all p-7 flex flex-col"
          >
            <div className="w-12 h-12 rounded-xl bg-luxury-gold/10 text-luxury-gold flex items-center justify-center mb-5 group-hover:bg-luxury-gold group-hover:text-white transition-colors">
              <Square className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h2 className="text-xl font-serif text-luxury-black mb-2">Standard Size</h2>
            <p className="text-sm text-gray-600 mb-6 flex-1">
              Single rectangular pergola. The classic flow — pick dimensions, colors, and accessories. Use this for most quotes.
            </p>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-luxury-black group-hover:text-luxury-gold">
              Continue <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Custom Size */}
          <button
            onClick={goCustom}
            className="group text-left bg-white rounded-2xl border border-slate-200 hover:border-luxury-gold hover:shadow-xl transition-all p-7 flex flex-col relative"
          >
            <span className="absolute top-4 right-4 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
              New
            </span>
            <div className="w-12 h-12 rounded-xl bg-luxury-gold/10 text-luxury-gold flex items-center justify-center mb-5 group-hover:bg-luxury-gold group-hover:text-white transition-colors">
              <Layers className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h2 className="text-xl font-serif text-luxury-black mb-2">Custom Size</h2>
            <p className="text-sm text-gray-600 mb-6 flex-1">
              Multi-section pergola. Combine different widths and depths side-by-side, each with its own louver orientation. For larger or non-standard layouts.
            </p>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-luxury-black group-hover:text-luxury-gold">
              Continue <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-8">
          Admin only. Customer-facing configurator is unchanged.
        </p>
      </div>
    </div>
  );
}
