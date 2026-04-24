import { Download } from 'lucide-react';

interface Props {
  submission: any;
  /** Compact button mode — just icon + label, no background */
  compact?: boolean;
  /** Override button text */
  label?: string;
}

/**
 * "Download PDF" for a submission. Opens the customer proposal view in
 * a new tab with ?auto=1, which triggers that page's own PDF download
 * handler — so admin and customer get byte-identical PDFs.
 */
export default function AdminPdfDownload({ submission, compact, label }: Props) {
  const handleDownload = () => {
    if (!submission?.id) return;
    window.open(`/proposal/${submission.id}?auto=1`, '_blank', 'noopener');
  };

  return (
    <button
      onClick={handleDownload}
      className={compact
        ? 'inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-luxury-gold'
        : 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-luxury-black rounded-lg text-xs font-bold hover:bg-luxury-gold/90'
      }
      title="Open the customer proposal view and download its PDF"
    >
      <Download className="w-3.5 h-3.5" />{label || 'Download PDF'}
    </button>
  );
}
