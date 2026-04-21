/**
 * CRM constants and helpers shared across the admin dashboard.
 * Pipeline stages, activity types, email templates.
 */

export interface PipelineStage {
  id: string;
  label: string;
  /** Tailwind-safe color variants used for pills, borders, and kanban columns */
  color: string; // e.g. "bg-gray-100 text-gray-800 border-gray-300"
  accent: string; // hex, used in charts / CSS vars
  description: string;
  /** Terminal stages are end-of-pipeline (no further actions expected). */
  terminal?: boolean;
  /** Stage at which a "win" is counted for conversion/revenue analytics. */
  countsAsWon?: boolean;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'new',             label: 'New Lead',            color: 'bg-slate-100 text-slate-800 border-slate-300',    accent: '#64748b', description: 'Fresh submission, not yet contacted.' },
  { id: 'contacted',       label: 'Contacted',           color: 'bg-sky-100 text-sky-800 border-sky-300',          accent: '#0284c7', description: 'Initial outreach made — waiting for response.' },
  { id: 'site-visit',      label: 'Site Visit',          color: 'bg-indigo-100 text-indigo-800 border-indigo-300', accent: '#4f46e5', description: 'Site visit scheduled or completed.' },
  { id: 'proposal-sent',   label: 'Proposal Sent',       color: 'bg-amber-100 text-amber-800 border-amber-300',    accent: '#d97706', description: 'Final proposal delivered — awaiting signature.' },
  { id: 'accepted',        label: 'Accepted',            color: 'bg-emerald-100 text-emerald-800 border-emerald-300', accent: '#059669', description: 'Customer signed the proposal.' },
  { id: 'in-production',   label: 'In Production',       color: 'bg-violet-100 text-violet-800 border-violet-300', accent: '#7c3aed', description: 'Deposit cleared, build in progress.' },
  { id: 'installed',       label: 'Installed',           color: 'bg-teal-100 text-teal-800 border-teal-300',       accent: '#0d9488', description: 'Pergola installed and commissioned.', countsAsWon: true, terminal: true },
  { id: 'lost',            label: 'Lost',                color: 'bg-rose-100 text-rose-800 border-rose-300',       accent: '#e11d48', description: 'Did not close — note reason.', terminal: true },
];

export function stageById(id: string | undefined | null): PipelineStage | undefined {
  if (!id) return undefined;
  return PIPELINE_STAGES.find(s => s.id === id);
}

/** Infer the default pipeline stage for a submission if not explicitly set. */
export function defaultStageFor(sub: any): string {
  if (sub.acceptance?.signedAt) return 'accepted';
  return 'new';
}

// ─── Activity Types ────────────────────────────────────────────────────────
export type ActivityType =
  | 'submission_created'      // lead first submitted
  | 'viewed_by_admin'         // admin opened the submission
  | 'viewed_by_customer'      // customer opened the proposal URL
  | 'email_sent'              // admin or system sent email
  | 'sms_sent'                // SMS was sent
  | 'stage_changed'           // pipeline stage changed
  | 'note_added'              // internal note
  | 'task_created'            // task added
  | 'task_completed'          // task marked done
  | 'signed'                  // customer accepted/signed
  | 'tag_added' | 'tag_removed'
  | 'file_uploaded'
  | 'file_deleted'
  | 'proposal_opened'         // customer opened /proposal/:id
  | 'manual';                 // free-form admin action

export interface Activity {
  id?: string;
  type: ActivityType;
  message: string;                 // human readable
  actor?: string;                  // admin email, 'customer', or 'system'
  meta?: Record<string, any>;      // arbitrary extra context
  createdAt?: any;                 // Firestore timestamp
}

// ─── Team Members ──────────────────────────────────────────────────────────
// Hardcoded list of admin/sales reps who can be assigned to leads.
// Add new entries here as the team grows. Initials are auto-generated.
export interface TeamMember {
  email: string;
  name: string;
  /** CSS color used for the avatar background */
  color: string;
  /** Optional role badge */
  role?: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  { email: 'michael@simcoedecks.ca', name: 'Michael Scott', color: '#C5A059', role: 'Owner' },
  // Add more team members here as you scale:
  // { email: 'jane@eclipsepergola.ca', name: 'Jane Doe', color: '#0284c7', role: 'Sales' },
];

export function teamMemberByEmail(email: string | null | undefined): TeamMember | undefined {
  if (!email) return undefined;
  return TEAM_MEMBERS.find(m => m.email.toLowerCase() === email.toLowerCase());
}

export function initialsFor(nameOrEmail: string): string {
  const parts = nameOrEmail.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ─── Lead Sources ──────────────────────────────────────────────────────────
export const LEAD_SOURCES = [
  { id: 'organic',          label: 'Organic / Direct' },
  { id: 'configurator',     label: 'Online Configurator' },
  { id: 'contractor',       label: 'Contractor Referral' },
  { id: 'referral',         label: 'Customer Referral' },
  { id: 'phone',            label: 'Phone Inquiry' },
  { id: 'walk-in',          label: 'Walk-in / In Person' },
  { id: 'trade-show',       label: 'Trade Show' },
  { id: 'facebook',         label: 'Facebook / Meta Ads' },
  { id: 'google',           label: 'Google Ads' },
  { id: 'instagram',        label: 'Instagram' },
  { id: 'other',            label: 'Other' },
];

// ─── Email / SMS Templates ─────────────────────────────────────────────────
export interface MessageTemplate {
  id: string;
  label: string;
  icon: string; // emoji
  subject?: string;
  body: string;
  /** Placeholders available: {{name}}, {{firstName}}, {{total}}, {{proposalUrl}} */
}

export const EMAIL_TEMPLATES: MessageTemplate[] = [
  {
    id: 'site-visit',
    label: 'Schedule site visit',
    icon: '📅',
    subject: "Let's schedule your Eclipse Pergola site visit",
    body: `Hi {{firstName}},

Thanks for your quote request. I'd love to set up a quick site visit so we can confirm dimensions and talk through your vision in person.

When works best for you this week or next? I have availability:
  • Tuesdays & Thursdays 10am–4pm
  • Saturday mornings 9am–12pm

Let me know what works and I'll confirm.

Best,
Michael
Eclipse Pergola
289-855-2977`,
  },
  {
    id: 'follow-up',
    label: 'Follow-up check-in',
    icon: '👋',
    subject: 'Checking in — your Eclipse Pergola quote',
    body: `Hi {{firstName}},

Just following up on the pergola quote I sent you ({{total}}). Happy to answer any questions or adjust the design if anything would work better for your space.

Your interactive proposal is still live here: {{proposalUrl}}

Want to chat briefly this week?

Best,
Michael
Eclipse Pergola`,
  },
  {
    id: 'proposal-reminder',
    label: 'Proposal expires soon',
    icon: '⏳',
    subject: 'Your Eclipse Pergola proposal — a quick reminder',
    body: `Hi {{firstName}},

The proposal I sent is valid for 30 days and we're coming up on that window. If you'd like to move forward at the current pricing, just sign here:

{{proposalUrl}}

Questions or changes needed? Reply and we'll adjust.

Best,
Michael`,
  },
  {
    id: 'payment-reminder',
    label: 'Payment schedule reminder',
    icon: '💳',
    subject: 'Your Eclipse Pergola — payment schedule',
    body: `Hi {{firstName}},

Thank you for signing your proposal! Here's a reminder of the payment schedule:

  • 50% deposit to begin production
  • 30% on pergola delivery
  • 20% on screen delivery

Interac e-Transfer can be sent to info@eclipsepergola.ca. Wire transfer details available on request.

Let me know once the deposit is out and we'll get you into production.

Best,
Michael`,
  },
  {
    id: 'install-scheduled',
    label: 'Install date confirmed',
    icon: '🔧',
    subject: 'Your Eclipse Pergola installation is scheduled',
    body: `Hi {{firstName}},

Great news — your installation is confirmed for [DATE]. Please expect our install team on site around 8am. The job typically takes 1–2 days depending on site conditions.

A few prep notes:
  • Please ensure the foundation/pad is clear of furniture and debris
  • Power should be accessible if your pergola includes motorized louvers or lighting
  • One team member should be reachable by phone on the day

Looking forward to getting this installed!

Best,
Michael`,
  },
  {
    id: 'thank-you',
    label: 'Post-install thank you',
    icon: '🙏',
    subject: 'Thank you from Eclipse Pergola',
    body: `Hi {{firstName}},

Just checking in now that your Eclipse Pergola is installed. I hope you love it as much as we enjoyed building it for you.

A couple of things:

  1. If you'd be willing to leave a Google review, it genuinely helps our small business: https://g.page/r/eclipsepergola/review

  2. We offer a 10-year structural warranty and 5-year on motors — if anything ever needs attention, just reach out.

  3. Referrals are the highest compliment. If you send us a neighbour or friend who signs a proposal, we'll send you a $500 thank you.

Thanks again — enjoy the outdoors!

Best,
Michael
Eclipse Pergola`,
  },
];

export const SMS_TEMPLATES: MessageTemplate[] = [
  { id: 'sms-site-visit', label: 'Quick site visit SMS', icon: '📅', body: "Hi {{firstName}}, Michael from Eclipse Pergola. Can we set up a quick site visit this week to confirm your design? Reply with a day/time that works. Thanks!" },
  { id: 'sms-follow-up',  label: 'Quick check-in SMS',  icon: '👋', body: "Hi {{firstName}}, just checking in on the pergola quote. Your proposal is still live: {{proposalUrl}} — Any questions?" },
  { id: 'sms-install',    label: 'Install reminder SMS', icon: '🔧', body: "Hi {{firstName}}, just a reminder your Eclipse Pergola install is scheduled for [DATE]. Crew arrives ~8am. Questions? 289-855-2977." },
];

export function renderTemplate(tpl: MessageTemplate, ctx: { name?: string; total?: string; proposalUrl?: string }): { subject?: string; body: string } {
  const firstName = (ctx.name || '').split(/\s+/)[0] || 'there';
  const total = ctx.total || '';
  const proposalUrl = ctx.proposalUrl || '';
  const fill = (s: string) => s
    .replaceAll('{{firstName}}', firstName)
    .replaceAll('{{name}}', ctx.name || '')
    .replaceAll('{{total}}', total)
    .replaceAll('{{proposalUrl}}', proposalUrl);
  return {
    subject: tpl.subject ? fill(tpl.subject) : undefined,
    body: fill(tpl.body),
  };
}
