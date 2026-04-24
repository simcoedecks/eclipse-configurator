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
  { id: 'in-progress',     label: 'In Progress',         color: 'bg-orange-100 text-orange-800 border-orange-300', accent: '#ea580c', description: 'Customer started the configurator but hasn’t clicked Submit yet — may be abandoned.' },
  { id: 'new',             label: 'New Lead',            color: 'bg-slate-100 text-slate-800 border-slate-300',    accent: '#64748b', description: 'Fresh submission, not yet contacted.' },
  { id: 'contacted',       label: 'Contacted',           color: 'bg-sky-100 text-sky-800 border-sky-300',          accent: '#0284c7', description: 'Initial outreach made — waiting for response.' },
  { id: 'cool-lead',       label: 'Cool Lead',           color: 'bg-cyan-100 text-cyan-800 border-cyan-300',       accent: '#0891b2', description: 'De-prioritized — follow up later.' },
  { id: 'site-visit',      label: 'Site Visit',          color: 'bg-indigo-100 text-indigo-800 border-indigo-300', accent: '#4f46e5', description: 'Site visit scheduled or completed.' },
  { id: 'proposal-sent',   label: 'Proposal Sent',       color: 'bg-amber-100 text-amber-800 border-amber-300',    accent: '#d97706', description: 'Final proposal delivered — awaiting signature.' },
  { id: 'accepted',        label: 'Accepted',            color: 'bg-emerald-100 text-emerald-800 border-emerald-300', accent: '#059669', description: 'Customer signed the proposal.' },
  { id: 'declined',        label: 'Declined',            color: 'bg-rose-100 text-rose-800 border-rose-300',       accent: '#e11d48', description: 'Customer passed on the proposal.', terminal: true },
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
  // Drafts always belong in the In Progress column, regardless of what
  // pipelineStage the client wrote (defensive — if the client ever
  // forgets to set the stage or a rule rejects the field).
  if (sub.isDraft) return 'in-progress';
  if (sub.acceptance?.signedAt) return 'accepted';
  return 'new';
}

/** Human-readable label for the configurator step the customer was on. */
export const CONFIGURATOR_STEP_LABELS: Record<number, string> = {
  1: 'Dimensions & Frame',
  2: 'Colors & Louvers',
  3: 'Privacy & Protection',
  4: 'Optional Features',
  5: 'Review & Submit',
};

export function stepLabel(step: any): string {
  const n = typeof step === 'number' ? step : parseInt(step);
  return CONFIGURATOR_STEP_LABELS[n] || (n ? `Step ${n}` : 'Not started');
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

// ─── Custom Product Catalog ────────────────────────────────────────────────
// Pre-built items the admin can drop into any proposal from the Pricing editor
// (windows, doors, heating, lighting, hardscape, permits, etc.). Each item
// carries a default price that can be overridden per-proposal. Set price = 0
// for "quote on site" items that need measuring.
export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  /** Default unit price in CAD */
  price: number;
  /** Unit shown in the UI (each, lf, sqft, hour, flat) */
  unit?: 'each' | 'lf' | 'sqft' | 'hour' | 'flat';
  /** Suggestion icon — emoji */
  icon?: string;
}

export interface CatalogCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  products: CatalogProduct[];
}

export const CUSTOM_PRODUCT_CATALOG: CatalogCategory[] = [
  {
    id: 'windows-doors',
    label: 'Windows & Doors',
    icon: '🚪',
    description: 'Glass, screens, and entry options to enclose the pergola.',
    products: [
      { id: 'patio-sliding-door-6',     name: 'Patio Sliding Door — 6 ft',       description: '2-panel aluminum sliding door, tempered glass',              price: 3200, unit: 'each', icon: '🚪' },
      { id: 'patio-sliding-door-8',     name: 'Patio Sliding Door — 8 ft',       description: '3-panel aluminum sliding door, tempered glass',              price: 4100, unit: 'each', icon: '🚪' },
      { id: 'french-door-pair',         name: 'French Doors (Pair) — 6 ft',      description: 'Dual-swing glass French doors, powder-coated frame',          price: 3850, unit: 'each', icon: '🪟' },
      { id: 'fixed-picture-window',     name: 'Fixed Picture Window',            description: 'Tempered glass fixed panel, any size under 20 sqft',          price: 850,  unit: 'each', icon: '🪟' },
      { id: 'casement-window',          name: 'Casement Window',                 description: 'Crank-open casement with screen, up to 4 sqft',               price: 1100, unit: 'each', icon: '🪟' },
      { id: 'awning-window',            name: 'Awning Window',                   description: 'Top-hinged outward-opening awning window',                    price: 950,  unit: 'each', icon: '🪟' },
      { id: 'guillotine-extra',         name: 'Extra Guillotine Window',         description: 'Motorized vertical-lift glass panel (additional side)',       price: 5500, unit: 'each', icon: '⬆️' },
      { id: 'screen-door',              name: 'Screen Door — Retractable',       description: 'Retractable cassette screen door',                           price: 680,  unit: 'each', icon: '🔳' },
      { id: 'dog-door',                 name: 'Pet Door Cutout',                 description: 'Framed opening for dog/cat door (unit not included)',         price: 350,  unit: 'each', icon: '🐾' },
      { id: 'glass-wall-panel',         name: 'Fixed Glass Wall Panel',          description: 'Tempered frameless wall panel (per sqft)',                    price: 85,   unit: 'sqft', icon: '🧊' },
    ],
  },
  {
    id: 'lighting-electrical',
    label: 'Lighting & Electrical',
    icon: '💡',
    description: 'Lighting upgrades and rough-ins handled by a licensed electrician.',
    products: [
      { id: 'elec-rough-in',            name: 'Electrical Rough-In',             description: 'Run power to pergola, base permit included',                   price: 1200, unit: 'flat', icon: '⚡' },
      { id: 'elec-sub-panel',           name: 'Sub-panel Install (60A)',         description: 'Dedicated 60A sub-panel at the pergola',                       price: 1800, unit: 'flat', icon: '🔌' },
      { id: 'elec-outlet',              name: 'Additional Weatherproof Outlet',  description: 'GFCI outdoor outlet, 120V',                                    price: 180,  unit: 'each', icon: '🔌' },
      { id: 'elec-dimmer',              name: 'Smart Dimmer Switch',             description: 'Wi-Fi enabled dimmer for lighting zones',                      price: 260,  unit: 'each', icon: '🎛️' },
      { id: 'led-strip-upgrade',        name: 'Extra LED Light Strip (per LF)',  description: 'Additional warm-white or RGB LED lighting',                    price: 45,   unit: 'lf',   icon: '🔆' },
      { id: 'spotlight-accent',         name: 'Accent Spotlight',                description: '12V architectural spotlight, dimmable',                         price: 320,  unit: 'each', icon: '🔦' },
      { id: 'ceiling-light',            name: 'Pendant / Ceiling Light',         description: 'Weatherproof ceiling-mount fixture',                           price: 450,  unit: 'each', icon: '💡' },
      { id: 'tv-bracket',               name: 'Outdoor TV Wall Mount',           description: 'Weatherproof tilting TV bracket, up to 75"',                   price: 380,  unit: 'each', icon: '📺' },
      { id: 'speaker-in-ceiling',       name: 'In-Ceiling Speaker Pair',         description: '6.5" coaxial weatherproof speakers (pair)',                    price: 680,  unit: 'each', icon: '🔊' },
    ],
  },
  {
    id: 'heating-comfort',
    label: 'Heating & Comfort',
    icon: '🔥',
    description: 'Stay-season extenders: heaters, fans, misters, fireplaces.',
    products: [
      { id: 'extra-heater-2300',        name: 'Bromic Smart-Heat 2300W',          description: 'Compact electric heater, covers ~40 sqft',                     price: 2100, unit: 'each', icon: '🔥' },
      { id: 'extra-heater-4500',        name: 'Bromic Smart-Heat 4500W',          description: '4500W premium IR heater, covers ~90 sqft',                      price: 3431, unit: 'each', icon: '🔥' },
      { id: 'heater-dimmer',            name: 'Bromic Affinity Dimmer',           description: 'App-controlled multi-zone dimmer',                              price: 1031, unit: 'each', icon: '🎚️' },
      { id: 'wall-fireplace',           name: 'Wall-Mount Linear Fireplace',      description: '48" electric linear fireplace, flame-effect',                   price: 2400, unit: 'each', icon: '🔥' },
      { id: 'misting-system',           name: 'Misting System',                    description: 'Cooling mist system with pump + nozzles',                       price: 1450, unit: 'flat', icon: '💧' },
      { id: 'extra-ceiling-fan',        name: 'Ceiling Fan + Light',               description: 'Additional outdoor-rated DC fan with remote',                   price: 2750, unit: 'each', icon: '🌀' },
      { id: 'portable-firepit',         name: 'Gas Fire Pit Table — 42"',          description: 'CSA-certified gas fire pit with cover',                         price: 1850, unit: 'each', icon: '🔥' },
    ],
  },
  {
    id: 'hardscape-foundation',
    label: 'Hardscape & Foundation',
    icon: '🧱',
    description: 'Groundwork: pads, footings, deck boards, stonework.',
    products: [
      { id: 'concrete-pad-basic',       name: 'Concrete Pad — up to 12×16 ft',    description: '4" reinforced slab, broom finish, rebar + vapour barrier',       price: 2800, unit: 'flat', icon: '🧱' },
      { id: 'concrete-pad-premium',     name: 'Stamped Concrete Pad',              description: 'Decorative stamped or exposed-aggregate finish (per sqft)',      price: 18,   unit: 'sqft', icon: '🧱' },
      { id: 'footings-sonotubes',       name: 'Sonotube Footings (4x)',            description: '4 × 10" sonotubes to frost depth, concrete fill',               price: 950,  unit: 'flat', icon: '🧱' },
      { id: 'deck-boards-composite',    name: 'Composite Decking (per sqft)',      description: 'Trex/TimberTech deck install including joists',                 price: 32,   unit: 'sqft', icon: '🪵' },
      { id: 'deck-boards-cedar',        name: 'Western Red Cedar Decking',          description: 'Premium cedar 5/4×6, hidden fasteners',                         price: 25,   unit: 'sqft', icon: '🪵' },
      { id: 'flagstone-patio',          name: 'Natural Flagstone Patio',           description: 'Irregular flagstone on compacted base (per sqft)',              price: 38,   unit: 'sqft', icon: '🪨' },
      { id: 'steps-rise',               name: 'Concrete Steps (per rise)',         description: 'Poured concrete steps with non-slip finish',                    price: 450,  unit: 'each', icon: '⬇️' },
      { id: 'grading-drainage',         name: 'Site Grading & Drainage',           description: 'Regrading, weeping tile, and swale',                             price: 1200, unit: 'flat', icon: '🚜' },
    ],
  },
  {
    id: 'gas-plumbing',
    label: 'Gas & Plumbing',
    icon: '🔧',
    description: 'Gas lines for fire features, water for misting or fountains.',
    products: [
      { id: 'gas-line-run',             name: 'Natural Gas Line Run',              description: 'Licensed gas fitter, ½" line up to 25 ft',                      price: 950,  unit: 'flat', icon: '🔥' },
      { id: 'gas-line-extra',           name: 'Additional Gas Line (per LF)',      description: 'Each additional linear foot beyond 25 ft',                      price: 28,   unit: 'lf',   icon: '🔥' },
      { id: 'water-line',               name: 'Water Line Run',                    description: 'Supply line with frost-proof hose bib',                         price: 650,  unit: 'flat', icon: '💧' },
      { id: 'drain-run',                name: 'Drain Line (for misting/fountain)', description: 'Connect to existing storm or dry well',                         price: 450,  unit: 'flat', icon: '💧' },
    ],
  },
  {
    id: 'structural-custom',
    label: 'Structural & Custom',
    icon: '🏗️',
    description: 'Custom fabrications and structural modifications.',
    products: [
      { id: 'post-upgrade-8x8',         name: 'Upgraded 8×8 Post (each)',          description: 'Heavier structural post for high-wind or attached config',      price: 285,  unit: 'each', icon: '🏗️' },
      { id: 'beam-extension',           name: 'Beam / Overhang Extension',         description: 'Cantilevered beam extension up to 3 ft',                        price: 850,  unit: 'flat', icon: '📏' },
      { id: 'custom-fabrication',       name: 'Custom Fabrication',                description: 'Engineer-reviewed modification (priced on design)',              price: 0,    unit: 'flat', icon: '🔨' },
      { id: 'decorative-post-caps',     name: 'Decorative Post Caps (set of 4)',   description: 'Brushed stainless or solar-powered post caps',                   price: 320,  unit: 'each', icon: '🎩' },
      { id: 'rafter-tails',             name: 'Custom Rafter Tails',                description: 'Custom-cut rafter tails for traditional look',                  price: 180,  unit: 'each', icon: '🪚' },
      { id: 'attached-ledger',          name: 'Attached-to-House Ledger Board',     description: 'Ledger attachment to home with flashing',                       price: 780,  unit: 'flat', icon: '🏠' },
      { id: 'painting-custom-color',    name: 'Custom Paint Color (non-RAL)',      description: 'Colour-match to your paint chip — adds 2-3 weeks',              price: 450,  unit: 'flat', icon: '🎨' },
    ],
  },
  {
    id: 'permits-delivery',
    label: 'Permits, Delivery & Fees',
    icon: '📄',
    description: 'Administrative items and logistics.',
    products: [
      { id: 'permit-standard',          name: 'Building Permit (Standard)',        description: 'Permit drawings + submission to municipality',                   price: 650,  unit: 'flat', icon: '📄' },
      { id: 'permit-complex',           name: 'Building Permit (Complex)',         description: 'Heritage district, conservation, or engineering review',         price: 1350, unit: 'flat', icon: '📑' },
      { id: 'engineering-stamp',        name: 'Engineering Stamp',                  description: 'Structural engineer review + stamp for custom config',          price: 850,  unit: 'flat', icon: '✍️' },
      { id: 'delivery-local',           name: 'Delivery (within 50 km)',           description: 'Included delivery within standard zone',                         price: 0,    unit: 'flat', icon: '🚚' },
      { id: 'delivery-extended',        name: 'Extended Delivery Zone',             description: '50–150 km from Barrie, ON',                                     price: 450,  unit: 'flat', icon: '🚚' },
      { id: 'rush-production',          name: 'Rush Production',                    description: 'Expedited 4-week production vs standard 6–8',                    price: 1500, unit: 'flat', icon: '⚡' },
      { id: 'crane-lift',               name: 'Crane / Telehandler Lift',           description: 'Required for rooftop or elevated installs',                      price: 1250, unit: 'flat', icon: '🏗️' },
      { id: 'removal-old-structure',    name: 'Old Structure Removal',             description: 'Demolition + disposal of existing gazebo/awning',                 price: 850,  unit: 'flat', icon: '🚜' },
    ],
  },
  {
    id: 'adjustments',
    label: 'Discounts & Credits',
    icon: '🏷️',
    description: 'Use for promos, loyalty, referrals, or price-matching.',
    products: [
      { id: 'loyalty-discount',         name: 'Loyalty Discount',                   description: 'Returning customer discount',                                    price: 500,  unit: 'flat', icon: '🎁' },
      { id: 'referral-credit',          name: 'Referral Credit',                    description: 'Credit for referring a new customer',                            price: 500,  unit: 'flat', icon: '💸' },
      { id: 'seasonal-promo',           name: 'Seasonal Promotion',                 description: 'Current promotional discount',                                   price: 1000, unit: 'flat', icon: '🏷️' },
      { id: 'price-match',              name: 'Price-Match Adjustment',             description: 'Matched a competing quote',                                      price: 0,    unit: 'flat', icon: '📊' },
      { id: 'trade-in',                 name: 'Trade-In Credit',                    description: 'Credit for old pergola/awning trade-in',                         price: 0,    unit: 'flat', icon: '♻️' },
    ],
  },
];

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
    id: 'send-proposal',
    label: 'Send proposal',
    icon: '📨',
    subject: 'Your Eclipse Pergola proposal — {{total}}',
    body: `Hi {{firstName}},

Thanks for designing your Eclipse Pergola with us. Your interactive proposal is ready to review — you can explore every angle of the 3D design, see the full pricing breakdown, and sign electronically right from the link below:

{{proposalUrl}}

Have a question or want to tweak something before you sign? Just reply to this email or give me a call — happy to adjust anything.

Best,
Michael
Eclipse Pergola
289-855-2977`,
  },
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
  { id: 'sms-send-proposal', label: 'Send proposal SMS', icon: '📨', body: "Hi {{firstName}}, Michael from Eclipse Pergola. Your interactive pergola proposal ({{total}}) is ready — view and sign here: {{proposalUrl}}. Any questions, just reply." },
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
