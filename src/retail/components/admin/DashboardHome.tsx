import { useMemo, useEffect, useState } from 'react';
import { collectionGroup, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import StatCard from './StatCard';
import { PIPELINE_STAGES, stageById, defaultStageFor } from '../../../shared/lib/crm';
import { motion } from 'motion/react';
import { DollarSign, TrendingUp, Users, FileCheck2, CalendarClock, AlertTriangle, Sparkles, ArrowRight, Globe } from 'lucide-react';
import { LEAD_SOURCES } from '../../../shared/lib/crm';

interface Props {
  submissions: any[];
  onOpenSubmission: (sub: any) => void;
  onGoToSubmissions: () => void;
  onGoToKanban: () => void;
}

function parsePrice(s: any): number {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.-]+/g, '')) || 0;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function relativeTime(date: Date | null): string {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardHome({ submissions, onOpenSubmission, onGoToSubmissions, onGoToKanban }: Props) {
  const [openTasks, setOpenTasks] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  // Fetch open tasks and recent activities across all submissions via collectionGroup
  useEffect(() => {
    (async () => {
      try {
        const tasksQ = query(collectionGroup(db, 'tasks'), where('completedAt', '==', null));
        const taskSnap = await getDocs(tasksQ);
        const tasks = taskSnap.docs.map(d => {
          const path = d.ref.path.split('/');
          const submissionId = path[1];
          const sub = submissions.find(s => s.id === submissionId);
          return { id: d.id, submissionId, submissionName: sub?.name || 'Unknown', ...d.data() } as any;
        });
        tasks.sort((a, b) => {
          const aDue = a.dueAt?.toDate?.() ? a.dueAt.toDate().getTime() : Infinity;
          const bDue = b.dueAt?.toDate?.() ? b.dueAt.toDate().getTime() : Infinity;
          return aDue - bDue;
        });
        setOpenTasks(tasks);
      } catch (e) {
        console.warn('Tasks fetch failed', e);
      }

      try {
        const actQ = query(collectionGroup(db, 'activities'), orderBy('createdAt', 'desc'));
        const actSnap = await getDocs(actQ);
        const acts = actSnap.docs.slice(0, 20).map(d => {
          const path = d.ref.path.split('/');
          const submissionId = path[1];
          const sub = submissions.find(s => s.id === submissionId);
          return { id: d.id, submissionId, submissionName: sub?.name || 'Unknown', ...d.data() };
        });
        setRecentActivities(acts);
      } catch (e) {
        console.warn('Activity fetch failed', e);
      }
    })();
  }, [submissions]);

  const stats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const openPipeline = submissions.filter(s => {
      const stage = s.pipelineStage || defaultStageFor(s);
      return stage !== 'lost' && stage !== 'installed';
    });

    const totalPipelineValue = openPipeline.reduce((sum, s) => sum + parsePrice(s.pricingBreakdown?.total || s.configuration?.totalPrice), 0);

    const accepted = submissions.filter(s => s.acceptance?.signedAt);
    const acceptedThisMonth = accepted.filter(s => {
      const d = s.acceptance?.signedAt?.toDate?.();
      return d && d.getTime() >= thisMonth.getTime();
    });
    const signedValueThisMonth = acceptedThisMonth.reduce((sum, s) => sum + parsePrice(s.pricingBreakdown?.total || s.configuration?.totalPrice), 0);

    const conversionRate = submissions.length > 0 ? (accepted.length / submissions.length) * 100 : 0;

    const newThisWeek = submissions.filter(s => {
      const d = s.createdAt?.toDate?.();
      return d && (now - d.getTime()) < 7 * day;
    });

    const avgDeal = accepted.length > 0
      ? accepted.reduce((sum, s) => sum + parsePrice(s.pricingBreakdown?.total || s.configuration?.totalPrice), 0) / accepted.length
      : 0;

    return {
      totalPipelineValue,
      openPipelineCount: openPipeline.length,
      signedValueThisMonth,
      acceptedThisMonthCount: acceptedThisMonth.length,
      conversionRate,
      totalLeads: submissions.length,
      newThisWeek: newThisWeek.length,
      avgDeal,
    };
  }, [submissions]);

  const pipelineByStage = useMemo(() => {
    return PIPELINE_STAGES.map(stage => {
      const items = submissions.filter(s => (s.pipelineStage || defaultStageFor(s)) === stage.id);
      const value = items.reduce((sum, s) => sum + parsePrice(s.pricingBreakdown?.total || s.configuration?.totalPrice), 0);
      return { stage, count: items.length, value };
    });
  }, [submissions]);

  const overdueTasks = openTasks.filter(t => t.dueAt?.toDate?.() && t.dueAt.toDate().getTime() < Date.now());
  const todayTasks = openTasks.filter(t => {
    if (!t.dueAt?.toDate?.()) return false;
    const d = t.dueAt.toDate();
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const hotLeads = useMemo(() => {
    return submissions
      .filter(s => !s.acceptance?.signedAt && (s.pipelineStage === 'proposal-sent' || s.pipelineStage === 'site-visit' || s.tags?.includes('Hot Lead')))
      .slice(0, 5);
  }, [submissions]);

  // Lead source attribution
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number; accepted: number }>();
    submissions.forEach(s => {
      const src = s.source || 'organic';
      const entry = map.get(src) || { count: 0, revenue: 0, accepted: 0 };
      entry.count += 1;
      if (s.acceptance?.signedAt) {
        entry.accepted += 1;
        entry.revenue += parsePrice(s.pricingBreakdown?.total || s.configuration?.totalPrice);
      }
      map.set(src, entry);
    });
    return Array.from(map.entries())
      .map(([id, data]) => ({
        id,
        label: LEAD_SOURCES.find(s => s.id === id)?.label || id,
        ...data,
      }))
      .sort((a, b) => b.count - a.count);
  }, [submissions]);

  const maxStageValue = Math.max(...pipelineByStage.map(p => p.value), 1);

  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold mb-3">Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Open Pipeline"
            value={formatCurrency(stats.totalPipelineValue)}
            sub={`${stats.openPipelineCount} active ${stats.openPipelineCount === 1 ? 'quote' : 'quotes'}`}
            accent="gold"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <StatCard
            label="Signed This Month"
            value={formatCurrency(stats.signedValueThisMonth)}
            sub={`${stats.acceptedThisMonthCount} ${stats.acceptedThisMonthCount === 1 ? 'deal' : 'deals'} closed`}
            accent="emerald"
            icon={<FileCheck2 className="w-4 h-4" />}
          />
          <StatCard
            label="Conversion Rate"
            value={`${stats.conversionRate.toFixed(1)}%`}
            sub={`${stats.totalLeads} leads all-time`}
            accent="indigo"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <StatCard
            label="New This Week"
            value={stats.newThisWeek}
            sub={`Avg deal: ${formatCurrency(stats.avgDeal)}`}
            accent="slate"
            icon={<Users className="w-4 h-4" />}
          />
        </div>
      </section>

      {/* Pipeline funnel */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold">Pipeline by Stage</h2>
          <button
            onClick={onGoToKanban}
            className="inline-flex items-center gap-1 text-xs font-semibold text-luxury-black hover:text-luxury-gold transition-colors"
          >
            Open Kanban <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="space-y-2.5">
            {pipelineByStage.map(({ stage, count, value }) => (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3"
              >
                <div className="w-36 text-sm font-semibold text-luxury-black flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.accent }} />
                  {stage.label}
                </div>
                <div className="flex-1 relative h-8 bg-slate-50 rounded-md overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-md flex items-center justify-end pr-3 text-xs font-bold text-white"
                    style={{ background: `linear-gradient(90deg, ${stage.accent}dd, ${stage.accent})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((value / maxStageValue) * 100, count > 0 ? 8 : 0)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  >
                    {value > 0 && formatCurrency(value)}
                  </motion.div>
                </div>
                <div className="w-20 text-right text-sm">
                  <span className="font-bold text-luxury-black">{count}</span>
                  <span className="text-gray-400 ml-1">{count === 1 ? 'lead' : 'leads'}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today + Overdue tasks */}
        <section className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-4 h-4 text-luxury-gold" />
            <h2 className="font-serif text-lg text-luxury-black">Your Focus</h2>
          </div>

          {overdueTasks.length === 0 && todayTasks.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileCheck2 className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-luxury-black">All caught up</p>
              <p className="text-xs text-gray-400 mt-1">No tasks due today</p>
            </div>
          ) : (
            <div className="space-y-3">
              {overdueTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-rose-600 mb-1.5">
                    <AlertTriangle className="w-3 h-3" />
                    Overdue ({overdueTasks.length})
                  </div>
                  <ul className="space-y-1">
                    {overdueTasks.slice(0, 4).map(t => {
                      const sub = submissions.find(s => s.id === t.submissionId);
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => sub && onOpenSubmission(sub)}
                            className="w-full text-left p-2 bg-rose-50 border border-rose-200 rounded-lg hover:border-rose-400 transition-colors"
                          >
                            <p className="text-sm font-semibold text-luxury-black">{t.title}</p>
                            <p className="text-[11px] text-gray-500">{t.submissionName} · Due {relativeTime(t.dueAt?.toDate?.())}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {todayTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-luxury-gold mb-1.5">
                    <CalendarClock className="w-3 h-3" />
                    Today ({todayTasks.length})
                  </div>
                  <ul className="space-y-1">
                    {todayTasks.slice(0, 4).map(t => {
                      const sub = submissions.find(s => s.id === t.submissionId);
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => sub && onOpenSubmission(sub)}
                            className="w-full text-left p-2 bg-amber-50 border border-amber-200 rounded-lg hover:border-amber-400 transition-colors"
                          >
                            <p className="text-sm font-semibold text-luxury-black">{t.title}</p>
                            <p className="text-[11px] text-gray-500">{t.submissionName}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Hot Leads */}
        <section className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-luxury-gold" />
            <h2 className="font-serif text-lg text-luxury-black">Hot Leads</h2>
          </div>
          {hotLeads.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-6 text-center">No proposals out right now. Send one to see it here.</p>
          ) : (
            <ul className="space-y-2">
              {hotLeads.map(sub => {
                const stage = stageById(sub.pipelineStage || defaultStageFor(sub));
                const price = sub.pricingBreakdown?.total;
                return (
                  <li key={sub.id}>
                    <button
                      onClick={() => onOpenSubmission(sub)}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-luxury-gold hover:bg-luxury-gold/5 transition-colors group"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-sm text-luxury-black">{sub.name}</span>
                        <span className="text-sm font-bold text-luxury-gold">{price ? formatCurrency(price) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${stage?.color || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded-full border`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage?.accent }} />
                          {stage?.label}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-luxury-gold transition-colors" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent activity */}
        <section className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-luxury-gold" />
            <h2 className="font-serif text-lg text-luxury-black">Recent Activity</h2>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-6 text-center">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivities.slice(0, 8).map(a => {
                const sub = submissions.find(s => s.id === a.submissionId);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => sub && onOpenSubmission(sub)}
                      className="w-full text-left p-2.5 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <p className="text-sm text-luxury-black truncate">{a.message}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {a.submissionName} · {relativeTime(a.createdAt?.toDate?.() || null)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            onClick={onGoToSubmissions}
            className="w-full mt-3 pt-3 border-t border-slate-100 text-xs font-semibold text-gray-500 hover:text-luxury-gold transition-colors flex items-center justify-center gap-1"
          >
            View all leads <ArrowRight className="w-3 h-3" />
          </button>
        </section>
      </div>

      {/* Lead source attribution */}
      {sourceBreakdown.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold mb-3">Lead Sources</h2>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sourceBreakdown.slice(0, 6).map((src) => {
                const conversionPct = src.count > 0 ? (src.accepted / src.count) * 100 : 0;
                return (
                  <div key={src.id} className="p-4 border border-slate-200 rounded-xl hover:border-luxury-gold transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="w-3.5 h-3.5 text-luxury-gold" />
                      <h3 className="text-sm font-semibold text-luxury-black">{src.label}</h3>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-serif font-medium text-luxury-black">{src.count}</span>
                      <span className="text-xs text-gray-500">leads</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <div>
                        <span className="text-gray-400">Accepted: </span>
                        <span className="font-bold text-emerald-600">{src.accepted}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Rate: </span>
                        <span className="font-bold text-luxury-black">{conversionPct.toFixed(0)}%</span>
                      </div>
                    </div>
                    {src.revenue > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Revenue</span>
                        <p className="text-sm font-bold text-luxury-gold">{formatCurrency(src.revenue)}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
