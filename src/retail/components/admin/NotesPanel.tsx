import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { addNote, deleteNote } from '../../lib/crmHelpers';
import { StickyNote, Send, Trash2 } from 'lucide-react';

interface Props { submissionId: string }

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotesPanel({ submissionId }: Props) {
  const [notes, setNotes] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'submissions', submissionId, 'notes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [submissionId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await addNote(submissionId, draft);
      setDraft('');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex items-start gap-2 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
          <StickyNote className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Internal note (not shown to the customer)…"
            rows={2}
            className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-amber-700/40"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-black text-white text-xs font-bold rounded-md hover:bg-luxury-black/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3 h-3" />
            Save
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-4">No internal notes yet. Anything you jot here stays invisible to the customer.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map(note => (
            <li key={note.id} className="group bg-amber-50 border border-amber-200 rounded-lg p-3 relative">
              <p className="text-sm text-luxury-black whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-amber-200/60 text-[11px] text-amber-900/60">
                <span>{note.actor} · {relativeTime(note.createdAt?.toDate?.() || null)}</span>
                <button
                  onClick={() => { if (confirm('Delete this note?')) deleteNote(submissionId, note.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-600 hover:text-rose-800"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
