import React from 'react';
import PergolaVisualizer from './PergolaVisualizer';

export const ProposalDocument = ({ data, isGeneratingPDF, previewMode }: { data: any, isGeneratingPDF?: boolean, previewMode?: boolean }) => {
  const {
    name, email, phone, address, city, date, docNumber,
    width, depth, height, frameColorName, louverColorName,
    basePrice, accessories, subtotal, discount, discountPercentage, discountedSubtotal, hst, total, visualizerProps
  } = data;

  const totalPagesCount = (isGeneratingPDF || previewMode) && visualizerProps ? 5 : 4;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const Header = ({ pageNum, totalPages }: { pageNum: number, totalPages: number }) => (
    <div className="flex justify-between items-center border-b-2 border-[#C5A059] pb-4 mb-6">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="Logo" className="h-14 object-contain" crossOrigin="anonymous" />
      </div>
      <div className="text-right text-[9px] text-[#333] leading-tight">
        <p className="font-bold text-[10px]">Eclipse Aluminum Pergola</p>
        <p>www.eclipsepergola.ca</p>
        <p>info@eclipsepergola.ca</p>
        <p>289-855-2977 (Office)</p>
        <p className="mt-2 text-[#9ca3af] text-[8px]">Page {pageNum} of {totalPages}</p>
      </div>
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-[#1A1A1A] text-[#ffffff] text-center py-2 font-bold text-[11px] mb-4 uppercase tracking-wider">
      {children}
    </div>
  );

  const GoldBar = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-[#C5A059] text-[#ffffff] text-center py-1.5 font-bold text-[10px] mb-3 uppercase tracking-wider">
      {children}
    </div>
  );

  if (!isGeneratingPDF && !previewMode) return null;

  return (
    <div
      id="proposal-capture"
      className={previewMode ? "bg-white" : "fixed top-0 left-0 z-[-50] pointer-events-none bg-white"}
      style={{ width: '210mm', minHeight: '297mm', transform: 'none' }}
    >
      {/* ═══════════════════════ PAGE 1: COVER ═══════════════════════ */}
      <div className="pdf-page w-[210mm] h-[297mm] bg-[#ffffff] text-[#1A1A1A] p-[15mm] flex flex-col relative box-border">
        <Header pageNum={1} totalPages={totalPagesCount} />

        {/* Hero Image */}
        <div className="w-full h-[80mm] mb-4 overflow-hidden rounded-sm border border-[#e5e7eb]">
          <img src="/pergola.jpg" alt="Eclipse Pergola" className="w-full h-full object-cover" crossOrigin="anonymous" />
        </div>

        <SectionTitle>Customer Information</SectionTitle>
        <div className="grid grid-cols-[140px_1fr] gap-y-2 text-[10px] mb-6">
          {[
            ['Customer Name', name || 'N/A'],
            ['Installation Address', `${address || 'N/A'}, ${city || 'N/A'}`],
            ['Phone Number(s)', phone || 'N/A'],
            ['Email Address', email || 'N/A'],
            ['Document Number', `Doc # ${docNumber}`],
            ['Date', date],
          ].map(([label, value], i) => (
            <React.Fragment key={i}>
              <div className="border-b border-[#e5e7eb] pb-1.5 font-medium text-[#666]">{label}</div>
              <div className="border-b border-[#e5e7eb] pb-1.5 font-bold">{value}</div>
            </React.Fragment>
          ))}
        </div>

        <SectionTitle>Proposal Overview</SectionTitle>
        <p className="text-[9px] leading-relaxed mb-4">
          This quote is provided for estimation purposes only and is based on preliminary information. Final pricing, design details, and material selections may vary. If you wish to proceed, we offer an on-site consultation where we take precise measurements, assess specific project requirements, and develop a customized design that aligns with your vision and needs.
        </p>

        <div className="bg-[#FAF9F6] border border-[#e5e7eb] p-4 text-[9px] leading-relaxed rounded-sm">
          <p className="font-bold mb-1">This Proposal Includes:</p>
          <p>1 — Pergola Specifications & Pricing</p>
          <p>2 — Optional Features & Accessories</p>
          <p>3 — Terms, Conditions & Payment</p>
          <p>4 — 3D Renderings (Perspective, Top, Front & Side Views)</p>
        </div>
      </div>

      {/* ═══════════════════════ PAGE 2: SPECS & PRICING ═══════════════════════ */}
      <div className="pdf-page w-[210mm] h-[297mm] bg-[#ffffff] text-[#1A1A1A] p-[15mm] flex flex-col relative box-border">
        <Header pageNum={2} totalPages={totalPagesCount} />

        <SectionTitle>Motorized Louvered Pergola with Perimeter Lighting</SectionTitle>

        {/* Price header row */}
        <div className="bg-[#FAF9F6] grid grid-cols-[1fr_100px_50px_100px] py-2 px-3 font-bold text-[9px] mb-1 border border-[#e5e7eb] uppercase tracking-wider text-[#666]">
          <div>Item Description</div>
          <div className="text-center">Price</div>
          <div className="text-center">Qty</div>
          <div className="text-right">Subtotal</div>
        </div>

        <div className="grid grid-cols-[1fr_100px_50px_100px] px-3 text-[10px] py-3 border-b border-[#e5e7eb]">
          <div>
            <div className="font-bold text-[11px]">Motorized Aluminum Louvered Pergola</div>
            <div className="text-[8px] italic text-[#888] mt-0.5">Includes motorized louver system &amp; LED perimeter lighting</div>
          </div>
          <div className="text-center">${fmt(basePrice)}</div>
          <div className="text-center">1</div>
          <div className="text-right font-bold">${fmt(basePrice)}</div>
        </div>

        {accessories.find((a: any) => a.id === 'louver-upgrade' || a.name?.toLowerCase().includes('woodgrain louver')) && (() => {
          const upgrade = accessories.find((a: any) => a.id === 'louver-upgrade' || a.name?.toLowerCase().includes('woodgrain louver'))!;
          return (
            <div className="grid grid-cols-[1fr_100px_50px_100px] px-3 text-[10px] py-2 border-b border-[#e5e7eb] bg-[#FAF9F6]">
              <div className="pl-4"><span className="text-[#666]">↳</span> <span className="font-bold">{upgrade.name}</span></div>
              <div className="text-center">${fmt(upgrade.cost / (upgrade.quantity || 1))}</div>
              <div className="text-center">{upgrade.quantity || 1}</div>
              <div className="text-right font-bold">${fmt(upgrade.cost)}</div>
            </div>
          );
        })()}

        {/* Specifications */}
        <div className="px-3 text-[10px] leading-relaxed space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            <div>Pergola Width: <span className="font-bold">{width} Feet</span></div>
            <div>Pergola Depth: <span className="font-bold">{depth} Feet</span></div>
            <div>Pergola Height: <span className="font-bold">{height} Feet</span></div>
            <div>Height Below Beams: <span className="font-bold">{height * 12 - 10}"–{height * 12}"</span></div>
          </div>

          <div className="border-t border-[#e5e7eb] pt-3">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <div>Frame Colour: <span className="font-bold">{frameColorName}</span></div>
              <div>Louver Colour: <span className="font-bold">{louverColorName}</span></div>
              <div>Number of Posts: <span className="font-bold">4 Posts</span></div>
              <div>Configuration: <span className="font-bold">Free Standing</span></div>
            </div>
            <p className="text-[9px] text-[#666] mt-1 italic">*Additional colours available but may increase lead time</p>
          </div>

          <GoldBar>Technical Specifications</GoldBar>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[10px]">
            <div>Column Extrusion: <span className="font-bold">7" × 7"</span></div>
            <div>Gutter Beam: <span className="font-bold">5" × 11"</span></div>
            <div>Louver Blade: <span className="font-bold">8"</span></div>
            <div>Motor: <span className="font-bold">Linear Actuator</span></div>
            <div>Control: <span className="font-bold">Remote Controllable</span></div>
            <div>Lighting: <span className="font-bold">Perimeter LED (Included)</span></div>
          </div>

          <div className="bg-[#FAF9F6] border border-[#e5e7eb] p-3 rounded-sm mt-3">
            <p className="font-bold text-[10px] mb-1">Features</p>
            <div className="grid grid-cols-2 gap-1 text-[9px]">
              <p>• Suitable for all-season use</p>
              <p>• Stainless steel connecting components</p>
              <p>• Anchored freestanding or wall-mounted</p>
              <p>• Concrete, steel & wood compatible</p>
            </div>
          </div>

          <div className="flex gap-4 mt-3 text-[9px]">
            <div className="flex-1 bg-[#1A1A1A] text-white p-3 rounded-sm text-center">
              <p className="text-[#C5A059] font-bold text-[10px]">10 Year Warranty</p>
              <p>Structure & Powder Coating</p>
            </div>
            <div className="flex-1 bg-[#1A1A1A] text-white p-3 rounded-sm text-center">
              <p className="text-[#C5A059] font-bold text-[10px]">5 Year Warranty</p>
              <p>Motors & Electronics</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ PAGE 3: ACCESSORIES & TOTALS ═══════════════════════ */}
      <div className="pdf-page w-[210mm] h-[297mm] bg-[#ffffff] text-[#1A1A1A] p-[15mm] flex flex-col relative box-border">
        <Header pageNum={3} totalPages={totalPagesCount} />

        {accessories.length > 0 && (() => {
          // Exclude louver upgrade — shown on Page 2 under pergola
          const filteredAccessories = accessories.filter((acc: any) =>
            acc.id !== 'louver-upgrade' &&
            !acc.name?.toLowerCase().includes('woodgrain louver')
          );
          const wallCoverages = filteredAccessories.filter((acc: any) =>
            acc.name?.toLowerCase().includes('screen') ||
            acc.name?.toLowerCase().includes('wall') ||
            acc.name?.toLowerCase().includes('guillotine')
          );
          const otherAccessories = filteredAccessories.filter((acc: any) =>
            !acc.name?.toLowerCase().includes('screen') &&
            !acc.name?.toLowerCase().includes('wall') &&
            !acc.name?.toLowerCase().includes('guillotine')
          );

          const wallCoverageImages: { src: string; label: string }[] = [];
          const hasScreens = wallCoverages.some((a: any) => a.name?.toLowerCase().includes('screen'));
          const hasWalls = wallCoverages.some((a: any) => a.name?.toLowerCase().includes('wall'));
          const hasGuillotine = wallCoverages.some((a: any) => a.name?.toLowerCase().includes('guillotine'));
          if (hasScreens) wallCoverageImages.push({ src: '/motorizedscreens.png', label: 'Motorized Screens' });
          if (hasWalls) wallCoverageImages.push({ src: '/privacywall.png', label: 'Privacy Walls' });
          if (hasGuillotine) wallCoverageImages.push({ src: '/motorizedscreens.png', label: 'Guillotine Windows' });

          const otherImages: { src: string; label: string }[] = [];
          if (otherAccessories.some((a: any) => a.name?.toLowerCase().includes('heater') || a.name?.toLowerCase().includes('smart-heat'))) otherImages.push({ src: '/bromic-heater.jpg', label: 'Bromic Heater' });
          if (otherAccessories.some((a: any) => a.name?.toLowerCase().includes('fan'))) otherImages.push({ src: '/ceiling-fan.jpg', label: 'Ceiling Fan' });
          if (otherAccessories.some((a: any) => a.name?.toLowerCase().includes('sensor'))) otherImages.push({ src: '/wind-rain-sensor.jpg', label: 'Wind & Rain Sensor' });
          if (otherAccessories.some((a: any) => a.name?.toLowerCase().includes('app'))) otherImages.push({ src: '/smart-app-control.jpg', label: 'Smart App Control' });

          const PriceHeader = () => (
            <div className="bg-[#FAF9F6] grid grid-cols-[1fr_100px_50px_100px] py-2 px-3 font-bold text-[9px] mb-1 border border-[#e5e7eb] uppercase tracking-wider text-[#666]">
              <div>Item Description</div>
              <div className="text-center">Price</div>
              <div className="text-center">Qty</div>
              <div className="text-right">Subtotal</div>
            </div>
          );

          const AccessoryRow = ({ acc }: { acc: any }) => (
            <div className="grid grid-cols-[1fr_100px_50px_100px] px-3 text-[10px] py-2 border-b border-[#f0f0f0]">
              <div><span className="font-bold">{acc.name}</span></div>
              <div className="text-center">${fmt(acc.cost / (acc.quantity || 1))}</div>
              <div className="text-center">{acc.quantity || 1}</div>
              <div className="text-right font-bold">${fmt(acc.cost)}</div>
            </div>
          );

          const ImageStrip = ({ images }: { images: { src: string; label: string }[] }) => (
            images.length > 0 ? (
              <div className="flex gap-2 mb-3">
                {images.map((img, i) => (
                  <div key={i} className="flex-1 text-center" style={{ maxWidth: `${100 / Math.min(images.length, 4)}%` }}>
                    <div className="h-[50px] flex items-center justify-center bg-[#FAF9F6] border border-[#e5e7eb] rounded-sm overflow-hidden">
                      <img src={img.src} alt={img.label} className="h-full object-contain p-1" crossOrigin="anonymous" />
                    </div>
                    <p className="text-[7px] text-[#999] mt-0.5">{img.label}</p>
                  </div>
                ))}
              </div>
            ) : null
          );

          return (
            <>
              {wallCoverages.length > 0 && (
                <>
                  <SectionTitle>Wall Coverages — Motorized Screens & Privacy Walls</SectionTitle>
                  <ImageStrip images={wallCoverageImages} />
                  <PriceHeader />
                  {wallCoverages.map((acc: any, idx: number) => <AccessoryRow key={`wc-${idx}`} acc={acc} />)}
                  <p className="text-[8px] text-[#666] italic mt-2 px-3 mb-4">
                    *Due to the precise nature of the motorized screens we recommend final measuring once the pergola is installed. Please allow approximately 3 weeks for screens after installation.
                  </p>
                </>
              )}

              {otherAccessories.length > 0 && (
                <>
                  <GoldBar>Additional Features & Accessories</GoldBar>
                  <ImageStrip images={otherImages} />
                  <PriceHeader />
                  {otherAccessories.map((acc: any, idx: number) => <AccessoryRow key={`oa-${idx}`} acc={acc} />)}
                  {otherAccessories.some((a: any) => a.name?.toLowerCase().includes('heater') || a.name?.toLowerCase().includes('smart-heat')) && (
                    <p className="text-[8px] text-[#666] italic mt-2 px-3">
                      *Heaters must be installed by a licensed electrician at additional cost.
                    </p>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Totals */}
        <div className="mt-auto">
          <SectionTitle>Project Totals</SectionTitle>

          <div className="flex flex-col items-end text-[11px] mb-6 pr-2 space-y-1">
            <div className="flex w-72 justify-between py-1">
              <span>Subtotal (CAD)</span>
              <span className="font-bold">${fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <>
                <div className="flex w-72 justify-between text-emerald-600 py-1">
                  <span>Contractor Discount ({discountPercentage}%)</span>
                  <span className="font-bold">-${fmt(discount)}</span>
                </div>
                <div className="flex w-72 justify-between border-t border-[#e5e7eb] pt-1.5">
                  <span>Discounted Subtotal</span>
                  <span className="font-bold">${fmt(discountedSubtotal)}</span>
                </div>
              </>
            )}
            <div className="flex w-72 justify-between py-1">
              <span>HST 13%</span>
              <span className="font-bold">${fmt(hst)}</span>
            </div>
            <div className="flex w-72 justify-between text-[14px] mt-2 pt-3 border-t-2 border-[#C5A059]">
              <span className="font-bold">Total Investment</span>
              <span className="font-bold text-[#C5A059]">${fmt(total)}</span>
            </div>
            <div className="text-[8px] text-[#9ca3af] mt-2 text-right">
              Price subject to duties and fees<br/>
              *Price quoted above is valid for 30 days
            </div>
            <p className="text-[8px] italic text-[#666] leading-relaxed mt-2 pt-2 border-t border-[#f0f0f0]">
              Pricing includes installation under normal circumstances. Should any additional work be required, the price will be adjusted to reflect the revised scope.
            </p>
            <p className="text-[8px] italic text-[#666] leading-relaxed mt-1.5">
              Please note that the configurator is provided for budgetary purposes only. Each pergola must be finalized with a site visit so we can provide an accurate final quote based on the specific site conditions and project details.
            </p>
          </div>

          <GoldBar>Payment Terms</GoldBar>

          <div className="text-[9px] space-y-1.5 px-2">
            <div className="flex justify-between border-b border-[#f0f0f0] pb-1">
              <span className="font-bold">50% due on signing</span>
              <span className="text-[#666]">Deposit to begin production</span>
            </div>
            <div className="flex justify-between border-b border-[#f0f0f0] pb-1">
              <span className="font-bold">30% due on pergola delivery</span>
              <span className="text-[#666]">Prior to installation</span>
            </div>
            <div className="flex justify-between border-b border-[#f0f0f0] pb-1">
              <span className="font-bold">Balance due on screen delivery</span>
              <span className="text-[#666]">Final payment</span>
            </div>
            <p className="text-[8px] text-[#666] pt-1">
              Payments accepted via wire transfer, Interac e-Transfer to info@eclipsepergola.ca, cash, or cheque payable to "Eclipse Pergola Inc."
              <br/>*Cheque payments add 5 business days for verification.
              <span className="font-bold ml-2">GST/HST: 72135 6426 RT0001</span>
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ PAGE 4: TERMS & CONDITIONS ═══════════════════════ */}
      <div className="pdf-page w-[210mm] h-[297mm] bg-[#ffffff] text-[#1A1A1A] p-[15mm] flex flex-col relative box-border">
        <Header pageNum={4} totalPages={totalPagesCount} />

        <SectionTitle>Terms & Conditions</SectionTitle>

        <div className="space-y-3 text-[9px] leading-relaxed">
          {[
            { title: 'Deposit Requirement', body: 'Projects will not be placed into the production queue until full deposit funds have cleared into Eclipse Pergola Inc.\'s bank account.' },
            { title: 'Clearing of Funds', body: 'Payments made by cheque or other non-instant methods are subject to a minimum five (5) business day hold to verify funds. The project will enter the production queue only after confirmation of cleared payment.' },
            { title: 'Partial Deposits', body: 'Projects are not released into production until the full required deposit amount has been received and cleared. Partial payments do not reserve a place in the production schedule.' },
            { title: 'Production Timeline', body: 'Our delivery turnaround time is 6–8 weeks from the time we have deposit cleared and final measurements. Any delay in receiving or clearing the deposit will result in a corresponding delay in the production and installation schedule.' },
            { title: 'Late Payments', body: 'If a deposit or payment is received later than the agreed date, the project timeline will be extended by an equivalent period.' },
            { title: 'Change Orders', body: 'Change orders are due in full upon issuance and may affect schedules going forward.' },
            { title: 'Electrical Work', body: 'A licensed electrician is required for installation of heaters and ceiling fans. Licensed electrician to be supplied by Eclipse at additional cost. Additional electrical outlets may be added within the enclosure.' },
            { title: 'Measurements', body: 'Dimensions are approximate for quoting purposes only and must be verified on site. Final scaled renderings are signed off with exact dimensions prior to production.' },
            { title: 'Permitting', body: 'Permitting costs are not included. If permit facilitation is necessary, additional costs apply. Pergolas can be attached to home in compliance with OBC.' },
          ].map((term, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-[#C5A059] text-white flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5">{i + 1}</div>
              <div className="flex-1">
                <p className="font-bold text-[10px] mb-0.5">{term.title}</p>
                <p className="text-[#444]">{term.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <div className="bg-[#FAF9F6] border border-[#e5e7eb] p-4 rounded-sm">
            <p className="text-[9px] leading-relaxed mb-3">
              <span className="font-bold">Important Notes:</span> All pricing includes installation unless otherwise noted. Wood deck applications will require additional framing for support. All pergola posts require solid embedment of structural lag bolts. Additional addendums will be required for technical details (detailed drawings, colour selections, fabric selections).
            </p>
            <div className="flex gap-8 text-[9px]">
              <div className="flex-1">
                <p className="text-[8px] text-[#999] mb-1">Customer Signature</p>
                <div className="border-b border-[#1A1A1A] h-8"></div>
                <p className="text-[8px] text-[#999] mt-1">{name || 'Customer Name'}</p>
              </div>
              <div className="flex-1">
                <p className="text-[8px] text-[#999] mb-1">Date</p>
                <div className="border-b border-[#1A1A1A] h-8"></div>
                <p className="text-[8px] text-[#999] mt-1">{date}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ PAGE 5: 3D VIEWS ═══════════════════════ */}
      {(isGeneratingPDF || previewMode) && visualizerProps && (
        <div className="pdf-page w-[210mm] h-[297mm] bg-[#ffffff] text-[#1A1A1A] p-[15mm] flex flex-col relative box-border">
          <Header pageNum={totalPagesCount} totalPages={totalPagesCount} />

          <SectionTitle>Pergola Renderings — {width}' × {depth}' × {height}'</SectionTitle>

          <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0">
            {[
              { view: 'perspective', label: '3D Perspective View' },
              { view: 'top', label: 'Top View' },
              { view: 'front', label: 'Front View' },
              { view: 'side', label: 'Side View' },
            ].map(({ view, label }) => (
              <div key={view} className="border border-[#e5e7eb] rounded-sm overflow-hidden relative flex flex-col">
                <div className="bg-[#1A1A1A] text-[#C5A059] text-center py-1.5 text-[9px] font-bold uppercase tracking-wider">{label}</div>
                <div className="flex-1 relative min-h-0 bg-[#f1f5f9]">
                  <div className="absolute inset-0">
                    <PergolaVisualizer {...visualizerProps} view={view} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-3 text-[8px] text-[#999]">
            {frameColorName} frame • {louverColorName} louvers • {width}' W × {depth}' D × {height}' H
          </div>
        </div>
      )}
    </div>
  );
};
