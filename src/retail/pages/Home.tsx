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
  Blinds,
  PanelRight,
  Mail,
  Calendar,
  User,
  Phone,
  MapPin,
  Plus,
  Minus,
  Loader2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import html2canvas from 'html2canvas';
import { db, collection, addDoc, serverTimestamp, auth, doc, setDoc, query, where, getDocs } from '../../shared/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { jsPDF } from 'jspdf';
import { toPng, toJpeg } from 'html-to-image';
import { ProposalDocument } from '../../shared/components/ProposalDocument';
import { generateProposalPDF } from '../../shared/lib/pdfGenerator';
import { useDebounce } from 'use-debounce';
import { SCREEN_PRICES, getMarkup, calculateLouverCount, calculateScreenPrice, getScreenDescription, formatCurrency } from '../../shared/lib/pricing';
import { type AccessoryType, type Accessory, ACCESSORIES } from '../../shared/lib/accessories';
import { COLORS, getColorName } from '../../shared/lib/colors';

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

export default function Home() {
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
        
        if (accessory.type === 'flat') {
          cost = accessory.price;
          if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
        } else if (accessory.type === 'sqft') {
          cost = accessory.price * (depth * width);
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
        
        let itemText = `- ${accessory.name}: $${cost.toFixed(2)}`;
        
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

    return `Pergola Quote for ${name}
Dimensions: ${width}' W x ${depth}' D x ${height}' H
Frame Color: ${getColorName(frameColor)}
Louver Color: ${getColorName(louverColor)}
Wall Color: ${getColorName(wallColor)}
Foundation: ${foundationStatus || 'Not specified'}
Heater Control: ${selectedAccessories.has('heater') ? heaterControl : 'N/A'}
Screen Drop: ${screenDrop}%
Guillotine Open: ${guillotineOpen}%
Accessories: ${accessoriesText}

Pricing:
Bespoke Pergola: $${(basePrice || 0).toFixed(2)}
Accessories: $${(accessoriesPrice || 0).toFixed(2)}
Woodgrain Upgrade: $${(woodgrainUpgrade || 0).toFixed(2)}${woodgrainDetails}
Total Price: $${(totalPrice || 0).toFixed(2)}`;
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
  const [houseWall, setHouseWall] = useState<'none' | 'back' | 'left' | 'right' | 'front'>('none');
  const [selectedAccessories, setSelectedAccessories] = useState<Set<string>>(new Set());
  const [wallColor, setWallColor] = useState<string>('#0A0A0A');
  const [houseWallColor, setHouseWallColor] = useState<string>('#82A0C2'); // Light Blue Siding
  const [heaterControl, setHeaterControl] = useState<'switch' | 'dimmer'>('switch');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [customModels, setCustomModels] = useState<{ post?: string; beam?: string; louver?: string }>({});

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
  const [hasStarted, setHasStarted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

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

  const accessoriesPrice = useMemo(() => {
    let total = 0;
    const sqft = depth * width;
    const wallUnitPrice = sqft < 120 ? 60 : 55;
    
    selectedAccessories.forEach(id => {
      const accessory = ACCESSORIES.find(a => a.id === id);
      if (accessory) {
        if (accessory.type === 'flat') {
          total += accessory.price;
          if (id === 'heater' && heaterControl === 'dimmer') {
            total += 1031; // Bromic Dimmer cost
          }
        } else if (accessory.type === 'sqft') {
          total += accessory.price * sqft;
        } else if (accessory.type === 'screen_width') {
          total += calculateScreenPrice(width, height, numScreenBaysX);
        } else if (accessory.type === 'screen_depth') {
          total += calculateScreenPrice(depth, height, numScreenBaysZ);
        } else if (accessory.type === 'wall_width') {
          total += width * height * wallUnitPrice;
        } else if (accessory.type === 'wall_depth') {
          total += depth * height * wallUnitPrice;
        }
      }
    });
    return total;
  }, [selectedAccessories, depth, width, height, heaterControl, numScreenBaysX, numScreenBaysZ]);

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

    const itemizedAccessories = Array.from(selectedAccessories).flatMap(id => {
      const acc = ACCESSORIES.find(a => a.id === id);
      if (!acc) return [];
      
      if (acc.type === 'screen_width') {
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
        const wallLength = width / numScreenBaysX;
        const walls = [];
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
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
        const wallLength = depth / numScreenBaysZ;
        const walls = [];
        const numPanelsPerBay = Math.ceil((height * 12) / 7);
        for (let i = 0; i < numScreenBaysZ; i++) {
          let price = wallLength * height * wallUnitPrice;
          if (wallColor === '#8B5A2B') {
            price += numPanelsPerBay * (wallLength < 12 ? 100 : 150);
          }
          walls.push({ ...acc, name: `${acc.name} (${wallLength.toFixed(1)}')`, cost: price, quantity: 1 });
        }
        return walls;
      }

      let cost = acc.price;
      if (acc.type === 'sqft') cost = acc.price * (width * depth);
      if (id === 'heater' && heaterControl === 'dimmer') {
        cost += 1031;
      }
      return [{ ...acc, cost, quantity: 1 }];
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
    const subtotal = (basePrice || 0) + accessoriesTotal;
    const hst = subtotal * 0.13;
    const finalTotal = subtotal + hst;

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
      visualizerProps: {
        width, depth, height, accessories: selectedAccessories, frameColor, louverColor,
        louverAngle: 0, screenDrop: 100, guillotineOpen: 50, wallColor: wallColor, houseWallColor: '#e2e8f0',
        houseWall: 'none' as any, staticMode: true
      }
    };
  }, [name, email, phone, address, city, width, depth, height, frameColor, louverColor, wallColor, basePrice, selectedAccessories, heaterControl, numScreenBaysX, numScreenBaysZ]);

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
          if (accessory.type === 'flat') {
            total += accessory.price;
            if (id === 'heater' && heaterControl === 'dimmer') total += 1031;
          } else if (accessory.type === 'sqft') {
            total += accessory.price * (width * depth);
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
  }, [basePrice, louverColor, width, depth, currentStep, selectedAccessories, height, numScreenBaysX, numScreenBaysZ, wallColor, heaterControl]);

  const toggleAccessory = (id: string) => {
    const next = new Set(selectedAccessories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccessories(next);
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

  const handleSubmission = async (type: 'email' | 'consultation') => {
    setIsSubmitting(true);
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
          totalPrice: totalPrice ? formatCurrency(totalPrice) : 'N/A',
          accessories: Array.from(selectedAccessories).map(id => {
            const acc = ACCESSORIES.find(a => a.id === id);
            return acc ? acc.name : id;
          })
        }
      };

      const isContractor = !!auth.currentUser;
      const contractorId = auth.currentUser?.uid || null;
      let submissionId: string | null = null;

      // 1. Save to Firestore (without PDF to save space)
      try {
        const submissionRef = await addDoc(collection(db, 'submissions'), {
          ...baseData,
          contractorId,
          isDuplicate: isDuplicateLead,
          createdAt: serverTimestamp()
        });
        submissionId = submissionRef.id;

        // Update Pipedrive lead
        if (leadId) {
          try {
            await fetch('/api/update-lead', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leadId, configuration: baseData.configuration, isDuplicate: isDuplicateLead })
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
          
          pdfBase64 = pdf.output('datauristring');
          if (type !== 'email') {
            pdf.save(`Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}.pdf`);
          }
          
          if (leadId) {
            await updatePipedrive(leadId, [{ name: `Eclipse_Proposal_${name.replace(/\s+/g, '_') || 'Quote'}`, data: pdfBase64 }]);
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
          const response = await fetch('/api/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...baseData,
              pdfAttachment: pdfBase64,
              isDuplicate: isDuplicateLead
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
          className="flex flex-col md:flex-row h-screen w-full bg-luxury-paper overflow-hidden font-sans text-luxury-black relative max-w-[1920px] mx-auto"
        >
          {currentUser && (
            <div className="absolute top-0 left-0 w-full bg-luxury-black text-luxury-cream py-1.5 px-4 text-center text-xs font-medium z-50 flex items-center justify-center gap-2 shadow-md">
              <User className="w-3 h-3" />
              Logged in as Contractor: {currentUser.email}
            </div>
          )}

          {/* Left: 3D Visualizer */}
          <div className="flex-1 relative h-[30vh] sm:h-[35vh] md:h-full lg:h-full bg-luxury-cream/30 overflow-hidden">
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
              houseWall={houseWall}
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
          </div>

          {/* Right: Lead Capture Form (Sidebar) */}
          <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[480px] bg-white border-t md:border-t-0 md:border-l border-luxury-cream flex flex-col h-[70vh] sm:h-[65vh] md:h-full lg:h-full shadow-2xl z-20 shrink-0 overflow-y-auto">
            <div className="p-6 lg:p-8 flex flex-col justify-center min-h-full">
              <h3 className="text-2xl font-serif text-luxury-black mb-2">Welcome</h3>
              <p className="text-sm text-slate-500 mb-8">Please enter your details to start configuring your bespoke pergola.</p>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all" placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all" placeholder="john@example.com" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all" placeholder="123 Main St" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                    <input type="text" required value={city} onChange={e => setCity(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-luxury-gold focus:border-transparent outline-none transition-all" placeholder="Toronto" />
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
      <div className={`flex flex-col rounded-xl border transition-all overflow-hidden bg-white ${anySelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200'}`}>
        <div className="w-full h-32 overflow-hidden border-b border-slate-100 relative">
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
          <p className="text-[10px] text-slate-500">Select the sides you would like to add:</p>
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

              return (
                <button
                  key={a.id}
                  onClick={() => toggleAccessory(a.id)}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                    isSelected 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>{sideName}</span>
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
        onClick={() => toggleAccessory(accessory.id)}
        className={`flex flex-col items-start rounded-xl border text-left transition-all overflow-hidden ${
          isSelected 
            ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500' 
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        {accessory.imageUrl && (
          <div className="w-full h-32 overflow-hidden border-b border-slate-100">
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
              <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className={`font-medium text-sm ${isSelected ? 'text-emerald-900' : 'text-slate-900'}`}>
                {accessory.name}
              </span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />}
          </div>
          <p className="text-xs text-slate-500 mb-3 flex-1 mt-2">{description}</p>
          <div className="flex justify-between items-center w-full">
            <p className={`text-sm font-medium ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>
              +{formatCurrency(accessoryCost)}
            </p>
          </div>
          {accessory.id === 'heater' && isSelected && (
            <div className="w-full mt-3 pt-3 border-t border-emerald-100" onClick={(e) => e.stopPropagation()}>
              <label className="block text-[10px] font-bold text-emerald-800 mb-2">Add Smart Control?</label>
              <button
                type="button"
                onClick={() => setHeaterControl(heaterControl === 'dimmer' ? 'switch' : 'dimmer')}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  heaterControl === 'dimmer'
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <img src="/bromic-dimmer.png" alt="Bromic Affinity Smart-Heat Dimmer" className="w-12 h-12 object-contain rounded shrink-0" />
                <div className="flex-1 text-left">
                  <p className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-900' : 'text-slate-800'}`}>
                    Bromic Affinity Smart-Heat Dimmer
                  </p>
                  <p className="text-[10px] text-slate-500">App-controlled dimmer with zones</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-700' : 'text-slate-600'}`}>
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
    <div className="flex flex-col md:flex-row h-screen w-full bg-luxury-paper overflow-hidden font-sans text-luxury-black relative max-w-[1920px] mx-auto">
      <Toaster position="top-center" />
      
      {currentUser && (
        <div className="absolute top-0 left-0 w-full bg-luxury-black text-luxury-cream py-1.5 px-4 text-center text-xs font-medium z-50 flex items-center justify-center gap-2 shadow-md">
          <User className="w-3 h-3" />
          Logged in as Contractor: {currentUser.email}
        </div>
      )}

      {/* Left: 3D Visualizer */}
      <div className="flex-1 relative h-[30vh] sm:h-[35vh] md:h-full lg:h-full bg-luxury-cream/30 overflow-hidden">
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
          houseWall={houseWall}
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

        <div className="absolute bottom-4 left-4 lg:bottom-8 lg:left-8 flex flex-col gap-1 md:gap-3 lg:gap-4 z-10">
          <div className="glass-panel px-3 py-1.5 sm:px-4 sm:py-2 lg:px-5 lg:py-3 rounded-none w-36 sm:w-44 lg:w-56">
            <div className="flex items-center justify-between mb-1 lg:mb-2">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 flex items-center gap-1 lg:gap-1.5 leading-none">
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
              className="w-full h-[2px] lg:h-[1px] bg-luxury-black/10 appearance-none cursor-pointer accent-luxury-gold my-1 lg:my-0"
            />
          </div>

          {(selectedAccessories.has('screen_front') || selectedAccessories.has('screen_back') || selectedAccessories.has('screen_left') || selectedAccessories.has('screen_right')) && (
            <div className="glass-panel px-3 py-1.5 sm:px-4 sm:py-2 lg:px-5 lg:py-3 rounded-none w-36 sm:w-44 lg:w-56">
              <div className="flex items-center justify-between mb-1 lg:mb-2">
                <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 flex items-center gap-1 lg:gap-1.5 leading-none">
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
                className="w-full h-[2px] lg:h-[1px] bg-luxury-black/10 appearance-none cursor-pointer accent-luxury-gold my-1 lg:my-0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right: Sidebar Controls */}
      <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[480px] 2xl:w-[560px] bg-white border-t md:border-t-0 md:border-l border-luxury-cream flex flex-col h-[70vh] sm:h-[65vh] md:h-full lg:h-full shadow-2xl z-20 shrink-0">
        {/* Step Indicator */}
        <div className="px-3 py-3 lg:px-5 lg:py-5 border-b border-luxury-cream bg-luxury-paper/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-luxury-gold uppercase tracking-[0.3em]">Phase {currentStep} / 5</span>
            <span className="text-xs font-serif font-medium text-luxury-black/40 truncate ml-2">
              {currentStep === 1 && <span className="text-base sm:text-lg">Define your space</span>}
              {currentStep === 2 && <span className="text-base sm:text-lg">The Palette</span>}
              {currentStep === 3 && <span className="text-base sm:text-lg"><span className="sm:hidden">Privacy</span><span className="hidden sm:inline">Privacy & Protection</span></span>}
              {currentStep === 4 && <span className="text-base sm:text-lg"><span className="sm:hidden">Features</span><span className="hidden sm:inline">Optional Features</span></span>}
              {currentStep === 5 && <span className="text-base sm:text-lg"><span className="sm:hidden">Summary</span><span className="hidden sm:inline">Specification Summary</span></span>}
            </span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((step) => (
              <button
                key={step}
                onClick={() => step <= currentStep && setCurrentStep(step)}
                disabled={step > currentStep}
                aria-label={`Go to step ${step}`}
                className={`h-[3px] flex-1 transition-all duration-700 ${
                  step <= currentStep ? 'bg-luxury-gold hover:bg-luxury-gold/80 cursor-pointer' : 'bg-luxury-black/5 cursor-not-allowed'
                }`}
              />
            ))}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Foundation</label>
                    <div className="relative">
                      <select
                        value={foundationStatus}
                        onChange={(e) => {
                          setFoundationStatus(e.target.value);
                          setShowFoundationError(false);
                        }}
                        className={`w-full border-b bg-transparent py-2 text-luxury-black font-serif focus:border-luxury-gold focus:outline-none appearance-none cursor-pointer pr-6 text-sm ${showFoundationError ? 'border-red-500' : 'border-luxury-black/10'}`}
                      >
                        <option value="">Select</option>
                        <option value="existing">Existing</option>
                        <option value="needs">Needs</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-luxury-black">
                        <ChevronDown className="w-3 h-3" />
                      </div>
                    </div>
                    {showFoundationError && (
                      <p className="text-red-500 text-[10px] mt-1">Please select a foundation status</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Structure</label>
                    <div className="relative">
                      <select
                        value={houseWall}
                        onChange={(e) => setHouseWall(e.target.value as any)}
                        className="w-full border-b border-luxury-black/10 bg-transparent py-2 text-luxury-black font-serif focus:border-luxury-gold focus:outline-none appearance-none cursor-pointer pr-6 text-sm"
                      >
                        <option value="none">Freestanding</option>
                        <option value="back">Attached (Rear)</option>
                        <option value="front">Attached (Front)</option>
                        <option value="left">Attached (Left)</option>
                        <option value="right">Attached (Right)</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-luxury-black">
                        <ChevronDown className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Width</label>
                    <span className="text-lg font-serif font-medium text-luxury-gold">{width}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setWidth(Math.max(7, width - 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min="7"
                      max="100"
                      step="1"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      aria-label="Pergola width in feet"
                      aria-valuetext={`${width} feet`}
                      className="flex-1 h-[2px] sm:h-[1px] bg-luxury-black/10 appearance-none cursor-pointer accent-luxury-gold"
                    />
                    <button 
                      onClick={() => setWidth(Math.min(100, width + 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Depth</label>
                    <span className="text-lg font-serif font-medium text-luxury-gold">{depth}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setDepth(Math.max(8, depth - 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min="8"
                      max="40"
                      step="1"
                      value={depth}
                      onChange={(e) => setDepth(Number(e.target.value))}
                      aria-label="Pergola depth in feet"
                      aria-valuetext={`${depth} feet`}
                      className="flex-1 h-[2px] sm:h-[1px] bg-luxury-black/10 appearance-none cursor-pointer accent-luxury-gold"
                    />
                    <button 
                      onClick={() => setDepth(Math.min(40, depth + 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Height</label>
                    <span className="text-lg font-serif font-medium text-luxury-gold">{height}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setHeight(Math.max(8, height - 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min="8"
                      max="11"
                      step="1"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      aria-label="Pergola height in feet"
                      aria-valuetext={`${height} feet`}
                      className="flex-1 h-[2px] sm:h-[1px] bg-luxury-black/10 appearance-none cursor-pointer accent-luxury-gold"
                    />
                    <button 
                      onClick={() => setHeight(Math.min(11, height + 1))}
                      className="w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border border-luxury-black/10 hover:border-luxury-gold hover:text-luxury-gold transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-luxury-black/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60">Base Price</span>
                  <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
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
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 mb-2">Frame Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                      {COLORS.filter(c => c.type !== 'wood').map(color => (
                        <button
                          key={`frame-${color.id}`}
                          onClick={() => handleColorSelection(color, setFrameColor, 'frame')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${frameColor === color.hex ? 'border-luxury-gold bg-luxury-paper' : 'border-transparent hover:border-luxury-cream'}`}
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
                    <p className="text-[9px] text-luxury-black/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40 mb-2">Louver Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                      {COLORS.map(color => (
                        <button
                          key={`louver-${color.id}`}
                          onClick={() => handleColorSelection(color, setLouverColor, 'louver')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${louverColor === color.hex ? 'border-luxury-gold bg-luxury-paper' : 'border-transparent hover:border-luxury-cream'}`}
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
                    <p className="text-[9px] text-luxury-black/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>

                </div>

                <div className="mt-4 p-2 bg-luxury-paper border border-luxury-gold/10 rounded-lg space-y-1">
                  <p className="text-[10px] italic text-luxury-black/60 font-medium">
                    *Other colours may affect lead time and pricing
                  </p>
                  <p className="text-[10px] italic text-luxury-black/60 font-medium">
                    *Woodgrain finish may affect lead time as well as cost
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-luxury-black/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60">Base Price</span>
                  <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
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
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Motorized Systems</h4>
                    {renderGroupedAccessory('Motorized Screens', 'screen', Blinds, '/motorizedscreens.png')}
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Fixed Privacy</h4>
                    {renderGroupedAccessory('Privacy Walls', 'wall', PanelRight, '/privacywall.png')}
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Privacy Wall Finish</h4>
                    <div className="grid grid-cols-4 sm:grid-cols-[repeat(7,minmax(0,1fr))] gap-2 sm:gap-1">
                      {COLORS.map(color => (
                        <button
                          key={`wall-${color.id}`}
                          onClick={() => handleColorSelection(color, setWallColor, 'wall')}
                          className={`group flex flex-col items-center p-1 transition-all border relative ${wallColor === color.hex ? 'border-luxury-gold bg-luxury-paper' : 'border-transparent hover:border-luxury-cream'}`}
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
                    <p className="text-[9px] text-luxury-black/60 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-luxury-black/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60">Base Price</span>
                  <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
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
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Enhance Your Experience</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {ACCESSORIES.filter(a => ['sensor', 'app_control', 'fan', 'heater'].includes(a.id))
                      .sort((a, b) => {
                        const order = ['sensor', 'app_control', 'fan', 'heater'];
                        return order.indexOf(a.id) - order.indexOf(b.id);
                      })
                      .map(renderAccessory)}
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-luxury-black/10 flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-luxury-black/60">Base Price</span>
                  <span className="text-2xl font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
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
                  <div className="border border-luxury-cream p-4 space-y-4">
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
                        </div>
                        <span className="text-lg font-serif text-luxury-gold">{formatCurrency(basePrice || 0)}</span>
                      </div>
                      {louverColor === '#8B5A2B' && (
                        <div className="flex justify-between items-center text-[10px] pl-3 mt-2">
                          <span className="font-serif text-luxury-black/60 italic font-bold">Woodgrain Louver Upgrade</span>
                          <span className="font-serif text-luxury-black/60 italic font-bold">{formatCurrency(calculateLouverCount(width, depth) * 150)}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {Array.from(selectedAccessories).map(id => {
                        const accessory = ACCESSORIES.find(a => a.id === id);
                        if (!accessory) return null;
                        
                        let cost = 0;
                        let breakdown: { price: number }[] | null = null;
                        let wallWoodgrainCost = 0;
                        let wallWoodgrainCount = 0;

                        if (accessory.type === 'flat') {
                          cost = accessory.price;
                          if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
                        } else if (accessory.type === 'sqft') {
                          cost = accessory.price * (depth * width);
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
                            <div className="pl-3 mt-1 space-y-0.5 border-l border-luxury-black/10">
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
                              <span className="font-serif text-luxury-black/60">{accessory.name} {accessory.type.includes('wall') && `(${COLORS.find(c => c.hex === wallColor)?.name})`}</span>
                              <span className="font-serif text-luxury-black/80">{formatCurrency(cost)}</span>
                            </div>
                            {breakdownRender}
                            {wallWoodgrainCost > 0 && (
                              <div className="flex justify-between items-center text-[10px] pl-3 mt-1">
                                <span className="font-serif text-luxury-black/40 italic font-bold">Woodgrain Upgrade</span>
                                <span className="font-serif text-luxury-black/60 italic font-bold">{formatCurrency(wallWoodgrainCost)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-luxury-black/10 flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-[0.3em] font-bold text-luxury-black/40">Total Investment</span>
                      </div>
                      <span className="text-2xl font-serif text-luxury-black">{formatCurrency(totalPrice || 0)}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-luxury-black/40">Contact Information</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="border-b border-luxury-black/10 py-1">
                        <span className="text-[10px] uppercase text-luxury-black/40 block mb-1">Name</span>
                        <span className="font-serif text-sm">{name}</span>
                      </div>
                      <div className="border-b border-luxury-black/10 py-1">
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
        <div className="px-4 py-3 lg:px-6 lg:py-4 border-t border-luxury-cream bg-white shrink-0 relative">
          {/* Sticky Price Display */}
          {currentStep < 5 && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-luxury-cream/50">
              <span className="text-[9px] uppercase tracking-widest font-bold text-luxury-black/40">Estimate</span>
              <span className="text-lg font-serif text-luxury-gold">{formatCurrency(displayedBasePrice)}</span>
            </div>
          )}
          {submitSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-full left-4 right-4 mb-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg border border-emerald-200 text-[10px] font-medium flex items-center gap-2 z-50"
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
                      onClick={() => handleSubmission('email')}
                      disabled={isSubmitting || isGeneratingPDF}
                      className="luxury-button flex-1 lg:flex-none lg:px-12 py-2.5 text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSubmitting || isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Quote to CRM'}
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleSubmission('email')}
                        disabled={isSubmitting || isGeneratingPDF}
                        className="luxury-button-outline flex-1 lg:flex-none lg:px-8 py-2.5 text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting || isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Email Quote'}
                      </button>
                      <button 
                        onClick={() => handleSubmission('consultation')}
                        disabled={isSubmitting || isGeneratingPDF}
                        className="luxury-button flex-1 lg:flex-none lg:px-8 py-2.5 text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting || isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Request Consultation'}
                      </button>
                    </>
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
              className="bg-white p-8 max-w-md w-full shadow-2xl border border-luxury-gold/20 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-luxury-gold/10 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8 text-luxury-gold" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-serif text-luxury-black">Foundation Required</h3>
                <p className="text-sm text-luxury-black/60 leading-relaxed">
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
      <ProposalDocument data={pdfData} isGeneratingPDF={isGeneratingPDF} />
      <Toaster position="top-center" />
      
      {/* Admin Link */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[60] opacity-20 hover:opacity-100 transition-opacity">
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

