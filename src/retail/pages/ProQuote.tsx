import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, User, Mail, Phone, MapPin, Image as ImageIcon, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../shared/hooks/useTheme';

/**
 * Eclipse Pro — two-step quote intake form.
 *
 * URL: /pro/quote
 *
 * Step 1: Contractor / dealer info (you, the contractor)
 * Step 2: Client info (your customer)
 *
 * On Continue we redirect to /configurator with the dealer + client info
 * encoded in the URL so the configurator hydrates with everything pre-
 * filled. The configurator's existing welcome form recognises these
 * params, populates state, and skips the welcome step.
 */
export default function ProQuote() {
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — contractor info
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [dealerEmail, setDealerEmail] = useState('');
  const [dealerPhone, setDealerPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Step 2 — client info
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientCity, setClientCity] = useState('');

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !contactName.trim() || !dealerEmail.trim()) return;
    setStep(2);
  };

  const handleStep2 = (e: FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim() || !clientCity.trim()) return;
    const params = new URLSearchParams({
      proIntake: '1',
      dealerName: businessName.trim(),
      dealerContact: contactName.trim(),
      dealerEmail: dealerEmail.trim(),
      dealerPhone: dealerPhone.trim(),
      dealerSlug: slugify(businessName.trim()),
      ...(logoUrl.trim() ? { dealerLogo: logoUrl.trim() } : {}),
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      clientAddress: clientAddress.trim(),
      clientCity: clientCity.trim(),
    });
    navigate(`/configurator?${params.toString()}`);
  };

  const inputClass = isDark
    ? 'w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/20 outline-none transition-all'
    : 'w-full px-3 py-2.5 bg-white border border-luxury-black/15 rounded-lg text-sm text-luxury-black placeholder:text-luxury-black/30 focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/20 outline-none transition-all shadow-sm';

  const primaryBtnClass = 'inline-flex items-center gap-2 bg-luxury-gold text-luxury-black px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-luxury-gold/90 transition-colors';

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${isDark ? 'bg-[#0a0a0a] text-white' : 'bg-[#FAF9F6] text-luxury-black'}`}>
      <header className={`border-b px-6 py-5 ${isDark ? 'border-white/10' : 'border-luxury-black/10'}`}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Eclipse Pergola"
              className={`h-8 object-contain ${isDark ? 'brightness-0 invert' : ''}`}
            />
            <div className={`border-l pl-3 ${isDark ? 'border-white/15' : 'border-luxury-black/15'}`}>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold">Pro Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-white/70 hover:text-luxury-gold' : 'hover:bg-luxury-black/5 text-luxury-black/60 hover:text-luxury-gold'}`}
              aria-label="Toggle light/dark mode"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => navigate('/pro')}
              className={`text-xs uppercase tracking-widest font-bold hover:text-luxury-gold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}
            >
              ← Cancel
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-10 lg:py-16">
        <div className="max-w-2xl mx-auto">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            <Step n={1} active={step === 1} done={step > 1} label="Your info" isDark={isDark} />
            <div className={`flex-1 h-px ${step > 1 ? 'bg-luxury-gold' : (isDark ? 'bg-white/10' : 'bg-luxury-black/10')}`} />
            <Step n={2} active={step === 2} done={false} label="Client info" isDark={isDark} />
          </div>

          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold mb-2">Step 1 of 2</p>
                <h1 className={`text-2xl lg:text-3xl font-serif mb-2 ${isDark ? 'text-white' : 'text-luxury-black'}`}>Tell us about your business</h1>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>This appears on the proposal alongside the Eclipse brand.</p>
              </div>

              <Field isDark={isDark} label="Business name *" icon={<Building2 className="w-4 h-4" />}>
                <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Acme Decking" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Your name *" icon={<User className="w-4 h-4" />}>
                <input required value={contactName} onChange={(e) => setContactName(e.target.value)}
                  placeholder="Kevin Smith" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Your email *" icon={<Mail className="w-4 h-4" />}>
                <input required type="email" value={dealerEmail} onChange={(e) => setDealerEmail(e.target.value)}
                  placeholder="kevin@acmedecking.ca" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Your phone" icon={<Phone className="w-4 h-4" />}>
                <input type="tel" value={dealerPhone} onChange={(e) => setDealerPhone(e.target.value)}
                  placeholder="(555) 123-4567" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Logo URL (optional)" icon={<ImageIcon className="w-4 h-4" />} hint="Paste a public URL to your logo image. Appears on the proposal next to Eclipse.">
                <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://yoursite.com/logo.png" className={inputClass} />
              </Field>

              <div className="flex justify-end pt-3">
                <button type="submit" className={primaryBtnClass}>
                  Next: Client info <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-luxury-gold mb-2">Step 2 of 2</p>
                <h1 className={`text-2xl lg:text-3xl font-serif mb-2 ${isDark ? 'text-white' : 'text-luxury-black'}`}>Who is this quote for?</h1>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>Your client receives the proposal. They can review and sign right from the email.</p>
              </div>

              <Field isDark={isDark} label="Client name *" icon={<User className="w-4 h-4" />}>
                <input required value={clientName} onChange={(e) => setClientName(e.target.value)}
                  placeholder="Jane Homeowner" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Client email *" icon={<Mail className="w-4 h-4" />}>
                <input required type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="jane@example.com" className={inputClass} />
              </Field>
              <Field isDark={isDark} label="Client phone" icon={<Phone className="w-4 h-4" />}>
                <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(555) 987-6543" className={inputClass} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                <Field isDark={isDark} label="Site address" icon={<MapPin className="w-4 h-4" />}>
                  <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="123 Main St" className={inputClass} />
                </Field>
                <Field isDark={isDark} label="City *">
                  <input required value={clientCity} onChange={(e) => setClientCity(e.target.value)}
                    placeholder="Toronto" className={inputClass} />
                </Field>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button type="button" onClick={() => setStep(1)} className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold hover:text-luxury-gold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button type="submit" className={primaryBtnClass}>
                  Continue to Configurator <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({ n, active, done, label, isDark }: { n: number; active: boolean; done: boolean; label: string; isDark: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
        done ? 'bg-luxury-gold text-luxury-black' :
        active ? 'bg-luxury-gold/15 text-luxury-gold border border-luxury-gold' :
        (isDark ? 'bg-white/5 text-white/40 border border-white/10' : 'bg-luxury-black/5 text-luxury-black/40 border border-luxury-black/10')
      }`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-[11px] uppercase tracking-widest font-bold ${
        active || done ? 'text-luxury-gold' : (isDark ? 'text-white/40' : 'text-luxury-black/40')
      }`}>
        {label}
      </span>
    </div>
  );
}

function Field({ label, icon, hint, children, isDark }: { label: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <label className="block">
      <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
        {icon}
        {label}
      </span>
      {children}
      {hint && <p className={`text-[10px] italic mt-1 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>{hint}</p>}
    </label>
  );
}

// Slug from business name. Lowercase, alphanumeric + hyphens, max 40 chars.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    || 'dealer';
}
