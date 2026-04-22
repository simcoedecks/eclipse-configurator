import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { toast } from 'sonner';

interface Props {
  /** Firestore collection the submission lives in (default: 'submissions') */
  collection?: string;
  /** Submission document id */
  docId: string;
  /** The field path being edited. Supports nested paths like 'configuration.customerNotes'
   *  — we'll expand them into nested setDoc merges. */
  path: string;
  /** Current display value */
  value: string | undefined | null;
  /** Display variant */
  multiline?: boolean;
  placeholder?: string;
  /** Extra classes for the displayed text */
  className?: string;
  /** Validator — return an error message string to block save, or null to allow */
  validate?: (next: string) => string | null;
}

/**
 * Read-only text by default, pencil icon to enter edit mode, saves to
 * Firestore on Check / Enter / Blur, cancels on X / Escape.
 *
 * Used across the admin detail modal to make customer fields
 * (name, email, phone, address, city, notes, etc.) editable in place.
 */
export default function InlineEditField({
  collection = 'submissions',
  docId, path, value, multiline = false, placeholder = '—', className = '', validate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { if (!editing) setText(value || ''); }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) (inputRef.current as HTMLInputElement).select();
    }
  }, [editing]);

  const commit = async () => {
    const next = text.trim();
    const current = (value || '').trim();
    if (next === current) { setEditing(false); return; }
    if (validate) {
      const err = validate(next);
      if (err) { toast.error(err); return; }
    }
    setSaving(true);
    try {
      // Build a nested update payload from the dotted path.
      // 'configuration.customerNotes' → { configuration: { customerNotes: next } }
      const parts = path.split('.');
      const payload: any = {};
      let cursor = payload;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = {};
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = next;
      await setDoc(doc(db, collection, docId), payload, { merge: true });
      toast.success('Saved');
      setEditing(false);
    } catch (err) {
      console.error('InlineEditField save failed', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => { setText(value || ''); setEditing(false); };

  if (!editing) {
    return (
      <span className={`group inline-flex items-center gap-1.5 ${className}`}>
        <span className={value ? '' : 'text-gray-400 italic'}>{value || placeholder}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-luxury-gold"
          aria-label="Edit"
          title="Edit"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </span>
    );
  }

  const commonProps = {
    value: text,
    onChange: (e: any) => setText(e.target.value),
    onKeyDown: (e: any) => {
      if (e.key === 'Escape') cancel();
      else if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
    },
    disabled: saving,
    placeholder,
  };

  return (
    <span className="inline-flex items-start gap-1 w-full">
      {multiline ? (
        <textarea
          ref={inputRef as any}
          {...commonProps}
          rows={3}
          className="flex-1 px-2 py-1 text-sm border border-luxury-gold rounded outline-none focus:ring-1 focus:ring-luxury-gold disabled:opacity-60"
        />
      ) : (
        <input
          ref={inputRef as any}
          {...commonProps}
          className="flex-1 px-2 py-0.5 text-sm border border-luxury-gold rounded outline-none focus:ring-1 focus:ring-luxury-gold disabled:opacity-60"
        />
      )}
      <button type="button" onClick={commit} disabled={saving}
        className="text-emerald-600 hover:text-emerald-700 p-1 disabled:opacity-50" aria-label="Save">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={cancel} disabled={saving}
        className="text-rose-600 hover:text-rose-700 p-1 disabled:opacity-50" aria-label="Cancel">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
