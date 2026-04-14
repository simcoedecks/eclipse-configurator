# Eclipse Pro — Contractor Portal Design Spec

## Overview

A separate contractor-facing application (`pro.eclipsepergola.ca`) that shares core components with the retail configurator but provides dealer/contractors with their own quoting tool, lead management, and pricing visibility. Invite-only access with custom per-contractor discount rates.

All contractor activity flows to Eclipse's Pipedrive CRM. A "Lead Collision" system detects overlap between retail and contractor quotes to protect contractor relationships.

---

## Architecture

### Two Apps, One Repo

```
pergola-configurator/
  src/
    shared/              # Shared between retail & pro
      components/        # PergolaVisualizer, ProposalDocument, ErrorBoundary
      lib/               # Pricing engine, PDF generator, color/accessory data
      hooks/             # Shared React hooks (useDebounce, etc.)
    retail/              # Retail app (current site)
      pages/             # Home, Admin
      main.tsx           # Retail entry point
      App.tsx            # Retail routes
    pro/                 # Contractor portal (new)
      pages/             # Login, Dashboard, Configurator, QuoteDetail
      components/        # ProPricingOverlay, LeadPipeline, CollisionAlert
      main.tsx           # Pro entry point
      App.tsx            # Pro routes
    index.css            # Shared styles
  vite.config.ts         # Multi-entry build (retail + pro)
```

Both apps share the same Vite config with two entry points. Deployment serves retail from the main domain and pro from the subdomain. Shared components (3D visualizer, proposal PDF, pricing engine, product catalog) live in `src/shared/` and are imported by both apps.

### Build & Deployment

- Single repo, two Vite entry points (`src/retail/main.tsx`, `src/pro/main.tsx`)
- Build outputs to `dist/retail/` and `dist/pro/`
- Hosting: two subdomains pointing to their respective build outputs
- Same `server.ts` backend serves both — new `/api/pro/*` endpoints for contractor-specific operations
- Same Firebase project, same Firestore database

---

## Authentication & Authorization

### Invite-Only Flow

1. Admin opens Admin Dashboard → Contractor Management tab
2. Admin enters: contractor company name, contact name, email, phone, custom discount %
3. System creates a Firestore `contractors/{id}` document with status `invited`
4. System sends an invite email (via Resend) with a secure signup link containing a one-time token
5. Contractor clicks link → lands on Pro signup page → sets their password
6. Firebase Auth account created, linked to `contractors/{id}` doc
7. Contractor status changes to `active`

### Auth Rules

- Pro portal requires authentication on every route except the login page
- Firestore rules use a new `isContractor()` helper that checks `contractors/{uid}.status == 'active'`
- Contractors can read/write their own quotes and leads
- Contractors cannot read other contractors' data
- Admin can read/write everything

### Data Model — `contractors` Collection

```
contractors/{uid}:
  companyName: string
  contactName: string
  email: string
  phone: string
  discountPercentage: number    # Custom rate, e.g., 18.5
  status: 'invited' | 'active' | 'suspended'
  inviteToken: string           # One-time signup token
  invitedAt: timestamp
  activatedAt: timestamp
  lastLogin: timestamp
  createdBy: string             # Admin UID who created the invite
```

---

## Contractor Dashboard

### Layout

Left sidebar navigation + main content area. Dark theme with gold accents (Eclipse Pro branding — slightly different from retail to reinforce separation).

### Navigation

- **Dashboard** — Overview stats (quotes this month, total pipeline value, conversion rate)
- **New Quote** — Opens the configurator with contractor pricing
- **My Quotes** — Pipeline view of all quotes
- **Account** — Company info, discount rate (read-only), contact Eclipse support

### Dashboard Home

- Cards: Quotes This Month, Pipeline Value, Quotes Sent, Quotes Accepted
- Recent activity feed (last 10 quote actions)
- Any active Lead Collision alerts prominently displayed at top

---

## Configurator (Pro Version)

The same 5-step configurator as retail, with these additions:

### Pricing Overlay

A persistent panel (docked to the bottom or side of the configurator) showing three columns:

| | Retail Price | Your Cost | Your Margin |
|---|---|---|---|
| Pergola 16'x12' | $24,500 | $20,090 | $4,410 |
| Screens (Front) | $4,200 | $3,444 | $756 |
| ... | ... | ... | ... |
| **Total** | **$44,543** | **$36,525** | **$8,018** |

- "Retail Price" = what the end customer sees
- "Your Cost" = retail minus the contractor's custom discount %
- "Your Margin" = the difference
- Contractor can optionally adjust the retail price up or down to set their own markup (the "Your Cost" stays fixed based on their Eclipse discount)

### Customer Info (Step 1)

Same fields as retail, plus:
- Contractor's company name auto-populated (from their account)
- Optional "Project Notes" field for internal contractor reference

### Quote Save

Instead of "Email Quote" / "Request Consultation", the pro configurator shows:
- **Save as Draft** — Saves to their pipeline without sending anything
- **Send to Client** — Generates the client-facing proposal PDF and emails it to the customer (retail pricing, Eclipse branding)
- **Download Cost Sheet** — Generates the internal PDF showing contractor cost breakdown

---

## Quote / Lead Management

### Pipeline View

Kanban-style board with columns:

| Draft | Sent | Accepted | Installed | Lost |

Each card shows: customer name, address, pergola dimensions, total retail value, contractor margin, date created.

Contractors can drag cards between columns. Moving to "Sent" triggers the client email if not already sent. Moving to "Accepted" or "Installed" updates the CRM.

### Quote Detail Page

Clicking a quote card opens the full detail:
- Customer contact info
- Full configuration summary (dimensions, colors, accessories)
- Pricing breakdown (retail / cost / margin)
- Timeline of actions (created, sent, viewed, accepted)
- Re-open in configurator (edit and re-send)
- Download PDFs (client proposal or internal cost sheet)
- Notes field

### Data Model — `contractor_quotes` Collection

```
contractor_quotes/{id}:
  contractorId: string          # UID of the contractor
  status: 'draft' | 'sent' | 'accepted' | 'installed' | 'lost'
  customer:
    name: string
    email: string
    phone: string
    address: string
    city: string
  configuration:
    width: number
    depth: number
    height: number
    frameColor: string
    louverColor: string
    wallColor: string
    accessories: string[]
    heaterControl: string
    foundation: string
  pricing:
    retailPrice: number         # What the customer sees
    contractorCost: number      # Retail minus discount
    contractorMargin: number    # The difference
    discountPercentage: number  # Snapshot of rate at time of quote
    customMarkup: number        # Any additional markup the contractor added
    accessories: array          # Itemized accessory costs
    hst: number
    total: number
  pipedriveLeadId: string       # Linked CRM lead
  collisionId: string | null    # If flagged, references collision doc
  notes: string
  createdAt: timestamp
  updatedAt: timestamp
  sentAt: timestamp | null
  acceptedAt: timestamp | null
```

---

## Two PDF Modes

### 1. Client Proposal (for the contractor's customer)

Same branded Eclipse proposal as the retail version (cover, specs, accessories, terms, 3D views). Uses retail pricing. The contractor's company name does NOT appear — this is an Eclipse-branded document the contractor gives to their client.

### 2. Internal Cost Sheet (for the contractor only)

A single-page or two-page PDF showing:
- Customer info
- Configuration summary
- Three-column pricing table (Retail | Your Cost | Margin) for every line item
- Total margin and margin percentage
- Contractor company name + date
- "CONFIDENTIAL — FOR INTERNAL USE ONLY" watermark

Both PDFs share the same rendering pipeline (html-to-image → jsPDF) from `src/shared/`.

---

## CRM Integration (Pipedrive)

### Contractor Leads in Pipedrive

Every contractor quote pushes to Pipedrive, tagged with:
- **Source**: "Eclipse Pro — [Contractor Company Name]"
- **Label/Tag**: "Contractor Lead"
- **Custom Fields**: Contractor name, contractor discount %, contractor margin
- **Pipeline**: Same pipeline as retail, but with the contractor source tag for filtering

This gives Eclipse full visibility into contractor activity alongside retail leads.

### API Endpoints (New)

```
POST /api/pro/save-quote        # Save/update a contractor quote
POST /api/pro/send-quote        # Email client proposal + push to CRM
GET  /api/pro/quotes             # List contractor's quotes
GET  /api/pro/quotes/:id         # Get single quote detail
POST /api/pro/check-collision    # Check for lead overlap before saving
```

All `/api/pro/*` endpoints require a valid Firebase Auth token with an active contractor account.

---

## Lead Collision Detection

### How It Works

Every time a quote is saved (retail OR contractor), the system checks for matches against all existing leads across both sources.

### Matching Criteria (Fuzzy)

A collision is flagged if ANY of these match between a new quote and an existing one:

1. **Address similarity** — Normalized address string (lowercase, strip unit/apt, standardize St/Street/Ave/Avenue) matches with >85% similarity (Levenshtein distance)
2. **Customer email** — Exact match (case-insensitive)
3. **Customer phone** — Normalized phone (digits only) exact match

### Collision Document

```
lead_collisions/{id}:
  status: 'active' | 'dismissed' | 'resolved'
  matchType: 'address' | 'email' | 'phone' | 'multiple'
  matchConfidence: number       # 0-1 score
  leads:
    - source: 'retail' | 'contractor'
      sourceId: string          # Quote or submission ID
      contractorId: string | null
      contractorName: string | null
      customerName: string
      customerEmail: string
      customerPhone: string
      address: string
      city: string
      createdAt: timestamp
      totalValue: number
    - source: 'retail' | 'contractor'
      ...                       # Second matching lead
  firstIn: 'retail' | 'contractor'   # Who quoted first
  firstInContractorId: string | null
  flaggedAt: timestamp
  resolvedAt: timestamp | null
  resolvedBy: string | null     # Admin UID
  resolution: string | null     # Admin notes on resolution
```

### What Happens on Collision

**Contractor portal:**
- When a contractor saves a quote that triggers a collision, they see an alert: "This customer may already have an inquiry with Eclipse or another contractor. Eclipse has been notified and will follow up."
- The quote still saves (we don't block them), but it's flagged.
- On their dashboard, the quote card shows a collision badge.

**Admin dashboard:**
- New "Lead Collisions" tab shows all active collisions.
- Each collision shows both leads side-by-side with match details.
- Admin actions: "Dismiss" (false positive), "Assign to Contractor" (retail lead defers to contractor), "Assign to Eclipse" (Eclipse keeps the lead), "Contact Both" (mediator notes).
- Resolution updates both the collision doc and notifies relevant parties.

**Retail side:**
- The retail customer flow is NOT interrupted. They still get their quote.
- The collision is handled internally by Eclipse admin.

### Priority Rule

The system highlights who was first:
- "First quoted by [Contractor Name] on [date]" or "First quoted via retail on [date]"
- This supports the goal of protecting the first-in contractor's relationship.

---

## Admin Dashboard Updates

### New Tab: Contractor Management

- **Contractor list** — All contractors with status, company name, discount %, last login, total quotes, pipeline value
- **Invite contractor** — Form to send new invites
- **Edit contractor** — Change discount %, suspend/reactivate account
- **Contractor detail** — View all their quotes, activity log, collision history

### New Tab: Lead Collisions

- List of all active collisions with match type, confidence, and both leads
- Filter by status (active / dismissed / resolved)
- Inline resolution actions

### Existing Tabs Enhanced

- **All Leads** — Now shows a "Source" column (Retail / Contractor Name) and collision badge
- **Analytics** — Add contractor metrics: total contractor volume, top contractors by revenue, collision rate

---

## Firestore Security Rules Updates

```
// New rules additions:

function isContractor() {
  return request.auth != null
    && exists(/databases/$(database)/documents/contractors/$(request.auth.uid))
    && get(/databases/$(database)/documents/contractors/$(request.auth.uid)).data.status == 'active';
}

match /contractors/{uid} {
  allow read: if request.auth.uid == uid || isAdmin();
  allow write: if isAdmin();
}

match /contractor_quotes/{quoteId} {
  allow read: if resource.data.contractorId == request.auth.uid || isAdmin();
  allow create: if isContractor() && request.resource.data.contractorId == request.auth.uid;
  allow update: if resource.data.contractorId == request.auth.uid || isAdmin();
  allow delete: if isAdmin();
}

match /lead_collisions/{collisionId} {
  allow read: if isAdmin()
    || (isContractor() && resource.data.leads[0].contractorId == request.auth.uid)
    || (isContractor() && resource.data.leads[1].contractorId == request.auth.uid);
  allow write: if isAdmin();
}
```

---

## Tech Stack (No New Dependencies)

Everything builds on what's already in the project:
- **React + TypeScript + Vite** — Same stack, second entry point
- **Tailwind CSS** — Same config, pro-specific color tokens
- **Firebase Auth** — Email/password for contractors (vs Google for admin)
- **Firestore** — Same database, new collections
- **Resend** — Invite emails + contractor client proposal emails
- **Pipedrive** — Same integration, tagged source
- **jsPDF + html-to-image** — Same PDF pipeline, new cost sheet template
- **Three.js / React Three Fiber** — Same 3D visualizer (shared component)

---

## Migration from Current Contractor Code

The existing `src/pages/Contractor.tsx` and contractor logic in `Home.tsx` will be replaced:

1. `Contractor.tsx` → Replaced by the full Pro portal (`src/pro/`)
2. Contractor auth in `Home.tsx` → Moved to Pro configurator
3. `/contractor` route → Redirects to `pro.eclipsepergola.ca`
4. `users/{uid}` contractor role → Migrated to `contractors/{uid}` collection
5. Self-assigned contractor role → Removed (invite-only)
6. Bidding system (jobs/bids collections) → Deferred for future phase

---

## Out of Scope (Future Phases)

- Job bidding / installer marketplace (the Available Jobs + Bids flow)
- Contractor onboarding self-signup with approval workflow
- Multi-user contractor accounts (multiple people under one company)
- Contractor-branded proposals (their logo on the PDF)
- Payment tracking / invoicing within the portal
- Mobile app version of the Pro portal
