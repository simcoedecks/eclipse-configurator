import { useState, type FormEvent } from 'react';
import { addTag, removeTag } from '../../lib/crmHelpers';
import { X, Plus, Tag as TagIcon } from 'lucide-react';

interface Props {
  submission: any;
}

// Pre-built tag suggestions with distinct colors
const SUGGESTED_TAGS: Array<{ label: string; color: string }> = [
  { label: 'VIP', color: 'bg-luxury-gold/20 text-amber-900 border-luxury-gold/40' },
  { label: 'Hot Lead', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  { label: 'Referral', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { label: 'Needs Financing', color: 'bg-violet-100 text-violet-800 border-violet-300' },
  { label: 'Fall Install', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { label: 'Tire Kicker', color: 'bg-slate-100 text-slate-700 border-slate-300' },
];

function tagStyle(tag: string): string {
  const preset = SUGGESTED_TAGS.find(s => s.label.toLowerCase() === tag.toLowerCase());
  return preset?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

export default function TagManager({ submission }: Props) {
  const [input, setInput] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const tags: string[] = submission.tags || [];

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await addTag(submission.id, tags, input);
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tagStyle(tag)}`}>
            {tag}
            <button
              onClick={() => removeTag(submission.id, tags, tag)}
              className="hover:opacity-60"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-[11px] text-gray-400 italic">No tags yet</span>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <TagIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder="Add tag…"
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-luxury-gold focus:border-transparent"
          />
          {showSuggest && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-2 flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter(s => !tags.includes(s.label) && (!input || s.label.toLowerCase().includes(input.toLowerCase()))).map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => { addTag(submission.id, tags, s.label); setInput(''); }}
                  className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 hover:brightness-95 ${s.color}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-1.5 bg-luxury-black text-white rounded-md hover:bg-luxury-black/90 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
