# Eclipse Pro Phase 1: Foundation — Repo Restructure, Auth & Pro Configurator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a two-app architecture (retail + pro) with shared components, add invite-only contractor auth, and build the Pro configurator with dual pricing overlay.

**Architecture:** Single Vite repo with two entry points (`retail` and `pro`). Shared components (3D visualizer, proposal PDF, pricing engine, product data) live in `src/shared/`. Each app has its own routes, pages, and entry point. The Express `server.ts` gains new `/api/pro/*` endpoints for contractor operations.

**Tech Stack:** React 19, TypeScript, Vite (multi-entry), Tailwind CSS 4, Firebase Auth (email/password for contractors), Firestore, Express, Resend (invite emails).

**Spec:** `docs/superpowers/specs/2026-04-14-eclipse-pro-contractor-portal-design.md`

---

## File Structure

After this phase, the repo will look like:

```
src/
  shared/
    components/
      PergolaVisualizer.tsx    (moved from src/components/)
      ProposalDocument.tsx     (moved from src/components/)
      ErrorBoundary.tsx        (moved from src/components/)
    lib/
      pdfGenerator.ts          (moved from src/lib/)
      pricing.ts               (NEW — extracted pricing engine)
      accessories.ts           (NEW — extracted accessory catalog + types)
      colors.ts                (NEW — extracted color definitions)
    firebase.ts                (moved from src/firebase.ts)
    hooks/
      useAuth.ts               (NEW — shared auth hook)
  retail/
    main.tsx                   (current src/main.tsx, updated import path)
    App.tsx                    (current src/App.tsx, updated imports)
    pages/
      Home.tsx                 (moved from src/pages/Home.tsx, uses shared imports)
      Admin.tsx                (moved from src/pages/Admin.tsx)
      ProposalPreview.tsx      (moved from src/pages/ProposalPreview.tsx)
  pro/
    main.tsx                   (NEW — pro entry point)
    App.tsx                    (NEW — pro routes with auth guard)
    pages/
      Login.tsx                (NEW — contractor login page)
      Dashboard.tsx            (NEW — placeholder dashboard)
      ProConfigurator.tsx      (NEW — configurator with pricing overlay)
    components/
      AuthGuard.tsx            (NEW — route protection component)
      PricingOverlay.tsx       (NEW — dual pricing panel)
      ProLayout.tsx            (NEW — sidebar nav layout)
    hooks/
      useContractor.ts         (NEW — contractor auth + data hook)
index.html                     (retail entry — unchanged)
pro.html                       (NEW — pro entry point HTML)
vite.config.ts                 (updated — multi-entry build)
server.ts                      (updated — new /api/pro/* endpoints)
firestore.rules                (updated — contractor rules)
```

---

## Task 1: Extract Shared Modules

Move reusable code out of the monolithic `Home.tsx` into shared modules so both apps can import them.

**Files:**
- Create: `src/shared/lib/accessories.ts`
- Create: `src/shared/lib/pricing.ts`
- Create: `src/shared/lib/colors.ts`
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Create `src/shared/lib/accessories.ts`**

Extract the `Accessory` type, `AccessoryType` type, and `ACCESSORIES` array from `Home.tsx` lines 148-186. The file needs to import icon components since they're used in the array.

```typescript
// src/shared/lib/accessories.ts
import {
  Lightbulb, Wind, Thermometer, Fan, Blinds, PanelRight, Smartphone, Speaker
} from 'lucide-react';
import type { ElementType } from 'react';

export type AccessoryType = 'flat' | 'sqft' | 'screen_width' | 'screen_depth' | 'wall_width' | 'wall_depth';

export interface Accessory {
  id: string;
  name: string;
  price: number;
  type: AccessoryType;
  icon: ElementType;
  description: string;
  imageUrl?: string;
}

export const ACCESSORIES: Accessory[] = [
  { id: 'led', name: 'Integrated LED Lighting', price: 1500, type: 'flat', icon: Lightbulb, description: 'Perimeter lighting system', imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400&h=300' },
  { id: 'sensor', name: 'Wind & Rain Sensor', price: 550, type: 'flat', icon: Wind, description: 'Automated weather sensor that detects wind, rain and temperature changes to automatically close louvers and protect your outdoor space', imageUrl: '/wind-rain-sensor.jpg' },
  { id: 'heater', name: 'Bromic Platinum Smart-Heat 4500W', price: 3431, type: 'flat', icon: Thermometer, description: '4500W premium infrared electric patio heater with sleek low-profile design. Provides powerful radiant heat for year-round outdoor comfort. Installation by a licensed electrician at additional cost.*', imageUrl: '/bromic-heater.jpg' },
  { id: 'fan', name: 'Ceiling Fan', price: 2750, type: 'flat', icon: Fan, description: 'Outdoor-rated ceiling fan with integrated LED light and remote control. Designed for wet locations with weather-resistant construction and quiet motor', imageUrl: '/ceiling-fan.jpg' },
  { id: 'screen_front', name: 'Motorized Screen (Front)', price: 0, type: 'screen_width', icon: Blinds, description: 'Retractable screen for front side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_back', name: 'Motorized Screen (Back)', price: 0, type: 'screen_width', icon: Blinds, description: 'Retractable screen for back side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_left', name: 'Motorized Screen (Left)', price: 0, type: 'screen_depth', icon: Blinds, description: 'Retractable screen for left side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_right', name: 'Motorized Screen (Right)', price: 0, type: 'screen_depth', icon: Blinds, description: 'Retractable screen for right side', imageUrl: '/motorizedscreens.png' },
  { id: 'wall_front', name: 'Privacy Wall (Front)', price: 55, type: 'wall_width', icon: PanelRight, description: 'Fixed privacy wall for front side', imageUrl: '/privacywall.png' },
  { id: 'wall_back', name: 'Privacy Wall (Back)', price: 55, type: 'wall_width', icon: PanelRight, description: 'Fixed privacy wall for back side', imageUrl: '/privacywall.png' },
  { id: 'wall_left', name: 'Privacy Wall (Left)', price: 55, type: 'wall_depth', icon: PanelRight, description: 'Fixed privacy wall for left side', imageUrl: '/privacywall.png' },
  { id: 'wall_right', name: 'Privacy Wall (Right)', price: 55, type: 'wall_depth', icon: PanelRight, description: 'Fixed privacy wall for right side', imageUrl: '/privacywall.png' },
  { id: 'guillotine_front', name: 'Guillotine Window (Front)', price: 0, type: 'screen_width', icon: Blinds, description: 'Motorized guillotine window for front side', imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=400&h=300' },
  { id: 'app_control', name: 'Smart App Control', price: 450, type: 'flat', icon: Smartphone, description: 'Wi-Fi enabled smart home integration to control louvers, screens, lighting and accessories from your smartphone or tablet anywhere', imageUrl: '/smart-app-control.jpg' },
  { id: 'speaker', name: 'Bluetooth Speaker System', price: 1200, type: 'flat', icon: Speaker, description: 'Weather-resistant Bluetooth speakers', imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&q=80&w=400&h=300' },
  { id: 'inlite_halo', name: 'in-lite HALO', price: 380, type: 'flat', icon: Lightbulb, description: 'Dimmable ambient wall fixtures', imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400&h=300' },
];
```

- [ ] **Step 2: Create `src/shared/lib/pricing.ts`**

Extract pricing functions from `Home.tsx` lines 93-145 (SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription).

```typescript
// src/shared/lib/pricing.ts

export const SCREEN_PRICES: Record<number, Record<number, number>> = {
  8: { 7: 3969.70, 8: 4124.85, 9: 4333.50, 10: 4579.60, 11: 4777.55, 12: 4884.55, 13: 5103.90, 14: 5312.55, 15: 5408.85, 16: 5617.50, 17: 5788.70, 18: 5938.50, 19: 6125.75, 20: 6313.00 },
  9: { 7: 4039.25, 8: 4183.70, 9: 4397.70, 10: 4643.80, 11: 4847.10, 12: 4948.75, 13: 5162.75, 14: 5371.40, 15: 5478.40, 16: 5692.40, 17: 5842.20, 18: 6034.80, 19: 6222.05, 20: 6409.30 },
  10: { 7: 4108.80, 8: 4263.95, 9: 4467.25, 10: 4708.00, 11: 4916.65, 12: 5029.00, 13: 5232.30, 14: 5446.30, 15: 5604.45, 16: 5756.60, 17: 5917.10, 18: 6077.60, 19: 6264.85, 20: 6452.10 },
  11: { 7: 4162.30, 8: 4328.15, 9: 4531.45, 10: 4772.20, 11: 4986.20, 12: 5087.85, 13: 5301.85, 14: 5515.85, 15: 5654.95, 16: 5820.08, 17: 5986.65, 18: 6141.80, 19: 6329.05, 20: 6516.30 },
};

export function getMarkup(area: number): number {
  if (area <= 99) return 1.20;
  if (area <= 119) return 1.15;
  return 1.10;
}

export function calculateLouverCount(width: number, depth: number): number {
  const postSize = 7.25 / 12;
  const maxLouverSpan = 13;
  const maxDepthSpan = 20;
  const numBaysX = Math.ceil(width / maxLouverSpan);
  const numBaysZ = Math.ceil(depth / maxDepthSpan);

  const louverBayWidthZ = ((depth - postSize) / numBaysZ) - postSize;
  const targetSpacing = 7.75 / 12;
  const louverMargin = 0.1;
  const louverArea = louverBayWidthZ - (louverMargin * 2 + (8.5 / 12));
  const louverCountPerBay = Math.max(2, Math.round(louverArea / targetSpacing) + 1);

  return numBaysX * numBaysZ * louverCountPerBay;
}

export function calculateScreenPrice(length: number, height: number, numBays: number): number {
  const base = Math.floor(length / numBays);
  const remainder = length % numBays;

  let total = 0;
  for (let i = 0; i < numBays; i++) {
    const screenLength = base + (i < remainder ? 1 : 0);
    total += SCREEN_PRICES[height]?.[screenLength] || 0;
  }

  return total * 1.05;
}

export function getScreenDescription(length: number, numBays: number): string {
  if (numBays === 1) return `Includes 1 screen (${length}')`;

  const base = Math.floor(length / numBays);
  const remainder = length % numBays;

  if (remainder === 0) {
    return `Includes ${numBays} screens (${base}' each)`;
  } else {
    return `Includes ${numBays} screens (${remainder} at ${base + 1}', ${numBays - remainder} at ${base}')`;
  }
}

/** Calculate the total price for a given configuration */
export function calculateTotalPrice(
  width: number,
  depth: number,
  height: number,
  selectedAccessories: Set<string>,
  accessories: { id: string; price: number; type: string }[],
  options: {
    louverColor?: string;
    wallColor?: string;
    heaterControl?: 'switch' | 'dimmer';
  } = {}
): { basePrice: number; accessoriesTotal: number; subtotal: number } {
  const sqft = width * depth;
  const markup = getMarkup(sqft);
  const basePrice = Math.round(sqft * 130 * markup);

  const wallUnitPrice = sqft < 120 ? 60 : 55;
  const maxLouverSpan = 13;
  const maxDepthSpan = 20;
  const numBaysX = Math.ceil(width / maxLouverSpan);
  const numBaysZ = Math.ceil(depth / maxDepthSpan);
  const hasMiddlePosts = numBaysX > 1 || numBaysZ > 1;
  const numScreenBaysX = (hasMiddlePosts && numBaysX > 1) || width > 20 ? numBaysX : 1;
  const numScreenBaysZ = (hasMiddlePosts && numBaysZ > 1) || depth > 20 ? numBaysZ : 1;

  let accessoriesTotal = 0;
  selectedAccessories.forEach(id => {
    const acc = accessories.find(a => a.id === id);
    if (!acc) return;

    if (acc.type === 'flat') {
      accessoriesTotal += acc.price;
      if (id === 'heater' && options.heaterControl === 'dimmer') accessoriesTotal += 1031;
    } else if (acc.type === 'sqft') {
      accessoriesTotal += acc.price * sqft;
    } else if (acc.type === 'screen_width') {
      accessoriesTotal += calculateScreenPrice(width, height, numScreenBaysX);
    } else if (acc.type === 'screen_depth') {
      accessoriesTotal += calculateScreenPrice(depth, height, numScreenBaysZ);
    } else if (acc.type === 'wall_width') {
      accessoriesTotal += width * height * wallUnitPrice;
    } else if (acc.type === 'wall_depth') {
      accessoriesTotal += depth * height * wallUnitPrice;
    }
  });

  // Louver upgrade
  if (options.louverColor === '#8B5A2B') {
    accessoriesTotal += calculateLouverCount(width, depth) * 150;
  }

  return { basePrice, accessoriesTotal, subtotal: basePrice + accessoriesTotal };
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

- [ ] **Step 3: Create `src/shared/lib/colors.ts`**

Extract color definitions from `Home.tsx`. Search for all color arrays (frame colors, louver colors, wall colors) and move them here.

```typescript
// src/shared/lib/colors.ts

export interface ColorOption {
  hex: string;
  name: string;
  ral?: string;
}

export const FRAME_COLORS: ColorOption[] = [
  { hex: '#0A0A0A', name: 'Black', ral: 'RAL 9005' },
  { hex: '#F6F6F6', name: 'White', ral: 'RAL 9016' },
  { hex: '#706B63', name: 'Bronze', ral: 'RAL 7006' },
  { hex: '#A39E93', name: 'Champagne', ral: 'RAL 1019' },
  { hex: '#808080', name: 'Grey', ral: 'RAL 7037' },
  { hex: '#8B5A2B', name: 'Woodgrain', ral: 'Special' },
];

export const LOUVER_COLORS: ColorOption[] = [
  { hex: '#F6F6F6', name: 'White', ral: 'RAL 9016' },
  { hex: '#0A0A0A', name: 'Black', ral: 'RAL 9005' },
  { hex: '#706B63', name: 'Bronze', ral: 'RAL 7006' },
  { hex: '#A39E93', name: 'Champagne', ral: 'RAL 1019' },
  { hex: '#808080', name: 'Grey', ral: 'RAL 7037' },
  { hex: '#8B5A2B', name: 'Woodgrain', ral: 'Special' },
];

export const WALL_COLORS: ColorOption[] = [
  { hex: '#0A0A0A', name: 'Black', ral: 'RAL 9005' },
  { hex: '#F6F6F6', name: 'White', ral: 'RAL 9016' },
  { hex: '#706B63', name: 'Bronze', ral: 'RAL 7006' },
  { hex: '#A39E93', name: 'Champagne', ral: 'RAL 1019' },
  { hex: '#808080', name: 'Grey', ral: 'RAL 7037' },
  { hex: '#8B5A2B', name: 'Woodgrain', ral: 'Special' },
];

export function getColorName(hex: string): string {
  const all = [...FRAME_COLORS, ...LOUVER_COLORS, ...WALL_COLORS];
  return all.find(c => c.hex === hex)?.name || hex;
}
```

- [ ] **Step 4: Update `Home.tsx` to import from shared modules**

Replace the inline definitions in `Home.tsx` with imports:

```typescript
// At top of Home.tsx, add:
import { ACCESSORIES, type Accessory, type AccessoryType } from '../shared/lib/accessories';
import { SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription, formatCurrency } from '../shared/lib/pricing';
import { FRAME_COLORS, LOUVER_COLORS, WALL_COLORS, getColorName } from '../shared/lib/colors';

// Then DELETE:
// - lines 93-186 (SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription, AccessoryType, Accessory, ACCESSORIES)
// - The color arrays wherever they are defined inline
// - The local formatCurrency function if one exists
```

- [ ] **Step 5: Verify the retail app still works**

Run: `npx vite --port 5174`

Open `http://localhost:5174` — walk through all 5 steps. Verify pricing, accessories, colors, and PDF generation still work. The only change is where the code lives, not what it does.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/accessories.ts src/shared/lib/pricing.ts src/shared/lib/colors.ts src/pages/Home.tsx
git commit -m "refactor: extract pricing, accessories, and colors into shared modules"
```

---

## Task 2: Move Components to Shared Directory

**Files:**
- Move: `src/components/PergolaVisualizer.tsx` → `src/shared/components/PergolaVisualizer.tsx`
- Move: `src/components/ProposalDocument.tsx` → `src/shared/components/ProposalDocument.tsx`
- Move: `src/components/ErrorBoundary.tsx` → `src/shared/components/ErrorBoundary.tsx`
- Move: `src/lib/pdfGenerator.ts` → `src/shared/lib/pdfGenerator.ts`
- Move: `src/firebase.ts` → `src/shared/firebase.ts`
- Modify: All files that import from the old paths

- [ ] **Step 1: Create shared directories and move files**

```bash
mkdir -p src/shared/components src/shared/lib src/shared/hooks
mv src/components/PergolaVisualizer.tsx src/shared/components/
mv src/components/ProposalDocument.tsx src/shared/components/
mv src/components/ErrorBoundary.tsx src/shared/components/
mv src/lib/pdfGenerator.ts src/shared/lib/
mv src/firebase.ts src/shared/firebase.ts
```

- [ ] **Step 2: Update all import paths**

Update every file that imports from the old locations. The key files:

**`src/pages/Home.tsx`** — Update imports:
```typescript
// Old:
import PergolaVisualizer from '../components/PergolaVisualizer';
import { ProposalDocument } from '../components/ProposalDocument';
import { generateProposalPDF } from '../lib/pdfGenerator';
import { db, collection, addDoc, serverTimestamp, auth, doc, setDoc, getDoc, query, where, getDocs } from '../firebase';

// New:
import PergolaVisualizer from '../shared/components/PergolaVisualizer';
import { ProposalDocument } from '../shared/components/ProposalDocument';
import { generateProposalPDF } from '../shared/lib/pdfGenerator';
import { db, collection, addDoc, serverTimestamp, auth, doc, setDoc, getDoc, query, where, getDocs } from '../shared/firebase';
```

**`src/pages/Admin.tsx`** — Update firebase import:
```typescript
// Old:
import { db, auth, ... } from '../firebase';
// New:
import { db, auth, ... } from '../shared/firebase';
```

**`src/pages/ProposalPreview.tsx`** — Update ProposalDocument import:
```typescript
// Old:
import { ProposalDocument } from '../components/ProposalDocument';
// New:
import { ProposalDocument } from '../shared/components/ProposalDocument';
```

**`src/shared/components/ProposalDocument.tsx`** — Update its own import:
```typescript
// Old:
import PergolaVisualizer from './PergolaVisualizer';
// New (same directory, no change needed):
import PergolaVisualizer from './PergolaVisualizer';
```

- [ ] **Step 3: Verify retail app still works**

Run: `npx vite --port 5174`
Open `http://localhost:5174` and `http://localhost:5174/proposal-preview`. Both should work identically.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move components, lib, and firebase to src/shared/"
```

---

## Task 3: Create Retail App Entry Points

Move the retail-specific files into `src/retail/` and update the Vite entry point.

**Files:**
- Create: `src/retail/main.tsx`
- Create: `src/retail/App.tsx`
- Move: `src/pages/Home.tsx` → `src/retail/pages/Home.tsx`
- Move: `src/pages/Admin.tsx` → `src/retail/pages/Admin.tsx`
- Move: `src/pages/ProposalPreview.tsx` → `src/retail/pages/ProposalPreview.tsx`
- Modify: `index.html`

- [ ] **Step 1: Create retail directory and move pages**

```bash
mkdir -p src/retail/pages
mv src/pages/Home.tsx src/retail/pages/
mv src/pages/Admin.tsx src/retail/pages/
mv src/pages/ProposalPreview.tsx src/retail/pages/
```

- [ ] **Step 2: Create `src/retail/App.tsx`**

```typescript
// src/retail/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import ProposalPreview from './pages/ProposalPreview';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/configurator" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/proposal-preview" element={<ProposalPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create `src/retail/main.tsx`**

```typescript
// src/retail/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Update `index.html` to point to retail entry**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eclipse Aluminum Pergola</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/retail/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Update import paths in moved retail pages**

Since pages moved from `src/pages/` to `src/retail/pages/`, the relative path to `src/shared/` changes:

**`src/retail/pages/Home.tsx`:**
```typescript
// Old: import ... from '../shared/...'
// New: import ... from '../../shared/...'
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import { ProposalDocument } from '../../shared/components/ProposalDocument';
import { generateProposalPDF } from '../../shared/lib/pdfGenerator';
import { db, collection, addDoc, serverTimestamp, auth, doc, setDoc, getDoc, query, where, getDocs } from '../../shared/firebase';
import { ACCESSORIES, type Accessory, type AccessoryType } from '../../shared/lib/accessories';
import { SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription, formatCurrency } from '../../shared/lib/pricing';
import { FRAME_COLORS, LOUVER_COLORS, WALL_COLORS, getColorName } from '../../shared/lib/colors';
```

Apply the same `../shared/` → `../../shared/` change to `Admin.tsx` and `ProposalPreview.tsx`.

- [ ] **Step 6: Delete old files**

```bash
rm -rf src/pages/ src/App.tsx src/main.tsx
```

Keep `src/index.css` in place (both apps import it).

- [ ] **Step 7: Verify retail app**

Run: `npx vite --port 5174`
Open `http://localhost:5174`. Everything should work exactly as before.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move retail app to src/retail/ with dedicated entry point"
```

---

## Task 4: Create Pro App Skeleton + Multi-Entry Vite Config

**Files:**
- Create: `pro.html`
- Create: `src/pro/main.tsx`
- Create: `src/pro/App.tsx`
- Create: `src/pro/pages/Login.tsx`
- Create: `src/pro/pages/Dashboard.tsx`
- Create: `src/pro/components/ProLayout.tsx`
- Create: `src/pro/components/AuthGuard.tsx`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create `pro.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eclipse Pro — Contractor Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/pro/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/pro/main.tsx`**

```typescript
// src/pro/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Create `src/pro/components/AuthGuard.tsx`**

```typescript
// src/pro/components/AuthGuard.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase';

interface ContractorData {
  uid: string;
  companyName: string;
  contactName: string;
  email: string;
  discountPercentage: number;
  status: 'invited' | 'active' | 'suspended';
}

interface AuthGuardProps {
  children: (contractor: ContractorData) => ReactNode;
  fallback: ReactNode;
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const [state, setState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [contractor, setContractor] = useState<ContractorData | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        setState('unauthenticated');
        setContractor(null);
        return;
      }

      try {
        const contractorDoc = await getDoc(doc(db, 'contractors', user.uid));
        if (contractorDoc.exists() && contractorDoc.data().status === 'active') {
          const data = contractorDoc.data();
          setContractor({
            uid: user.uid,
            companyName: data.companyName,
            contactName: data.contactName,
            email: data.email,
            discountPercentage: data.discountPercentage,
            status: data.status,
          });
          setState('authenticated');
        } else {
          setState('unauthenticated');
          setContractor(null);
        }
      } catch {
        setState('unauthenticated');
        setContractor(null);
      }
    });

    return () => unsubscribe();
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C5A059] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (state === 'unauthenticated' || !contractor) {
    return <>{fallback}</>;
  }

  return <>{children(contractor)}</>;
}

export type { ContractorData };
```

- [ ] **Step 4: Create `src/pro/components/ProLayout.tsx`**

```typescript
// src/pro/components/ProLayout.tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FileText, Settings, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../shared/firebase';
import type { ContractorData } from './AuthGuard';

interface ProLayoutProps {
  contractor: ContractorData;
  children: React.ReactNode;
}

export default function ProLayout({ contractor, children }: ProLayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/quote/new', icon: PlusCircle, label: 'New Quote' },
    { to: '/quotes', icon: FileText, label: 'My Quotes' },
    { to: '/account', icon: Settings, label: 'Account' },
  ];

  return (
    <div className="min-h-screen bg-[#111] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0a] border-r border-[#222] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-[#222]">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Eclipse" className="h-8 object-contain" />
            <div>
              <p className="text-white font-bold text-sm">Eclipse Pro</p>
              <p className="text-[#C5A059] text-[10px] uppercase tracking-wider">Contractor Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#C5A059]/10 text-[#C5A059] font-medium'
                    : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-[#222]">
          <div className="mb-3">
            <p className="text-white text-sm font-medium truncate">{contractor.companyName}</p>
            <p className="text-[#666] text-xs truncate">{contractor.contactName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[#666] hover:text-red-400 text-xs transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/pro/pages/Login.tsx`**

```typescript
// src/pro/pages/Login.tsx
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../shared/firebase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <img src="/logo.png" alt="Eclipse" className="h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-white text-2xl font-bold">Eclipse Pro</h1>
          <p className="text-[#C5A059] text-sm uppercase tracking-wider mt-1">Contractor Portal</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-colors"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-colors"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C5A059] text-[#0a0a0a] font-bold py-3 rounded-lg text-sm uppercase tracking-wider hover:bg-[#d4b068] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-[#555] text-xs text-center mt-4">
            Contractor accounts are invite-only.<br />
            Contact Eclipse to request access.
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/pro/pages/Dashboard.tsx`** (placeholder)

```typescript
// src/pro/pages/Dashboard.tsx
import type { ContractorData } from '../components/AuthGuard';

interface DashboardProps {
  contractor: ContractorData;
}

export default function Dashboard({ contractor }: DashboardProps) {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold">Welcome back, {contractor.contactName}</h1>
        <p className="text-[#666] text-sm mt-1">{contractor.companyName} — {contractor.discountPercentage}% contractor discount</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Quotes This Month', value: '—' },
          { label: 'Pipeline Value', value: '—' },
          { label: 'Quotes Sent', value: '—' },
          { label: 'Quotes Accepted', value: '—' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-6">
            <p className="text-[#666] text-xs uppercase tracking-wider mb-2">{stat.label}</p>
            <p className="text-white text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-8 text-center">
        <p className="text-[#666] text-sm mb-4">Start quoting by creating a new configuration</p>
        <a
          href="/quote/new"
          className="inline-block bg-[#C5A059] text-[#0a0a0a] font-bold px-8 py-3 rounded-lg text-sm uppercase tracking-wider hover:bg-[#d4b068] transition-colors"
        >
          New Quote
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/pro/App.tsx`**

```typescript
// src/pro/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import ProLayout from './components/ProLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function ProApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <AuthGuard fallback={<Navigate to="/login" replace />}>
              {(contractor) => (
                <ProLayout contractor={contractor}>
                  <Routes>
                    <Route path="/" element={<Dashboard contractor={contractor} />} />
                    <Route path="/quotes" element={<Dashboard contractor={contractor} />} />
                    <Route path="/account" element={<Dashboard contractor={contractor} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ProLayout>
              )}
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Update `vite.config.ts` for multi-entry build**

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          retail: path.resolve(__dirname, 'index.html'),
          pro: path.resolve(__dirname, 'pro.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Content-Security-Policy': "frame-ancestors *",
        'Access-Control-Allow-Origin': '*',
      },
    },
  };
});
```

- [ ] **Step 9: Verify both apps**

Run: `npx vite --port 5174`

- Open `http://localhost:5174` → Retail configurator works
- Open `http://localhost:5174/pro.html` → Pro login page shows with dark theme and Eclipse Pro branding

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Eclipse Pro app skeleton with login, dashboard, sidebar layout, and multi-entry Vite build"
```

---

## Task 5: Contractor Invite System (Admin Side)

**Files:**
- Modify: `src/retail/pages/Admin.tsx` — add Contractor Management tab
- Modify: `server.ts` — add `/api/pro/invite-contractor` endpoint
- Modify: `firestore.rules` — add contractors collection rules

- [ ] **Step 1: Add `/api/pro/invite-contractor` endpoint to `server.ts`**

Add this after the existing API endpoints in `server.ts`:

```typescript
// ─── Pro Contractor Endpoints ────────────────────────────────────────────────

app.post('/api/pro/invite-contractor', async (req: Request, res: Response) => {
  try {
    const { companyName, contactName, email, phone, discountPercentage, adminSecret } = req.body;

    // Simple admin auth — verify with a shared secret (or Firebase Admin token in production)
    if (adminSecret !== process.env.EXPORT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!companyName || !contactName || !email || discountPercentage === undefined) {
      return res.status(400).json({ error: 'Missing required fields: companyName, contactName, email, discountPercentage' });
    }

    // Generate a secure invite token
    const inviteToken = crypto.randomUUID();

    // Create the contractor document (UID will be set when they sign up)
    const contractorRef = adminDb.collection('contractors').doc();
    await contractorRef.set({
      companyName,
      contactName,
      email,
      phone: phone || '',
      discountPercentage: Number(discountPercentage),
      status: 'invited',
      inviteToken,
      invitedAt: FieldValue.serverTimestamp(),
      activatedAt: null,
      lastLogin: null,
      createdBy: 'admin',
    });

    // Send invite email via Resend
    if (resend) {
      const signupUrl = `${process.env.PRO_URL || 'https://pro.eclipsepergola.ca'}/signup?token=${inviteToken}`;
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: 'You\'re invited to Eclipse Pro — Contractor Portal',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #fff; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #C5A059; margin: 0;">Eclipse Pro</h1>
              <p style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Contractor Portal</p>
            </div>
            <p>Hi ${contactName},</p>
            <p>You've been invited to join Eclipse Pro — our contractor quoting platform. Price out pergola projects with your exclusive ${discountPercentage}% contractor discount.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${signupUrl}" style="background: #C5A059; color: #0a0a0a; padding: 14px 32px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Create Your Account
              </a>
            </div>
            <p style="color: #666; font-size: 12px;">This invite link is unique to you and can only be used once. If you have questions, contact us at info@eclipsepergola.ca or 289-855-2977.</p>
          </div>
        `,
      });
    }

    res.json({ success: true, contractorId: contractorRef.id, inviteToken });
  } catch (error) {
    console.error('Invite contractor error:', error);
    res.status(500).json({ error: 'Failed to invite contractor' });
  }
});
```

- [ ] **Step 2: Add Contractor Management tab to `Admin.tsx`**

This involves adding a new tab to the existing Admin dashboard. Add a "Contractors" tab that shows existing contractors and has an "Invite" form. The Admin page already uses tabs — add one more.

In the Admin.tsx tab definitions, add:
```typescript
{ id: 'contractors', label: 'Contractors' }
```

And add the tab content panel with:
- A list of existing contractors from Firestore `contractors` collection (companyName, email, status, discountPercentage, lastLogin)
- An "Invite Contractor" form with fields: Company Name, Contact Name, Email, Phone, Discount %
- The form POSTs to `/api/pro/invite-contractor`

(Full implementation code is context-dependent on the existing Admin.tsx tab structure — the executing agent should read Admin.tsx to follow the existing pattern.)

- [ ] **Step 3: Update `firestore.rules`**

Add after the existing helper functions:

```
function isContractor() {
  return request.auth != null
    && exists(/databases/$(database)/documents/contractors/$(request.auth.uid))
    && get(/databases/$(database)/documents/contractors/$(request.auth.uid)).data.status == 'active';
}

match /contractors/{contractorId} {
  allow read: if request.auth != null && (request.auth.uid == contractorId || isAdmin());
  allow create: if isAdmin();
  allow update: if isAdmin();
  allow delete: if isAdmin();
}
```

- [ ] **Step 4: Commit**

```bash
git add server.ts src/retail/pages/Admin.tsx firestore.rules
git commit -m "feat: add contractor invite system — admin UI, API endpoint, invite email, Firestore rules"
```

---

## Task 6: Contractor Signup Flow

**Files:**
- Create: `src/pro/pages/Signup.tsx`
- Modify: `src/pro/App.tsx` — add signup route
- Modify: `server.ts` — add `/api/pro/activate-contractor` endpoint

- [ ] **Step 1: Add `/api/pro/activate-contractor` endpoint to `server.ts`**

```typescript
app.post('/api/pro/activate-contractor', async (req: Request, res: Response) => {
  try {
    const { inviteToken, uid } = req.body;

    if (!inviteToken || !uid) {
      return res.status(400).json({ error: 'Missing inviteToken or uid' });
    }

    // Find the contractor doc with this invite token
    const snapshot = await adminDb.collection('contractors')
      .where('inviteToken', '==', inviteToken)
      .where('status', '==', 'invited')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Invalid or expired invite token' });
    }

    const contractorDoc = snapshot.docs[0];

    // Move the contractor doc to use the Firebase Auth UID as the document ID
    const contractorData = contractorDoc.data();
    await adminDb.collection('contractors').doc(uid).set({
      ...contractorData,
      status: 'active',
      inviteToken: null, // Clear the token
      activatedAt: FieldValue.serverTimestamp(),
    });

    // Delete the old doc if it has a different ID
    if (contractorDoc.id !== uid) {
      await contractorDoc.ref.delete();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Activate contractor error:', error);
    res.status(500).json({ error: 'Failed to activate contractor account' });
  }
});
```

- [ ] **Step 2: Create `src/pro/pages/Signup.tsx`**

```typescript
// src/pro/pages/Signup.tsx
import { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../shared/firebase';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Signup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link. Please contact Eclipse for a new invitation.');
    }
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // Create Firebase Auth account
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // Activate the contractor account on the server
      const res = await fetch('/api/pro/activate-contractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token, uid: user.uid }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to activate account');
      }

      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else {
        setError(err.message || 'Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/logo.png" alt="Eclipse" className="h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-white text-2xl font-bold">Create Your Account</h1>
          <p className="text-[#C5A059] text-sm uppercase tracking-wider mt-1">Eclipse Pro — Contractor Portal</p>
        </div>

        <form onSubmit={handleSignup} className="bg-[#0a0a0a] border border-[#222] rounded-xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-colors"
              placeholder="Use the email from your invite"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-colors"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="block text-[#888] text-xs uppercase tracking-wider mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white text-sm focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-colors"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-[#C5A059] text-[#0a0a0a] font-bold py-3 rounded-lg text-sm uppercase tracking-wider hover:bg-[#d4b068] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add signup route to `src/pro/App.tsx`**

```typescript
// Add import:
import Signup from './pages/Signup';

// Add route before the catch-all:
<Route path="/signup" element={<Signup />} />
```

- [ ] **Step 4: Verify the full invite → signup → login flow**

1. POST to `/api/pro/invite-contractor` with test data
2. Use the returned `inviteToken` to open `/signup?token=<token>` on the Pro app
3. Create account → should redirect to Dashboard
4. Sign out → sign back in via Login page → should reach Dashboard

- [ ] **Step 5: Commit**

```bash
git add src/pro/pages/Signup.tsx src/pro/App.tsx server.ts
git commit -m "feat: add contractor signup flow — token validation, account creation, activation endpoint"
```

---

## Task 7: Pro Configurator with Pricing Overlay

**Files:**
- Create: `src/pro/pages/ProConfigurator.tsx`
- Create: `src/pro/components/PricingOverlay.tsx`
- Modify: `src/pro/App.tsx` — add `/quote/new` route

- [ ] **Step 1: Create `src/pro/components/PricingOverlay.tsx`**

```typescript
// src/pro/components/PricingOverlay.tsx
import { formatCurrency } from '../../shared/lib/pricing';

interface PricingLineItem {
  name: string;
  retailPrice: number;
  contractorCost: number;
}

interface PricingOverlayProps {
  items: PricingLineItem[];
  discountPercentage: number;
  hstRate?: number;
}

export default function PricingOverlay({ items, discountPercentage, hstRate = 0.13 }: PricingOverlayProps) {
  const retailTotal = items.reduce((sum, i) => sum + i.retailPrice, 0);
  const contractorTotal = items.reduce((sum, i) => sum + i.contractorCost, 0);
  const marginTotal = retailTotal - contractorTotal;
  const retailHst = retailTotal * hstRate;
  const contractorHst = contractorTotal * hstRate;

  return (
    <div className="bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden">
      <div className="bg-[#C5A059] px-4 py-2">
        <p className="text-[#0a0a0a] text-xs font-bold uppercase tracking-wider">
          Pricing Breakdown — {discountPercentage}% Contractor Discount
        </p>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[1fr_90px_90px_90px] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#666] border-b border-[#222]">
        <div>Item</div>
        <div className="text-right">Retail</div>
        <div className="text-right">Your Cost</div>
        <div className="text-right">Margin</div>
      </div>

      {/* Line items */}
      <div className="max-h-[300px] overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_90px_90px] px-4 py-2 text-[11px] border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
            <div className="text-white truncate pr-2">{item.name}</div>
            <div className="text-right text-[#888]">${formatCurrency(item.retailPrice)}</div>
            <div className="text-right text-[#C5A059]">${formatCurrency(item.contractorCost)}</div>
            <div className="text-right text-emerald-400">${formatCurrency(item.retailPrice - item.contractorCost)}</div>
          </div>
        ))}
      </div>

      {/* HST */}
      <div className="grid grid-cols-[1fr_90px_90px_90px] px-4 py-2 text-[11px] border-t border-[#333] text-[#666]">
        <div>HST (13%)</div>
        <div className="text-right">${formatCurrency(retailHst)}</div>
        <div className="text-right">${formatCurrency(contractorHst)}</div>
        <div className="text-right">${formatCurrency(retailHst - contractorHst)}</div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-[1fr_90px_90px_90px] px-4 py-3 text-sm font-bold border-t-2 border-[#C5A059] bg-[#111]">
        <div className="text-white">Total</div>
        <div className="text-right text-white">${formatCurrency(retailTotal + retailHst)}</div>
        <div className="text-right text-[#C5A059]">${formatCurrency(contractorTotal + contractorHst)}</div>
        <div className="text-right text-emerald-400">${formatCurrency(marginTotal + (retailHst - contractorHst))}</div>
      </div>

      {/* Margin percentage */}
      <div className="px-4 py-2 text-center">
        <span className="text-emerald-400 text-xs font-medium">
          Your margin: {((marginTotal / retailTotal) * 100).toFixed(1)}% (${formatCurrency(marginTotal)} before tax)
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pro/pages/ProConfigurator.tsx`**

This wraps the shared configurator logic with the Pro pricing overlay. Rather than duplicating the entire 2100-line `Home.tsx`, it imports the shared pricing/accessory modules and rebuilds only the configurator core with the Pro-specific UI additions.

The executing agent should:
1. Read `src/retail/pages/Home.tsx` for the full configurator state and step logic
2. Create `ProConfigurator.tsx` that reuses the same 5-step configurator flow
3. Replace the landing page (Step 0) with a simple customer info form (no brand hero)
4. Add the `PricingOverlay` component as a collapsible panel below the 3D visualizer
5. Replace the "Email Quote" / "Request Consultation" buttons with "Save as Draft" and "Send to Client"
6. Auto-populate the contractor's company name from the `contractor` prop
7. Build the pricing line items array by applying the contractor's `discountPercentage` to each line

Key differences from retail `Home.tsx`:
- No landing hero page — starts directly at the customer info form
- `PricingOverlay` visible alongside the configurator showing Retail / Cost / Margin
- Footer actions: "Save as Draft" + "Send to Client" + "Download Cost Sheet"
- Customer info includes an optional "Project Notes" field
- No contractor discount toggle (discount is always applied, it's inherent)
- The `contractor` prop provides `discountPercentage` and `companyName`

The pricing overlay items are computed as:

```typescript
const pricingItems: PricingLineItem[] = useMemo(() => {
  const discount = contractor.discountPercentage / 100;
  const items: PricingLineItem[] = [
    {
      name: `Motorized Louvered Pergola (${width}' × ${depth}')`,
      retailPrice: basePrice,
      contractorCost: basePrice * (1 - discount),
    },
  ];

  // Add each selected accessory as a line item
  itemizedAccessories.forEach(acc => {
    items.push({
      name: acc.name,
      retailPrice: acc.cost,
      contractorCost: acc.cost * (1 - discount),
    });
  });

  return items;
}, [basePrice, itemizedAccessories, contractor.discountPercentage, width, depth]);
```

- [ ] **Step 3: Add route to `src/pro/App.tsx`**

```typescript
// Add import:
import ProConfigurator from './pages/ProConfigurator';

// Add route inside the authenticated Routes:
<Route path="/quote/new" element={<ProConfigurator contractor={contractor} />} />
```

- [ ] **Step 4: Verify the Pro configurator**

Run: `npx vite --port 5174`

1. Open `http://localhost:5174/pro.html`
2. Log in with a test contractor account
3. Click "New Quote" in the sidebar
4. Walk through all 5 configurator steps
5. Verify the pricing overlay shows Retail / Cost / Margin for every line item
6. Verify the discount % matches the contractor's account setting

- [ ] **Step 5: Commit**

```bash
git add src/pro/pages/ProConfigurator.tsx src/pro/components/PricingOverlay.tsx src/pro/App.tsx
git commit -m "feat: add Pro configurator with dual pricing overlay showing retail/cost/margin"
```

---

## Task 8: Remove Old Contractor Code + Add Redirect

**Files:**
- Delete: `src/pages/Contractor.tsx` (if not already removed in Task 3)
- Modify: `src/retail/App.tsx` — remove `/contractor` route, add redirect

- [ ] **Step 1: Clean up the retail app**

In `src/retail/App.tsx`, remove any reference to the old Contractor page. Add a redirect for anyone who hits `/contractor`:

```typescript
// src/retail/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import ProposalPreview from './pages/ProposalPreview';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/configurator" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/proposal-preview" element={<ProposalPreview />} />
        {/* Redirect old contractor route to Pro portal */}
        <Route path="/contractor" element={<Navigate to="https://pro.eclipsepergola.ca" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Remove contractor-specific UI from retail Home.tsx**

In `src/retail/pages/Home.tsx`:
- Remove the contractor discount toggle panel (Step 5 contractor options)
- Remove the "Contractor pricing applied in final step" badge
- Remove the `userRole`, `contractorDiscount`, `applyContractorDiscount` state and the Firebase auth check that reads the user document for contractor role
- Keep the admin login functionality if it exists for the admin dashboard

This cleans up the retail site so there's zero contractor-related UI visible to retail customers.

- [ ] **Step 3: Delete old Contractor.tsx**

```bash
rm -f src/pages/Contractor.tsx 2>/dev/null
```

- [ ] **Step 4: Verify retail site has no contractor references**

Open `http://localhost:5174` — no "contractor portal" button, no contractor discount UI, no admin link pointing to contractor features. The retail experience is clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old contractor code from retail app, add redirect to Pro portal"
```

---

## Summary

After completing all 8 tasks, you'll have:

- **Shared modules** in `src/shared/` — pricing engine, accessory catalog, colors, 3D visualizer, proposal PDF, Firebase config
- **Retail app** in `src/retail/` — the existing configurator, clean of any contractor references
- **Pro app** in `src/pro/` — contractor login, signup, dashboard, sidebar layout, configurator with pricing overlay
- **Invite system** — admin can invite contractors from the Admin dashboard, invite email sent via Resend
- **Auth flow** — invite token → signup → email/password login → AuthGuard protects all Pro routes
- **Dual pricing** — Pro configurator shows Retail Price / Contractor Cost / Margin for every line item
- **Multi-entry Vite build** — `index.html` serves retail, `pro.html` serves Pro

### What's Next (Phase 2 Plan)

- **Lead pipeline** — Kanban board for managing contractor quotes (Draft → Sent → Accepted → Installed → Lost)
- **Quote CRUD** — Save, edit, re-open configurations from the dashboard
- **Dual PDF generation** — Client proposal (retail pricing) + Internal cost sheet (margin breakdown)
- **CRM integration** — Contractor quotes push to Pipedrive with source tagging
- **Lead Collision detection** — Fuzzy matching across retail + contractor leads
