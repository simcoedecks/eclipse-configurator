import { useState, useRef, useEffect } from 'react';
import { LEAD_SOURCES } from '../../../shared/lib/crm';
import { updateSource } from '../../lib/crmHelpers';
import { ChevronDown, Globe, Check } from 'lucide-react';

interface Props {
  submission: any;
}

export default function SourceSelector({ submission }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentId = submission.source || 'organic';
  const current = LEAD_SOURCES.find(s => s.id === currentId);
  const currentLabel = current?.label || submission.source || 'Unknown';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-luxury-gold/50 hover:bg-luxury-gold/5 transition-colors text-xs"
      >
        <Globe className="w-3 h-3 text-luxury-gold" />
        <span className="font-semibold text-luxury-black">{currentLabel}</span>
        {submission.sourceRef && <span className="text-[10px] text-gray-400">· {submission.sourceRef}</span>}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden max-h-72 overflow-y-auto">
          {LEAD_SOURCES.map(s => {
            const isCurrent = currentId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => { if (!isCurrent) updateSource(submission.id, s.id, s.label); setOpen(false); }}
                className={`w-full flex items-center justify-between text-left px-3 py-2 hover:bg-gray-50 ${isCurrent ? 'bg-gray-50' : ''}`}
              >
                <span className="text-sm text-luxury-black">{s.label}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-luxury-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
