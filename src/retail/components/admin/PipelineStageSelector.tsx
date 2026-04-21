import { PIPELINE_STAGES, stageById, defaultStageFor } from '../../../shared/lib/crm';
import { changeStage } from '../../lib/crmHelpers';
import { ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Props {
  submission: any;
  compact?: boolean;
}

export default function PipelineStageSelector({ submission, compact }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentId = submission.pipelineStage || defaultStageFor(submission);
  const current = stageById(currentId) || PIPELINE_STAGES[0];

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
        className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs font-semibold transition-all ${current.color} hover:shadow-sm`}
        style={compact ? {} : undefined}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: current.accent }} />
        {current.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden">
          {PIPELINE_STAGES.map(s => {
            const isCurrent = s.id === currentId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (!isCurrent) changeStage(submission.id, s.id, current.label, s.label);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2 text-left px-3 py-2 hover:bg-gray-50 transition-colors ${isCurrent ? 'bg-gray-50' : ''}`}
              >
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: s.accent }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-luxury-black">{s.label}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{s.description}</p>
                </div>
                {isCurrent && <Check className="w-4 h-4 text-luxury-gold mt-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
