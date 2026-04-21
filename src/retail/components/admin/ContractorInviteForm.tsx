import { useState, useRef, type FormEvent } from 'react';
import { storage, storageRef, uploadBytes, getDownloadURL } from '../../../shared/firebase';
import { Upload, Loader2, X, Image as ImageIcon, Link as LinkIcon, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props { onClose: () => void }

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function ContractorInviteForm({ onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [discount, setDiscount] = useState('15');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCompanyChange = (v: string) => {
    setCompanyName(v);
    if (!slugManual) setSlug(slugify(v));
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Logo too large (max 5 MB)'); return; }
    setUploadingLogo(true);
    try {
      const path = `dealerLogos/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file, { contentType: file.type });
      const url = await getDownloadURL(ref);
      setLogoUrl(url);
      toast.success('Logo uploaded');
    } catch (e: any) {
      console.error(e);
      toast.error(`Upload failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const adminSecret = prompt('Enter admin secret:') || '';
      if (!adminSecret) { setLoading(false); return; }
      const res = await fetch('/api/pro/invite-contractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName, contactName, email, phone,
          discountPercentage: discount, slug, logoUrl, adminSecret,
        }),
      });
      const r = await res.json();
      if (!r.success) { toast.error(r.error || 'Failed'); setLoading(false); return; }
      toast.success('Invite sent ✓');
      const dealerLink = r.slug ? `${window.location.origin}/dealer/${r.slug}` : '';
      setCreatedLink(dealerLink);
    } catch (e: any) {
      toast.error(e?.message || 'Network error');
      setLoading(false);
    }
  };

  if (createdLink) {
    return (
      <div className="bg-white p-6 rounded-xl border-2 border-emerald-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-serif text-lg text-luxury-black">Dealer created &amp; invite sent</h3>
            <p className="text-xs text-gray-500">{companyName} can now share their co-branded link with customers.</p>
          </div>
        </div>
        <div className="bg-luxury-paper rounded-lg p-4 mb-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">Dealer's customer link</p>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <LinkIcon className="w-4 h-4 text-gray-400" />
            <code className="flex-1 text-xs text-luxury-black font-mono truncate">{createdLink}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(createdLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1 px-2 py-1 bg-luxury-black text-white rounded text-xs font-bold hover:bg-luxury-black/90"
            >
              {copied ? <><CheckCircle2 className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            When a customer designs a pergola from this link, the lead will be auto-assigned to <span className="font-semibold">{contactName}</span>, tagged "Dealer Lead", and source-attributed to <code className="bg-slate-100 px-1 rounded text-[10px]">{slug}</code>. Dealer cost &amp; margin are visible only in your CRM.
          </p>
        </div>
        <button onClick={() => { setCreatedLink(''); onClose(); }} className="px-4 py-2 bg-luxury-black text-white rounded-lg text-sm font-semibold">Done</button>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-serif text-lg text-luxury-black">Invite a New Dealer</h3>
          <p className="text-xs text-gray-500 mt-0.5">Provisions their Pro account, generates a co-branded customer link, and emails the invite.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1"><X className="w-4 h-4" /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Company / contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Company name *</label>
            <input value={companyName} onChange={(e) => handleCompanyChange(e.target.value)} required placeholder="Simcoe Decks" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Contact name *</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder="John Doe" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Email *</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="john@simcoedecks.ca" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="(705) 555-1234" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Dealer discount %</label>
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min="0" max="100" placeholder="15" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-luxury-gold" />
            <p className="text-[10px] text-gray-400 mt-1">Used internally to compute their cost &amp; margin. Customer never sees this.</p>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">URL slug</label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 font-mono whitespace-nowrap">/dealer/</span>
              <input value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugManual(true); }} placeholder="simcoe-decks" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-luxury-gold" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Auto-generated from company name. Edit to customize.</p>
          </div>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Dealer logo</label>
          {logoUrl ? (
            <div className="flex items-center gap-3 p-3 bg-luxury-paper border border-slate-200 rounded-lg">
              <img src={logoUrl} alt="Logo preview" className="h-10 max-w-[120px] object-contain" />
              <div className="flex-1 text-xs text-gray-500">
                Logo uploaded · will appear next to Eclipse on the dealer's customer page
              </div>
              <button type="button" onClick={() => setLogoUrl('')} className="text-rose-500 hover:text-rose-700 p-1"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleLogoUpload(e.dataTransfer.files?.[0] || null); }}
              className="flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-luxury-gold hover:bg-luxury-gold/5 transition-colors"
            >
              <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)} className="hidden" />
              {uploadingLogo ? (
                <><Loader2 className="w-4 h-4 animate-spin text-luxury-gold" /><span className="text-xs text-luxury-gold font-semibold">Uploading…</span></>
              ) : (
                <><Upload className="w-4 h-4 text-slate-500" /><span className="text-xs text-slate-600"><span className="font-semibold">Click to upload</span> or drag &amp; drop · PNG/JPG/SVG, max 5 MB</span></>
              )}
            </label>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading || uploadingLogo} className="px-5 py-2 bg-luxury-black text-white rounded-lg font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : 'Send Invite & Generate Link'}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}
