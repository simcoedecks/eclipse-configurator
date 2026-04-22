import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X, Loader2, Paperclip, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { db, addDoc, collection, serverTimestamp, storage, storageRef, uploadBytes, getDownloadURL } from '../../shared/firebase';
import { nextJobNumber } from '../../shared/lib/jobNumber';
import { toast } from 'sonner';

const MAX_FILE_MB = 15;
const MAX_FILES = 6;
const ACCEPT = 'image/*,application/pdf,.heic,.heif';

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
  const [heardAbout, setHeardAbout] = useState('');
  const [heardAboutOther, setHeardAboutOther] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted: File[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_FILE_MB}MB — skipped`);
        continue;
      }
      accepted.push(f);
    }
    const combined = [...files, ...accepted].slice(0, MAX_FILES);
    if (files.length + accepted.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} attachments`);
    }
    setFiles(combined);
  };

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (submissionId: string): Promise<Array<{ name: string; url: string; size: number; type: string }>> => {
    if (files.length === 0) return [];
    setUploading(true);
    const uploaded: Array<{ name: string; url: string; size: number; type: string }> = [];
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `custom-requests/${submissionId}/${Date.now()}-${safeName}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file);
        const url = await getDownloadURL(ref);
        uploaded.push({ name: file.name, url, size: file.size, type: file.type });
      }
      return uploaded;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !description.trim()) {
      toast.error('Please fill in name, email, phone, and describe your vision.');
      return;
    }
    setSubmitting(true);
    try {
      const heardAboutValue = heardAbout === 'Other' && heardAboutOther.trim()
        ? `Other: ${heardAboutOther.trim()}`
        : heardAbout || null;
      let jobNumber: number | null = null;
      try { jobNumber = await nextJobNumber(); } catch (e) { console.warn('Job number allocation failed', e); }
      // Build the payload conditionally so older firestore rules (which
      // don't list jobNumber in the allowlist yet) still accept the doc.
      const basePayload: any = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        type: 'custom-request',
        customRequest: true,
        customRequestNotes: description.trim(),
        heardAbout: heardAboutValue,
        attachments: [],
        pipelineStage: 'new',
        viewedAt: null,
        source: 'configurator-custom-request',
        tags: ['Custom Request'],
        assignedTo: dealerEmail || null,
        dealerSlug: dealerSlug || null,
        dealerName: dealerName || null,
        pipedriveLeadId: leadId || null,
        createdAt: serverTimestamp(),
      };
      if (typeof jobNumber === 'number') basePayload.jobNumber = jobNumber;
      // Strip any undefined values Firestore would reject.
      // Skip non-plain objects (FieldValue sentinels, Timestamp, etc.)
      // so serverTimestamp() etc. pass through unmodified.
      const isPlainObject = (v: any): boolean => {
        if (v === null || typeof v !== 'object') return false;
        const proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
      };
      const stripUndefined = (v: any): any => {
        if (v === undefined) return undefined;
        if (v === null) return v;
        if (Array.isArray(v)) return v.map(stripUndefined).filter((x: any) => x !== undefined);
        if (!isPlainObject(v)) return v;
        const out: any = {};
        for (const k of Object.keys(v)) {
          const cleaned = stripUndefined(v[k]);
          if (cleaned !== undefined) out[k] = cleaned;
        }
        return out;
      };
      const cleanPayload = stripUndefined(basePayload);
      // Fallback: if deployed rules don't support customRequest fields,
      // retry with a minimal payload that should pass any old ruleset.
      let docRef;
      try {
        docRef = await addDoc(collection(db, 'submissions'), cleanPayload);
      } catch (err: any) {
        if (err?.code !== 'permission-denied') throw err;
        console.warn('[custom-request] permission-denied — falling back to minimal payload (deploy firestore.rules to enable custom-request fields)');
        const fallback = stripUndefined({
          name: cleanPayload.name,
          email: cleanPayload.email,
          phone: cleanPayload.phone,
          address: cleanPayload.address,
          city: cleanPayload.city,
          type: 'email',
          configuration: {
            _customRequest: true,
            customRequestNotes: cleanPayload.customRequestNotes,
            heardAbout: cleanPayload.heardAbout,
            attachments: cleanPayload.attachments,
          },
          pipelineStage: 'new',
          viewedAt: null,
          source: 'configurator-custom-request',
          tags: ['Custom Request'],
          assignedTo: cleanPayload.assignedTo,
          dealerSlug: cleanPayload.dealerSlug,
          dealerName: cleanPayload.dealerName,
          createdAt: cleanPayload.createdAt,
        });
        docRef = await addDoc(collection(db, 'submissions'), fallback);
      }

      // Upload attachments (if any) and patch the doc with URLs.
      let attachments: Array<{ name: string; url: string; size: number; type: string }> = [];
      if (files.length > 0) {
        try {
          attachments = await uploadFiles(docRef.id);
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'submissions', docRef.id), { attachments }, { merge: true });
        } catch (err) {
          console.error('Attachment upload failed', err);
          toast.error('Some attachments failed to upload, but your request was saved.');
        }
      }

      // Notify sales side via existing endpoint (best-effort).
      try {
        await fetch('/api/custom-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, address, city, description, attachments }),
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

              {/* Attachments */}
              <div>
                <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>
                  Inspiration, sketches, or site photos <span className="font-normal normal-case tracking-normal opacity-60">(optional)</span>
                </label>
                <div
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  className={`w-full rounded-lg border border-dashed px-3 py-4 cursor-pointer transition-colors flex flex-col items-center justify-center text-center ${
                    dragActive
                      ? 'border-luxury-gold bg-luxury-gold/10'
                      : isDark
                        ? 'border-white/15 bg-white/[0.02] hover:border-luxury-gold/50 hover:bg-luxury-gold/[0.04]'
                        : 'border-slate-300 bg-slate-50/50 hover:border-luxury-gold hover:bg-luxury-gold/[0.04]'
                  }`}
                >
                  <Paperclip className={`w-4 h-4 mb-1.5 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`} />
                  <p className={`text-[11px] font-medium ${isDark ? 'text-white/70' : 'text-luxury-black/70'}`}>
                    Drop files here or <span className="text-luxury-gold underline">browse</span>
                  </p>
                  <p className={`text-[9px] mt-0.5 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                    Images or PDFs · up to {MAX_FILES} files · {MAX_FILE_MB}MB each
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((f, i) => {
                      const isImage = f.type.startsWith('image/');
                      const sizeKb = Math.round(f.size / 1024);
                      const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
                      return (
                        <li
                          key={`${f.name}-${i}`}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[11px] ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'}`}
                        >
                          {isImage
                            ? <ImageIcon className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`} />
                            : <FileText className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`} />}
                          <span className={`flex-1 truncate font-medium ${isDark ? 'text-white/80' : 'text-luxury-black/80'}`}>{f.name}</span>
                          <span className={`shrink-0 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>{sizeLabel}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            aria-label={`Remove ${f.name}`}
                            className={`shrink-0 p-1 rounded hover:bg-rose-500/10 ${isDark ? 'text-white/40 hover:text-rose-400' : 'text-luxury-black/40 hover:text-rose-600'}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
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

              <div>
                <label className={`block text-[10px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/60' : 'text-luxury-black/50'}`}>
                  How did you hear about us?
                </label>
                <select
                  value={heardAbout}
                  onChange={e => { setHeardAbout(e.target.value); if (e.target.value !== 'Other') setHeardAboutOther(''); }}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`}
                >
                  <option value="">Select an option</option>
                  <option value="Google Search">Google search</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="TikTok">TikTok</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Friend / Referral">Friend or referral</option>
                  <option value="Home Show / Event">Home show or event</option>
                  <option value="Dealer / Contractor">Dealer or contractor</option>
                  <option value="Saw an Installation">Saw one installed</option>
                  <option value="Print / Magazine">Print or magazine</option>
                  <option value="Radio / Podcast">Radio or podcast</option>
                  <option value="Other">Other</option>
                </select>
                {heardAbout === 'Other' && (
                  <input
                    type="text"
                    value={heardAboutOther}
                    onChange={e => setHeardAboutOther(e.target.value)}
                    placeholder="Please specify…"
                    className={`mt-2 w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold outline-none ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 placeholder:text-slate-400'}`}
                  />
                )}
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
                  disabled={submitting || uploading}
                  className="luxury-button flex-1 !px-4 !py-2.5 text-[11px] inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                    : submitting
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                      : 'Send to Designer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
