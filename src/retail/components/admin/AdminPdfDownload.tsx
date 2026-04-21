import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { toJpeg, toPng } from 'html-to-image';
import { Download, Loader2 } from 'lucide-react';
import { ProposalDocument } from '../../../shared/components/ProposalDocument';
import { COLORS } from '../../../shared/lib/colors';
import { toast } from 'sonner';

interface Props {
  submission: any;
  /** Compact button mode — just icon + label, no background */
  compact?: boolean;
  /** Override button text */
  label?: string;
}

/**
 * Generates a fresh PDF of a submission's proposal, baked with any admin
 * custom line items, and downloads it to the admin's computer.
 * Uses the same ProposalDocument component that the customer PDF uses.
 */
export default function AdminPdfDownload({ submission, compact, label }: Props) {
  const [generating, setGenerating] = useState(false);
  const [showRender, setShowRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the pdfData from the submission doc
  const buildPdfData = () => {
    const cfg = submission.configuration || {};
    const pb = submission.pricingBreakdown || {};
    const date = submission.createdAt?.toDate?.()
      ? submission.createdAt.toDate().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    const docNumber = submission.id.slice(0, 8).toUpperCase();

    // Reconstruct colors (try to match by name)
    const frameColor = COLORS.find(c => c.name === cfg.frameColor)?.hex || '#0A0A0A';
    const louverColor = COLORS.find(c => c.name === cfg.louverColor)?.hex || '#F6F6F6';

    return {
      name: submission.name, email: submission.email, phone: submission.phone,
      address: submission.address, city: submission.city,
      date, docNumber,
      width: cfg.width, depth: cfg.depth, height: cfg.height,
      frameColorName: cfg.frameColor,
      louverColorName: cfg.louverColor,
      basePrice: pb.basePrice,
      accessories: pb.itemizedAccessories || [],
      subtotal: pb.subtotal,
      discount: pb.discount || 0,
      discountPercentage: pb.discountPercentage || 0,
      discountedSubtotal: pb.discountedSubtotal || pb.subtotal,
      hst: pb.hst,
      total: pb.total,
      customLineItems: submission.customLineItems || [],
      visualizerProps: {
        width: cfg.width, depth: cfg.depth, height: cfg.height,
        accessories: new Set<string>((pb.itemizedAccessories || []).map((a: any) => a.id).filter(Boolean)),
        frameColor, louverColor,
        louverAngle: 0, screenDrop: 100, guillotineOpen: 50,
        wallColor: frameColor, houseWallColor: '#e2e8f0',
        houseWall: 'none' as const,
        staticMode: true,
      },
    };
  };

  const handleDownload = async () => {
    setGenerating(true);
    setShowRender(true);
    try {
      // Wait for the hidden render to mount + 3D views to render
      await new Promise(r => setTimeout(r, 6000));

      const container = containerRef.current;
      if (!container) throw new Error('Container not ready');
      const pages = container.querySelectorAll('.pdf-page');
      if (pages.length === 0) throw new Error('No pages to render');

      const pdf = new jsPDF('p', 'mm', 'a4');
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const pageElement = pages[i] as HTMLElement;
        let imgData: string;
        let format: 'PNG' | 'JPEG' = 'PNG';
        // Use JPEG for the 3D renderings page (it's heavy + compresses well)
        const isLastRenderings = i === pages.length - 1 && pageElement.textContent?.includes('Renderings');
        if (isLastRenderings) {
          imgData = await toJpeg(pageElement, { pixelRatio: 3, quality: 0.92, backgroundColor: '#ffffff' });
          format = 'JPEG';
        } else {
          imgData = await toPng(pageElement, { pixelRatio: 3 });
        }
        const props = pdf.getImageProperties(imgData);
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const imgRatio = props.width / props.height;
        const pageRatio = pdfW / pdfH;
        let w = pdfW, h = pdfH, x = 0, y = 0;
        if (imgRatio > pageRatio) { h = pdfW / imgRatio; y = (pdfH - h) / 2; }
        else { w = pdfH * imgRatio; x = (pdfW - w) / 2; }
        pdf.addImage(imgData, format, x, y, w, h);
      }

      const filename = `Eclipse_Proposal_${submission.name?.replace(/\s+/g, '_') || submission.id.slice(0, 8)}.pdf`;
      pdf.save(filename);
      toast.success('PDF downloaded');
    } catch (err: any) {
      console.error('PDF generation failed', err);
      toast.error(`PDF generation failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setGenerating(false);
      setShowRender(false);
    }
  };

  return (
    <>
      <button
        onClick={handleDownload}
        disabled={generating}
        className={compact
          ? 'inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:text-luxury-gold disabled:opacity-50'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-luxury-black rounded-lg text-xs font-bold hover:bg-luxury-gold/90 disabled:opacity-50'
        }
      >
        {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : <><Download className="w-3.5 h-3.5" />{label || 'Download PDF'}</>}
      </button>

      {/* Hidden render used for PDF capture. Mount only while generating. */}
      {showRender && createPortal(
        <div
          ref={containerRef}
          className="fixed top-0 left-0 z-[-50] pointer-events-none bg-white"
          aria-hidden="true"
        >
          <ProposalDocument data={buildPdfData()} isGeneratingPDF={true} />
        </div>,
        document.body
      )}
    </>
  );
}
