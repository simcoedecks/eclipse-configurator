import { useMemo, useState, type DragEvent } from 'react';
import { PIPELINE_STAGES, defaultStageFor, stageById, teamMemberByEmail, stepLabel } from '../../../shared/lib/crm';
import { changeStage } from '../../lib/crmHelpers';
import { MapPin } from 'lucide-react';
import { Avatar } from './AssignedToSelector';

interface Props {
  submissions: any[];
  onOpen: (sub: any) => void;
}

function formatPrice(n: any): string {
  if (typeof n === 'number') return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  if (typeof n === 'string') {
    const parsed = parseFloat(n.replace(/[^0-9.-]+/g, ''));
    if (!isNaN(parsed)) return parsed.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  return '—';
}

function LeadCard({ sub, onOpen, onDragStart }: { sub: any; onOpen: () => void; onDragStart: (e: DragEvent<HTMLDivElement>) => void }) {
  const createdAt = sub.createdAt?.toDate?.() || null;
  const price = sub.pricingBreakdown?.total || sub.configuration?.totalPrice;
  const assignee = teamMemberByEmail(sub.assignedTo);
  // Draft-lead indicators — show "Step X/5" and an "Abandoned" pill
  // if the customer hasn't touched it in 20+ minutes. This is the
  // only signal the sales team gets that someone started the
  // configurator but never clicked Submit.
  const isDraft = !!sub.isDraft;
  const currentStep: number | undefined = typeof sub.currentStep === 'number' ? sub.currentStep : undefined;
  const lastStepAt = sub.lastStepAt?.toDate?.() || sub.updatedAt?.toDate?.() || createdAt;
  const idleMinutes = lastStepAt ? Math.round((Date.now() - lastStepAt.getTime()) / 60000) : 0;
  const abandoned = isDraft && idleMinutes >= 20;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`bg-white rounded-xl p-3 mb-2 shadow-sm hover:shadow-md hover:border-luxury-gold/60 transition-all cursor-pointer active:scale-[0.98] border ${abandoned ? 'border-rose-300 ring-1 ring-rose-200' : 'border-gray-200'}`}
    >
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <p className="font-semibold text-sm text-luxury-black truncate flex-1">{sub.name}</p>
        <div className="flex items-center gap-1 shrink-0">
          {!sub.viewedAt && (
            <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold animate-pulse" title="Unread" />
          )}
          {assignee && <Avatar name={assignee.name} email={assignee.email} color={assignee.color} size="sm" />}
        </div>
      </div>
      {isDraft && (
        <div className="space-y-1 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {abandoned ? (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full"
                    title={`Customer hasn't touched the configurator in ${idleMinutes}m`}>
                ⚠ Abandoned · {idleMinutes}m idle
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full animate-pulse">
                ● Live · configuring
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="font-mono font-bold text-slate-800">Step {currentStep || '?'}/5</span>
            <span className="text-slate-400">·</span>
            <span className="truncate">{stepLabel(currentStep)}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-2">
        <MapPin className="w-3 h-3" />
        <span className="truncate">{sub.city || 'No city'}</span>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-sm font-bold text-luxury-gold">{formatPrice(price)}</span>
        {createdAt && (
          <span className="text-[10px] text-gray-400">
            {createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      {sub.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-100">
          {sub.tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-[9px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
              {tag}
            </span>
          ))}
          {sub.tags.length > 3 && <span className="text-[9px] text-gray-400">+{sub.tags.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

export default function KanbanBoard({ submissions, onOpen }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    PIPELINE_STAGES.forEach(s => { map[s.id] = []; });
    submissions.forEach(sub => {
      // Drafts (in-progress / abandoned) live outside the sales pipeline —
      // they show up in their own surface, not as kanban cards.
      if (sub.isDraft) return;
      const stage = sub.pipelineStage || defaultStageFor(sub);
      if (!map[stage]) map[stage] = [];
      map[stage].push(sub);
    });
    return map;
  }, [submissions]);

  const handleDrop = (e: DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!draggedId) return;
    const sub = submissions.find(s => s.id === draggedId);
    if (!sub) return;
    const currentStage = sub.pipelineStage || defaultStageFor(sub);
    if (currentStage === stageId) return;
    const fromLabel = stageById(currentStage)?.label || currentStage;
    const toLabel = stageById(stageId)?.label || stageId;
    changeStage(draggedId, stageId, fromLabel, toLabel);
    setDraggedId(null);
  };

  return (
    <div className="overflow-x-auto pb-4 -mx-6 px-6">
      <div className="flex gap-4 min-w-max">
        {PIPELINE_STAGES.map(stage => {
          const items = grouped[stage.id] || [];
          const valueTotal = items.reduce((sum, s) => {
            const v = s.pricingBreakdown?.total || 0;
            return sum + (typeof v === 'number' ? v : 0);
          }, 0);
          const isOver = dragOver === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`w-72 shrink-0 rounded-xl border-2 transition-colors ${
                isOver ? 'border-luxury-gold bg-luxury-gold/5' : 'border-transparent'
              }`}
            >
              <div className="px-3 py-3 flex items-center justify-between border-b-2 rounded-t-xl"
                   style={{ borderBottomColor: stage.accent, background: `${stage.accent}10` }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: stage.accent }} />
                  <h3 className="font-bold text-sm text-luxury-black">{stage.label}</h3>
                  <span className="bg-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm border border-gray-200 text-gray-700">
                    {items.length}
                  </span>
                </div>
              </div>
              {valueTotal > 0 && (
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-gray-50">
                  {valueTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} pipeline
                </div>
              )}
              <div className="p-2 min-h-[200px] max-h-[70vh] overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-8 px-2">
                    Drop leads here
                  </p>
                ) : (
                  items.map(sub => (
                    <LeadCard
                      key={sub.id}
                      sub={sub}
                      onOpen={() => onOpen(sub)}
                      onDragStart={(e) => {
                        setDraggedId(sub.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
