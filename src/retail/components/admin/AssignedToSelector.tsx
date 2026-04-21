import { useState, useRef, useEffect } from 'react';
import { TEAM_MEMBERS, teamMemberByEmail, initialsFor } from '../../../shared/lib/crm';
import { assignLead } from '../../lib/crmHelpers';
import { ChevronDown, UserMinus, Check, UserPlus } from 'lucide-react';

interface Props {
  submission: any;
  /** Compact mode: just shows the avatar, no label */
  compact?: boolean;
}

export function Avatar({ name, email, color, size = 'md' }: { name: string; email?: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5 text-[9px]' : size === 'lg' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-[11px]';
  return (
    <div
      title={`${name}${email ? ` (${email})` : ''}`}
      style={{ background: color }}
      className={`${sizeClass} rounded-full text-white font-bold flex items-center justify-center shrink-0 border-2 border-white shadow-sm`}
    >
      {initialsFor(name)}
    </div>
  );
}

export default function AssignedToSelector({ submission, compact }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const assigned = teamMemberByEmail(submission.assignedTo);

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
        className={`inline-flex items-center gap-2 rounded-lg border transition-all ${
          assigned
            ? 'border-luxury-gold/30 bg-luxury-gold/10 hover:bg-luxury-gold/20 px-2 py-1'
            : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs text-slate-500'
        }`}
      >
        {assigned ? (
          <>
            <Avatar name={assigned.name} email={assigned.email} color={assigned.color} size="sm" />
            {!compact && <span className="text-xs font-semibold text-luxury-black">{assigned.name.split(' ')[0]}</span>}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </>
        ) : (
          <>
            <UserPlus className="w-3.5 h-3.5" />
            {!compact && <span className="text-xs font-semibold">Assign</span>}
          </>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden right-0">
          {TEAM_MEMBERS.map(m => {
            const isCurrent = submission.assignedTo === m.email;
            return (
              <button
                key={m.email}
                onClick={() => { if (!isCurrent) assignLead(submission.id, m.email, m.name); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2 hover:bg-gray-50 transition-colors ${isCurrent ? 'bg-gray-50' : ''}`}
              >
                <Avatar name={m.name} email={m.email} color={m.color} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-luxury-black">{m.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{m.role || m.email}</p>
                </div>
                {isCurrent && <Check className="w-4 h-4 text-luxury-gold shrink-0" />}
              </button>
            );
          })}
          {assigned && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { assignLead(submission.id, null); setOpen(false); }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-rose-50 text-rose-600 text-sm font-semibold"
              >
                <UserMinus className="w-4 h-4" />
                Unassign
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
