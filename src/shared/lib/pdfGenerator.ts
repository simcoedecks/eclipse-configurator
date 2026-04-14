import { jsPDF } from 'jspdf';

export const generateProposalPDF = (data: any) => {
  const doc = new jsPDF();

  // Helper for company info
  const addHeader = (pageNumber: number) => {
    doc.setFontSize(10);
    doc.text('Eclipse Aluminum Pergola', 20, 280);
    doc.text('www.eclipsepergola.ca', 20, 285);
    doc.text('info@eclipsepergola.com', 20, 290);
    doc.text('289-855-2977 (Office)', 20, 295);
    doc.text(`Page ${pageNumber} of 13`, 105, 295, { align: 'center' });
  };

  // Page 1: Title Page
  doc.setFontSize(24);
  doc.text('Eclipse Aluminum Louvered Pergola', 105, 40, { align: 'center' });
  
  doc.setFontSize(16);
  doc.setFillColor(0, 0, 0);
  doc.rect(20, 60, 170, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Customer Information', 105, 67, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(12);
  doc.text(`Customer Name: ${data.name}`, 20, 85);
  doc.line(20, 87, 190, 87);
  doc.text(`Installation Address: ${data.address}, ${data.city}`, 20, 95);
  doc.line(20, 97, 190, 97);
  doc.text(`Phone Number(s): ${data.phone}`, 20, 105);
  doc.line(20, 107, 190, 107);
  doc.text(`Email Address: ${data.email}`, 20, 115);
  doc.line(20, 117, 190, 117);
  doc.text(`Document Number: Doc # ${data.docNumber}`, 20, 125);
  doc.line(20, 127, 190, 127);
  doc.text(`Date: ${data.date}`, 20, 135);
  doc.line(20, 137, 190, 137);

  doc.setFontSize(16);
  doc.setFillColor(0, 0, 0);
  doc.rect(20, 150, 170, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Proposal Overview', 105, 157, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(10);
  doc.text(
    'This quote is provided for estimation purposes only and is based on preliminary information. Final pricing, design details, and material selections may vary. If you wish to proceed, we offer an on-site consultation where we take precise measurements, assess specific project requirements, and develop a customized design that aligns with your vision and needs. This ensures accuracy and clarity before finalizing any commitments.',
    20, 170,
    { maxWidth: 170 }
  );

  addHeader(1);

  // Page 5: Details and Pricing (Mapping to Page 5 in example)
  doc.addPage();
  doc.setFontSize(16);
  doc.setFillColor(0, 0, 0);
  doc.rect(20, 20, 170, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('MOTORIZED LOUVERED PERGOLA WITH PERIMETER LIGHTING', 105, 27, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(12);
  doc.text('Motorized Aluminum Louvered Pergola', 20, 40);
  doc.text(`Pergola Width: ${data.width} Feet`, 20, 50);
  doc.text(`Pergola Depth (Louver Direction): ${data.depth} Feet`, 20, 60);
  doc.text(`Pergola Height: 9 Feet (Finished Pergola Height)`, 20, 70);
  doc.text(`Height Below Beams: 98"-108"`, 20, 80);
  doc.text(`Pergola Structure Colour: ${data.frameColorName}`, 20, 90);
  doc.text(`Pergola Louver Colour: ${data.louverColorName}`, 20, 100);
  doc.text(`Number of Posts: [POSTS]`, 20, 110);
  doc.text(`Attachment Configuration: Custom flashings required`, 20, 120);
  
  doc.text('Technical Specifications:', 20, 140);
  doc.text(`Column Extrusion: 7" x 7"`, 20, 150);
  doc.text(`Gutter Beam Extrusion: 5" x 11"`, 20, 160);
  doc.text(`Louver Blade Extrusion: 8"`, 20, 170);
  doc.text(`Remote Controllable: Yes`, 20, 180);
  doc.text(`Motor: Linear actuator motors used for each unit`, 20, 190);
  doc.text(`Lighting: Perimeter LED - Included`, 20, 200);
  doc.text(`Warranty: 10 Year on Structure & Powder Coating, 5 Year on Motors`, 20, 210);

  addHeader(5);

  doc.save(`Pergola_Proposal_${data.docNumber}.pdf`);
};
