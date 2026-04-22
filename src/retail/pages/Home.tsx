/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, Suspense, Fragment, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
  Check,
  Sun,
  Moon,
  Blinds,
  PanelRight,
  Mail,
  Calendar,
  User,
  Phone,
  MapPin,
  Plus,
  Minus,
  Loader2,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import html2canvas from 'html2canvas';
import { db, collection, addDoc, serverTimestamp, auth, doc, setDoc, query, where, getDocs, onSnapshot, deleteDoc, storage, storageRef, uploadBytes, getDownloadURL } from '../../shared/firebase';
import { QRCodeSVG } from 'qrcode.react';
import { onAuthStateChanged } from 'firebase/auth';
import { jsPDF } from 'jspdf';
import { toPng, toJpeg } from 'html-to-image';
import { ProposalDocument } from '../../shared/components/ProposalDocument';
import { generateProposalPDF } from '../../shared/lib/pdfGenerator';
import { useDebounce } from 'use-debounce';
import { SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription, formatCurrency } from '../../shared/lib/pricing';
import { type AccessoryType, type Accessory, ACCESSORIES } from '../../shared/lib/accessories';
import { COLORS, getColorName } from '../../shared/lib/colors';
import { useTheme } from '../../shared/hooks/useTheme';
import AddPergolaModal from '../components/AddPergolaModal';
import CustomRequestModal from '../components/CustomRequestModal';
import type { AdditionalPergolaItem } from '../../shared/lib/pricingMath';
import { nextJobNumber } from '../../shared/lib/jobNumber';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


function calculateBasePrice(depth: number, width: number): number | null {
  // The pricing was reported as reversed from the PDF table.
  // We swap depth and width internally to match the expected lookup logic.
  const d = width;
  const w = depth;

  if (d < 7 || d > 100 || w < 8 || w > 40) return null;

  const area = d * w;
  const sections = Math.ceil(d / 13) * Math.ceil(w / 20);

  let calculatedPrice = 0;

  if (sections > 1) {
    calculatedPrice = 140 * area + 2000 * sections;
  } else {
    if (area <= 99) {
      calculatedPrice = 165 * area + 2000;
    } else if (area <= 120) {
      calculatedPrice = 150 * area + 2000;
    } else {
      calculatedPrice = 130 * area + 2000;
    }
  }

  return calculatedPrice * getMarkup(area);
}

/**
 * Number input that tolerates partial/invalid entry while the user is
 * typing (so typing "3" on a min-7 field doesn't immediately clamp to
 * 7 before they can add the "0"). Clamps and commits on blur or Enter.
 */
function DimensionNumberInput({
  value, setter, min, max, ariaKey,
}: {
  value: number;
  setter: (n: number) => void;
  min: number;
  max: number;
  ariaKey: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) { setText(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, n));
    if (clamped !== value) setter(clamped);
    setText(String(clamped));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step="1"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); }
      }}
      onFocus={(e) => e.currentTarget.select()}
      aria-label={`Pergola ${ariaKey} in feet`}
      className="w-14 text-right text-lg font-serif font-medium text-luxury-gold bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

interface HomeProps {
  skipIntro?: boolean;
  /** When loaded via /dealer/:slug, these tag the submission for attribution */
  dealerSlug?: string;
  dealerEmail?: string;
  dealerName?: string;
  /** Admin-only build — exposes advanced controls (partial structure walls,
   *  per-end flush toggles, Phase 5 customer notes textarea). Only set by
   *  the /admin/configurator route after auth. */
  adminMode?: boolean;
}

export default function Home({ skipIntro = false, dealerSlug, dealerEmail, dealerName, adminMode = false }: HomeProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [visualizerData, setVisualizerData] = useState<any>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isDuplicateLead, setIsDuplicateLead] = useState(false);
  const getQuoteSummary = () => {
    let accessoriesText = 'None';
    if (selectedAccessories.size > 0) {
      const details: string[] = [];
      const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
      
      selectedAccessories.forEach(id => {
        const accessory = ACCESSORIES.find(a => a.id === id);
        if (!accessory) return;
        
        let cost = 0;
        let breakdown: { price: number }[] = [];
        
        const qty = accessory.quantifiable ? (accessoryQuantities[id] || 1) : 1;
        if (accessory.type === 'flat') {
          cost = accessory.price * qty;
          if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
        } else if (accessory.type === 'sqft') {
          cost = accessory.price * (depth * width) * qty;
        } else if (accessory.type === 'screen_width') {
          cost = calculateScreenPrice(width, height, numScreenBaysX);
          if (numScreenBaysX > 1) {
            const base = Math.floor(width / numScreenBaysX);
            const remainder = width % numScreenBaysX;
            for (let i = 0; i < numScreenBaysX; i++) {
              const screenLength = base + (i < remainder ? 1 : 0);
              const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
              breakdown.push({ price });
            }
          }
        } else if (accessory.type === 'screen_depth') {
          cost = calculateScreenPrice(depth, height, numScreenBaysZ);
          if (numScreenBaysZ > 1) {
            const base = Math.floor(depth / numScreenBaysZ);
            const remainder = depth % numScreenBaysZ;
            for (let i = 0; i < numScreenBaysZ; i++) {
              const screenLength = base + (i < remainder ? 1 : 0);
              const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
              breakdown.push({ price });
            }
          }
        } else if (accessory.type === 'wall_width') {
          cost = width * height * wallUnitPrice;
          const base = Math.floor(width / numScreenBaysX);
          const remainder = width % numScreenBaysX;
          for (let i = 0; i < numScreenBaysX; i++) {
            const wallLength = base + (i < remainder ? 1 : 0);
            const price = wallLength * height * wallUnitPrice;
            breakdown.push({ price });
          }
        } else if (accessory.type === 'wall_depth') {
          cost = depth * height * wallUnitPrice;
          const base = Math.floor(depth / numScreenBaysZ);
          const remainder = depth % numScreenBaysZ;
          for (let i = 0; i < numScreenBaysZ; i++) {
            const wallLength = base + (i < remainder ? 1 : 0);
            const price = wallLength * height * wallUnitPrice;
            breakdown.push({ price });
          }
        }
        
        const qtyLabel = (accessory.quantifiable && qty > 1) ? ` × ${qty}` : '';
        let itemText = `- ${accessory.name}${qtyLabel}: $${cost.toFixed(2)}`;
        
        if (breakdown.length > 1 && (accessory.type.includes('screen') || accessory.type.includes('wall'))) {
          const grouped = breakdown.reduce((acc, item) => {
            const key = item.price.toString();
            if (!acc[key]) acc[key] = { price: item.price, count: 0 };
            acc[key].count++;
            return acc;
          }, {} as Record<string, { price: number, count: number }>);
          
          Object.values(grouped).forEach(item => {
            const itemName = accessory.type.includes('wall') 
              ? (item.count === 1 ? 'wall' : 'walls') 
              : (item.count === 1 ? 'screen' : 'screens');
            itemText += `\n  * (${item.count}) ${itemName} @ $${item.price.toFixed(2)} each`;
          });
        }
        
        details.push(itemText);
      });
      accessoriesText = '\n' + details.join('\n');
    }

    let woodgrainDetails = '';
    if (woodgrainUpgrade && woodgrainUpgrade > 0) {
      const isWoodgrainLouvers = louverColor === '#8B5A2B';
      const isWoodgrainWalls = wallColor === '#8B5A2B';
      
      if (isWoodgrainLouvers) {
        const louverCount = calculateLouverCount(width, depth);
        woodgrainDetails += `\n- Woodgrain Louvers: $${(louverCount * 150).toFixed(2)}`;
      }
      
      if (isWoodgrainWalls) {
        let wallWoodgrainCost = 0;
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        selectedAccessories.forEach(id => {
          const accessory = ACCESSORIES.find(a => a.id === id);
          if (accessory && (accessory.type === 'wall_width' || accessory.type === 'wall_depth')) {
            const isWidth = accessory.type === 'wall_width';
            const sideLength = isWidth ? width : depth;
            const numBays = isWidth ? numScreenBaysX : numScreenBaysZ;
            const panelLength = sideLength / numBays;
            for (let i = 0; i < numBays; i++) {
              if (panelLength < 12) {
                wallWoodgrainCost += 100 * numPanelsPerBay;
              } else if (panelLength <= 20) {
                wallWoodgrainCost += 150 * numPanelsPerBay;
              }
            }
          }
        });
        if (wallWoodgrainCost > 0) {
          woodgrainDetails += `\n- Woodgrain Walls: $${wallWoodgrainCost.toFixed(2)}`;
        }
      }
    }

    let extraPergolasText = '';
    if (extraPergolas.length > 0) {
      const lines = extraPergolas.map((p, i) => {
        const dims = (p.width && p.depth && p.height) ? ` ${p.width}'W x ${p.depth}'D x ${p.height}'H` : '';
        const colors = (p.frameColor || p.louverColor) ? ` / Frame: ${p.frameColor || '—'}, Louver: ${p.louverColor || '—'}` : '';
        const notes = p.notes ? ` — ${p.notes}` : '';
        return `- Pergola ${i + 2}: ${p.label}${dims}${colors}${notes}: $${(p.price || 0).toFixed(2)}`;
      });
      extraPergolasText = `\n\nAdditional Pergolas:\n${lines.join('\n')}`;
    }

    const extraPergolasTotal = extraPergolas.reduce((s, p) => s + (p.price || 0), 0);
    const grandTotal = (totalPrice || 0) + extraPergolasTotal;

    // Structure wall attachment summary
    let structureText = 'Free-standing';
    if (houseWalls.size > 0) {
      const sideLabels: Record<string, string> = { front: 'Front', back: 'Rear', left: 'Left', right: 'Right' };
      const posLabels: Record<string, string> = { start: 'from left/front', center: 'centered', end: 'from right/back' };
      const sides = Array.from(houseWalls).map(s => {
        const total = (s === 'front' || s === 'back') ? width : depth;
        const len = houseWallLengths[s];
        if (typeof len === 'number' && len < total) {
          const anchor = houseWallAnchors[s] || 'start';
          return `${sideLabels[s]} (${len}' of ${total}' ${posLabels[anchor]})`;
        }
        return `${sideLabels[s]} (full ${total}')`;
      });
      structureText = sides.join(', ');
    }

    return `Pergola Quote for ${name}
Dimensions: ${width}' W x ${depth}' D x ${height}' H
Frame Color: ${getColorName(frameColor)}
Louver Color: ${getColorName(louverColor)}
Wall Color: ${getColorName(wallColor)}
Structure: ${structureText}
Foundation: ${foundationStatus || 'Not specified'}
Heater Control: ${selectedAccessories.has('heater') ? heaterControl : 'N/A'}
Screen Drop: ${screenDrop}%
Guillotine Open: ${guillotineOpen}%
Accessories: ${accessoriesText}${extraPergolasText}

Pricing:
Bespoke Pergola: $${(basePrice || 0).toFixed(2)}
Accessories: $${(accessoriesPrice || 0).toFixed(2)}
Woodgrain Upgrade: $${(woodgrainUpgrade || 0).toFixed(2)}${woodgrainDetails}${extraPergolas.length > 0 ? `\nAdditional Pergolas (${extraPergolas.length}): $${extraPergolasTotal.toFixed(2)}` : ''}
Total Price: $${grandTotal.toFixed(2)}${customerNotes.trim() ? `\n\nCustomer Notes:\n${customerNotes.trim()}` : ''}`;
  };

  const updatePipedrive = async (currentLeadId: string, additionalImages: {name: string, data: string}[] = []) => {
    try {
      const images = await captureImages();
      const allImages = [...images, ...additionalImages];
      const summary = getQuoteSummary();
      
      await fetch('/api/update-pipedrive-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: currentLeadId, images: allImages, summary, price: totalPrice, isDuplicate: isDuplicateLead })
      });
    } catch (error) {
      console.error("Failed to update Pipedrive:", error);
    }
  };

  const captureImages = async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return [];
    }
    
    try {
      const dataUrl = canvas.toDataURL('image/png');
      return [{ name: 'view_0', data: dataUrl }];
    } catch (e) {
      console.error("Failed to capture canvas:", e);
      return [];
    }
  };

  const [foundationStatus, setFoundationStatus] = useState<string>('');
  const [showFoundationError, setShowFoundationError] = useState(false);
  const [depth, setDepth] = useState<number>(16);
  const [width, setWidth] = useState<number>(12);
  const [height, setHeight] = useState<number>(9);
  const [frameColor, setFrameColor] = useState<string>('#0A0A0A'); // RAL 9005
  const [louverColor, setLouverColor] = useState<string>('#F6F6F6'); // RAL 9016
  const [louverAngle, setLouverAngle] = useState<number>(60);
  const [screenDrop, setScreenDrop] = useState<number>(100);
  const [activeColorWarning, setActiveColorWarning] = useState<string | null>(null);
  const [guillotineOpen, setGuillotineOpen] = useState<number>(0);
  const [houseWalls, setHouseWalls] = useState<Set<'back' | 'left' | 'right' | 'front'>>(new Set());
  // Partial structure-wall support: per-side length in feet (undefined = full
  // side length) + anchor position ('start' | 'center' | 'end').
  //   start  → left for front/back, front for left/right
  //   end    → right for front/back, back for left/right
  const [houseWallLengths, setHouseWallLengths] = useState<Partial<Record<'back'|'front'|'left'|'right', number>>>({});
  const [houseWallAnchors, setHouseWallAnchors] = useState<Partial<Record<'back'|'front'|'left'|'right', 'start'|'center'|'end'>>>({});
  // Per-end extension toggle: when true (default), the structure wall
  // extends past the pergola edge to imply the house continues. When
  // false, the wall terminates flush at the pergola edge. Only applies
  // when that end touches the pergola edge (i.e., partial walls with
  // 'center' anchor don't show extensions at either end).
  const [houseWallExtensions, setHouseWallExtensions] = useState<Partial<Record<'back'|'front'|'left'|'right', { start?: boolean; end?: boolean }>>>({});
  // Free-form customer notes surfaced on Phase 5 — persisted to
  // Firestore submission so sales can see "change requests" alongside
  // the configured spec.
  const [customerNotes, setCustomerNotes] = useState('');
  // Admin fine-tune: middle post offsets along X (width) and Z (depth)
  // axes. Index is the post's position in the postCenters array
  // (1 .. numBays-1 are middle posts; corners 0 and numBays are fixed).
  // Value is a delta in feet from the default even-distribution position.
  const [postXOffsets, setPostXOffsets] = useState<Record<number, number>>({});
  const [postZOffsets, setPostZOffsets] = useState<Record<number, number>>({});
  // Independent post-only offsets — when an admin wants to nudge a post
  // without moving the beam+louver divider it carries. These layer on
  // top of postXOffsets/postZOffsets (which move post+beam together).
  //   final post X = default + postXOffsets[i] + postXOnlyOffsets[i]
  //   final beam X = default + postXOffsets[i]                    (no post-only offset)
  const [postXOnlyOffsets, setPostXOnlyOffsets] = useState<Record<number, number>>({});
  const [postZOnlyOffsets, setPostZOnlyOffsets] = useState<Record<number, number>>({});
  const [selectedMiddlePost, setSelectedMiddlePost] = useState<{ axis: 'x' | 'z'; index: number } | null>(null);
  // Admin: which movement mode is active for the selected post
  //   'together' — nudge moves post AND beam (current default)
  //   'post-only' — nudge moves just the post, beam stays
  const [postMoveMode, setPostMoveMode] = useState<'together' | 'post-only'>('together');
  // Admin cantilever: how far each edge's corner posts sit INSIDE the
  // pergola footprint, in feet. Beams still span the full pergola,
  // creating a cantilever overhang past the corner post.
  const [cantileverInsets, setCantileverInsets] = useState<Partial<Record<'left'|'right'|'front'|'back', number>>>({});
  // Per-corner fine-tune — each of the 4 corner posts can be nudged
  // independently in X and Z. Layered ON TOP of cantileverInsets.
  // Keys: 'back-left', 'back-right', 'front-left', 'front-right'
  //   x > 0 = move right (toward +X), x < 0 = move left (toward -X)
  //   z > 0 = move front (toward +Z), z < 0 = move back (toward -Z)
  const [cornerPostOffsets, setCornerPostOffsets] = useState<Record<string, { x?: number; z?: number }>>({});
  const [selectedCorner, setSelectedCorner] = useState<string | null>(null);
  // Admin-only: per-section coverage for multi-bay sides. Array length
  // matches the side's bay count (numBaysX for front/back, numBaysZ for
  // left/right). When set, it OVERRIDES the uniform screen_/wall_ side
  // toggle — pricing and visualizer render per-bay.
  //   'open'   → nothing
  //   'screen' → motorized screen bay
  //   'wall'   → privacy wall bay
  const [sectionChoices, setSectionChoices] = useState<Partial<Record<'front'|'back'|'left'|'right', Array<'open'|'screen'|'wall'>>>>({});
  // Admin: which middle posts are removed entirely. Keys are `${axis}-${index}`.
  // When a post is removed, the adjacent bays merge into one for rendering.
  const [removedMiddlePosts, setRemovedMiddlePosts] = useState<Set<string>>(new Set());
  const [selectedAccessories, setSelectedAccessories] = useState<Set<string>>(new Set());
  const [accessoryQuantities, setAccessoryQuantities] = useState<Record<string, number>>({});
  const [wallColor, setWallColor] = useState<string>('#0A0A0A');
  const [houseWallColor, setHouseWallColor] = useState<string>('#82A0C2'); // Light Blue Siding
  const [heaterControl, setHeaterControl] = useState<'switch' | 'dimmer'>('switch');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [customModels, setCustomModels] = useState<{ post?: string; beam?: string; louver?: string }>({});

  const resetConfigurator = () => {
    // Reset all configuration state to defaults
    setCurrentStep(1);
    setDepth(16);
    setWidth(12);
    setHeight(9);
    setFrameColor('#0A0A0A');
    setLouverColor('#F6F6F6');
    setLouverAngle(60);
    setScreenDrop(100);
    setGuillotineOpen(0);
    setHouseWalls(new Set());
    setHouseWallLengths({});
    setHouseWallAnchors({});
    setHouseWallExtensions({});
    setCustomerNotes('');
    setPostXOffsets({});
    setPostZOffsets({});
    setPostXOnlyOffsets({});
    setPostZOnlyOffsets({});
    setSelectedMiddlePost(null);
    setRemovedMiddlePosts(new Set());
    setPostMoveMode('together');
    setCantileverInsets({});
    setCornerPostOffsets({});
    setSelectedCorner(null);
    setSectionChoices({});
    setSelectedAccessories(new Set());
    setAccessoryQuantities({});
    setExtraPergolas([]);
    setAddPergolaModalOpen(false);
    setEditingPergola(null);
    setWallColor('#0A0A0A');
    setHouseWallColor('#82A0C2');
    setHeaterControl('switch');
    setCustomModels({});
    setFoundationStatus('');
    setShowFoundationError(false);
    setSubmitSuccess(false);
    setIsDuplicateLead(false);
    setLeadId(null);
    // Reset customer info
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setHeardAbout('');
    setHeardAboutOther('');
    // For the full flow, return to welcome screen. For /configurator, stay in builder.
    if (!skipIntro) {
      setHasStarted(false);
    }
    setShowResetModal(false);
    toast.success('Configurator reset');
  };

  const handleColorSelection = (color: any, setter: (hex: string) => void, prefix: string) => {
    setter(color.hex);
    if (prefix === 'frame') {
      setWallColor(color.hex);
    }
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [heardAbout, setHeardAbout] = useState('');
  const [heardAboutOther, setHeardAboutOther] = useState('');
  const [hasStarted, setHasStarted] = useState(skipIntro);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  // Additional pergolas the customer added to this project
  const [extraPergolas, setExtraPergolas] = useState<AdditionalPergolaItem[]>([]);
  const [addPergolaModalOpen, setAddPergolaModalOpen] = useState(false);
  const [editingPergola, setEditingPergola] = useState<AdditionalPergolaItem | null>(null);
  const [showCustomRequestModal, setShowCustomRequestModal] = useState(false);
  const [expandedPergolaIds, setExpandedPergolaIds] = useState<Set<string>>(new Set());
  // Capture lead source from URL params (e.g. ?source=contractor&ref=john).
  // When loaded inside /dealer/:slug, the dealer props override.
  const [leadSource] = useState<string>(() => {
    if (dealerSlug) return 'contractor';
    if (typeof window === 'undefined') return 'configurator';
    const params = new URLSearchParams(window.location.search);
    return params.get('source') || 'configurator';
  });
  const [leadSourceRef] = useState<string | null>(() => {
    if (dealerSlug) return dealerSlug;
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('ref') || null;
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [scanSessionId] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  });
  const [scanReceived, setScanReceived] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Listen for kiosk QR code scan submissions — auto-fill form when mobile user submits
  useEffect(() => {
    // Active when on welcome screen, OR when contact modal is open on /configurator Phase 5
    const shouldListen = (!hasStarted && !skipIntro) || showContactModal;
    if (!shouldListen) return;
    const unsub = onSnapshot(doc(db, 'kiosk-sessions', scanSessionId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      if (data.status !== 'completed') return;
      setName(data.name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setAddress(data.address || '');
      setCity(data.city || '');
      setScanReceived(true);
      // Auto-submit when the modal is open and we received the data
      if (showContactModal) {
        setTimeout(() => {
          setShowContactModal(false);
          handleSubmission('email');
        }, 800);
      }
      // Delete the session doc to clean up
      deleteDoc(doc(db, 'kiosk-sessions', scanSessionId)).catch(() => {});
    });
    return () => unsub();
  }, [scanSessionId, hasStarted, skipIntro, showContactModal]);

  const postFileInputRef = useRef<HTMLInputElement>(null);
  const beamFileInputRef = useRef<HTMLInputElement>(null);
  const louverFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (type: 'post' | 'beam' | 'louver', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomModels(prev => ({ ...prev, [type]: url }));
    }
  };

  const removeCustomModel = (type: 'post' | 'beam' | 'louver') => {
    setCustomModels(prev => {
      const next = { ...prev };
      if (next[type]) {
        URL.revokeObjectURL(next[type]!);
        delete next[type];
      }
      return next;
    });
    if (type === 'post' && postFileInputRef.current) postFileInputRef.current.value = '';
    if (type === 'beam' && beamFileInputRef.current) beamFileInputRef.current.value = '';
    if (type === 'louver' && louverFileInputRef.current) louverFileInputRef.current.value = '';
  };

  const generateAndDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Wait for the 4 views to render (increased delay for maximum quality)
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = document.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const pageElement = pages[i] as HTMLElement;
        
        let imgData;
        let format: 'PNG' | 'JPEG' = 'PNG';
        
        // Use very high quality JPEG for the 3D views page
        // Now the 5th page (index 4)
        if (i === 4) { 
          imgData = await toJpeg(pageElement, { 
            pixelRatio: 5,
            quality: 0.98,
            backgroundColor: '#ffffff'
          });
          format = 'JPEG';
        } else {
          // Use high pixel ratio for text pages
          imgData = await toPng(pageElement, { 
            pixelRatio: 3,
          });
          format = 'PNG';
        }
        
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
        
        // Add image with its natural aspect ratio to prevent distortion
        pdf.addImage(imgData, format, x, y, finalWidth, finalHeight);
      }
      
      pdf.save(`Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}.pdf`);
    } catch (pdfError) {
      console.error("Failed to generate PDF", pdfError);
      toast.error("There was an issue generating your PDF proposal.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const basePrice = useMemo(() => calculateBasePrice(depth, width), [depth, width]);
  
  const hasMiddlePosts = (width * depth > 260);
  const numBaysX = Math.ceil(width / 13);
  const numBaysZ = Math.ceil(depth / 20);
  const numScreenBaysX = (hasMiddlePosts && numBaysX > 1) || width > 20 ? numBaysX : 1;
  const numScreenBaysZ = (hasMiddlePosts && numBaysZ > 1) || depth > 20 ? numBaysZ : 1;
  // Which axes have middle posts (matches the visualizer rule — only
  // shows when a beam actually exceeds 20').
  const hasMiddleXPost = width > 20;
  const hasMiddleZPost = depth > 20;
  /** Default X position of middle post at index i (1..numBaysX-1),
   *  relative to the left edge (x=0 at left, x=width at right). */
  const defaultMiddleXPostPosition = (i: number) => (width * i) / numBaysX;
  const defaultMiddleZPostPosition = (i: number) => (depth * i) / numBaysZ;

  // Compute the length (ft) of the OPEN portion of a side — the part NOT
  // covered by a structure (house) wall. Used to price screens/privacy walls
  // on a side that's partially attached to a building. Declared BEFORE
  // accessoriesPrice / pdfData because those useMemo factories run
  // synchronously during render and would otherwise hit a TDZ error.
  const getSideTotalLength = (side: 'front'|'back'|'left'|'right'): number => {
    return (side === 'front' || side === 'back') ? width : depth;
  };
  const getOpenLengthOnSide = (side: 'front'|'back'|'left'|'right'): number => {
    const total = getSideTotalLength(side);
    if (!houseWalls.has(side)) return total;
    const structLen = houseWallLengths[side];
    if (structLen === undefined || structLen >= total) return 0;
    return Math.max(0, total - structLen);
  };

  // Per-section helpers — number of bays on a side and whether the side
  // is eligible for the admin per-section selector (needs >1 bays).
  const getSideBayCount = (side: 'front'|'back'|'left'|'right'): number => {
    return (side === 'front' || side === 'back') ? numBaysX : numBaysZ;
  };
  const sideIsMultiBay = (side: 'front'|'back'|'left'|'right'): boolean => {
    return getSideBayCount(side) > 1;
  };
  // Returns the per-bay choices array for a side, padded/trimmed to the
  // current bay count. Missing side returns an empty array.
  const getSectionChoicesForSide = (side: 'front'|'back'|'left'|'right'): Array<'open'|'screen'|'wall'> => {
    const arr = sectionChoices[side];
    if (!arr) return [];
    const count = getSideBayCount(side);
    if (arr.length === count) return arr;
    const padded = arr.slice(0, count);
    while (padded.length < count) padded.push('open');
    return padded;
  };
  // For a given side, is per-section mode active? (i.e. sectionChoices has
  // a non-empty array for this side)
  const sideUsesSections = (side: 'front'|'back'|'left'|'right'): boolean => {
    return Array.isArray(sectionChoices[side]) && (sectionChoices[side] as any).length > 0;
  };
  // Per-bay width along the side. Length of each bay equals
  // total-side / bayCount (approximate — matches visualizer's even-bay math).
  const getBayLengthOnSide = (side: 'front'|'back'|'left'|'right'): number => {
    return getSideTotalLength(side) / getSideBayCount(side);
  };

  const accessoriesPrice = useMemo(() => {
    let total = 0;
    const sqft = depth * width;
    const wallUnitPrice = sqft < 120 ? 60 : 55;

    // Effective length for a screen/wall on a given side:
    // if the side has a partial structure wall, the screen/wall can only
    // cover the open portion → shorter linear footage → reduced price.
    const effLen = (id: string, fullLen: number): number => {
      const side = id.endsWith('_front') ? 'front'
                 : id.endsWith('_back')  ? 'back'
                 : id.endsWith('_left')  ? 'left'
                 : id.endsWith('_right') ? 'right' : null;
      if (!side) return fullLen;
      if (houseWalls.has(side as any)) {
        const open = getOpenLengthOnSide(side as any);
        return open > 0 ? open : fullLen;
      }
      return fullLen;
    };

    // Helper: get side from accessory id (null if not side-based)
    const sideOfAcc = (id: string): 'front'|'back'|'left'|'right'|null =>
      id.endsWith('_front') ? 'front'
      : id.endsWith('_back') ? 'back'
      : id.endsWith('_left') ? 'left'
      : id.endsWith('_right') ? 'right' : null;

    selectedAccessories.forEach(id => {
      const accessory = ACCESSORIES.find(a => a.id === id);
      if (accessory) {
        const qty = accessory.quantifiable ? (accessoryQuantities[id] || 1) : 1;
        // If this accessory is a side-based screen/wall AND the side is
        // in per-section mode, skip the uniform side cost — the per-bay
        // costs will be added below in a dedicated pass.
        const sideOfThis = sideOfAcc(id);
        const sideIsSectioned = sideOfThis && sideUsesSections(sideOfThis);
        if (sideIsSectioned && (accessory.type === 'screen_width' || accessory.type === 'screen_depth' || accessory.type === 'wall_width' || accessory.type === 'wall_depth')) {
          return; // skip — handled below per-bay
        }

        if (accessory.type === 'flat') {
          total += accessory.price * qty;
          if (id === 'heater' && heaterControl === 'dimmer') {
            total += 1031; // Bromic Dimmer cost (one controller regardless of heater qty)
          }
        } else if (accessory.type === 'sqft') {
          total += accessory.price * sqft * qty;
        } else if (accessory.type === 'screen_width') {
          const len = effLen(id, width);
          total += calculateScreenPrice(len, height, len === width ? numScreenBaysX : 1);
        } else if (accessory.type === 'screen_depth') {
          const len = effLen(id, depth);
          total += calculateScreenPrice(len, height, len === depth ? numScreenBaysZ : 1);
        } else if (accessory.type === 'wall_width') {
          total += effLen(id, width) * height * wallUnitPrice;
        } else if (accessory.type === 'wall_depth') {
          total += effLen(id, depth) * height * wallUnitPrice;
        }
      }
    });

    // Per-section pass — add costs for each bay on sides using sections.
    (['front','back','left','right'] as const).forEach(side => {
      if (!sideUsesSections(side)) return;
      const choices = getSectionChoicesForSide(side);
      const bayLen = getBayLengthOnSide(side);
      choices.forEach(choice => {
        if (choice === 'screen') {
          total += (SCREEN_PRICES[height]?.[Math.round(bayLen)] || 0) * 1.05;
        } else if (choice === 'wall') {
          total += bayLen * height * wallUnitPrice;
        }
      });
    });

    return total;
  }, [selectedAccessories, accessoryQuantities, depth, width, height, heaterControl, numScreenBaysX, numScreenBaysZ, houseWalls, houseWallLengths, sectionChoices]);

  const woodgrainUpgrade = useMemo(() => {
    let total = 0;
    const isWoodgrainLouvers = louverColor === '#8B5A2B';
    const isWoodgrainWalls = wallColor === '#8B5A2B';

    if (isWoodgrainLouvers) {
      const count = calculateLouverCount(width, depth);
      total += count * 150;
    }

    if (isWoodgrainWalls) {
      const numPanelsPerBay = Math.ceil((height * 12) / 7);
      selectedAccessories.forEach(id => {
        const accessory = ACCESSORIES.find(a => a.id === id);
        if (accessory && (accessory.type === 'wall_width' || accessory.type === 'wall_depth')) {
          const isWidth = accessory.type === 'wall_width';
          const sideLength = isWidth ? width : depth;
          const numBays = isWidth ? numScreenBaysX : numScreenBaysZ;
          
          const panelLength = sideLength / numBays;
          
          for (let i = 0; i < numBays; i++) {
            if (panelLength < 12) {
              total += 100 * numPanelsPerBay;
            } else if (panelLength <= 20) {
              total += 150 * numPanelsPerBay;
            }
          }
        }
      });
    }
    return total;
  }, [louverColor, wallColor, width, depth, height, selectedAccessories, numScreenBaysX, numScreenBaysZ]);

  const totalPrice = useMemo(() => {
    if (basePrice === null) return null;
    const subtotal = basePrice + accessoriesPrice + woodgrainUpgrade;
    return subtotal;
  }, [basePrice, accessoriesPrice, woodgrainUpgrade]);

  const pdfData = useMemo(() => {
    const sqft = width * depth;
    const wallUnitPrice = sqft < 120 ? 60 : 55;

    const louverCount = calculateLouverCount(width, depth);
    const louverUpgrade = louverColor === '#8B5A2B' ? louverCount * 150 : 0;

    // Effective length for a screen/wall on a given side — partial
    // structure walls shrink the screen/wall to the open portion.
    const sideFromId = (id: string) =>
      id.endsWith('_front') ? 'front'
      : id.endsWith('_back') ? 'back'
      : id.endsWith('_left') ? 'left'
      : id.endsWith('_right') ? 'right'
      : null;
    const partialLen = (id: string): number | null => {
      const s = sideFromId(id);
      if (!s) return null;
      if (!houseWalls.has(s as any)) return null;
      const open = getOpenLengthOnSide(s as any);
      return open > 0 ? open : null;
    };

    const itemizedAccessories = Array.from(selectedAccessories).flatMap(id => {
      const acc = ACCESSORIES.find(a => a.id === id);
      if (!acc) return [];

      if (acc.type === 'screen_width') {
        const partial = partialLen(id);
        if (partial !== null) {
          const price = (SCREEN_PRICES[height]?.[Math.round(partial)] || 0) * 1.05;
          return [{ ...acc, name: `${acc.name} (${partial}' — open portion)`, cost: price, quantity: 1 }];
        }
        const base = Math.floor(width / numScreenBaysX);
        const remainder = width % numScreenBaysX;
        const screens = [];
        for (let i = 0; i < numScreenBaysX; i++) {
          const screenLength = base + (i < remainder ? 1 : 0);
          const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
          screens.push({ ...acc, name: `${acc.name} (${screenLength}')`, cost: price, quantity: 1 });
        }
        return screens;
      }
      if (acc.type === 'screen_depth') {
        const partial = partialLen(id);
        if (partial !== null) {
          const price = (SCREEN_PRICES[height]?.[Math.round(partial)] || 0) * 1.05;
          return [{ ...acc, name: `${acc.name} (${partial}' — open portion)`, cost: price, quantity: 1 }];
        }
        const base = Math.floor(depth / numScreenBaysZ);
        const remainder = depth % numScreenBaysZ;
        const screens = [];
        for (let i = 0; i < numScreenBaysZ; i++) {
          const screenLength = base + (i < remainder ? 1 : 0);
          const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
          screens.push({ ...acc, name: `${acc.name} (${screenLength}')`, cost: price, quantity: 1 });
        }
        return screens;
      }
      if (acc.type === 'wall_width') {
        const partial = partialLen(id);
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        if (partial !== null) {
          let price = partial * height * wallUnitPrice;
          if (wallColor === '#8B5A2B') {
            price += numPanelsPerBay * (partial < 12 ? 100 : 150);
          }
          return [{ ...acc, name: `${acc.name} (${partial}' — open portion)`, cost: price, quantity: 1 }];
        }
        const wallLength = width / numScreenBaysX;
        const walls = [];
        for (let i = 0; i < numScreenBaysX; i++) {
          let price = wallLength * height * wallUnitPrice;
          if (wallColor === '#8B5A2B') {
            price += numPanelsPerBay * (wallLength < 12 ? 100 : 150);
          }
          walls.push({ ...acc, name: `${acc.name} (${wallLength.toFixed(1)}')`, cost: price, quantity: 1 });
        }
        return walls;
      }
      if (acc.type === 'wall_depth') {
        const partial = partialLen(id);
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        if (partial !== null) {
          let price = partial * height * wallUnitPrice;
          if (wallColor === '#8B5A2B') {
            price += numPanelsPerBay * (partial < 12 ? 100 : 150);
          }
          return [{ ...acc, name: `${acc.name} (${partial}' — open portion)`, cost: price, quantity: 1 }];
        }
        const wallLength = depth / numScreenBaysZ;
        const walls = [];
        for (let i = 0; i < numScreenBaysZ; i++) {
          let price = wallLength * height * wallUnitPrice;
          if (wallColor === '#8B5A2B') {
            price += numPanelsPerBay * (wallLength < 12 ? 100 : 150);
          }
          walls.push({ ...acc, name: `${acc.name} (${wallLength.toFixed(1)}')`, cost: price, quantity: 1 });
        }
        return walls;
      }

      const qty = acc.quantifiable ? (accessoryQuantities[id] || 1) : 1;
      let cost = acc.price * qty;
      if (acc.type === 'sqft') cost = acc.price * (width * depth) * qty;
      if (id === 'heater' && heaterControl === 'dimmer') {
        cost += 1031; // dimmer is one controller regardless of heater count
      }
      return [{ ...acc, cost, quantity: qty }];
    }) as any[];

    if (louverUpgrade > 0) {
      itemizedAccessories.push({
        id: 'louver-upgrade',
        name: `Woodgrain Louver Upgrade (${louverCount} louvers)`,
        cost: louverUpgrade,
        quantity: 1
      });
    }

    const accessoriesTotal = itemizedAccessories.reduce((sum, item) => sum + item.cost, 0);
    const extraPergolasTotal = extraPergolas.reduce((s, p) => s + (p.price || 0), 0);
    const subtotal = (basePrice || 0) + accessoriesTotal + extraPergolasTotal;
    const hst = subtotal * 0.13;
    const finalTotal = subtotal + hst;

    // Build a list of UPGRADES the customer did NOT pick, with calculated pricing.
    // Used on the PDF's "Available Options & Upgrades" page.
    const wallUnitPriceForAvail = (width * depth) < 120 ? 60 : 55;
    const availableUpgrades = ACCESSORIES
      .filter(a => !selectedAccessories.has(a.id))
      .map(a => {
        let price = 0;
        if (a.type === 'flat') price = a.price;
        else if (a.type === 'sqft') price = a.price * (width * depth);
        else if (a.type === 'screen_width') price = calculateScreenPrice(width, height, numScreenBaysX);
        else if (a.type === 'screen_depth') price = calculateScreenPrice(depth, height, numScreenBaysZ);
        else if (a.type === 'wall_width') price = width * height * wallUnitPriceForAvail;
        else if (a.type === 'wall_depth') price = depth * height * wallUnitPriceForAvail;
        const isWallCoverage = a.type === 'screen_width' || a.type === 'screen_depth' ||
                               a.type === 'wall_width' || a.type === 'wall_depth' ||
                               a.id.includes('guillotine');
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          price,
          category: isWallCoverage ? 'wall' : 'addon',
        };
      });

    return {
      name, email, phone, address, city,
      date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
      docNumber: Math.floor(1000 + Math.random() * 9000).toString(),
      width, depth, height,
      frameColorName: COLORS.find(c => c.hex === frameColor)?.name || frameColor,
      louverColorName: COLORS.find(c => c.hex === louverColor)?.name || louverColor,
      basePrice: basePrice || 0,
      accessories: itemizedAccessories,
      subtotal,
      discount: 0,
      discountPercentage: 0,
      discountedSubtotal: subtotal,
      hst,
      total: finalTotal,
      additionalPergolas: extraPergolas,
      availableUpgrades,
      visualizerProps: {
        width, depth, height, accessories: selectedAccessories, frameColor, louverColor,
        louverAngle: 0, screenDrop: 100, guillotineOpen: 50, wallColor: wallColor, houseWallColor: '#e2e8f0',
        houseWall: 'none' as any, houseWalls, staticMode: true
      }
    };
  }, [name, email, phone, address, city, width, depth, height, frameColor, louverColor, wallColor, basePrice, selectedAccessories, accessoryQuantities, heaterControl, numScreenBaysX, numScreenBaysZ, extraPergolas, houseWalls, houseWallLengths]);

  const depths = Array.from({ length: 73 }, (_, i) => i + 8);
  const widths = Array.from({ length: 34 }, (_, i) => i + 7);

  const displayedBasePrice = useMemo(() => {
    let total = basePrice || 0;
    if (louverColor === '#8B5A2B') {
      total += calculateLouverCount(width, depth) * 150;
    }
    
    // In Phase 3, include selected accessories in the "Base Price" display as requested
    if (currentStep === 3) {
      selectedAccessories.forEach(id => {
        const accessory = ACCESSORIES.find(a => a.id === id);
        if (accessory) {
          const qty = accessory.quantifiable ? (accessoryQuantities[id] || 1) : 1;
          if (accessory.type === 'flat') {
            total += accessory.price * qty;
            if (id === 'heater' && heaterControl === 'dimmer') total += 1031;
          } else if (accessory.type === 'sqft') {
            total += accessory.price * (width * depth) * qty;
          } else if (accessory.type === 'screen_width') {
            total += calculateScreenPrice(width, height, numScreenBaysX);
          } else if (accessory.type === 'screen_depth') {
            total += calculateScreenPrice(depth, height, numScreenBaysZ);
          } else if (accessory.type === 'wall_width') {
            const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
            total += width * height * wallUnitPrice;
            if (wallColor === '#8B5A2B') {
              const panelLength = width / numScreenBaysX;
              const numPanelsPerBay = Math.ceil((height * 12) / 7);
              for (let i = 0; i < numScreenBaysX; i++) {
                total += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
              }
            }
          } else if (accessory.type === 'wall_depth') {
            const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
            total += depth * height * wallUnitPrice;
            if (wallColor === '#8B5A2B') {
              const panelLength = depth / numScreenBaysZ;
              const numPanelsPerBay = Math.ceil((height * 12) / 7);
              for (let i = 0; i < numScreenBaysZ; i++) {
                total += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
              }
            }
          }
        }
      });
    }
    
    return total;
  }, [basePrice, louverColor, width, depth, currentStep, selectedAccessories, accessoryQuantities, height, numScreenBaysX, numScreenBaysZ, wallColor, heaterControl]);

  const heaterCardRef = useRef<HTMLButtonElement>(null);

  // Conflict detection: structure walls and screens occupy sides
  const getSideOfAccessory = (id: string): 'front' | 'back' | 'left' | 'right' | null => {
    if (id.endsWith('_front')) return 'front';
    if (id.endsWith('_back')) return 'back';
    if (id.endsWith('_left')) return 'left';
    if (id.endsWith('_right')) return 'right';
    return null;
  };

  const getConflictReason = (id: string): 'structure' | 'screen' | null => {
    const side = getSideOfAccessory(id);
    if (!side) return null;
    // Structure wall on same side is only a conflict when it spans the
    // entire side — partial structure walls leave an open portion that a
    // screen or privacy wall can fill.
    if (houseWalls.has(side) && getOpenLengthOnSide(side) <= 0) return 'structure';
    // Screen on same side → privacy wall is a conflict
    if (id.startsWith('wall_') && selectedAccessories.has(`screen_${side}`)) return 'screen';
    return null;
  };

  // Pending conflict accessory, shown in modal before actually toggling
  const [pendingConflict, setPendingConflict] = useState<{ id: string; reason: 'structure' | 'screen' } | null>(null);

  const performToggle = (id: string) => {
    const next = new Set(selectedAccessories);
    const wasSelected = next.has(id);
    if (wasSelected) {
      next.delete(id);
      // Clear any stored quantity for this item
      const { [id]: _removed, ...rest } = accessoryQuantities;
      setAccessoryQuantities(rest);
    } else {
      next.add(id);
    }
    setSelectedAccessories(next);

    // Auto-scroll to reveal the Smart Control sub-option when heater is first selected
    if (id === 'heater' && !wasSelected) {
      setTimeout(() => {
        heaterCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  // Quantity helpers for quantifiable accessories (heaters, fans, lighting, audio)
  const getQty = (id: string): number => {
    if (!selectedAccessories.has(id)) return 0;
    return accessoryQuantities[id] || 1;
  };
  const setQty = (id: string, qty: number) => {
    const acc = ACCESSORIES.find(a => a.id === id);
    const max = acc?.maxQuantity || 4;
    const clamped = Math.max(1, Math.min(max, qty));
    setAccessoryQuantities({ ...accessoryQuantities, [id]: clamped });
  };

  const toggleAccessory = (id: string) => {
    const alreadySelected = selectedAccessories.has(id);
    // Only check for conflict on ADD, not remove
    if (!alreadySelected) {
      const reason = getConflictReason(id);
      if (reason) {
        setPendingConflict({ id, reason });
        return;
      }
    }
    performToggle(id);
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        console.log('API Health Check:', data);
      } catch (e) {
        console.error('API Health Check Failed:', e);
      }
    };
    checkHealth();
  }, []);

  const [debouncedConfig] = useDebounce({ width, depth, height, frameColor, louverColor, selectedAccessories: Array.from(selectedAccessories) }, 2000);

  useEffect(() => {
    if (auth.currentUser) {
      const leadRef = doc(db, 'leads', auth.currentUser.uid);
      setDoc(leadRef, {
        userId: auth.currentUser.uid,
        configuration: {
          width: debouncedConfig.width,
          depth: debouncedConfig.depth,
          height: debouncedConfig.height,
          frameColor: debouncedConfig.frameColor,
          louverColor: debouncedConfig.louverColor,
          accessories: debouncedConfig.selectedAccessories
        },
        lastUpdated: serverTimestamp()
      }, { merge: true });
    }
  }, [debouncedConfig, auth.currentUser]);

  // Snapshot the current pergola into extraPergolas and restart the
  // configurator at Phase 1 (dimensions). Customer info is preserved.
  const saveAndStartAnotherPergola = () => {
    const snapshotAccessories = (pdfData.accessories || []).map((a: any) => ({
      id: a.id || a.name || `acc-${Math.random().toString(36).slice(2, 8)}`,
      name: a.name || '',
      cost: typeof a.cost === 'number' ? a.cost : 0,
      quantity: a.quantity || 1,
    }));
    const snapshotTotal = (totalPrice || 0);
    const snapshot: AdditionalPergolaItem = {
      id: `pergola-${Date.now()}`,
      label: `Pergola ${extraPergolas.length + 1}`,
      width, depth, height,
      frameColor: getColorName(frameColor),
      louverColor: getColorName(louverColor),
      lineItems: snapshotAccessories,
      price: snapshotTotal,
    };
    setExtraPergolas([...extraPergolas, snapshot]);

    // Reset configuration state, but keep customer info (name/email/etc.)
    setDepth(16);
    setWidth(12);
    setHeight(9);
    setFrameColor('#0A0A0A');
    setLouverColor('#F6F6F6');
    setLouverAngle(60);
    setScreenDrop(100);
    setGuillotineOpen(0);
    setHouseWalls(new Set());
    setHouseWallLengths({});
    setHouseWallAnchors({});
    setHouseWallExtensions({});
    setCustomerNotes('');
    setPostXOffsets({});
    setPostZOffsets({});
    setPostXOnlyOffsets({});
    setPostZOnlyOffsets({});
    setSelectedMiddlePost(null);
    setRemovedMiddlePosts(new Set());
    setPostMoveMode('together');
    setCantileverInsets({});
    setCornerPostOffsets({});
    setSelectedCorner(null);
    setSectionChoices({});
    setSelectedAccessories(new Set());
    setAccessoryQuantities({});
    setWallColor('#0A0A0A');
    setHouseWallColor('#82A0C2');
    setHeaterControl('switch');
    setCustomModels({});
    setFoundationStatus('');
    setShowFoundationError(false);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`${snapshot.label} saved — let's build the next one.`);
  };

  const handleSubmission = async (type: 'email' | 'consultation') => {
    setIsSubmitting(true);
    let finalLeadId = leadId;
    try {
      const baseData = {
        name,
        email,
        phone,
        address,
        city,
        type,
        configuration: {
          width,
          depth,
          height,
          frameColor: COLORS.find(c => c.hex === frameColor)?.name || frameColor,
          louverColor: COLORS.find(c => c.hex === louverColor)?.name || louverColor,
          totalPrice: totalPrice ? formatCurrency((totalPrice || 0) + extraPergolas.reduce((s, p) => s + (p.price || 0), 0)) : 'N/A',
          accessories: Array.from(selectedAccessories).map(id => {
            const acc = ACCESSORIES.find(a => a.id === id);
            const qty = acc?.quantifiable ? (accessoryQuantities[id] || 1) : 1;
            if (!acc) return id;
            return qty > 1 ? `${acc.name} × ${qty}` : acc.name;
          }),
          houseWalls: Array.from(houseWalls),
          houseWallLengths,
          houseWallAnchors,
          houseWallExtensions,
          sectionChoices,
          customerNotes: customerNotes.trim(),
        }
      };

      const isContractor = !!auth.currentUser;
      const contractorId = auth.currentUser?.uid || null;
      let submissionId: string | null = null;

      // 1. Save to Firestore (without PDF to save space)
      // Include full pricing breakdown so the admin detail view can show it
      const pricingBreakdown = {
        basePrice: pdfData.basePrice,
        subtotal: pdfData.subtotal,
        hst: pdfData.hst,
        total: pdfData.total,
        itemizedAccessories: pdfData.accessories?.map((a: any) => ({
          id: a.id || null,
          name: a.name || '',
          cost: typeof a.cost === 'number' ? a.cost : 0,
          quantity: a.quantity || 1,
        })) || [],
      };
      const summaryText = getQuoteSummary();
      try {
        const heardAboutValue = heardAbout === 'Other' && heardAboutOther.trim()
          ? `Other: ${heardAboutOther.trim()}`
          : heardAbout || null;
        // Allocate a human-readable sequential job number.
        // If the counter transaction fails, fall back gracefully — the
        // submission still gets saved without a job number.
        let jobNumber: number | null = null;
        try { jobNumber = await nextJobNumber(); } catch (e) { console.warn('Job number allocation failed', e); }
        const submissionRef = await addDoc(collection(db, 'submissions'), {
          ...baseData,
          contractorId,
          isDuplicate: isDuplicateLead,
          pricingBreakdown,
          additionalPergolas: extraPergolas,
          heardAbout: heardAboutValue,
          jobNumber,
          summary: summaryText,
          viewedAt: null,
          pipelineStage: 'new',
          source: leadSource,
          sourceRef: leadSourceRef,
          tags: dealerSlug ? ['Dealer Lead'] : [],
          assignedTo: dealerEmail || null,
          dealerSlug: dealerSlug || null,
          dealerName: dealerName || null,
          createdAt: serverTimestamp()
        });
        submissionId = submissionRef.id;

        // Create or update Pipedrive lead
        let currentLeadId = leadId;
        let currentIsDuplicate = isDuplicateLead;
        if (!currentLeadId) {
          // Standalone /configurator route — no lead yet, create one now
          try {
            const createRes = await fetch('/api/create-lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, email, phone, address, city })
            });
            const createData = await createRes.json();
            if (createData.success && createData.leadId) {
              currentLeadId = createData.leadId;
              currentIsDuplicate = createData.isDuplicate || false;
              finalLeadId = createData.leadId;
              setLeadId(createData.leadId);
              setIsDuplicateLead(currentIsDuplicate);
            }
            // Save the submitter IP back to the submission doc for map geolocation
            if (submissionId && createData.submitterIp) {
              try {
                await setDoc(doc(db, 'submissions', submissionId), {
                  submitterIp: createData.submitterIp,
                }, { merge: true });
              } catch (e) { console.warn('Failed to save submitter IP', e); }
            }
          } catch (error) {
            console.error("Failed to create Pipedrive lead:", error);
          }
        }
        if (currentLeadId) {
          try {
            await fetch('/api/update-lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leadId: currentLeadId, configuration: baseData.configuration, isDuplicate: currentIsDuplicate })
            });
          } catch (error) {
            console.error("Failed to update Pipedrive lead:", error);
          }
        }

        // Create a job for contractors to bid on, or save as contractor's own quote
        await addDoc(collection(db, 'jobs'), {
          submissionId: submissionRef.id,
          city: city || 'Unknown',
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          configuration: baseData.configuration,
          status: isContractor ? 'contractor_quote' : 'open',
          contractorId,
          isDuplicate: isDuplicateLead,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'submissions/jobs');
      }

      if (type === 'email') {
        if (isContractor) {
          toast.success(`Quote saved to CRM! Generating PDF in the background...`);
        } else {
          toast.success(`Email sent! Generating PDF in the background...`);
        }
        setSubmitSuccess(true);
        setTimeout(() => setSubmitSuccess(false), 5000);
        setIsSubmitting(false);
      }

      // Background task for PDF and Email
      const processBackground = async () => {
        // 1. Upload the 3D preview image to Pipedrive FIRST (fast, reliable)
        //    Do this BEFORE rendering the PDF — otherwise the canvas is replaced
        if (finalLeadId) {
          try {
            await updatePipedrive(finalLeadId);
            console.log("Preview image uploaded to Pipedrive");
          } catch (e) {
            console.error("Failed to upload preview image to Pipedrive:", e);
          }
        }

        // 2. Generate PDF
        let pdfBase64 = null;
        let pdfInstance: jsPDF | null = null;
        try {
          setIsGeneratingPDF(true);
          // Wait for the 4 views to render (increased delay for maximum quality)
          await new Promise(resolve => setTimeout(resolve, 8000));
          
          const pdf = new jsPDF('p', 'mm', 'a4');
          pdfInstance = pdf;
          const pages = document.querySelectorAll('.pdf-page');
          
          for (let i = 0; i < pages.length; i++) {
            if (i > 0) pdf.addPage();
            const pageElement = pages[i] as HTMLElement;
            
            let imgData;
            let format: 'PNG' | 'JPEG' = 'PNG';
            
            // Use very high quality JPEG for the 3D views page
            // Now the 5th page (index 4)
            if (i === 4) { 
              imgData = await toJpeg(pageElement, {
                pixelRatio: 3,
                quality: 0.92,
                backgroundColor: '#ffffff'
              });
              format = 'JPEG';
            } else {
              // Use high pixel ratio for text pages
              imgData = await toPng(pageElement, { 
                pixelRatio: 3,
              });
              format = 'PNG';
            }
            
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
            
            // Add image with its natural aspect ratio to prevent distortion
            pdf.addImage(imgData, format, x, y, finalWidth, finalHeight);
          }
          
          pdfBase64 = pdf.output('datauristring');
          if (type !== 'email') {
            pdf.save(`Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}.pdf`);
          }

          // Upload PDF to Firebase Storage so admin can view later
          if (submissionId && pdfBase64) {
            try {
              const pdfBlob = pdf.output('blob');
              const filename = `${submissionId}_${(name || 'Quote').replace(/\s+/g, '_')}.pdf`;
              const fileRef = storageRef(storage, `proposals/${filename}`);
              await uploadBytes(fileRef, pdfBlob, { contentType: 'application/pdf' });
              const url = await getDownloadURL(fileRef);
              await setDoc(doc(db, 'submissions', submissionId), {
                pdfUrl: url,
                pdfFilename: filename,
              }, { merge: true });
              console.log('PDF saved to Firebase Storage:', url);
            } catch (e) {
              console.error('Failed to upload PDF to Firebase Storage:', e);
            }
          }

          // Upload PDF to Pipedrive via background function (15min timeout)
          if (finalLeadId && pdfBase64) {
            try {
              const pdfRes = await fetch('/.netlify/functions/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  leadId: finalLeadId,
                  fileName: `Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}`,
                  fileData: pdfBase64,
                })
              });
              console.log(`PDF upload queued (${pdfRes.status})`);
            } catch (e) {
              console.error("Failed to queue PDF upload:", e);
            }
          }
        } catch (pdfError) {
          console.error("Failed to generate PDF", pdfError);
          if (type !== 'email') {
            toast.error("There was an issue generating your PDF proposal.");
          }
        } finally {
          setIsGeneratingPDF(false);
        }

        // 3. Send via local API (for email notifications with attachment)
        let emailSent = false;
        try {
          console.log("Attempting to send email via /api/submit...");
          const canvasImages = await captureImages();
          const previewImage = canvasImages[0]?.data || null;
          const proposalUrl = submissionId
            ? `${window.location.origin}/proposal/${submissionId}`
            : null;
          const response = await fetch('/api/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...baseData,
              pdfAttachment: pdfBase64,
              previewImage,
              proposalUrl,
              isDuplicate: isDuplicateLead,
              dealerEmail,
              dealerName,
              dealerSlug,
            }),
          });

          const result = await response.json();
          console.log("Email API response:", result);

          if (response.ok && result.success) {
            emailSent = true;
            console.log("Email sent successfully!");
            
            if (result.customerError) {
              console.warn("Customer email failed:", result.customerError);
              toast.warning(`Quote sent to you, but could not be sent to the client: ${result.customerError}. Please verify your domain in Resend.`);
            }
            
            // Update Firestore with email IDs for tracking
            if (submissionId) {
              try {
                await setDoc(doc(db, 'submissions', submissionId), {
                  adminEmailId: result.adminEmailId || null,
                  customerEmailId: result.customerEmailId || null,
                  emailStatus: 'sent',
                  emailSentAt: serverTimestamp()
                }, { merge: true });
              } catch (updateError) {
                console.error("Failed to update submission with email IDs:", updateError);
              }
            }
          } else {
            console.error("Email API returned an error:", result);
            if (result.error) {
              toast.error(`Email error: ${result.error}`);
            }
          }
        } catch (apiError) {
          console.warn("Email API unavailable or network error.", apiError);
        }

        if (type === 'email') {
          if (emailSent) {
            // Silently succeed since we already showed the toast
          } else {
            if (pdfInstance) {
              pdfInstance.save(`Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}.pdf`);
            }
            toast.info(`Quote downloaded. Note: Email notification failed to send, but your request has been saved.`);
          }
        } else {
          setSubmitSuccess(true);
          setTimeout(() => setSubmitSuccess(false), 5000);
          toast.success('Thank you for your interest. Our architectural consultants will contact you shortly.');
          setIsSubmitting(false);
        }
      };

      // Run background task
      processBackground();

    } catch (error) {
      console.error("Error saving submission:", error);
      toast.error("There was an error saving your request. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (!hasStarted) {
    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`tv-root flex flex-col md:flex-row h-screen w-full overflow-hidden font-sans relative max-w-[1920px] mx-auto ${isDark ? 'dark bg-[#0a0a0a] text-[#e5e5e5]' : 'bg-luxury-paper dark:bg-[#111] text-luxury-black'}`}
        >
          {currentUser && (
            <div className={`absolute top-0 left-0 w-full py-1.5 px-4 text-center text-xs font-medium z-50 flex items-center justify-center gap-2 shadow-md ${isDark ? 'bg-[#141414] text-white/70' : 'bg-luxury-black text-luxury-cream'}`}>
              <User className="w-3 h-3" />
              Logged in as Contractor: {currentUser.email}
            </div>
          )}

          {/* Left: 3D Visualizer */}
          <div className={`tv-visualizer flex-1 relative h-[30vh] sm:h-[35vh] md:h-full lg:h-full overflow-hidden ${isDark ? 'bg-[#111]' : 'bg-luxury-cream/30'}`}>
            <PergolaVisualizer
              width={width}
              depth={depth}
              height={height}
              accessories={selectedAccessories}
              frameColor={frameColor}
              louverColor={louverColor}
              louverAngle={louverAngle}
              screenDrop={screenDrop}
              guillotineOpen={guillotineOpen}
              wallColor={wallColor}
              houseWallColor={houseWallColor}
              customModels={customModels}
              houseWalls={houseWalls}
            />

            {/* Luxury Overlay Elements */}
            <div className="absolute top-4 left-4 lg:top-8 lg:left-8 pointer-events-none z-10">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col items-start"
              >
                <img src="/logo.png" alt="Eclipse Pergola" className="h-6 lg:h-10 object-contain mb-1" />
              </motion.div>
            </div>

            {/* Theme Toggle — floats on visualizer, reachable in all viewports */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`absolute top-3 right-3 lg:top-6 lg:right-6 z-20 w-9 h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all shadow-lg ${
                isDark
                  ? 'bg-black/40 border-white/15 hover:bg-black/60 hover:border-luxury-gold/40'
                  : 'bg-white/70 border-luxury-black/10 hover:bg-white/90 hover:border-luxury-gold/40'
              }`}
            >
              {isDark ? <Moon className="w-4 h-4 text-luxury-gold" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>
          </div>

          {/* Right: Lead Capture Form (Sidebar) */}
          <div className={`tv-sidebar w-full md:w-[380px] lg:w-[420px] xl:w-[480px] border-t md:border-t-0 md:border-l flex flex-col h-[70vh] sm:h-[65vh] md:h-full lg:h-full shadow-2xl z-20 shrink-0 overflow-y-auto ${isDark ? 'bg-[#141414] border-white/10' : 'bg-white border-luxury-cream'}`}>
            <div className="p-6 lg:p-8 flex flex-col justify-center min-h-full relative">
              <h3 className={`text-2xl font-serif mb-2 ${isDark ? 'text-white' : 'text-luxury-black'}`}>Welcome</h3>
              <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-slate-500 dark:text-white/50'}`}>Please enter your details to start configuring your bespoke pergola.</p>

              {/* QR code scan helper */}
              <div className={`mb-6 rounded-lg border p-4 flex items-center gap-4 ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-luxury-paper border-luxury-cream'}`}>
                <div className={`p-2 rounded-md shrink-0 ${scanReceived ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-white'}`}>
                  <QRCodeSVG
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/scan/${scanSessionId}`}
                    size={78}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1A1A1A"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {scanReceived ? (
                    <>
                      <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 text-emerald-600 dark:text-emerald-400`}>
                        ✓ Details received
                      </p>
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                        Review below, then tap Start Designing.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 text-luxury-gold`}>
                        Faster on Mobile
                      </p>
                      <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                        Scan to fill these fields on your phone — no typing on screen.
                      </p>
                    </>
                  )}
                </div>
              </div>
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const response = await fetch('/api/create-lead', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name, email, phone, address, city })
                    });
                    const data = await response.json();
                    if (data.success) {
                      setLeadId(data.leadId);
                      setIsDuplicateLead(data.isDuplicate || false);
                      
                      // Capture images and send to Pipedrive
                      const images = await captureImages();
                      const summary = getQuoteSummary();
                      
                      await fetch('/api/update-pipedrive-lead', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leadId: data.leadId, images, summary, price: totalPrice, isDuplicate: data.isDuplicate || false })
                      });
                    } else {
                      console.error("Failed to create lead:", data.error);
                      toast.error(`Failed to create lead: ${data.error}`);
                    }
                  } catch (error) {
                    console.error("Failed to create lead:", error);
                    toast.error("Failed to create lead.");
                  }
                  setHasStarted(true);
                }}
                className="space-y-4"
              >
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="John Doe" />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Phone Number *</label>
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Email Address *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="john@example.com" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Address</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="123 Main St" />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>City *</label>
                    <input type="text" required value={city} onChange={e => setCity(e.target.value)} className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="Toronto" />
                  </div>
                </div>
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  className="pt-4"
                >
                  <button 
                    type="submit"
                    className="luxury-button group !bg-luxury-black !text-white hover:!bg-luxury-gold hover:!text-white px-12 py-4 text-lg w-full flex items-center justify-center"
                  >
                    Start Designing
                    <ChevronRight className="inline-block ml-3 w-5 h-5 transition-transform group-hover:translate-x-2" />
                  </button>
                </motion.div>
              </form>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const renderGroupedAccessory = (title: string, prefix: string, icon: React.ElementType, imageUrl: string) => {
    const groupAccessories = ACCESSORIES.filter(a => a.id.startsWith(prefix));
    const anySelected = groupAccessories.some(a => selectedAccessories.has(a.id));
    const Icon = icon as any;

    return (
      <div className={`flex flex-col rounded-xl border transition-all overflow-hidden bg-white dark:bg-[#1a1a1a] ${anySelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-white/10'}`}>
        <div className="w-full h-32 overflow-hidden border-b border-slate-100 dark:border-white/5 relative">
          <img 
            src={imageUrl} 
            alt={title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
            <div className="flex items-center gap-2 text-white">
              <Icon className="w-4 h-4" />
              <span className="font-bold text-sm">{title}</span>
            </div>
          </div>
        </div>
        <div className="p-2 space-y-2">
          <p className="text-[10px] text-slate-500 dark:text-white/50">Select the sides you would like to add:</p>
          <div className="grid grid-cols-2 gap-1">
            {groupAccessories.map(a => {
              const isSelected = selectedAccessories.has(a.id);
              const sideName = a.name.split('(')[1].replace(')', '');
              
              let cost = 0;
              const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
              if (a.type === 'screen_width') {
                cost = calculateScreenPrice(width, height, numScreenBaysX);
              } else if (a.type === 'screen_depth') {
                cost = calculateScreenPrice(depth, height, numScreenBaysZ);
              } else if (a.type === 'wall_width') {
                cost = width * height * wallUnitPrice;
                if (wallColor === '#8B5A2B') {
                  const base = Math.floor(width / numScreenBaysX);
                  const remainder = width % numScreenBaysX;
                  const numPanelsPerBay = Math.ceil((height * 12) / 7);
                  for (let i = 0; i < numScreenBaysX; i++) {
                    const panelLength = base + (i < remainder ? 1 : 0);
                    cost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
                  }
                }
              } else if (a.type === 'wall_depth') {
                cost = depth * height * wallUnitPrice;
                if (wallColor === '#8B5A2B') {
                  const base = Math.floor(depth / numScreenBaysZ);
                  const remainder = depth % numScreenBaysZ;
                  const numPanelsPerBay = Math.ceil((height * 12) / 7);
                  for (let i = 0; i < numScreenBaysZ; i++) {
                    const panelLength = base + (i < remainder ? 1 : 0);
                    cost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
                  }
                }
              } else {
                cost = a.price;
              }

              const conflict = !isSelected ? getConflictReason(a.id) : null;
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAccessory(a.id)}
                  title={conflict === 'structure' ? 'A structure wall is on this side' : conflict === 'screen' ? 'A motorized screen is on this side' : undefined}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700'
                      : conflict
                        ? 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] text-slate-400 dark:text-white/30 opacity-60 hover:opacity-80 hover:border-amber-300'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50 text-slate-600 dark:text-white/60 hover:border-slate-300 dark:border-white/15'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {conflict && <span className="text-[9px] text-amber-500">⚠</span>}
                    {sideName}
                  </span>
                  <span className="opacity-70">+{formatCurrency(cost)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderAccessory = (accessory: Accessory) => {
    const isSelected = selectedAccessories.has(accessory.id);
    const Icon = accessory.icon as any;
    
    let accessoryCost = 0;
    let description = accessory.description;
    const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
    
    if (accessory.type === 'flat') {
      accessoryCost = accessory.price;
    } else if (accessory.type === 'sqft') {
      accessoryCost = accessory.price * (depth * width);
    } else if (accessory.type === 'screen_width') {
      accessoryCost = calculateScreenPrice(width, height, numScreenBaysX);
      description = `${accessory.description}. ${getScreenDescription(width, numScreenBaysX)}`;
    } else if (accessory.type === 'screen_depth') {
      accessoryCost = calculateScreenPrice(depth, height, numScreenBaysZ);
      description = `${accessory.description}. ${getScreenDescription(depth, numScreenBaysZ)}`;
    } else if (accessory.type === 'wall_width') {
      accessoryCost = width * height * wallUnitPrice;
      if (wallColor === '#8B5A2B') {
        const base = Math.floor(width / numScreenBaysX);
        const remainder = width % numScreenBaysX;
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        for (let i = 0; i < numScreenBaysX; i++) {
          const panelLength = base + (i < remainder ? 1 : 0);
          accessoryCost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
        }
      }
      description = `${accessory.description} (${width}' × ${height}' = ${width * height} sq ft)`;
    } else if (accessory.type === 'wall_depth') {
      accessoryCost = depth * height * wallUnitPrice;
      if (wallColor === '#8B5A2B') {
        const base = Math.floor(depth / numScreenBaysZ);
        const remainder = depth % numScreenBaysZ;
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        for (let i = 0; i < numScreenBaysZ; i++) {
          const panelLength = base + (i < remainder ? 1 : 0);
          accessoryCost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
        }
      }
      description = `${accessory.description} (${depth}' × ${height}' = ${depth * height} sq ft)`;
    }

    return (
      <button
        key={accessory.id}
        ref={accessory.id === 'heater' ? heaterCardRef : undefined}
        onClick={() => toggleAccessory(accessory.id)}
        className={`flex flex-col items-start rounded-xl border text-left transition-all overflow-hidden ${
          isSelected
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30/50 dark:bg-emerald-900/20 ring-1 ring-emerald-500'
            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/5 dark:hover:bg-white/5'
        }`}
      >
        {accessory.imageUrl && (
          <div className="w-full h-32 overflow-hidden border-b border-slate-100 dark:border-white/5">
            <img 
              src={accessory.imageUrl} 
              alt={accessory.name} 
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="p-4 w-full flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-slate-400 dark:text-white/40'}`} />
              <span className={`font-medium text-sm ${isSelected ? 'text-emerald-900' : 'text-slate-900 dark:text-white'}`}>
                {accessory.name}
              </span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />}
          </div>
          <p className="text-xs text-slate-500 dark:text-white/50 mb-3 flex-1 mt-2">{description}</p>
          <div className="flex justify-between items-center w-full">
            <p className={`text-sm font-medium ${isSelected ? 'text-emerald-700' : 'text-slate-600 dark:text-white/60'}`}>
              {isSelected && accessory.quantifiable
                ? <>+{formatCurrency(accessoryCost * getQty(accessory.id))}{getQty(accessory.id) > 1 && <span className="text-[10px] opacity-60 ml-1">({formatCurrency(accessoryCost)} × {getQty(accessory.id)})</span>}</>
                : <>+{formatCurrency(accessoryCost)}</>}
            </p>
          </div>
          {accessory.quantifiable && isSelected && (
            <div className="w-full mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQty(accessory.id, getQty(accessory.id) - 1); }}
                  disabled={getQty(accessory.id) <= 1}
                  className="w-8 h-8 rounded-full border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-emerald-900">{getQty(accessory.id)}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQty(accessory.id, getQty(accessory.id) + 1); }}
                  disabled={getQty(accessory.id) >= (accessory.maxQuantity || 4)}
                  className="w-8 h-8 rounded-full border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          {accessory.id === 'heater' && isSelected && (
            <div className="w-full mt-3 pt-3 border-t border-emerald-100" onClick={(e) => e.stopPropagation()}>
              <label className="block text-[10px] font-bold text-emerald-800 mb-2">Add Smart Control?</label>
              <button
                type="button"
                onClick={() => setHeaterControl(heaterControl === 'dimmer' ? 'switch' : 'dimmer')}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  heaterControl === 'dimmer'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-500'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] hover:border-slate-300 dark:border-white/15'
                }`}
              >
                <img src="/bromic-dimmer.png" alt="Bromic Affinity Smart-Heat Dimmer" className="w-12 h-12 object-contain rounded shrink-0" />
                <div className="flex-1 text-left">
                  <p className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-900' : 'text-slate-800 dark:text-white/80'}`}>
                    Bromic Affinity Smart-Heat Dimmer
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">App-controlled dimmer with zones</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-700' : 'text-slate-600 dark:text-white/60'}`}>
                    +{formatCurrency(1031)}
                  </span>
                  {heaterControl === 'dimmer' && <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5" />}
                </div>
              </button>
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className={`tv-root flex flex-col md:flex-row h-screen w-full overflow-hidden font-sans relative max-w-[1920px] mx-auto ${isDark ? 'dark bg-[#0a0a0a] text-[#e5e5e5]' : 'bg-luxury-paper dark:bg-[#111] text-luxury-black'}`}>
      <Toaster position="top-center" theme={isDark ? 'dark' : 'light'} />

      {currentUser && (
        <div className={`absolute top-0 left-0 w-full py-1.5 px-4 text-center text-xs font-medium z-50 flex items-center justify-center gap-2 shadow-md ${isDark ? 'bg-[#141414] text-white/70' : 'bg-luxury-black text-luxury-cream'}`}>
          <User className="w-3 h-3" />
          Logged in as Contractor: {currentUser.email}
        </div>
      )}

      {/* Left: 3D Visualizer */}
      <div className={`tv-visualizer flex-1 relative h-[30vh] sm:h-[35vh] md:h-full lg:h-full overflow-hidden ${isDark ? 'bg-[#111]' : 'bg-luxury-cream/30'}`}>
        <PergolaVisualizer
          width={width}
          depth={depth}
          height={height}
          accessories={selectedAccessories}
          frameColor={frameColor}
          louverColor={louverColor}
          louverAngle={louverAngle}
          screenDrop={screenDrop}
          guillotineOpen={guillotineOpen}
          wallColor={wallColor}
          houseWallColor={houseWallColor}
          customModels={customModels}
          houseWalls={houseWalls}
          houseWallLengths={houseWallLengths}
          houseWallAnchors={houseWallAnchors}
          houseWallExtensions={houseWallExtensions}
          postXOffsets={postXOffsets}
          postZOffsets={postZOffsets}
          postXOnlyOffsets={postXOnlyOffsets}
          postZOnlyOffsets={postZOnlyOffsets}
          removedMiddlePosts={removedMiddlePosts}
          cantileverInsets={cantileverInsets}
          cornerPostOffsets={cornerPostOffsets}
          sectionChoices={sectionChoices}
        />

        {/* Luxury Overlay Elements */}
        <div className="absolute top-4 left-4 lg:top-8 lg:left-8 pointer-events-none z-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col items-start"
          >
            <img src="/logo.png" alt="Eclipse Pergola" className="h-6 lg:h-10 object-contain mb-1" />
          </motion.div>
        </div>

        {/* Theme Toggle — floats on visualizer, reachable in all viewports */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`absolute top-3 right-3 lg:top-6 lg:right-6 z-20 w-9 h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all shadow-lg ${
            isDark
              ? 'bg-black/40 border-white/15 hover:bg-black/60 hover:border-luxury-gold/40'
              : 'bg-white/70 border-luxury-black/10 hover:bg-white/90 hover:border-luxury-gold/40'
          }`}
        >
          {isDark ? <Moon className="w-4 h-4 text-luxury-gold" /> : <Sun className="w-4 h-4 text-amber-500" />}
        </button>

        <div className="absolute bottom-4 left-4 lg:bottom-8 lg:left-8 flex flex-col gap-1 md:gap-3 lg:gap-4 z-10">
          <div className="glass-panel px-3 py-1.5 sm:px-4 sm:py-2 lg:px-5 lg:py-3 rounded-none w-36 sm:w-44 lg:w-56">
            <div className="flex items-center justify-between mb-1 lg:mb-2">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40 flex items-center gap-1 lg:gap-1.5 leading-none">
                <Sun className="w-3 h-3" />
                Louvers
              </span>
              <span className="text-[10px] lg:text-xs font-serif font-medium leading-none">{louverAngle}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              value={louverAngle}
              onChange={(e) => setLouverAngle(Number(e.target.value))}
              aria-label="Louver angle in degrees"
              aria-valuetext={`${louverAngle} degrees`}
              className="w-full h-[2px] lg:h-[1px] bg-luxury-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold my-1 lg:my-0"
            />
          </div>

          {(selectedAccessories.has('screen_front') || selectedAccessories.has('screen_back') || selectedAccessories.has('screen_left') || selectedAccessories.has('screen_right')) && (
            <div className="glass-panel px-3 py-1.5 sm:px-4 sm:py-2 lg:px-5 lg:py-3 rounded-none w-36 sm:w-44 lg:w-56">
              <div className="flex items-center justify-between mb-1 lg:mb-2">
                <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40 flex items-center gap-1 lg:gap-1.5 leading-none">
                  <Blinds className="w-3 h-3" />
                  Screens
                </span>
                <span className="text-[10px] lg:text-xs font-serif font-medium leading-none">{screenDrop}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={screenDrop}
                onChange={(e) => setScreenDrop(Number(e.target.value))}
                aria-label="Screen drop percentage"
                aria-valuetext={`${screenDrop} percent`}
                className="w-full h-[2px] lg:h-[1px] bg-luxury-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold my-1 lg:my-0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right: Sidebar Controls */}
      <div className={`tv-sidebar w-full md:w-[380px] lg:w-[420px] xl:w-[480px] 2xl:w-[560px] border-t md:border-t-0 md:border-l flex flex-col h-[70vh] sm:h-[65vh] md:h-full lg:h-full shadow-2xl z-20 shrink-0 ${isDark ? 'bg-[#141414] border-white/10' : 'bg-white border-luxury-cream'}`}>
        {/* Step Indicator */}
        <div className={`px-3 py-3 lg:px-5 lg:py-5 border-b shrink-0 flex items-center gap-3 ${isDark ? 'border-white/10 bg-[#0f0f0f]' : 'border-luxury-cream bg-luxury-paper dark:bg-[#111]/50'}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-luxury-gold uppercase tracking-[0.3em]">
                Phase {currentStep} / 5
                {extraPergolas.length > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] tracking-wider ${isDark ? 'bg-luxury-gold/20 text-luxury-gold' : 'bg-luxury-gold/15 text-luxury-gold'}`}>
                    Pergola {extraPergolas.length + 1}
                  </span>
                )}
                {adminMode && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] tracking-wider bg-rose-500/15 text-rose-500 border border-rose-500/30">
                    Admin
                  </span>
                )}
              </span>
              <span className={`text-xs font-serif font-medium truncate ml-2 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                {currentStep === 1 && <span className="text-base sm:text-lg">Define your space</span>}
                {currentStep === 2 && <span className="text-base sm:text-lg">The Palette</span>}
                {currentStep === 3 && <span className="text-base sm:text-lg"><span className="sm:hidden">Privacy</span><span className="hidden sm:inline">Privacy & Protection</span></span>}
                {currentStep === 4 && <span className="text-base sm:text-lg"><span className="sm:hidden">Features</span><span className="hidden sm:inline">Optional Features</span></span>}
                {currentStep === 5 && <span className="text-base sm:text-lg"><span className="sm:hidden">Summary</span><span className="hidden sm:inline">Specification Summary</span></span>}
              </span>
            </div>
            <div className="flex gap-1">
              {[
                { step: 1, label: 'Size' },
                { step: 2, label: 'Colors' },
                { step: 3, label: 'Privacy' },
                { step: 4, label: 'Extras' },
                { step: 5, label: 'Review' },
              ].map(({ step, label }) => (
                <button
                  key={step}
                  onClick={() => step <= currentStep && setCurrentStep(step)}
                  disabled={step > currentStep}
                  aria-label={`Go to ${label}`}
                  title={`Phase ${step}: ${label}`}
                  className="group flex flex-col items-center gap-1 flex-1 cursor-pointer disabled:cursor-not-allowed"
                >
                  <div className={`h-[3px] w-full transition-all duration-700 ${
                    step <= currentStep ? 'bg-luxury-gold group-hover:bg-luxury-gold/80' : isDark ? 'bg-white/5' : 'bg-luxury-black/5'
                  }`} />
                  <span className={`text-[8px] uppercase tracking-wider font-bold transition-colors ${
                    step === currentStep
                      ? 'text-luxury-gold'
                      : step < currentStep
                        ? (isDark ? 'text-white/50 group-hover:text-luxury-gold' : 'text-luxury-black/40 group-hover:text-luxury-gold')
                        : (isDark ? 'text-white/20' : 'text-luxury-black/20')
                  }`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">

          {currentStep === 1 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="space-y-4">
                {/* Foundation Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Do you have a foundation?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setFoundationStatus('existing'); setShowFoundationError(false); }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
                        foundationStatus === 'existing'
                          ? 'border-luxury-gold bg-luxury-gold/5 dark:bg-luxury-gold/10 ring-1 ring-luxury-gold'
                          : showFoundationError
                            ? 'border-red-400 dark:border-red-500/50'
                            : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 dark:hover:border-white/20'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        foundationStatus === 'existing' ? 'border-luxury-gold' : showFoundationError ? 'border-red-400' : 'border-slate-300 dark:border-white/15 dark:border-white/20'
                      }`}>
                        {foundationStatus === 'existing' && <div className="w-2 h-2 rounded-full bg-luxury-gold" />}
                      </div>
                      <div>
                        <span className={`text-sm font-serif font-medium block ${foundationStatus === 'existing' ? 'text-luxury-gold' : 'text-luxury-black/80 dark:text-white/80'}`}>
                          Yes, existing
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-white/50 dark:text-white/40">Deck, patio, or concrete pad</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { setFoundationStatus('needs'); setShowFoundationError(false); }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
                        foundationStatus === 'needs'
                          ? 'border-luxury-gold bg-luxury-gold/5 dark:bg-luxury-gold/10 ring-1 ring-luxury-gold'
                          : showFoundationError
                            ? 'border-red-400 dark:border-red-500/50'
                            : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 dark:hover:border-white/20'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        foundationStatus === 'needs' ? 'border-luxury-gold' : showFoundationError ? 'border-red-400' : 'border-slate-300 dark:border-white/15 dark:border-white/20'
                      }`}>
                        {foundationStatus === 'needs' && <div className="w-2 h-2 rounded-full bg-luxury-gold" />}
                      </div>
                      <div>
                        <span className={`text-sm font-serif font-medium block ${foundationStatus === 'needs' ? 'text-luxury-gold' : 'text-luxury-black/80 dark:text-white/80'}`}>
                          No, I need one
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-white/50 dark:text-white/40">*Additional cost may occur</span>
                      </div>
                    </button>
                  </div>
                  {showFoundationError && (
                    <p className="text-red-500 text-[10px]">Please select your foundation status to continue</p>
                  )}
                </div>

                {/* Structure */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Structure</label>
                    <span className="text-[9px] text-luxury-black/30 dark:text-white/30 italic">Select one or more sides</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { value: 'none', label: 'Free', sub: 'standing', diagram: (
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="4" y="4" width="16" height="16" rx="1" />
                        </svg>
                      ) },
                      { value: 'back', label: 'Rear', sub: 'wall', diagram: (
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <line x1="2" y1="4" x2="22" y2="4" strokeWidth="2.5" />
                          <rect x="4" y="4" width="16" height="16" rx="1" />
                        </svg>
                      ) },
                      { value: 'front', label: 'Front', sub: 'wall', diagram: (
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="4" y="4" width="16" height="16" rx="1" />
                          <line x1="2" y1="20" x2="22" y2="20" strokeWidth="2.5" />
                        </svg>
                      ) },
                      { value: 'left', label: 'Left', sub: 'wall', diagram: (
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <line x1="4" y1="2" x2="4" y2="22" strokeWidth="2.5" />
                          <rect x="4" y="4" width="16" height="16" rx="1" />
                        </svg>
                      ) },
                      { value: 'right', label: 'Right', sub: 'wall', diagram: (
                        <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="4" y="4" width="16" height="16" rx="1" />
                          <line x1="20" y1="2" x2="20" y2="22" strokeWidth="2.5" />
                        </svg>
                      ) },
                    ].map((opt) => {
                      const selected = opt.value === 'none' ? houseWalls.size === 0 : houseWalls.has(opt.value as any);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            if (opt.value === 'none') {
                              setHouseWalls(new Set());
    setHouseWallLengths({});
    setHouseWallAnchors({});
    setHouseWallExtensions({});
    setCustomerNotes('');
    setPostXOffsets({});
    setPostZOffsets({});
    setPostXOnlyOffsets({});
    setPostZOnlyOffsets({});
    setSelectedMiddlePost(null);
    setRemovedMiddlePosts(new Set());
    setPostMoveMode('together');
    setCantileverInsets({});
    setCornerPostOffsets({});
    setSelectedCorner(null);
    setSectionChoices({});
                            } else {
                              const next = new Set(houseWalls);
                              const removing = next.has(opt.value as any);
                              if (removing) {
                                next.delete(opt.value as any);
                                // Clean up partial-length state for the removed side
                                const nl = { ...houseWallLengths }; delete (nl as any)[opt.value];
                                const na = { ...houseWallAnchors }; delete (na as any)[opt.value];
                                const nx = { ...houseWallExtensions }; delete (nx as any)[opt.value];
                                setHouseWallLengths(nl);
                                setHouseWallAnchors(na);
                                setHouseWallExtensions(nx);
                              } else {
                                next.add(opt.value as any);
                              }
                              setHouseWalls(next);
                            }
                          }}
                          aria-label={`${opt.label} ${opt.sub}`}
                          className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border transition-all ${
                            selected
                              ? 'border-luxury-gold bg-luxury-gold/5 dark:bg-luxury-gold/10 text-luxury-gold'
                              : (isDark
                                  ? 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                                  : 'border-slate-200 text-luxury-black/60 hover:border-luxury-black/30')
                          }`}
                        >
                          <div className="w-6 h-6">{opt.diagram}</div>
                          <span className="text-[8px] font-bold uppercase tracking-wider leading-tight text-center">
                            {opt.label}
                            <span className="block text-[7px] font-normal opacity-70">{opt.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Partial structure-wall controls — admin-only feature, one
                      expandable panel per selected side */}
                  {adminMode && Array.from(houseWalls).map((side) => {
                    const sideLabel = side.charAt(0).toUpperCase() + side.slice(1);
                    const total = getSideTotalLength(side);
                    const currentLen = houseWallLengths[side] ?? total;
                    const isPartial = currentLen < total;
                    const anchor = houseWallAnchors[side] ?? 'start';
                    const anchorOptions: Array<{ value: 'start'|'center'|'end'; label: string }> =
                      (side === 'front' || side === 'back')
                        ? [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'Right' }]
                        : [{ value: 'start', label: 'Front' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'Back' }];
                    const extensions = houseWallExtensions[side] || {};
                    const extendStart = extensions.start !== false; // default true
                    const extendEnd = extensions.end !== false;     // default true
                    // Which ends actually touch the pergola edge (and therefore
                    // show an "extend past" choice)
                    const touchesStart = !isPartial || anchor === 'start';
                    const touchesEnd = !isPartial || anchor === 'end';
                    const startLabel = (side === 'front' || side === 'back') ? 'Left end' : 'Front end';
                    const endLabel   = (side === 'front' || side === 'back') ? 'Right end' : 'Back end';
                    const toggleExt = (which: 'start'|'end') => {
                      const curr = houseWallExtensions[side] || {};
                      const currVal = curr[which] !== false; // default true
                      setHouseWallExtensions({
                        ...houseWallExtensions,
                        [side]: { ...curr, [which]: !currVal },
                      });
                    };
                    return (
                      <div key={`struct-${side}`} className={`mt-2 p-3 rounded-lg border ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-luxury-paper/40'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                            {sideLabel} Structure Wall
                          </span>
                          <span className="text-[11px] font-serif text-luxury-gold">
                            {currentLen}' of {total}'
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = { ...houseWallLengths };
                              delete next[side];
                              setHouseWallLengths(next);
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                              !isPartial
                                ? 'bg-luxury-gold text-luxury-black'
                                : (isDark ? 'bg-white/5 text-white/50 hover:text-white' : 'bg-slate-100 text-luxury-black/50 hover:text-luxury-black')
                            }`}
                          >
                            Full
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHouseWallLengths({ ...houseWallLengths, [side]: Math.max(4, Math.floor(total / 2)) });
                              if (!houseWallAnchors[side]) {
                                setHouseWallAnchors({ ...houseWallAnchors, [side]: 'start' });
                              }
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                              isPartial
                                ? 'bg-luxury-gold text-luxury-black'
                                : (isDark ? 'bg-white/5 text-white/50 hover:text-white' : 'bg-slate-100 text-luxury-black/50 hover:text-luxury-black')
                            }`}
                          >
                            Partial
                          </button>
                        </div>
                        {isPartial && (
                          <div className="space-y-2">
                            <input
                              type="range"
                              min={4}
                              max={total}
                              step={1}
                              value={currentLen}
                              onChange={(e) => setHouseWallLengths({ ...houseWallLengths, [side]: Number(e.target.value) })}
                              aria-label={`${sideLabel} structure wall length in feet`}
                              className="w-full h-[2px] bg-luxury-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold"
                            />
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] uppercase tracking-widest font-bold mr-2 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                                Position
                              </span>
                              {anchorOptions.map(({ value, label }) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setHouseWallAnchors({ ...houseWallAnchors, [side]: value })}
                                  className={`flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                                    anchor === value
                                      ? 'bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/40'
                                      : (isDark ? 'bg-white/[0.03] text-white/50 border border-white/10 hover:text-white' : 'bg-white text-luxury-black/50 border border-slate-200 hover:text-luxury-black')
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <p className={`text-[9px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                              Open portion ({total - currentLen}') is available for privacy walls or motorized screens in Phase 3.
                            </p>
                          </div>
                        )}

                        {/* End styles — extend past pergola vs end flush. Only offered
                            for ends that actually touch the pergola edge. */}
                        {(touchesStart || touchesEnd) && (
                          <div className="mt-3 pt-3 border-t border-luxury-black/5 dark:border-white/5">
                            <p className={`text-[9px] uppercase tracking-widest font-bold mb-1.5 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                              Wall Ends
                            </p>
                            <div className="space-y-1">
                              {touchesStart && (
                                <button
                                  type="button"
                                  onClick={() => toggleExt('start')}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-colors ${
                                    isDark
                                      ? 'bg-white/[0.02] border-white/10 hover:border-luxury-gold/40'
                                      : 'bg-white border-slate-200 hover:border-luxury-gold/60'
                                  }`}
                                >
                                  <span className={isDark ? 'text-white/70' : 'text-luxury-black/70'}>{startLabel}</span>
                                  <span className={`font-bold uppercase tracking-widest text-[9px] ${extendStart ? 'text-luxury-gold' : (isDark ? 'text-white/50' : 'text-luxury-black/50')}`}>
                                    {extendStart ? 'Extend past →' : 'End flush ▌'}
                                  </span>
                                </button>
                              )}
                              {touchesEnd && (
                                <button
                                  type="button"
                                  onClick={() => toggleExt('end')}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-colors ${
                                    isDark
                                      ? 'bg-white/[0.02] border-white/10 hover:border-luxury-gold/40'
                                      : 'bg-white border-slate-200 hover:border-luxury-gold/60'
                                  }`}
                                >
                                  <span className={isDark ? 'text-white/70' : 'text-luxury-black/70'}>{endLabel}</span>
                                  <span className={`font-bold uppercase tracking-widest text-[9px] ${extendEnd ? 'text-luxury-gold' : (isDark ? 'text-white/50' : 'text-luxury-black/50')}`}>
                                    {extendEnd ? '← Extend past' : '▐ End flush'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Middle Post Adjustments — admin-only. Lets the admin
                    override the default even-distribution position of
                    any middle post along the width or depth axis. Corners
                    are always fixed by the pergola dimensions. */}
                {adminMode && (hasMiddleXPost || hasMiddleZPost) && (() => {
                  // Build the list of middle posts that exist
                  const middlePosts: Array<{ axis: 'x' | 'z'; index: number; axisLabel: string; defaultPos: number; total: number }> = [];
                  if (hasMiddleXPost) {
                    for (let i = 1; i < numBaysX; i++) {
                      middlePosts.push({ axis: 'x', index: i, axisLabel: 'Width', defaultPos: defaultMiddleXPostPosition(i), total: width });
                    }
                  }
                  if (hasMiddleZPost) {
                    for (let i = 1; i < numBaysZ; i++) {
                      middlePosts.push({ axis: 'z', index: i, axisLabel: 'Depth', defaultPos: defaultMiddleZPostPosition(i), total: depth });
                    }
                  }
                  if (middlePosts.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Posts &amp; Louver Sections</label>
                        <span className="text-[9px] text-luxury-black/30 dark:text-white/30 italic">Admin fine-tune</span>
                      </div>
                      {/* Louver section widths visual — shows current distribution */}
                      {hasMiddleXPost && (() => {
                        const widths: number[] = [];
                        let prev = 0;
                        for (let i = 1; i < numBaysX; i++) {
                          const pos = defaultMiddleXPostPosition(i) + (postXOffsets[i] || 0);
                          widths.push(pos - prev);
                          prev = pos;
                        }
                        widths.push(width - prev);
                        return (
                          <div className={`flex items-stretch gap-0.5 rounded overflow-hidden ${isDark ? 'bg-white/5' : 'bg-luxury-cream'}`}>
                            {widths.map((w, i) => (
                              <div
                                key={i}
                                style={{ flex: w }}
                                className={`px-1.5 py-1 text-center text-[9px] font-bold ${isDark ? 'bg-luxury-gold/15 text-luxury-gold' : 'bg-luxury-gold/20 text-luxury-black'}`}
                                title={`Louver section ${i + 1}: ${w.toFixed(1)}'`}
                              >
                                {w.toFixed(1)}'
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <div className="space-y-1.5">
                        {middlePosts.map(({ axis, index, axisLabel, defaultPos, total }) => {
                          const offsets = axis === 'x' ? postXOffsets : postZOffsets;
                          const setOffsets = axis === 'x' ? setPostXOffsets : setPostZOffsets;
                          const onlyOffsets = axis === 'x' ? postXOnlyOffsets : postZOnlyOffsets;
                          const setOnlyOffsets = axis === 'x' ? setPostXOnlyOffsets : setPostZOnlyOffsets;
                          const offset = offsets[index] || 0;
                          const onlyOffset = onlyOffsets[index] || 0;
                          // Beam sits at default + offset (together-mode adjustments).
                          // Physical post sits at beam + post-only offset on top.
                          const beamPos = defaultPos + offset;
                          const currentPos = beamPos + onlyOffset;
                          const removeKey = `${axis}-${index}`;
                          const isRemoved = removedMiddlePosts.has(removeKey);
                          const toggleRemoved = () => {
                            const next = new Set(removedMiddlePosts);
                            if (next.has(removeKey)) next.delete(removeKey);
                            else next.add(removeKey);
                            setRemovedMiddlePosts(next);
                          };
                          // Clamp so the BEAM stays at least 4' from neighbor beams
                          // (structural constraint). Post-only offsets just need
                          // to keep the post within the pergola footprint.
                          const prevBeamPos = axis === 'x'
                            ? (index === 1 ? 0 : defaultMiddleXPostPosition(index - 1) + (postXOffsets[index - 1] || 0))
                            : (index === 1 ? 0 : defaultMiddleZPostPosition(index - 1) + (postZOffsets[index - 1] || 0));
                          const nextBeamPos = axis === 'x'
                            ? (index === numBaysX - 1 ? width : defaultMiddleXPostPosition(index + 1) + (postXOffsets[index + 1] || 0))
                            : (index === numBaysZ - 1 ? depth : defaultMiddleZPostPosition(index + 1) + (postZOffsets[index + 1] || 0));
                          const minBeamPos = prevBeamPos + 4;
                          const maxBeamPos = nextBeamPos - 4;
                          // Post-only offset — post stays inside the pergola (between the neighbors' posts).
                          // We don't enforce the 4' rule here, letting admin position it freely.
                          const minPostOnlyPos = axis === 'x' ? 1 : 1; // keep 1' inside from edge
                          const maxPostOnlyPos = axis === 'x' ? width - 1 : depth - 1;
                          const isSelected = selectedMiddlePost?.axis === axis && selectedMiddlePost?.index === index;
                          const leftLabel = axis === 'x' ? 'Left' : 'Front';
                          const rightLabel = axis === 'x' ? 'Right' : 'Back';
                          const nudge = (delta: number) => {
                            if (postMoveMode === 'together') {
                              const newBeam = Math.max(minBeamPos, Math.min(maxBeamPos, beamPos + delta));
                              setOffsets({ ...offsets, [index]: newBeam - defaultPos });
                            } else {
                              // post-only — shift the physical post, beam stays put
                              const newPost = Math.max(minPostOnlyPos, Math.min(maxPostOnlyPos, currentPos + delta));
                              setOnlyOffsets({ ...onlyOffsets, [index]: newPost - beamPos });
                            }
                          };
                          const reset = () => {
                            const next = { ...offsets };
                            delete next[index];
                            setOffsets(next);
                            const nextOnly = { ...onlyOffsets };
                            delete nextOnly[index];
                            setOnlyOffsets(nextOnly);
                          };
                          // Compute button-disable thresholds for the active mode
                          const minPos = postMoveMode === 'together' ? minBeamPos : minPostOnlyPos;
                          const maxPos = postMoveMode === 'together' ? maxBeamPos : maxPostOnlyPos;
                          return (
                            <div
                              key={`${axis}-${index}`}
                              onClick={() => {
                                const nextSelected = isSelected ? null : { axis, index };
                                setSelectedMiddlePost(nextSelected);
                                // Reset to Post+Beam mode each time a new post is selected
                                // so the default nudge always moves the beam with the post.
                                if (nextSelected) setPostMoveMode('together');
                              }}
                              className={`rounded-lg border transition-all px-3 py-2 cursor-pointer ${
                                isRemoved
                                  ? 'border-rose-400/40 bg-rose-500/5'
                                  : isSelected
                                    ? 'border-luxury-gold bg-luxury-gold/10'
                                    : (isDark ? 'border-white/10 bg-white/[0.02] hover:border-luxury-gold/40' : 'border-slate-200 bg-luxury-paper/40 hover:border-luxury-gold/40')
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[10px] uppercase tracking-widest font-bold ${isRemoved ? 'text-rose-500 line-through' : (isDark ? 'text-white/60' : 'text-luxury-black/60')}`}>
                                  {axisLabel} Post {numBaysX > 2 || numBaysZ > 2 ? `#${index}` : ''}
                                  {isRemoved && <span className="ml-1.5 not-italic no-underline">(removed)</span>}
                                </span>
                                <span className={`text-[11px] font-serif ${isRemoved ? 'text-rose-500/60 line-through' : 'text-luxury-gold'}`}>
                                  {onlyOffset !== 0
                                    ? `Post ${currentPos.toFixed(1)}' • Beam ${beamPos.toFixed(1)}'`
                                    : `${currentPos.toFixed(1)}' from ${leftLabel.toLowerCase()}`}
                                </span>
                              </div>
                              {isSelected && (
                                <div className="pt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                  {!isRemoved && (
                                    <>
                                      {/* Move mode toggle — together moves post+beam, post-only moves just the post */}
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setPostMoveMode('together')}
                                          className={`flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                                            postMoveMode === 'together'
                                              ? 'bg-luxury-gold text-luxury-black'
                                              : (isDark ? 'bg-white/[0.03] text-white/50 border border-white/10 hover:text-white' : 'bg-white text-luxury-black/50 border border-slate-200 hover:text-luxury-black')
                                          }`}
                                        >
                                          Post + Beam
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setPostMoveMode('post-only')}
                                          className={`flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                                            postMoveMode === 'post-only'
                                              ? 'bg-luxury-gold text-luxury-black'
                                              : (isDark ? 'bg-white/[0.03] text-white/50 border border-white/10 hover:text-white' : 'bg-white text-luxury-black/50 border border-slate-200 hover:text-luxury-black')
                                          }`}
                                        >
                                          Post Only
                                        </button>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => nudge(-1)} disabled={currentPos - 1 < minPos}
                                          className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                          ◀ {leftLabel} 1'
                                        </button>
                                        <button type="button" onClick={() => nudge(-0.5)} disabled={currentPos - 0.5 < minPos}
                                          className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                          ◁ 6″
                                        </button>
                                        <button type="button" onClick={reset}
                                          className="px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold"
                                          title="Reset both post and beam to default position">
                                          ⟲
                                        </button>
                                        <button type="button" onClick={() => nudge(0.5)} disabled={currentPos + 0.5 > maxPos}
                                          className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                          6″ ▷
                                        </button>
                                        <button type="button" onClick={() => nudge(1)} disabled={currentPos + 1 > maxPos}
                                          className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                          1' {rightLabel} ▶
                                        </button>
                                      </div>
                                    </>
                                  )}
                                  <button type="button" onClick={toggleRemoved}
                                    className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                      isRemoved
                                        ? 'bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/40 hover:bg-luxury-gold/25'
                                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500/20'
                                    }`}
                                  >
                                    {isRemoved ? '↺ Restore Post' : '✕ Remove Post'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className={`text-[9px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                        Click a post to select it, then choose Post + Beam (moves both) or Post Only (moves the support column while the beam stays). Removing a post keeps the beam and louver divider — only the vertical support disappears.
                      </p>
                    </div>
                  );
                })()}

                {/* Edge Cantilevers — hidden. Functionality superseded
                    by the Corner Post Adjustments section below. */}
                {false && adminMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Edge Cantilevers</label>
                      <span className="text-[9px] text-luxury-black/30 dark:text-white/30 italic">Admin fine-tune</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { side: 'left',  label: 'Left Edge',  axisMax: Math.floor(width / 3) },
                        { side: 'right', label: 'Right Edge', axisMax: Math.floor(width / 3) },
                        { side: 'back',  label: 'Back Edge',  axisMax: Math.floor(depth / 3) },
                        { side: 'front', label: 'Front Edge', axisMax: Math.floor(depth / 3) },
                      ] as const).map(({ side, label, axisMax }) => {
                        const val = cantileverInsets[side] || 0;
                        const setVal = (v: number) => {
                          const next = { ...cantileverInsets };
                          if (v <= 0) delete next[side];
                          else next[side] = v;
                          setCantileverInsets(next);
                        };
                        const readout = val > 0 ? `${val}' inset` : 'Default';
                        return (
                          <div key={side} className={`rounded-lg border px-2.5 py-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-luxury-paper/40'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>{label}</span>
                              <span className="text-[11px] font-serif text-luxury-gold">{readout}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => setVal(Math.max(0, val - 1))}
                                className="w-7 h-7 rounded-full border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0 flex items-center justify-center">
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="range"
                                min={0}
                                max={axisMax}
                                step={1}
                                value={val}
                                onChange={(e) => setVal(Number(e.target.value))}
                                className="flex-1 h-[2px] bg-luxury-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold"
                              />
                              <button type="button" onClick={() => setVal(Math.min(axisMax, val + 1))}
                                className="w-7 h-7 rounded-full border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0 flex items-center justify-center">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[9px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                      Positive = post inset inward (beam cantilevers past it). Negative = post pushed outward past the pergola corner. Max ±⅓ of the edge length. Both left corners move together, both right corners move together, etc.
                    </p>
                  </div>
                )}

                {/* Corner Post Adjustments — admin only. Inset each
                    corner post inward (toward pergola center) in both X
                    and Z. Beams stay at the pergola edge, creating a
                    cantilever overhang on each affected side. */}
                {adminMode && (() => {
                  // Each corner gets inward-only directions. Sign is
                  // applied automatically based on which corner.
                  const corners: Array<{
                    key: string; label: string;
                    xSign: 1 | -1;  // sign applied to X inset to move toward center
                    zSign: 1 | -1;  // sign applied to Z inset to move toward center
                    xInwardLabel: string; zInwardLabel: string;
                  }> = [
                    { key: 'back-left',   label: 'Back-Left',   xSign:  1, zSign:  1, xInwardLabel: 'Right', zInwardLabel: 'Front' },
                    { key: 'back-right',  label: 'Back-Right',  xSign: -1, zSign:  1, xInwardLabel: 'Left',  zInwardLabel: 'Front' },
                    { key: 'front-left',  label: 'Front-Left',  xSign:  1, zSign: -1, xInwardLabel: 'Right', zInwardLabel: 'Back'  },
                    { key: 'front-right', label: 'Front-Right', xSign: -1, zSign: -1, xInwardLabel: 'Left',  zInwardLabel: 'Back'  },
                  ];
                  const maxX = Math.max(0, Math.floor(width / 3));
                  const maxZ = Math.max(0, Math.floor(depth / 3));
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Corner Post Adjustments</label>
                        <span className="text-[9px] text-luxury-black/30 dark:text-white/30 italic">Admin cantilever</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {corners.map(({ key, label, xSign, zSign, xInwardLabel, zInwardLabel }) => {
                          const off = cornerPostOffsets[key] || {};
                          // Stored offsets are already signed (post-center coordinates).
                          // Convert back to unsigned "inset amount" for the UI.
                          const xInset = Math.max(0, (off.x || 0) * xSign);
                          const zInset = Math.max(0, (off.z || 0) * zSign);
                          const isSelected = selectedCorner === key;
                          const writeOffset = (nextX: number, nextZ: number) => {
                            const clampedX = Math.max(0, Math.min(maxX, nextX));
                            const clampedZ = Math.max(0, Math.min(maxZ, nextZ));
                            const out = { ...cornerPostOffsets };
                            if (clampedX === 0 && clampedZ === 0) {
                              delete out[key];
                            } else {
                              out[key] = {
                                ...(clampedX === 0 ? {} : { x: clampedX * xSign }),
                                ...(clampedZ === 0 ? {} : { z: clampedZ * zSign }),
                              };
                            }
                            setCornerPostOffsets(out);
                          };
                          const nudgeX = (delta: number) => writeOffset(xInset + delta, zInset);
                          const nudgeZ = (delta: number) => writeOffset(xInset, zInset + delta);
                          const reset = () => writeOffset(0, 0);
                          const readout = (xInset === 0 && zInset === 0)
                            ? 'Default'
                            : [xInset > 0 && `${xInset}' ${xInwardLabel}`, zInset > 0 && `${zInset}' ${zInwardLabel}`].filter(Boolean).join(' · ');
                          return (
                            <div
                              key={key}
                              onClick={() => setSelectedCorner(isSelected ? null : key)}
                              className={`rounded-lg border transition-all px-2.5 py-2 cursor-pointer ${
                                isSelected
                                  ? 'border-luxury-gold bg-luxury-gold/10'
                                  : (isDark ? 'border-white/10 bg-white/[0.02] hover:border-luxury-gold/40' : 'border-slate-200 bg-luxury-paper/40 hover:border-luxury-gold/40')
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>{label}</span>
                                <span className={`text-[10px] font-serif ${(xInset === 0 && zInset === 0) ? (isDark ? 'text-white/30' : 'text-luxury-black/30') : 'text-luxury-gold'}`}>{readout}</span>
                              </div>
                              {isSelected && (
                                <div className="pt-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => nudgeX(-1)} disabled={xInset <= 0}
                                      className="flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                      −1'
                                    </button>
                                    <span className={`flex-1 text-center text-[10px] font-bold ${isDark ? 'text-white/70' : 'text-luxury-black/70'}`}>{xInset}' {xInwardLabel}</span>
                                    <button type="button" onClick={() => nudgeX(1)} disabled={xInset >= maxX}
                                      className="flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                      +1'
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => nudgeZ(-1)} disabled={zInset <= 0}
                                      className="flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                      −1'
                                    </button>
                                    <span className={`flex-1 text-center text-[10px] font-bold ${isDark ? 'text-white/70' : 'text-luxury-black/70'}`}>{zInset}' {zInwardLabel}</span>
                                    <button type="button" onClick={() => nudgeZ(1)} disabled={zInset >= maxZ}
                                      className="flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold disabled:opacity-30 disabled:cursor-not-allowed">
                                      +1'
                                    </button>
                                  </div>
                                  {(xInset > 0 || zInset > 0) && (
                                    <button type="button" onClick={reset}
                                      className="w-full py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold">
                                      ⟲ Reset Corner
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className={`text-[9px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                        Click a corner, then inset it inward along either axis. The beam stays at the pergola edge — the post slides under it. Max inset ⅓ of each edge.
                      </p>
                    </div>
                  );
                })()}

                {/* Dimension inputs — typable + slider + ± buttons.
                    Common renderer so we keep consistent behavior across W/D/H. */}
                {([
                  { label: 'Width (Louver Length)', value: width,  setter: setWidth,  min: 7, max: 100, ariaKey: 'width' },
                  { label: 'Depth',                 value: depth,  setter: setDepth,  min: 8, max: 40,  ariaKey: 'depth' },
                  { label: 'Height',                value: height, setter: setHeight, min: 8, max: 11,  ariaKey: 'height' },
                ] as const).map(({ label, value, setter, min, max, ariaKey }) => (
                  <div key={ariaKey} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">{label}</label>
                      <div className="flex items-baseline gap-0.5">
                        <DimensionNumberInput value={value} setter={setter} min={min} max={max} ariaKey={ariaKey} />
                        <span className="text-lg font-serif font-medium text-luxury-gold">'</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setter(Math.max(min, value - 1))}
                        className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                        aria-label={`Decrease ${ariaKey}`}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step="1"
                        value={value}
                        onChange={(e) => setter(Number(e.target.value))}
                        aria-label={`Pergola ${ariaKey} slider`}
                        aria-valuetext={`${value} feet`}
                        className="flex-1 h-[2px] sm:h-[1px] bg-luxury-black/10 dark:bg-white/10 appearance-none cursor-pointer accent-luxury-gold"
                      />
                      <button
                        onClick={() => setter(Math.min(max, value + 1))}
                        className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 dark:border-white/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                        aria-label={`Increase ${ariaKey}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-luxury-black/30 dark:text-white/30">
                      <span>{min}'</span>
                      <span>Range: {min}'–{max}'</span>
                      <span>{max}'</span>
                    </div>
                  </div>
                ))}

                <div className="mt-6 pt-6 border-t border-luxury-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60 dark:text-white/60">Base Price</span>
                    <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
                  </div>
                  <p className="text-[9px] italic text-luxury-black/40 dark:text-white/40 mt-1.5 leading-snug">
                    Includes motorized louver system &amp; LED perimeter lighting
                  </p>
                </div>

              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40 mb-2">Frame Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                      {COLORS.filter(c => c.type !== 'wood').map(color => (
                        <button
                          key={`frame-${color.id}`}
                          onClick={() => handleColorSelection(color, setFrameColor, 'frame')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${frameColor === color.hex ? 'border-luxury-gold bg-luxury-paper dark:bg-[#111]' : 'border-transparent hover:border-luxury-cream dark:hover:border-white/20'}`}
                        >
                          {color.isStandard && (
                            <div className="absolute top-0 right-0 px-1 py-0.5 bg-luxury-gold/10 border border-luxury-gold/20 rounded-[2px]">
                              <span className="text-[5px] uppercase tracking-widest font-bold text-luxury-gold">Std</span>
                            </div>
                          )}
                          <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-luxury-black/5" style={{ backgroundColor: color.hex }} />
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight">{color.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-luxury-black/60 dark:text-white/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40 mb-2">Louver Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                      {COLORS.map(color => (
                        <button
                          key={`louver-${color.id}`}
                          onClick={() => handleColorSelection(color, setLouverColor, 'louver')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${louverColor === color.hex ? 'border-luxury-gold bg-luxury-paper dark:bg-[#111]' : 'border-transparent hover:border-luxury-cream dark:hover:border-white/20'}`}
                        >
                          {color.isStandard && (
                            <div className="absolute top-0 right-0 px-1 py-0.5 bg-luxury-gold/10 border border-luxury-gold/20 rounded-[2px]">
                              <span className="text-[5px] uppercase tracking-widest font-bold text-luxury-gold">Std</span>
                            </div>
                          )}
                          <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-luxury-black/5" style={{ backgroundColor: color.hex }} />
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight">{color.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-luxury-black/60 dark:text-white/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>

                </div>

                <div className="mt-4 p-2 bg-luxury-paper dark:bg-[#111] border border-luxury-gold/10 rounded-lg space-y-1">
                  <p className="text-[10px] italic text-luxury-black/60 dark:text-white/60 font-medium">
                    *Other colours may affect lead time and pricing
                  </p>
                  <p className="text-[10px] italic text-luxury-black/60 dark:text-white/60 font-medium">
                    *Woodgrain finish may affect lead time as well as cost
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-luxury-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60 dark:text-white/60">Base Price</span>
                    <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
                  </div>
                  <p className="text-[9px] italic text-luxury-black/40 dark:text-white/40 mt-1.5 leading-snug">
                    Includes motorized louver system &amp; LED perimeter lighting
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Motorized Systems</h4>
                    {renderGroupedAccessory('Motorized Screens', 'screen', Blinds, '/motorizedscreens.png')}
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Fixed Privacy</h4>
                    {renderGroupedAccessory('Privacy Walls', 'wall', PanelRight, '/privacywall.png')}
                  </div>

                  {/* Per-Section Customization — admin only, visible for multi-bay sides.
                      Lets admin pick Open / Screen / Wall independently per bay. */}
                  {adminMode && (['front','back','left','right'] as const).some(sideIsMultiBay) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Per-Section Customization</h4>
                        <span className="text-[9px] text-luxury-black/30 dark:text-white/30 italic">Admin</span>
                      </div>
                      <div className="space-y-3">
                        {(['front','back','left','right'] as const).filter(sideIsMultiBay).map(side => {
                          const sideLabel = { front: 'Front', back: 'Rear', left: 'Left', right: 'Right' }[side];
                          const bayCount = getSideBayCount(side);
                          const bayLen = getBayLengthOnSide(side);
                          const choices = getSectionChoicesForSide(side);
                          const isActive = sideUsesSections(side);
                          const enableSide = () => {
                            const arr: Array<'open'|'screen'|'wall'> = Array.from({ length: bayCount }, () => 'open');
                            setSectionChoices({ ...sectionChoices, [side]: arr });
                          };
                          const disableSide = () => {
                            const next = { ...sectionChoices };
                            delete (next as any)[side];
                            setSectionChoices(next);
                          };
                          const setBay = (i: number, choice: 'open'|'screen'|'wall') => {
                            const arr = [...(choices.length ? choices : Array.from({ length: bayCount }, () => 'open' as const))];
                            arr[i] = choice;
                            setSectionChoices({ ...sectionChoices, [side]: arr });
                          };
                          return (
                            <div key={side} className={`rounded-lg border px-3 py-2.5 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-luxury-paper/40'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>
                                  {sideLabel} Side · {bayCount} sections × ~{bayLen.toFixed(1)}'
                                </span>
                                {isActive ? (
                                  <button type="button" onClick={disableSide} className="text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-600">
                                    Disable
                                  </button>
                                ) : (
                                  <button type="button" onClick={enableSide} className="text-[9px] font-bold uppercase tracking-widest text-luxury-gold hover:text-luxury-black">
                                    Customize
                                  </button>
                                )}
                              </div>
                              {isActive && (
                                <div className="space-y-1.5">
                                  {choices.map((choice, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className={`text-[10px] font-bold w-14 shrink-0 ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                                        § {i + 1}
                                      </span>
                                      <div className="flex-1 flex gap-1">
                                        {(['open','screen','wall'] as const).map(opt => {
                                          const selected = choice === opt;
                                          const optLabel = opt === 'open' ? 'Open' : opt === 'screen' ? 'Screen' : 'Wall';
                                          return (
                                            <button
                                              key={opt}
                                              type="button"
                                              onClick={() => setBay(i, opt)}
                                              className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                                selected
                                                  ? (opt === 'screen' ? 'bg-emerald-500 text-white' : opt === 'wall' ? 'bg-luxury-gold text-luxury-black' : (isDark ? 'bg-white/15 text-white' : 'bg-luxury-black text-white'))
                                                  : (isDark ? 'bg-white/[0.03] text-white/50 border border-white/10 hover:text-white' : 'bg-white text-luxury-black/50 border border-slate-200 hover:text-luxury-black')
                                              }`}
                                            >
                                              {optLabel}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className={`text-[9px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                        When a side is customized, each section's choice overrides the per-side Motorized Screen / Privacy Wall toggle for that side. Per-section pricing replaces the uniform side price.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Privacy Wall Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-[repeat(7,minmax(0,1fr))] gap-2 sm:gap-1">
                      {COLORS.map(color => (
                        <button
                          key={`wall-${color.id}`}
                          onClick={() => handleColorSelection(color, setWallColor, 'wall')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${wallColor === color.hex ? 'border-luxury-gold bg-luxury-paper dark:bg-[#111]' : 'border-transparent hover:border-luxury-cream dark:hover:border-white/20'}`}
                        >
                          {color.isStandard && (
                            <div className="absolute top-0 right-0 px-1 py-0.5 bg-luxury-gold/10 border border-luxury-gold/20 rounded-[2px]">
                              <span className="text-[5px] uppercase tracking-widest font-bold text-luxury-gold">Std</span>
                            </div>
                          )}
                          <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-luxury-black/5 relative overflow-hidden" style={{ backgroundColor: color.hex }}>
                            {color.type === 'wood' && (
                              <div className="absolute inset-0 opacity-40 mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(139, 90, 43, 0.4), rgba(139, 90, 43, 0.4) 10px, rgba(160, 106, 59, 0.4) 10px, rgba(160, 106, 59, 0.4) 20px)' }} />
                            )}
                          </div>
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight">{color.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-luxury-black/60 dark:text-white/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-luxury-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60 dark:text-white/60">Base Price</span>
                    <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
                  </div>
                  <p className="text-[9px] italic text-luxury-black/40 dark:text-white/40 mt-1.5 leading-snug">
                    Includes motorized louver system &amp; LED perimeter lighting
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <div className="space-y-4">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Enhance Your Experience</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {ACCESSORIES.filter(a => ['sensor', 'app_control', 'fan', 'heater'].includes(a.id))
                      .sort((a, b) => {
                        const order = ['sensor', 'app_control', 'fan', 'heater'];
                        return order.indexOf(a.id) - order.indexOf(b.id);
                      })
                      .map(renderAccessory)}
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-luxury-black/10 dark:border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60 dark:text-white/60">Base Price</span>
                    <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
                  </div>
                  <p className="text-[9px] italic text-luxury-black/40 dark:text-white/40 mt-1.5 leading-snug">
                    Includes motorized louver system &amp; LED perimeter lighting
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 5 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div>
                <div className="space-y-4">
                  {/* Previously-saved pergolas render FIRST, in save order — collapsed by default */}
                  {extraPergolas.map((p, idx) => {
                    const price = typeof p.price === 'number' ? p.price : 0;
                    const items = p.lineItems || [];
                    const itemsTotal = items.reduce((s, i) => s + (i.cost || 0), 0);
                    const isOpen = expandedPergolaIds.has(p.id);
                    const toggle = () => {
                      const next = new Set(expandedPergolaIds);
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                      setExpandedPergolaIds(next);
                    };
                    return (
                      <div key={p.id} className="border border-luxury-cream">
                        {/* Accordion header — always visible */}
                        <button
                          type="button"
                          onClick={toggle}
                          aria-expanded={isOpen}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-luxury-paper/50'}`}
                        >
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-luxury-gold text-luxury-black shrink-0">
                            Pergola {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0 text-left">
                            <p className={`text-sm font-serif font-medium truncate ${isDark ? 'text-white' : 'text-luxury-black'}`}>{p.label}</p>
                            <p className={`text-[10px] ${isDark ? 'text-white/50' : 'text-luxury-black/50'}`}>
                              {p.width}' × {p.depth}' × {p.height}'{items.length > 0 && ` · ${items.length} option${items.length === 1 ? '' : 's'}`}
                            </p>
                          </div>
                          <span className="text-base font-serif text-luxury-gold font-medium whitespace-nowrap">{formatCurrency(price)}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`} />
                        </button>

                        {/* Accordion body — full spec only when expanded */}
                        {isOpen && (
                          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-luxury-cream">
                            <div className="flex items-center gap-2 pt-3">
                              <div className="flex-1" />
                              <button
                                type="button"
                                onClick={() => { setEditingPergola(p); setAddPergolaModalOpen(true); }}
                                className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-white/60 hover:text-luxury-gold' : 'text-luxury-black/60 hover:text-luxury-gold'}`}
                              >
                                Edit
                              </button>
                              <span className={isDark ? 'text-white/20' : 'text-luxury-black/20'}>·</span>
                              <button
                                type="button"
                                onClick={() => { if (confirm(`Remove "${p.label}" from your project?`)) setExtraPergolas(extraPergolas.filter(x => x.id !== p.id)); }}
                                className="text-[9px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-600"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="flex flex-col border-b border-luxury-cream pb-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="text-lg font-serif mb-1">Bespoke Pergola</h4>
                                  <p className="text-[10px] text-luxury-black/40 uppercase tracking-widest leading-relaxed">
                                    {p.width}' × {p.depth}' × {p.height}' <br />
                                    {p.frameColor} Frame <br />
                                    {p.louverColor} Louvers
                                    {p.notes && <><br /><span className="normal-case italic">{p.notes}</span></>}
                                  </p>
                                  <p className="text-[9px] italic text-luxury-black/50 dark:text-white/50 mt-2 leading-snug normal-case">
                                    Includes motorized louver system &amp; LED perimeter lighting
                                  </p>
                                </div>
                                <span className="text-lg font-serif text-luxury-gold">{formatCurrency(price - itemsTotal)}</span>
                              </div>
                            </div>

                            {items.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 pb-1">
                                  <span className="text-[9px] uppercase tracking-[0.25em] font-bold text-luxury-gold">Options &amp; Add-Ons</span>
                                  <div className="flex-1 h-px bg-luxury-gold/20" />
                                </div>
                                <div className="space-y-1.5">
                                  {items.map((it, i) => (
                                    <div key={`${p.id}-${it.id || i}`} className="flex justify-between items-center text-[11px]">
                                      <span className="font-serif text-luxury-black/60 dark:text-white/60">
                                        {it.name}{(it.quantity && it.quantity > 1) ? ` × ${it.quantity}` : ''}
                                      </span>
                                      <span className="font-serif text-luxury-black/80 dark:text-white/80">{formatCurrency(it.cost || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-2 border-t border-luxury-black/10 dark:border-white/10">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/60 dark:text-white/60">Pergola {idx + 1} Subtotal</span>
                              <span className="text-base font-serif text-luxury-gold">{formatCurrency(price)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Active / current pergola (last — the one being configured now) */}
                  <div className="border border-luxury-cream p-4 space-y-4">
                    {extraPergolas.length > 0 && (
                      <div className="flex items-center gap-2 -mt-1 mb-1">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-luxury-gold text-luxury-black">
                          Pergola {extraPergolas.length + 1}
                        </span>
                        <span className="text-[10px] italic text-luxury-black/40 dark:text-white/40">current design</span>
                      </div>
                    )}
                    <div className="flex flex-col border-b border-luxury-cream pb-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-lg font-serif mb-1">Bespoke Pergola</h4>
                          <p className="text-[10px] text-luxury-black/40 uppercase tracking-widest leading-relaxed">
                            {width}' × {depth}' × {height}' <br />
                            {COLORS.find(c => c.hex === frameColor)?.name} Frame <br />
                            {COLORS.find(c => c.hex === louverColor)?.name} Louvers <br />
                            {foundationStatus && (
                              <>
                                Foundation: {
                                  {
                                    'existing': 'Existing Foundation',
                                    'needs': 'Needs Foundation'
                                  }[foundationStatus] || foundationStatus
                                }
                                <br />
                              </>
                            )}
                          </p>
                          <p className="text-[9px] italic text-luxury-black/50 dark:text-white/50 mt-2 leading-snug normal-case">
                            Includes motorized louver system &amp; LED perimeter lighting
                          </p>
                        </div>
                        <span className="text-lg font-serif text-luxury-gold">{formatCurrency(basePrice || 0)}</span>
                      </div>
                      {louverColor === '#8B5A2B' && (
                        <div className="flex justify-between items-center text-[10px] pl-3 mt-2">
                          <span className="font-serif text-luxury-black/60 dark:text-white/60 italic font-bold">Woodgrain Louver Upgrade</span>
                          <span className="font-serif text-luxury-black/60 dark:text-white/60 italic font-bold">{formatCurrency(calculateLouverCount(width, depth) * 150)}</span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const renderAccessoryRow = (id: string) => {
                        const accessory = ACCESSORIES.find(a => a.id === id);
                        if (!accessory) return null;

                        let cost = 0;
                        let breakdown: { price: number }[] | null = null;
                        let wallWoodgrainCost = 0;
                        let wallWoodgrainCount = 0;

                        const qty = accessory.quantifiable ? (accessoryQuantities[id] || 1) : 1;
                        if (accessory.type === 'flat') {
                          cost = accessory.price * qty;
                          if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
                        } else if (accessory.type === 'sqft') {
                          cost = accessory.price * (depth * width) * qty;
                        } else if (accessory.type === 'screen_width') {
                          cost = calculateScreenPrice(width, height, numScreenBaysX);
                          if (numScreenBaysX > 1) {
                            const base = Math.floor(width / numScreenBaysX);
                            const remainder = width % numScreenBaysX;
                            breakdown = [];
                            for (let i = 0; i < numScreenBaysX; i++) {
                              const screenLength = base + (i < remainder ? 1 : 0);
                              const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
                              breakdown.push({ price });
                            }
                          }
                        } else if (accessory.type === 'screen_depth') {
                          cost = calculateScreenPrice(depth, height, numScreenBaysZ);
                          if (numScreenBaysZ > 1) {
                            const base = Math.floor(depth / numScreenBaysZ);
                            const remainder = depth % numScreenBaysZ;
                            breakdown = [];
                            for (let i = 0; i < numScreenBaysZ; i++) {
                              const screenLength = base + (i < remainder ? 1 : 0);
                              const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
                              breakdown.push({ price });
                            }
                          }
                        } else if (accessory.type === 'wall_width') {
                          const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
                          cost = width * height * wallUnitPrice;
                          const base = Math.floor(width / numScreenBaysX);
                          const remainder = width % numScreenBaysX;
                          const numPanelsPerBay = Math.ceil((height * 12) / 7);
                          breakdown = [];
                          for (let i = 0; i < numScreenBaysX; i++) {
                            const wallLength = base + (i < remainder ? 1 : 0);
                            const price = wallLength * height * wallUnitPrice;
                            breakdown.push({ price });
                            if (wallColor === '#8B5A2B') {
                              wallWoodgrainCost += numPanelsPerBay * (wallLength < 12 ? 100 : 150);
                              wallWoodgrainCount += numPanelsPerBay;
                            }
                          }
                        } else if (accessory.type === 'wall_depth') {
                          const wallUnitPrice = (width * depth) < 120 ? 60 : 55;
                          cost = depth * height * wallUnitPrice;
                          const base = Math.floor(depth / numScreenBaysZ);
                          const remainder = depth % numScreenBaysZ;
                          const numPanelsPerBay = Math.ceil((height * 12) / 7);
                          breakdown = [];
                          for (let i = 0; i < numScreenBaysZ; i++) {
                            const wallLength = base + (i < remainder ? 1 : 0);
                            const price = wallLength * height * wallUnitPrice;
                            breakdown.push({ price });
                            if (wallColor === '#8B5A2B') {
                              wallWoodgrainCost += numPanelsPerBay * (wallLength < 12 ? 100 : 150);
                              wallWoodgrainCount += numPanelsPerBay;
                            }
                          }
                        }

                        let breakdownRender = null;
                        if (breakdown && breakdown.length > 0 && (accessory.type.includes('screen') || (accessory.type.includes('wall') && breakdown.length > 1))) {
                          const grouped = breakdown.reduce((acc, item) => {
                            const key = item.price.toString();
                            if (!acc[key]) acc[key] = { price: item.price, count: 0 };
                            acc[key].count++;
                            return acc;
                          }, {} as Record<string, { price: number, count: number }>);

                          breakdownRender = (
                            <div className="pl-3 mt-1 space-y-0.5 border-l border-luxury-black/10 dark:border-white/10">
                              {Object.values(grouped).map((item, i) => {
                                const itemName = accessory.type.includes('wall')
                                  ? (item.count === 1 ? 'wall' : 'walls')
                                  : (item.count === 1 ? 'screen' : 'screens');
                                return (
                                  <div key={i} className="flex justify-between items-center text-[10px] text-luxury-black/50">
                                    <span>({item.count}) {itemName}</span>
                                    <span>{formatCurrency(item.price)} each</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        return (
                          <div key={id} className="flex flex-col">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="font-serif text-luxury-black/60 dark:text-white/60">{accessory.name}{accessory.quantifiable && qty > 1 ? ` × ${qty}` : ''} {accessory.type.includes('wall') && `(${COLORS.find(c => c.hex === wallColor)?.name})`}</span>
                              <span className="font-serif text-luxury-black/80">{formatCurrency(cost)}</span>
                            </div>
                            {breakdownRender}
                            {wallWoodgrainCost > 0 && (
                              <div className="flex justify-between items-center text-[10px] pl-3 mt-1">
                                <span className="font-serif text-luxury-black/40 italic font-bold">Woodgrain Upgrade</span>
                                <span className="font-serif text-luxury-black/60 dark:text-white/60 italic font-bold">{formatCurrency(wallWoodgrainCost)}</span>
                              </div>
                            )}
                          </div>
                        );
                      };

                      const isWallCoverage = (id: string) => {
                        const acc = ACCESSORIES.find(a => a.id === id);
                        if (!acc) return false;
                        return acc.type === 'screen_width' || acc.type === 'screen_depth' ||
                               acc.type === 'wall_width' || acc.type === 'wall_depth' ||
                               acc.id.includes('guillotine');
                      };

                      const wallCoverageIds = Array.from(selectedAccessories).filter(isWallCoverage);
                      const addOnIds = Array.from(selectedAccessories).filter(id => !isWallCoverage(id));

                      return (
                        <>
                          {wallCoverageIds.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 pb-1">
                                <span className="text-[9px] uppercase tracking-[0.25em] font-bold text-luxury-gold">Wall Coverages</span>
                                <div className="flex-1 h-px bg-luxury-gold/20" />
                              </div>
                              <div className="space-y-2">
                                {wallCoverageIds.map(renderAccessoryRow)}
                              </div>
                            </div>
                          )}
                          {addOnIds.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 pb-1">
                                <span className="text-[9px] uppercase tracking-[0.25em] font-bold text-luxury-gold">Add-Ons & Features</span>
                                <div className="flex-1 h-px bg-luxury-gold/20" />
                              </div>
                              <div className="space-y-2">
                                {addOnIds.map(renderAccessoryRow)}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Add Another Pergola CTA */}
                    <div className="pt-4 border-t border-luxury-black/10 dark:border-white/10 flex items-center justify-between gap-3">
                      <span className={`text-[10px] italic leading-relaxed ${isDark ? 'text-white/40' : 'text-luxury-black/50'}`}>
                        Building a larger space? Add another pergola to this project.
                      </span>
                      <button
                        type="button"
                        onClick={saveAndStartAnotherPergola}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-luxury-black rounded-full text-[11px] font-bold uppercase tracking-wider hover:bg-luxury-gold/90 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        Add Another Pergola
                      </button>
                    </div>

                    <div className="pt-4 border-t border-luxury-black/10 dark:border-white/10 flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-[0.3em] font-bold text-luxury-black/40">Total Investment</span>
                        {extraPergolas.length > 0 && (
                          <span className="text-[10px] text-luxury-black/50 dark:text-white/50 italic">
                            Across {extraPergolas.length + 1} pergolas
                          </span>
                        )}
                      </div>
                      <span className="text-2xl font-serif text-luxury-black dark:text-white">
                        {formatCurrency((totalPrice || 0) + extraPergolas.reduce((s, p) => s + (p.price || 0), 0))}
                      </span>
                    </div>
                    <p className="text-[9px] italic text-luxury-black/50 dark:text-white/50 leading-relaxed pt-2">
                      Pricing includes installation under normal circumstances. Should any additional work be required, the price will be adjusted to reflect the revised scope.
                    </p>
                    <p className="text-[9px] italic text-luxury-black/50 dark:text-white/50 leading-relaxed">
                      Please note that the configurator is provided for budgetary purposes only. Each pergola must be finalized with a site visit so we can provide an accurate final quote based on the specific site conditions and project details.
                    </p>
                  </div>

                  {/* Customer Notes — admin-only, change requests, context, special instructions */}
                  {adminMode && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Notes &amp; Change Requests</h4>
                        <span className={`text-[9px] italic ${isDark ? 'text-white/30' : 'text-luxury-black/30'}`}>Optional</span>
                      </div>
                      <textarea
                        value={customerNotes}
                        onChange={(e) => setCustomerNotes(e.target.value)}
                        rows={4}
                        maxLength={2000}
                        placeholder="Site-specific details, design tweaks, colour-match requests, or anything else we should know…"
                        className={`w-full px-3 py-2.5 rounded-lg border text-sm leading-relaxed focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${
                          isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 placeholder:text-slate-400'
                        }`}
                      />
                      <div className="flex items-center justify-between text-[9px]">
                        <span className={isDark ? 'text-white/40' : 'text-luxury-black/40'}>
                          Your sales rep will review these notes alongside the quote.
                        </span>
                        <span className={isDark ? 'text-white/30' : 'text-luxury-black/30'}>
                          {customerNotes.length}/2000
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 dark:text-white/40">Contact Information</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="border-b border-luxury-black/10 dark:border-white/10 py-1">
                        <span className="text-[10px] uppercase text-luxury-black/40 block mb-1">Name</span>
                        <span className="font-serif text-sm">{name}</span>
                      </div>
                      <div className="border-b border-luxury-black/10 dark:border-white/10 py-1">
                        <span className="text-[10px] uppercase text-luxury-black/40 block mb-1">Email</span>
                        <span className="font-serif text-sm">{email}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className={`px-4 py-3 lg:px-6 lg:py-4 border-t shrink-0 relative ${isDark ? 'border-white/10 bg-[#0f0f0f]' : 'border-luxury-cream bg-white'}`}>
          {/* Utility Row — Reset + Custom-Pergola Escape Hatch */}
          <div className={`flex items-center justify-between gap-2 pb-2 mb-2 border-b ${isDark ? 'border-white/5' : 'border-luxury-cream/40'}`}>
            <button
              onClick={() => setShowResetModal(true)}
              className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold transition-colors ${isDark ? 'text-white/35 hover:text-luxury-gold' : 'text-luxury-black/35 hover:text-luxury-gold'}`}
              title="Start over"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset
            </button>
            {currentStep < 5 && (
              <button
                onClick={() => setShowCustomRequestModal(true)}
                className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold transition-colors ${isDark ? 'text-white/35 hover:text-luxury-gold' : 'text-luxury-black/35 hover:text-luxury-gold'}`}
                title="Design a custom pergola"
              >
                <Sparkles className="w-2.5 h-2.5" />
                Need something custom?
              </button>
            )}
          </div>

          {/* Sticky Running Total */}
          <div className={`flex items-center justify-between mb-2 pb-2 border-b ${isDark ? 'border-white/10' : 'border-luxury-cream/50'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-white/40' : 'text-luxury-black/40'}`}>
                {currentStep === 5 ? 'Grand Total' : 'Running Total'}
              </span>
              {currentStep < 5 && (
                <span className={`text-[8px] italic ${isDark ? 'text-white/30' : 'text-luxury-black/30'}`}>
                  (pre-tax)
                </span>
              )}
            </div>
            <motion.span
              key={(totalPrice || 0) + extraPergolas.length}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-lg font-serif font-medium text-luxury-gold"
            >
              {totalPrice !== null
                ? formatCurrency(totalPrice + extraPergolas.reduce((s, p) => s + (p.price || 0), 0))
                : '—'}
            </motion.span>
          </div>
          {submitSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-full left-4 right-4 mb-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 px-3 py-2 rounded-lg border border-emerald-200 text-[10px] font-medium flex items-center gap-2 z-50"
            >
              <Check className="w-3 h-3" />
              Submitted successfully!
            </motion.div>
          )}
          
          <div className="flex flex-col md:flex-row justify-between gap-3 lg:gap-4">
            {/* Secondary Actions (Left on Desktop, Bottom on Mobile) */}
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep(s => s - 1)}
                  className="luxury-button-outline flex-1 md:flex-none md:px-8 py-2.5 text-[11px]"
                >
                  Back
                </button>
              )}
            </div>

            {/* Primary Actions (Right on Desktop, Top on Mobile) */}
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              {currentStep < 5 ? (
                <button 
                  onClick={() => {
                    if (currentStep === 1 && !foundationStatus) {
                      setShowFoundationError(true);
                    } else {
                      setCurrentStep(s => s + 1);
                      if (leadId) {
                        updatePipedrive(leadId);
                      }
                    }
                  }}
                  className="luxury-button flex-1 lg:flex-none lg:px-12 py-2.5 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              ) : (
                <>
                  {currentUser ? (
                    <button
                      onClick={() => {
                        if (!name || !email || !phone || !city) {
                          setShowContactModal(true);
                        } else {
                          handleSubmission('email');
                        }
                      }}
                      disabled={isSubmitting || isGeneratingPDF}
                      className="luxury-button flex-1 lg:flex-none lg:px-12 py-2.5 text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting || isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Quote to CRM'}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!name || !email || !phone || !city) {
                          setShowContactModal(true);
                        } else {
                          handleSubmission('email');
                        }
                      }}
                      disabled={isSubmitting || isGeneratingPDF}
                      className="luxury-button flex-1 lg:flex-none lg:px-12 py-2.5 text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting || isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Email Quote'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {activeColorWarning && (
        <div className="fixed inset-0 z-40" onClick={() => setActiveColorWarning(null)} />
      )}
      
      {/* Foundation Validation Popup */}
      <AnimatePresence>
        {showFoundationError && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-8 max-w-md w-full shadow-2xl border border-luxury-gold/20 text-center space-y-6 ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
            >
              <div className="w-16 h-16 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8 text-luxury-gold" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-luxury-black">Foundation Required</h3>
                <p className="text-sm text-luxury-black/60 dark:text-white/60 leading-relaxed">
                  Please select a Foundation Status to continue with your architectural specification.
                </p>
              </div>
              <button 
                onClick={() => setShowFoundationError(false)}
                className="luxury-button w-full"
              >
                Acknowledge
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Conflict Confirmation Modal */}
      <AnimatePresence>
        {pendingConflict && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 lg:p-8 max-w-sm w-full shadow-2xl border border-luxury-gold/20 rounded-lg ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">⚠</span>
                </div>
                <h3 className={`text-xl font-serif ${isDark ? 'text-white' : 'text-luxury-black'}`}>
                  {pendingConflict.reason === 'structure' ? 'Existing Structure Wall' : 'Motorized Screen Selected'}
                </h3>
                <p className={`text-sm mt-2 leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-500 dark:text-white/50'}`}>
                  {pendingConflict.reason === 'structure'
                    ? 'A structure wall is already on this side. Are you sure you want to add a vertical coverage here as well?'
                    : 'A motorized screen is already on this side. Are you sure you want to add a privacy wall here as well?'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingConflict(null)}
                  className="luxury-button-outline flex-1 !px-4 !py-2.5 text-[11px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (pendingConflict) {
                      performToggle(pendingConflict.id);
                      setPendingConflict(null);
                    }
                  }}
                  className="luxury-button flex-1 !px-4 !py-2.5 text-[11px]"
                >
                  Add Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Pergola Modal */}
      {addPergolaModalOpen && (
        <AddPergolaModal
          initial={editingPergola}
          indexNumber={editingPergola ? extraPergolas.findIndex(p => p.id === editingPergola.id) + 2 : extraPergolas.length + 2}
          isDark={isDark}
          onClose={() => { setAddPergolaModalOpen(false); setEditingPergola(null); }}
          onSave={(pergola) => {
            if (editingPergola) {
              setExtraPergolas(extraPergolas.map(p => p.id === pergola.id ? pergola : p));
            } else {
              setExtraPergolas([...extraPergolas, pergola]);
            }
            setAddPergolaModalOpen(false);
            setEditingPergola(null);
          }}
        />
      )}

      {/* Custom Request Modal — Phase 1 escape hatch */}
      {showCustomRequestModal && (
        <CustomRequestModal
          isDark={isDark}
          onClose={() => setShowCustomRequestModal(false)}
          initialName={name}
          initialEmail={email}
          initialPhone={phone}
          initialAddress={address}
          initialCity={city}
          leadId={leadId}
          dealerSlug={dealerSlug || null}
          dealerEmail={dealerEmail || null}
          dealerName={dealerName || null}
        />
      )}

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 lg:p-8 max-w-sm w-full shadow-2xl border border-luxury-gold/20 rounded-lg ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <RotateCcw className="w-6 h-6 text-luxury-gold" />
                </div>
                <h3 className={`text-xl font-serif ${isDark ? 'text-white' : 'text-luxury-black'}`}>Start Over?</h3>
                <p className={`text-sm mt-2 leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-500 dark:text-white/50'}`}>
                  This will clear your current configuration and return to the beginning. This can't be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="luxury-button-outline flex-1 !px-4 !py-2.5 text-[11px]"
                >
                  Cancel
                </button>
                <button
                  onClick={resetConfigurator}
                  className="luxury-button flex-1 !px-4 !py-2.5 text-[11px]"
                >
                  Yes, Start Over
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contact Info Modal (for standalone /configurator route) */}
      <AnimatePresence>
        {showContactModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-luxury-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 lg:p-8 max-w-md w-full shadow-2xl border border-luxury-gold/20 rounded-lg ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'}`}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-luxury-gold" />
                </div>
                <h3 className={`text-xl font-serif ${isDark ? 'text-white' : 'text-luxury-black'}`}>Your Contact Details</h3>
                <p className={`text-sm mt-1 ${isDark ? 'text-white/50' : 'text-slate-500 dark:text-white/50'}`}>We'll send your personalized quote to your email.</p>
              </div>

              {/* QR code handoff */}
              <div className={`mb-5 rounded-lg border p-3 flex items-center gap-3 ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-luxury-paper border-luxury-cream'}`}>
                <div className={`p-1.5 rounded-md shrink-0 ${scanReceived ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-500' : 'bg-white'}`}>
                  <QRCodeSVG
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/scan/${scanSessionId}`}
                    size={64}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1A1A1A"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {scanReceived ? (
                    <>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 text-emerald-600 dark:text-emerald-400`}>✓ Details received</p>
                      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>Sending your quote now…</p>
                    </>
                  ) : (
                    <>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 text-luxury-gold`}>Faster on Mobile</p>
                      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-white/60' : 'text-luxury-black/60'}`}>Scan to fill these fields on your phone — no typing required.</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-luxury-black/10'}`} />
                <span className={`text-[9px] uppercase tracking-widest font-bold ${isDark ? 'text-white/30' : 'text-luxury-black/30'}`}>or type manually</span>
                <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-luxury-black/10'}`} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setShowContactModal(false);
                  handleSubmission('email');
                }}
                className="space-y-3"
              >
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="John Doe" />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Phone Number *</label>
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Email Address *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="john@example.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Address</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="123 Main St" />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>City *</label>
                    <input type="text" required value={city} onChange={e => setCity(e.target.value)} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 dark:border-white/15'}`} placeholder="Toronto" />
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>How did you hear about us?</label>
                  <select
                    value={heardAbout}
                    onChange={e => { setHeardAbout(e.target.value); if (e.target.value !== 'Other') setHeardAboutOther(''); }}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white' : 'border-slate-300'}`}
                  >
                    <option value="">Select an option</option>
                    <option value="Google Search">Google search</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Facebook">Facebook</option>
                    <option value="TikTok">TikTok</option>
                    <option value="YouTube">YouTube</option>
                    <option value="Friend / Referral">Friend or referral</option>
                    <option value="Home Show / Event">Home show or event</option>
                    <option value="Dealer / Contractor">Dealer or contractor</option>
                    <option value="Saw an Installation">Saw one installed</option>
                    <option value="Print / Magazine">Print or magazine</option>
                    <option value="Radio / Podcast">Radio or podcast</option>
                    <option value="Other">Other</option>
                  </select>
                  {heardAbout === 'Other' && (
                    <input
                      type="text"
                      value={heardAboutOther}
                      onChange={e => setHeardAboutOther(e.target.value)}
                      placeholder="Please specify…"
                      className={`mt-2 w-full px-3 py-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'border-slate-300 placeholder:text-slate-400'}`}
                    />
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className="luxury-button-outline flex-1 !px-4 !py-2.5 text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="luxury-button flex-1 !px-4 !py-2.5 text-[11px]"
                  >
                    Send My Quote
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ProposalDocument data={pdfData} isGeneratingPDF={isGeneratingPDF} />
      <Toaster position="top-center" />
      
      {/* Admin Link */}
      <div className="admin-link fixed bottom-2 left-1/2 -translate-x-1/2 z-[60] opacity-20 hover:opacity-100 transition-opacity">
        <a href="/admin" className="text-[10px] text-luxury-black/40 hover:text-luxury-gold font-medium">
          Admin Dashboard
        </a>
      </div>
      {/* Hidden Proposal for Capture */}
      <div ref={proposalRef} className="fixed top-0 left-0 z-[-50] pointer-events-none">
        {visualizerData && <ProposalDocument data={visualizerData} isGeneratingPDF={true} />}
      </div>
    </div>
  );
}

