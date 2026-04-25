import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Hammer } from 'lucide-react';

/**
 * Phase 1.1 placeholder for the custom multi-section pergola builder.
 * Real implementation lands in a follow-up commit. For now, this just
 * confirms the route works and gives the admin a way back.
 */
export default function AdminConfiguratorCustom() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-luxury-paper flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-luxury-gold/10 text-luxury-gold flex items-center justify-center mx-auto mb-5">
          <Hammer className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-serif text-luxury-black mb-2">Custom Builder — Coming Soon</h1>
        <p className="text-sm text-gray-600 mb-6">
          The multi-section pergola builder is being built. For now, please use the Standard flow and add extra sections via the CRM Pricing tab → Additional Pergolas.
        </p>
        <button
          onClick={() => navigate('/admin/configurator')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-luxury-black text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-luxury-black/90"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Chooser
        </button>
      </div>
    </div>
  );
}
