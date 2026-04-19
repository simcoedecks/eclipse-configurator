import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { db, doc, setDoc, serverTimestamp } from '../../shared/firebase';

export default function Scan() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-luxury-paper flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-serif text-luxury-black mb-2">Invalid session</h1>
          <p className="text-slate-500">Please scan the QR code again from the kiosk.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'kiosk-sessions', sessionId), {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        status: 'completed',
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error(err);
      setError('Something went wrong. Please try again or fill in details on the kiosk directly.');
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-luxury-paper flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-serif text-luxury-black mb-3">You're all set!</h1>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Your details have been sent to the kiosk. Turn back to the screen to continue designing your pergola.
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-xs uppercase tracking-widest font-bold text-luxury-gold"
          >
            Continue on this device instead →
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-luxury-paper flex flex-col">
      <div className="px-6 pt-8 pb-4 text-center">
        <img src="/logo.png" alt="Eclipse Pergola" className="h-8 mx-auto mb-3" />
        <h1 className="text-xl font-serif text-luxury-black">Your Details</h1>
        <p className="text-xs text-slate-500 mt-1">Fill these in, then look back at the kiosk screen.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-6 pb-8 space-y-4 max-w-md w-full mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Name *</label>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all text-base"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Phone *</label>
          <input
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all text-base"
            placeholder="(555) 123-4567"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Email *</label>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all text-base"
            placeholder="john@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Address</label>
          <input
            type="text"
            autoComplete="street-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all text-base"
            placeholder="123 Main St"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">City *</label>
          <input
            type="text"
            required
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-4 py-3.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all text-base"
            placeholder="Toronto"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="luxury-button w-full !py-4 !text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send to Kiosk'}
        </button>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          Session: {sessionId.slice(0, 8)}…
        </p>
      </form>
    </div>
  );
}
