import { useEffect, useState, useRef } from 'react';
import { Search, User, Eye, Home, Map, Kanban, Users, ArrowRight, CornerDownLeft } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  submissions: any[];
  onOpenSubmission: (sub: any) => void;
  onNav: (tab: 'dashboard' | 'submissions' | 'kanban' | 'map' | 'jobs' | 'contractors') => void;
}

export default function CommandPalette({ open, onClose, submissions, onOpenSubmission, onNav }: Props) {
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const navItems: Command[] = [
    { id: 'nav-dashboard',    label: 'Go to Dashboard',    icon: <Home className="w-4 h-4" />,    action: () => onNav('dashboard'),    keywords: ['home'] },
    { id: 'nav-submissions',  label: 'Go to Submissions',  icon: <User className="w-4 h-4" />,    action: () => onNav('submissions'),  keywords: ['leads', 'quotes'] },
    { id: 'nav-kanban',       label: 'Go to Kanban Board', icon: <Kanban className="w-4 h-4" />,  action: () => onNav('kanban'),       keywords: ['pipeline', 'board'] },
    { id: 'nav-map',          label: 'Go to Map',          icon: <Map className="w-4 h-4" />,     action: () => onNav('map'),          keywords: ['heatmap', 'geo'] },
    { id: 'nav-contractors',  label: 'Go to Contractors',  icon: <Users className="w-4 h-4" />,   action: () => onNav('contractors'),  keywords: ['pro'] },
  ];

  const leadItems: Command[] = submissions.slice(0, 50).map(sub => ({
    id: `lead-${sub.id}`,
    label: sub.name || 'Unnamed',
    hint: `${sub.city || ''} · ${sub.email || ''}`,
    icon: <Eye className="w-4 h-4" />,
    action: () => onOpenSubmission(sub),
    keywords: [sub.email, sub.phone, sub.city, sub.address].filter(Boolean),
  }));

  const all = [...navItems, ...leadItems];

  const filtered = q.trim() ? all.filter(cmd => {
    const hay = [cmd.label, cmd.hint, ...(cmd.keywords || [])].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(tok => hay.includes(tok));
  }) : [...navItems, ...leadItems.slice(0, 6)];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[selectedIdx]?.action(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-100" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelectedIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search leads, jump to a page…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400"
          />
          <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded font-mono">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No matches. Try a different query.</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => { cmd.action(); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIdx ? 'bg-luxury-gold/10 text-luxury-black' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${i === selectedIdx ? 'bg-luxury-gold text-white' : 'bg-slate-100 text-gray-500'}`}>
                  {cmd.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-luxury-black truncate">{cmd.label}</p>
                  {cmd.hint && <p className="text-[11px] text-gray-400 truncate">{cmd.hint}</p>}
                </div>
                {i === selectedIdx && <CornerDownLeft className="w-3.5 h-3.5 text-luxury-gold shrink-0" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1 bg-gray-100 rounded font-mono">↑↓</kbd>navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 bg-gray-100 rounded font-mono">↵</kbd>select</span>
          </div>
          <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
