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
  // logoUrl holds EITHER a pasted https URL OR a resized data: URL from an
  // uploaded file. We avoid Firebase Storage entirely — the logo is resized
  // client-side and carried as a compact data URL.
  const [logoUrl, setLogoUrl] = useState('');
  const [logoError, setLogoError] = useState('');

  // Read an uploaded image, downscale it on a canvas (max 320px on the long
  // side) and store the result as a PNG data URL. Keeps it small enough to
  // live in the submission doc and render on the co-branded proposal.
  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    if (!file.type.startsWith('image/')) { setLogoError('Please choose an image file (PNG, JPG, SVG…).'); return; }
    if (file.size > 8 * 1024 * 1024) { setLogoError('That image is too large (max 8MB).'); return; }
    const reader = new FileReader();
    reader.onerror = () => setLogoError("Couldn't read that file.");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setLogoError("That file isn't a readable image.");
      img.onload = () => {
        const MAX = 320;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setLogoError("Couldn't process that image."); return; }
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = '';
        try { dataUrl = canvas.toDataURL('image/png'); } catch { setLogoError("Couldn't process that image."); return; }
        if (dataUrl.length > 700 * 1024) {
          setLogoError('Logo is too detailed even after resizing — try a simpler/smaller image.');
          return;
        }
        setLogoUrl(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

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
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      clientAddress: clientAddress.trim(),
      clientCity: clientCity.trim(),
    });
    // Logo handoff: a pasted https URL is short enough for the query string,
    // but an uploaded data: URL is far too long — stash it in sessionStorage
    // (survives the client-side navigate + a refresh) and pass a sentinel.
    const logo = logoUrl.trim();
    if (logo.startsWith('data:')) {
      try { sessionStorage.setItem('eclipse-pro-dealer-logo', logo); } catch {}
      params.set('dealerLogo', 'stored');
    } else if (logo) {
      params.set('dealerLogo', logo);
    }
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
              <div className="block">
                <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                  <ImageIcon className="w-4 h-4" />
                  Your logo (optional)
                </span>

                {logoUrl ? (
                  /* Preview + remove */
                  <div className={`flex items-center gap-3 rounded-lg border p-2.5 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-luxury-black/15'}`}>
                    <div className="h-12 w-20 flex items-center justify-center rounded bg-white border border-luxury-black/10 shrink-0 overflow-hidden">
                      <img src={logoUrl} alt="Your logo" className="max-h-12 max-w-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-luxury-black'}`}>
                        {logoUrl.startsWith('data:') ? 'Logo uploaded' : 'Logo from URL'}
                      </p>
                      <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>Shown on the proposal next to Eclipse.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLogoUrl(''); setLogoError(''); }}
                      className={`text-[10px] uppercase tracking-widest font-bold shrink-0 ${isDark ? 'text-white/50 hover:text-rose-400' : 'text-luxury-black/50 hover:text-rose-500'}`}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Upload button */}
                    <label className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed cursor-pointer py-5 px-3 transition-colors ${isDark ? 'border-white/15 hover:border-luxury-gold bg-white/[0.02]' : 'border-luxury-black/20 hover:border-luxury-gold bg-white'}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
                      <ImageIcon className="w-5 h-5 text-luxury-gold" />
                      <span className={`text-xs font-bold ${isDark ? 'text-white/80' : 'text-luxury-black/80'}`}>Upload logo file</span>
                      <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>PNG, JPG or SVG · with transparency looks best</span>
                    </label>
                    {/* Or paste a URL */}
                    <div className="flex items-center gap-2 my-2">
                      <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-luxury-black/10'}`} />
                      <span className={`text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-white/30' : 'text-luxury-black/30'}`}>or paste a URL</span>
                      <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-luxury-black/10'}`} />
                    </div>
                    <input type="url" value={logoUrl} onChange={(e) => { setLogoUrl(e.target.value); setLogoError(''); }}
                      placeholder="https://yoursite.com/logo.png" className={inputClass} />
                  </>
                )}
                {logoError && <p className="text-[10px] text-rose-500 mt-1.5">{logoError}</p>}
              </div>

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
