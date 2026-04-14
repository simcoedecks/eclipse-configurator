import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { ProposalDocument } from '../components/ProposalDocument';

const sampleData = {
  name: 'John & Sarah Mitchell',
  email: 'j.mitchell@email.com',
  phone: '(416) 555-0192',
  address: '42 Lakeshore Blvd W',
  city: 'Toronto, ON M5V 1A1',
  date: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
  docNumber: 'EP-2026-0413',
  width: 16,
  depth: 12,
  height: 9,
  frameColorName: 'Black',
  louverColorName: 'White',
  basePrice: 24500,
  accessories: [
    { name: 'Motorized Screen (Front) (16\')', cost: 4200, quantity: 1 },
    { name: 'Motorized Screen (Back) (16\')', cost: 4200, quantity: 1 },
    { name: 'Motorized Screen (Left) (12\')', cost: 3150, quantity: 1 },
    { name: 'Privacy Wall (Right) (12\')', cost: 5940, quantity: 1 },
    { name: 'Bromic Platinum Smart-Heat 4500W', cost: 3431, quantity: 1 },
    { name: 'Bromic Affinity Smart-Heat Dimmer', cost: 1031, quantity: 1 },
    { name: 'Ceiling Fan', cost: 2750, quantity: 1 },
    { name: 'Wind & Rain Sensor', cost: 550, quantity: 1 },
    { name: 'Smart App Control', cost: 450, quantity: 1 },
  ],
  subtotal: 50202,
  discount: 0,
  discountPercentage: 0,
  discountedSubtotal: 50202,
  hst: 6526.26,
  total: 56728.26,
  visualizerProps: {
    width: 16,
    depth: 12,
    height: 9,
    accessories: new Set(['screen_front', 'screen_back', 'screen_left', 'wall_right', 'heater', 'fan', 'sensor', 'app_control']),
    frameColor: '#0A0A0A',
    louverColor: '#FFFFFF',
    louverAngle: 0,
    screenDrop: 100,
    guillotineOpen: 50,
    wallColor: '#0A0A0A',
    houseWallColor: '#e2e8f0',
    houseWall: 'none' as const,
    staticMode: true,
  },
};

export default function ProposalPreview() {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = document.querySelectorAll('#proposal-preview-visible .pdf-page');

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const pageElement = pages[i] as HTMLElement;

        const imgData = await toPng(pageElement, {
          pixelRatio: 3,
          backgroundColor: '#ffffff',
        });

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgRatio = imgProps.width / imgProps.height;
        const pageRatio = pdfWidth / pdfHeight;

        let finalWidth = pdfWidth;
        let finalHeight = pdfHeight;
        let x = 0;
        let y = 0;

        if (imgRatio > pageRatio) {
          finalHeight = pdfWidth / imgRatio;
          y = (pdfHeight - finalHeight) / 2;
        } else {
          finalWidth = pdfHeight * imgRatio;
          x = (pdfWidth - finalWidth) / 2;
        }

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      }

      pdf.save(`Eclipse_Proposal_${sampleData.docNumber}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF. Check the console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-300 py-10">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Proposal Preview</h1>
        <p className="text-gray-600 text-sm mb-4">Scroll down to see all pages. This is a preview only — not a live PDF.</p>
        <button
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          className="px-8 py-3 bg-[#1A1A1A] text-white font-bold text-sm uppercase tracking-wider hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Generating PDF...' : 'Download as PDF'}
        </button>
      </div>
      <div className="flex flex-col items-center gap-8">
        <style>{`
          #proposal-preview-visible {
            position: static !important;
            z-index: auto !important;
            pointer-events: auto !important;
          }
          #proposal-preview-visible .pdf-page {
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            margin: 0 auto;
          }
        `}</style>
        <div id="proposal-preview-visible">
          <ProposalDocument data={sampleData} isGeneratingPDF={false} previewMode={true} />
        </div>
      </div>
    </div>
  );
}
