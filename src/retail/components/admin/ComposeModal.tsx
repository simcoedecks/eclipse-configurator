import { useState, type FormEvent } from 'react';
import { X, Mail, MessageSquare, Send, Loader2, Sparkles } from 'lucide-react';
import { EMAIL_TEMPLATES, SMS_TEMPLATES, renderTemplate } from '../../../shared/lib/crm';
import { logActivity } from '../../lib/crmHelpers';
import { toast } from 'sonner';

interface Props {
  submission: any;
  initialMode?: 'email' | 'sms';
  onClose: () => void;
}

export default function ComposeModal({ submission, initialMode = 'email', onClose }: Props) {
  const [mode, setMode] = useState<'email' | 'sms'>(initialMode);
  const proposalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/proposal/${submission.id}`;
  const total = submission.pricingBreakdown?.total
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(submission.pricingBreakdown.total)
    : submission.configuration?.totalPrice || '';

  const [to, setTo] = useState<string>(mode === 'email' ? submission.email || '' : submission.phone || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const switchMode = (m: 'email' | 'sms') => {
    setMode(m);
    setTo(m === 'email' ? submission.email || '' : submission.phone || '');
    setSubject('');
    setBody('');
  };

  const applyTemplate = (tplId: string) => {
    const templates = mode === 'email' ? EMAIL_TEMPLATES : SMS_TEMPLATES;
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) return;
    const rendered = renderTemplate(tpl, {
      name: submission.name,
      total,
      proposalUrl,
    });
    setSubject(rendered.subject || '');
    setBody(rendered.body);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !body.trim()) return;
    if (mode === 'email' && !subject.trim()) return;
    setSending(true);
    try {
      if (mode === 'email') {
        const res = await fetch('/api/admin/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, body, submissionId: submission.id }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || 'Send failed');
        await logActivity(submission.id, 'email_sent', `Sent email: "${subject}"`, { to, subject, emailId: result.emailId });
        toast.success('Email sent');
      } else {
        const res = await fetch('/api/admin/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, body, submissionId: submission.id }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || 'Send failed');
        await logActivity(submission.id, 'sms_sent', `Sent SMS: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`, { to, sid: result.sid });
        toast.success('SMS sent');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
      setSending(false);
    }
  };

  const templates = mode === 'email' ? EMAIL_TEMPLATES : SMS_TEMPLATES;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-serif text-luxury-black">Message {submission.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Logs automatically to the activity timeline</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => switchMode('email')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'email' ? 'bg-luxury-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={() => switchMode('sms')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'sms' ? 'bg-luxury-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <MessageSquare className="w-4 h-4" />
            SMS
          </button>
        </div>

        {/* Templates */}
        <div className="px-6 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-2">
            <Sparkles className="w-3 h-3" />
            Templates
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-luxury-gold/10 hover:bg-luxury-gold/20 text-luxury-black border border-luxury-gold/30 rounded-full text-xs font-semibold transition-colors"
              >
                <span>{tpl.icon}</span>
                {tpl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">
              {mode === 'email' ? 'To (email)' : 'To (phone)'}
            </label>
            <input
              type={mode === 'email' ? 'email' : 'tel'}
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
            />
          </div>

          {mode === 'email' && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Subject</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Message</label>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={mode === 'email' ? 12 : 5}
              maxLength={mode === 'sms' ? 1600 : undefined}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent font-sans"
            />
            {mode === 'sms' && (
              <p className="text-[10px] text-gray-400 mt-1 text-right">{body.length} / 1600 · ~{Math.ceil(body.length / 160)} SMS segment{Math.ceil(body.length / 160) === 1 ? '' : 's'}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !to.trim() || !body.trim() || (mode === 'email' && !subject.trim())}
              className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-luxury-black rounded-lg text-sm font-bold hover:bg-luxury-gold/90 disabled:opacity-40"
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send {mode === 'email' ? 'Email' : 'SMS'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
