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

export default function ActivityTimeline({ submissionId }: Props) {
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'submissions', submissionId, 'activities'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [submissionId]);

  if (activities.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-gray-400 italic">
        No activity yet. Actions you take on this lead will appear here.
      </div>
    );
  }

  return (
    <ol className="space-y-3 relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
      {activities.map((a) => {
        const date = a.createdAt?.toDate?.() || null;
        return (
          <li key={a.id} className="relative">
            <div className={`absolute -left-[calc(1.5rem-2px)] top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${colorFor(a.type)} ring-2 ring-white shadow-sm`}>
              {iconFor(a.type)}
            </div>
            <div className="pl-2">
              <p className="text-sm text-luxury-black leading-tight">{a.message}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {a.actor && <span>{a.actor === 'system' ? 'System' : a.actor} · </span>}
                {relativeTime(date)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
