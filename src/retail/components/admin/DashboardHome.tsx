import { useMemo, useEffect, useState } from 'react';
import { collectionGroup, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import StatCard from './StatCard';
import { PIPELINE_STAGES, stageById, defaultStageFor } from '../../../shared/lib/crm';
import { motion } from 'motion/react';
import { DollarSign, TrendingUp, Users, FileCheck2, CalendarClock, AlertTriangle, Sparkles, ArrowRight, Globe, Download, Loader2, ShieldCheck, AlertCircle, Trash2 } from 'lucide-react';
import { writeBatch, doc as firestoreDoc } from 'firebase/firestore';
import { LEAD_SOURCES } from '../../../shared/lib/crm';
import { downloadFullBackup, type BackupProgress } from '../../lib/backupExport';
import { toast } from 'sonner';

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
  // Backup export state
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [lastBackup, setLastBackup] = useState<{ at: string; sizeBytes: number; counts: Record<string, number> } | null>(() => {
    try {
      const raw = localStorage.getItem('eclipse-last-backup');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const runBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    setBackupProgress({ step: 'Starting…' });
    try {
      const res = await downloadFullBackup((p) => setBackupProgress(p));
      const sizeMb = (res.sizeBytes / (1024 * 1024)).toFixed(2);
      const summary = `${res.counts.submissions} subs · ${res.counts.jobs} jobs · ${res.counts.contractors} contractors · ${sizeMb} MB`;
      const meta = { at: new Date().toISOString(), sizeBytes: res.sizeBytes, counts: res.counts };
      setLastBackup(meta);
      try { localStorage.setItem('eclipse-last-backup', JSON.stringify(meta)); } catch {}
      toast.success(`Backup saved: ${res.filename}`, { description: summary, duration: 6000 });
    } catch (e: any) {
      console.error('backup failed', e);
      toast.error(`Backup failed: ${e?.message || 'unknown error'}`);
    } finally {
      setBackingUp(false);
      setBackupProgress(null);
    }
  };

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

    // Three-stage funnel conversion:
    //   submittedLeads  = anyone who actually clicked Submit (not drafts)
    //   engaged         = customer viewed the proposal page or opened the
    //                     email — a 'soft reply' / proof of interest. When
    //                     inbound SMS/email reply tracking is wired up, this
    //                     can be tightened to actual replies.
    //   reachedConsult  = leads whose stage advanced to Site Visit or later
    //   reachedWon      = leads whose stage advanced to Signed or later
    //                     (also matches anyone with acceptance.signedAt)
    // 'Lost' submissions are intentionally INCLUDED in the denominator at
    // each step — the goal is to measure how many leads make it from one
    // gate to the next, regardless of where they ultimately end up.
    const stageOrder = ['new', 'contacted', 'cool-lead', 'site-visit', 'proposal-sent', 'accepted', 'in-production', 'installed'];
    const consultIdx = stageOrder.indexOf('site-visit');
    const wonIdx = stageOrder.indexOf('accepted');
    const submittedLeads = submissions.filter(s => !s.isDraft);
    const stageRank = (s: any) => stageOrder.indexOf(s.pipelineStage || defaultStageFor(s));
    const isEngaged = (s: any) =>
      !!(s.customerFirstViewedAt || s.customerEmailOpenedAt || s.customerEmailClickedAt || s.customerViewCount > 0);
    const engaged = submittedLeads.filter(isEngaged);
    const reachedConsult = engaged.filter(s => stageRank(s) >= consultIdx);
    const reachedWon = reachedConsult.filter(s => stageRank(s) >= wonIdx || !!s.acceptance?.signedAt);

    const leadToEngaged = submittedLeads.length > 0
      ? (engaged.length / submittedLeads.length) * 100
      : 0;
    const engagedToConsult = engaged.length > 0
      ? (reachedConsult.length / engaged.length) * 100
      : 0;
    const consultToWon = reachedConsult.length > 0
      ? (reachedWon.length / reachedConsult.length) * 100
      : 0;

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
      // Funnel — three stages: Lead → Engaged → Consultation → Won
      submittedLeadsCount: submittedLeads.length,
      engagedCount: engaged.length,
      reachedConsultCount: reachedConsult.length,
      reachedWonCount: reachedWon.length,
      leadToEngaged,
      engagedToConsult,
      consultToWon,
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

  // Detect drafts that look like duplicates of a more recent submitted
  // lead (same email, draft created BEFORE the submitted one). These are
  // the records the admin probably wants to clean up — same person, two
  // entries — and they should be alerted to them up front, not have
  // them silently deleted.
  const duplicateDrafts = useMemo(() => {
    const submittedByEmail = new Map<string, any>();
    for (const s of submissions) {
      if (s.isDraft || !s.email) continue;
      const e = String(s.email).toLowerCase().trim();
      const cur = submittedByEmail.get(e);
      const sCreated = s.createdAt?.toDate?.()?.getTime?.() || 0;
      const curCreated = cur?.createdAt?.toDate?.()?.getTime?.() || 0;
      if (!cur || sCreated > curCreated) submittedByEmail.set(e, s);
    }
    return submissions.filter(s => {
      if (!s.isDraft || !s.email) return false;
      const e = String(s.email).toLowerCase().trim();
      const submitted = submittedByEmail.get(e);
      if (!submitted) return false;
      const dCreated = s.createdAt?.toDate?.()?.getTime?.() || 0;
      const sCreated = submitted.createdAt?.toDate?.()?.getTime?.() || 0;
      return dCreated < sCreated;
    }).map(d => ({
      draft: d,
      submitted: submittedByEmail.get(String(d.email).toLowerCase().trim()),
    }));
  }, [submissions]);

  const cleanupAllDuplicates = async () => {
    if (duplicateDrafts.length === 0) return;
    if (!confirm(`Delete ${duplicateDrafts.length} duplicate draft${duplicateDrafts.length === 1 ? '' : 's'}?\n\nEach one is an abandoned configurator session that has a matching submitted lead from the same person.`)) return;
    try {
      const batch = writeBatch(db);
      for (const pair of duplicateDrafts) batch.delete(firestoreDoc(db, 'submissions', pair.draft.id));
      await batch.commit();
      toast.success(`Cleaned up ${duplicateDrafts.length} duplicate draft${duplicateDrafts.length === 1 ? '' : 's'}`);
    } catch (e: any) {
      console.error(e);
      toast.error(`Cleanup failed: ${e?.message || 'unknown error'}`);
    }
  };

  const cleanupSingleDuplicate = async (draftId: string) => {
    if (!confirm('Delete this abandoned draft? The submitted lead with the same email is kept.')) return;
    try {
      await (await import('firebase/firestore')).deleteDoc(firestoreDoc(db, 'submissions', draftId));
      toast.success('Duplicate draft removed');
    } catch (e: any) {
      console.error(e);
      toast.error(`Delete failed: ${e?.message || 'unknown error'}`);
    }
  };

  // Draft / in-progress leads — shown as a banner so the team sees them
  // the moment they walk into the CRM. "Live" means still actively moving
  // through the configurator; "Abandoned" means idle 20+ minutes so
  // almost certainly dropped off without clicking Submit.
  const draftBuckets = useMemo(() => {
    const now = Date.now();
    const live: any[] = [];
    const abandoned: any[] = [];
    submissions.forEach(s => {
      if (!s.isDraft) return;
      const last = s.lastStepAt?.toDate?.() || s.updatedAt?.toDate?.() || s.createdAt?.toDate?.();
      const idleMin = last ? (now - last.getTime()) / 60000 : 0;
      if (idleMin >= 20) abandoned.push(s); else live.push(s);
    });
    return { live, abandoned };
  }, [submissions]);

  return (
    <div className="space-y-8">
      {/* Duplicate-drafts alert — surfaces drafts that have a matching
          submitted lead so admin can review/delete. Always rendered at
          the top so the admin sees it the moment they open the CRM. */}
      {duplicateDrafts.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap border-b border-amber-200">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  {duplicateDrafts.length} duplicate draft{duplicateDrafts.length === 1 ? '' : 's'} detected
                </h3>
                <p className="text-xs text-amber-800 mt-0.5 max-w-2xl">
                  These customers started as abandoned drafts but later submitted a real quote with the same email. The drafts are now redundant — review and delete to keep your inbox clean.
                </p>
              </div>
            </div>
            <button
              onClick={cleanupAllDuplicates}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 uppercase tracking-widest"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All ({duplicateDrafts.length})
            </button>
          </div>
          <div className="divide-y divide-amber-200 max-h-72 overflow-y-auto">
            {duplicateDrafts.map(({ draft, submitted }) => {
              const last = draft.lastStepAt?.toDate?.() || draft.updatedAt?.toDate?.() || draft.createdAt?.toDate?.() || null;
              const idleMin = last ? Math.round((Date.now() - last.getTime()) / 60000) : 0;
              const draftCreated = draft.createdAt?.toDate?.();
              const submittedCreated = submitted?.createdAt?.toDate?.();
              return (
                <div key={draft.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-amber-100/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900 truncate">{draft.name || draft.email || draft.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-amber-700 truncate">
                      Draft (Step {draft.currentStep || '?'}/5, {idleMin}m idle) {draftCreated ? `from ${draftCreated.toLocaleDateString()}` : ''}
                      {submittedCreated && ` → submitted ${submittedCreated.toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onOpenSubmission(submitted)}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-900 underline"
                    >
                      View submitted lead
                    </button>
                    <button
                      onClick={() => cleanupSingleDuplicate(draft.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700 border border-rose-300 rounded hover:bg-rose-500 hover:text-white"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Draft
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Live + abandoned draft banner */}
      {(draftBuckets.live.length > 0 || draftBuckets.abandoned.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {draftBuckets.live.length > 0 && (
            <button
              onClick={onGoToKanban}
              className="text-left bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 hover:border-orange-400 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center animate-pulse">●</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">Live Now · Configuring</p>
                  <p className="text-lg font-serif text-luxury-black mt-0.5">
                    {draftBuckets.live.length} {draftBuckets.live.length === 1 ? 'customer is' : 'customers are'} designing right now
                  </p>
                  <p className="text-[11px] text-orange-900/70 mt-1">
                    {draftBuckets.live.slice(0, 3).map(s => s.name).join(' · ')}
                    {draftBuckets.live.length > 3 && ` · +${draftBuckets.live.length - 3} more`}
                  </p>
                </div>
              </div>
            </button>
          )}
          {draftBuckets.abandoned.length > 0 && (
            <button
              onClick={onGoToKanban}
              className="text-left bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-2xl p-4 hover:border-rose-400 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Abandoned · Didn't Submit</p>
                  <p className="text-lg font-serif text-luxury-black mt-0.5">
                    {draftBuckets.abandoned.length} {draftBuckets.abandoned.length === 1 ? 'lead' : 'leads'} left without clicking Submit
                  </p>
                  <p className="text-[11px] text-rose-900/70 mt-1">
                    Follow up — these are warm leads that got interrupted. Click to review.
                  </p>
                </div>
              </div>
            </button>
          )}
        </section>
      )}

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

      {/* Funnel conversion — three-stage drop-off rates */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold">Funnel Conversion</h2>
          <span className="text-[10px] italic text-gray-400">'Engaged' = customer opened the proposal</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Lead → Engaged"
            value={`${stats.leadToEngaged.toFixed(1)}%`}
            sub={`${stats.engagedCount} of ${stats.submittedLeadsCount} leads opened the proposal`}
            accent="sky"
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            label="Engaged → Consultation"
            value={`${stats.engagedToConsult.toFixed(1)}%`}
            sub={`${stats.reachedConsultCount} of ${stats.engagedCount} engaged leads reached site visit`}
            accent="indigo"
            icon={<CalendarClock className="w-4 h-4" />}
          />
          <StatCard
            label="Consultation → Won"
            value={`${stats.consultToWon.toFixed(1)}%`}
            sub={`${stats.reachedWonCount} of ${stats.reachedConsultCount} consultations signed`}
            accent="emerald"
            icon={<FileCheck2 className="w-4 h-4" />}
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

      {/* Backup — provider-independent JSON export of all CRM data */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.25em] font-bold text-luxury-gold mb-3">Backup</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-luxury-black">Export full CRM backup</h3>
                <p className="text-xs text-gray-600 mt-0.5 max-w-xl">
                  Downloads every submission, activity, note, task, file, view session, job, bid, contractor and dealer profile as a single JSON file. Save it to your computer, Dropbox, or a USB drive — fully portable and not tied to Firebase.
                </p>
                {lastBackup && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    Last backup: <span className="font-semibold">{new Date(lastBackup.at).toLocaleString()}</span>
                    {' · '}{(lastBackup.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    {' · '}{lastBackup.counts?.submissions ?? 0} submissions
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={runBackup}
              disabled={backingUp}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-luxury-black text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-luxury-black/90 disabled:opacity-50 disabled:cursor-wait"
            >
              {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {backingUp ? (backupProgress?.step || 'Working…') : 'Download Backup'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
