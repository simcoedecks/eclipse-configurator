import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { FileText, Mail, MessageSquare, Flag, PlusCircle, CheckCircle2, Tag, Upload, Trash2, Eye, UserCheck, Edit3, MailCheck, MailOpen, MousePointerClick, MailX, AlertTriangle } from 'lucide-react';

interface Props { submissionId: string }

function iconFor(type: string) {
  switch (type) {
    case 'submission_created': return <FileText className="w-3.5 h-3.5" />;
    case 'email_sent':         return <Mail className="w-3.5 h-3.5" />;
    case 'email_delivered':    return <MailCheck className="w-3.5 h-3.5" />;
    case 'email_opened':       return <MailOpen className="w-3.5 h-3.5" />;
    case 'email_clicked':      return <MousePointerClick className="w-3.5 h-3.5" />;
    case 'email_bounced':      return <MailX className="w-3.5 h-3.5" />;
    case 'email_complained':   return <AlertTriangle className="w-3.5 h-3.5" />;
    case 'sms_sent':           return <MessageSquare className="w-3.5 h-3.5" />;
    case 'stage_changed':      return <Flag className="w-3.5 h-3.5" />;
    case 'note_added':         return <Edit3 className="w-3.5 h-3.5" />;
    case 'task_created':       return <PlusCircle className="w-3.5 h-3.5" />;
    case 'task_completed':     return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'signed':             return <UserCheck className="w-3.5 h-3.5" />;
    case 'tag_added':
    case 'tag_removed':        return <Tag className="w-3.5 h-3.5" />;
    case 'file_uploaded':      return <Upload className="w-3.5 h-3.5" />;
    case 'file_deleted':       return <Trash2 className="w-3.5 h-3.5" />;
    case 'viewed_by_admin':
    case 'viewed_by_customer':
    case 'proposal_opened':    return <Eye className="w-3.5 h-3.5" />;
    default:                   return <Flag className="w-3.5 h-3.5" />;
  }
}

function colorFor(type: string) {
  if (type === 'signed')           return 'bg-emerald-500 text-white';
  if (type === 'task_completed')   return 'bg-emerald-500 text-white';
  if (type === 'stage_changed')    return 'bg-luxury-gold text-white';
  if (type === 'email_sent' || type === 'sms_sent') return 'bg-indigo-500 text-white';
  if (type === 'email_delivered')  return 'bg-slate-400 text-white';
  if (type === 'email_opened')     return 'bg-emerald-500 text-white';
  if (type === 'email_clicked')    return 'bg-emerald-600 text-white';
  if (type === 'email_bounced' || type === 'email_complained') return 'bg-rose-500 text-white';
  if (type === 'file_uploaded')    return 'bg-sky-500 text-white';
  if (type === 'file_deleted')     return 'bg-rose-500 text-white';
  return 'bg-slate-200 text-slate-700';
}

function relativeTime(date: Date | null): string {
  if (!date) return 'just now';
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

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return 'less than 15s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export default function ActivityTimeline({ submissionId }: Props) {
  const [activities, setActivities] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    const aQuery = query(
      collection(db, 'submissions', submissionId, 'activities'),
      orderBy('createdAt', 'desc')
    );
    const unsubA = onSnapshot(aQuery, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Customer view sessions — one doc per page open. We render each as
    // its own row in the timeline so the admin can see individual visits.
    const sQuery = query(
      collection(db, 'submissions', submissionId, 'viewSessions'),
      orderBy('startedAt', 'desc')
    );
    const unsubS = onSnapshot(
      sQuery,
      (snap) => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      // Quietly swallow permission errors if rules haven't been deployed
      // yet — the rest of the timeline still renders.
      (err) => console.warn('view-sessions subscribe failed', err)
    );

    return () => { unsubA(); unsubS(); };
  }, [submissionId]);

  // Merge activities + sessions into a single time-ordered list.
  type Row = {
    id: string;
    kind: 'activity' | 'session';
    when: Date | null;
    type?: string;
    message?: string;
    actor?: string;
    durationSeconds?: number;
  };
  const rows: Row[] = [
    ...activities.map((a): Row => ({
      id: `a:${a.id}`,
      kind: 'activity',
      when: a.createdAt?.toDate?.() || null,
      type: a.type,
      message: a.message,
      actor: a.actor,
    })),
    ...sessions.map((s): Row => ({
      id: `s:${s.id}`,
      kind: 'session',
      when: s.startedAt?.toDate?.() || null,
      durationSeconds: s.durationSeconds || 0,
      actor: 'customer',
    })),
  ].sort((a, b) => (b.when?.getTime() || 0) - (a.when?.getTime() || 0));

  if (rows.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-gray-400 italic">
        No activity yet. Actions you take on this lead will appear here.
      </div>
    );
  }

  return (
    <ol className="space-y-3 relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
      {rows.map((r) => {
        if (r.kind === 'session') {
          const dur = r.durationSeconds || 0;
          const engaged = dur >= 60;
          return (
            <li key={r.id} className="relative">
              <div className={`absolute -left-[calc(1.5rem-2px)] top-0.5 w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-white shadow-sm ${engaged ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
                <Eye className="w-3.5 h-3.5" />
              </div>
              <div className="pl-2">
                <p className="text-sm text-luxury-black leading-tight">
                  Customer viewed proposal · <span className="font-semibold">{formatDuration(dur)}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">customer · {relativeTime(r.when)}</p>
              </div>
            </li>
          );
        }
        return (
          <li key={r.id} className="relative">
            <div className={`absolute -left-[calc(1.5rem-2px)] top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${colorFor(r.type || '')} ring-2 ring-white shadow-sm`}>
              {iconFor(r.type || '')}
            </div>
            <div className="pl-2">
              <p className="text-sm text-luxury-black leading-tight">{r.message}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {r.actor && <span>{r.actor === 'system' ? 'System' : r.actor} · </span>}
                {relativeTime(r.when)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
