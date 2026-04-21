import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { addTask, toggleTask, deleteTask } from '../../lib/crmHelpers';
import { CheckCircle2, Circle, CalendarClock, Trash2, AlertTriangle, Plus } from 'lucide-react';

interface Props { submissionId: string }

function formatDueLabel(due: Date | null): { label: string; status: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!due) return { label: 'No due date', status: 'none' };
  const now = new Date();
  const msDiff = due.getTime() - now.getTime();
  const dayDiff = Math.round(msDiff / 86400000);
  const dateLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (msDiff < 0) return { label: `Overdue · ${dateLabel}`, status: 'overdue' };
  if (dayDiff === 0) return { label: `Today · ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, status: 'today' };
  if (dayDiff <= 3) return { label: `In ${dayDiff}d · ${dateLabel}`, status: 'soon' };
  return { label: dateLabel, status: 'later' };
}

export default function TasksPanel({ submissionId }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'submissions', submissionId, 'tasks'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [submissionId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await addTask(submissionId, {
        title,
        dueAt: dueLocal ? new Date(dueLocal) : null,
      });
      setTitle('');
      setDueLocal('');
    } finally { setBusy(false); }
  };

  const open = tasks.filter(t => !t.completedAt);
  const done = tasks.filter(t => t.completedAt);

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="flex items-start gap-2 mb-2">
          <Plus className="w-4 h-4 text-slate-500 mt-1 shrink-0" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task (e.g. Call about payment schedule)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-2 pl-6">
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700"
          />
          <button
            type="submit"
            disabled={!title.trim() || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white text-xs font-bold rounded-md hover:bg-luxury-black/90 disabled:opacity-40"
          >
            Add Task
          </button>
        </div>
      </form>

      {tasks.length === 0 && (
        <p className="text-xs text-gray-400 italic text-center py-4">No tasks yet.</p>
      )}

      {open.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {open.map(t => {
            const due = t.dueAt?.toDate?.() || (t.dueAt ? new Date(t.dueAt) : null);
            const { label, status } = formatDueLabel(due);
            return (
              <li key={t.id} className={`group flex items-start gap-2 p-2.5 rounded-lg border transition-colors ${
                status === 'overdue' ? 'bg-rose-50 border-rose-200' :
                status === 'today'   ? 'bg-amber-50 border-amber-200' :
                'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <button
                  onClick={() => toggleTask(submissionId, t.id, true, t.title)}
                  className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                >
                  <Circle className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-luxury-black">{t.title}</p>
                  <div className={`inline-flex items-center gap-1 text-[11px] mt-0.5 font-semibold ${
                    status === 'overdue' ? 'text-rose-600' :
                    status === 'today'   ? 'text-amber-700' :
                    status === 'soon'    ? 'text-luxury-gold' :
                    'text-slate-500'
                  }`}>
                    {status === 'overdue' ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                    {label}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm('Delete this task?')) deleteTask(submissionId, t.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-700 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-semibold mb-1">
            {done.length} completed
          </summary>
          <ul className="space-y-1 mt-1">
            {done.map(t => (
              <li key={t.id} className="group flex items-start gap-2 p-2 rounded-lg bg-slate-50 text-slate-500">
                <button
                  onClick={() => toggleTask(submissionId, t.id, false, t.title)}
                  className="mt-0.5 text-emerald-500 hover:text-slate-400 transition-colors shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <span className="line-through flex-1">{t.title}</span>
                <button
                  onClick={() => deleteTask(submissionId, t.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-700 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
