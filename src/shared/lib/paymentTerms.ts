/**
 * Single source of truth for the proposal payment schedule.
 *
 * Retail customers and dealer/pro quotes have different deposit structures:
 *  - Retail: 50% on signing / 30% on pergola delivery / 20% on screen delivery
 *  - Dealer (/pro): 70% on signing / 30% before delivery or shipping
 *
 * Both the web proposal (Proposal.tsx) and the PDF template
 * (ProposalDocument.tsx) render from getPaymentSchedule() so the two can
 * never drift out of sync.
 */

export interface PaymentMilestone {
  /** e.g. "70%" */
  pct: string;
  /** e.g. "Due on signing" */
  when: string;
  /** short supporting line, e.g. "Deposit to begin production" */
  note: string;
}

/**
 * Whether a loaded submission represents a dealer / pro quote. Mirrors the
 * canonical "is this a contractor lead" check used in the CRM (Admin.tsx) so
 * the contractor badge and the dealer payment terms always agree.
 */
export function isDealerQuote(data: any): boolean {
  if (!data) return false;
  return !!(data.dealerName || data.dealerEmail || data.dealerPhone || data.dealerContact);
}

export function getPaymentSchedule(isDealer: boolean): PaymentMilestone[] {
  if (isDealer) {
    return [
      { pct: '70%', when: 'Due on signing', note: 'Deposit to begin production' },
      { pct: '30%', when: 'Due before delivery or shipping', note: 'Final payment' },
    ];
  }
  return [
    { pct: '50%', when: 'Due on signing', note: 'Deposit to begin production' },
    { pct: '30%', when: 'Due on pergola delivery', note: 'Prior to installation' },
    { pct: '20%', when: 'Due on screen delivery', note: 'Final payment' },
  ];
}
