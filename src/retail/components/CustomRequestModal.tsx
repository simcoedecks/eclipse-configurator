import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { db, addDoc, collection, serverTimestamp } from '../../shared/firebase';
import { toast } from 'sonner';

interface Props {
  isDark: boolean;
  onClose: () => void;
  /** Optional prefilled customer info */
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  initialAddress?: string;
  initialCity?: string;
  /** Optional Pipedrive lead ID to link the request back to */
  leadId?: string | null;
  dealerSlug?: string | null;
  dealerEmail?: string | null;
  dealerName?: string | null;
}

/**
 * Escape-hatch form for customers whose needs don't fit the configurator —
 * captures a description of the custom pergola + contact info and files it as
 * a lead with `type: 'custom-request'` for the sales team to follow up on.
 */
export default function CustomRequestModal({
  isDark, onClose,
  initialName = '', initialEmail = '', initialPhone = '',
  initialAddress = '', initialCity = '',
  leadId = null, dealerSlug = null, dealerEmail = null, dealerName = null,
}: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !description.trim()) {
      toast.error('Please fill in name, email, phone, and describe your vision.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'submissions'), {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        type: 'custom-request',
        customRequest: true,
        customRequestNotes: description.trim(),
        pipelineStage: 'new',
        viewedAt: null,
        source: 'configurator-custom-request',
        tags: ['Custom Request'],
        assignedTo: dealerEmail || null,
        dealerSlug: dealerSlug || null,
        dealerName: dealerName || null,
        pipedriveLeadId: leadId || null,
        createdAt: serverTimestamp(),
      });

      // Notify sales side via existing endpoint (best-effort).
      try {
        await fetch('/api/custom-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, address, city, description }),
        });
      } catch (err) {
        // Endpoint may not exist yet — Firestore is the source of truth.
        console.warn('Custom request webhook failed (non-blocking)', err);
      }

      setSubmitted(true);
      toast.success("We've got your vision — a designer will be in touch shortly.");
      setTimeout(() => onClose(), 1800);
    } catch (err) {
      console.error('Custom request submit failed', err);
      toast.error('Something went wrong. Please try again or call us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-luxury-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative w-full max-w-lg rounded-xl border border-luxury-gold/20 shadow-2xl ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-luxury-black/40 hover:text-luxury-black hover:bg-luxury-black/5'}`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 lg:p-8">
          <div className="text-center mb-5">
            <div className="w-12 h-12 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-luxury-gold" />
            </div>
            <h3 className={`text-xl font-serif ${isDark ? 'text-white' : 'text-luxury-black'}`}>
              Design a Custom Pergola
            </h3>
            <p className={`text-sm mt-1.5 leading-relaxed max-w-sm mx-auto ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`}>
              The configurator covers our standard range. For bespoke footprints, integrated features,
              or special architectural requirements, tell us your vision and a designer will reach out.
            </p>
          </div>

          {submitted ? (
            <div className="py-8 text-center">
              <p className="text-luxury-gold font-serif text-lg">Thanks — we've received your request.</p>
              <p className={`text-sm mt-2 ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`}>
                A designer will be in touch within one business day.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>
                  Tell us what you're envisioning *
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. A 24' x 30' L-shaped pergola with an integrated outdoor kitchen, retractable glass walls, and a built-in fireplace…"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm leading-relaxed focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 placeholder:text-slate-400'}`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`} placeholder="John Doe" />
                </div>
                <div>
                  <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>Phone *</label>
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`} placeholder="(555) 123-4567" />
                </div>
              </div>

              <div>
                <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>Email *</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`} placeholder="john@example.com" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>Address</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`} placeholder="123 Main St" />
                </div>
                <div>
                  <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>City</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`} placeholder="Toronto" />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="luxury-button-outline flex-1 !px-4 !py-2.5 text-[11px] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="luxury-button flex-1 !px-4 !py-2.5 text-[11px] inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : 'Send to Designer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
