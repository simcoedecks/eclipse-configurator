import { useState, useMemo, Suspense } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  Check,
  Sun,
  Blinds,
  PanelRight,
  Plus,
  Minus,
  Save,
  Send,
  Download,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import PergolaVisualizer from '../../shared/components/PergolaVisualizer';
import {
  SCREEN_PRICES,
  getMarkup,
  calculateLouverCount,
  calculateScreenPrice,
  getScreenDescription,
  formatCurrency,
} from '../../shared/lib/pricing';
import { type AccessoryType, type Accessory, ACCESSORIES } from '../../shared/lib/accessories';
import { COLORS, getColorName } from '../../shared/lib/colors';
import PricingOverlay, { type PricingLineItem } from '../components/PricingOverlay';
import type { ContractorData } from '../components/AuthGuard';

// ---------- price helpers (mirrored from retail Home.tsx) ----------
function calculateBasePrice(depth: number, width: number): number | null {
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

// ---------- component ----------
interface ProConfiguratorProps {
  contractor: ContractorData;
}

export default function ProConfigurator({ contractor }: ProConfiguratorProps) {
  // --- Customer info ---
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [projectNotes, setProjectNotes] = useState('');

  // --- Pergola config ---
  const [depth, setDepth] = useState<number>(16);
  const [width, setWidth] = useState<number>(12);
  const [height, setHeight] = useState<number>(9);
  const [frameColor, setFrameColor] = useState<string>('#0A0A0A');
  const [louverColor, setLouverColor] = useState<string>('#F6F6F6');
  const [louverAngle, setLouverAngle] = useState<number>(60);
  const [screenDrop, setScreenDrop] = useState<number>(100);
  const [guillotineOpen, setGuillotineOpen] = useState<number>(0);
  const [houseWall, setHouseWall] = useState<'none' | 'back' | 'left' | 'right' | 'front'>('none');
  const [selectedAccessories, setSelectedAccessories] = useState<Set<string>>(new Set());
  const [wallColor, setWallColor] = useState<string>('#0A0A0A');
  const [houseWallColor] = useState<string>('#82A0C2');
  const [heaterControl, setHeaterControl] = useState<'switch' | 'dimmer'>('switch');
  const [foundationStatus, setFoundationStatus] = useState<string>('');
  const [showFoundationError, setShowFoundationError] = useState(false);

  const [currentStep, setCurrentStep] = useState<number>(1);

  // --- Color handler ---
  const handleColorSelection = (color: { hex: string }, setter: (hex: string) => void, prefix: string) => {
    setter(color.hex);
    if (prefix === 'frame') {
      setWallColor(color.hex);
    }
  };

  // --- Derived pricing ---
  const basePrice = useMemo(() => calculateBasePrice(depth, width), [depth, width]);

  const hasMiddlePosts = width * depth > 260;
  const numBaysX = Math.ceil(width / 13);
  const numBaysZ = Math.ceil(depth / 20);
  const numScreenBaysX = (hasMiddlePosts && numBaysX > 1) || width > 20 ? numBaysX : 1;
  const numScreenBaysZ = (hasMiddlePosts && numBaysZ > 1) || depth > 20 ? numBaysZ : 1;

  const accessoriesPrice = useMemo(() => {
    let total = 0;
    const sqft = depth * width;
    const wallUnitPrice = sqft < 120 ? 60 : 55;

    selectedAccessories.forEach((id) => {
      const accessory = ACCESSORIES.find((a) => a.id === id);
      if (accessory) {
        if (accessory.type === 'flat') {
          total += accessory.price;
          if (id === 'heater' && heaterControl === 'dimmer') total += 1031;
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
      total += calculateLouverCount(width, depth) * 150;
    }

    if (isWoodgrainWalls) {
      const numPanelsPerBay = Math.ceil((height * 12) / 7);
      selectedAccessories.forEach((id) => {
        const accessory = ACCESSORIES.find((a) => a.id === id);
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
    return basePrice + accessoriesPrice + woodgrainUpgrade;
  }, [basePrice, accessoriesPrice, woodgrainUpgrade]);

  // --- Itemized accessories for pricing overlay ---
  const itemizedAccessories = useMemo(() => {
    const sqft = width * depth;
    const wallUnitPrice = sqft < 120 ? 60 : 55;
    const louverCount = calculateLouverCount(width, depth);
    const louverUpgrade = louverColor === '#8B5A2B' ? louverCount * 150 : 0;

    const items = Array.from(selectedAccessories).flatMap((id) => {
      const acc = ACCESSORIES.find((a) => a.id === id);
      if (!acc) return [];

      if (acc.type === 'screen_width') {
        const base = Math.floor(width / numScreenBaysX);
        const remainder = width % numScreenBaysX;
        const screens = [];
        for (let i = 0; i < numScreenBaysX; i++) {
          const screenLength = base + (i < remainder ? 1 : 0);
          const price = (SCREEN_PRICES[height]?.[screenLength] || 0) * 1.05;
          screens.push({ name: `${acc.name} (${screenLength}')`, cost: price });
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
          screens.push({ name: `${acc.name} (${screenLength}')`, cost: price });
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
          walls.push({ name: `${acc.name} (${wallLength.toFixed(1)}')`, cost: price });
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
          walls.push({ name: `${acc.name} (${wallLength.toFixed(1)}')`, cost: price });
        }
        return walls;
      }

      let cost = acc.price;
      if (acc.type === 'sqft') cost = acc.price * sqft;
      if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
      return [{ name: acc.name, cost }];
    });

    if (louverUpgrade > 0) {
      items.push({ name: `Woodgrain Louver Upgrade (${louverCount} louvers)`, cost: louverUpgrade });
    }

    return items;
  }, [selectedAccessories, width, depth, height, numScreenBaysX, numScreenBaysZ, wallColor, louverColor, heaterControl]);

  // --- Pricing overlay data ---
  const pricingItems = useMemo(() => {
    const discount = contractor.discountPercentage / 100;
    const items: PricingLineItem[] = [
      {
        name: `Motorized Louvered Pergola (${width}' x ${depth}')`,
        retailPrice: basePrice || 0,
        contractorCost: (basePrice || 0) * (1 - discount),
      },
    ];

    itemizedAccessories.forEach((acc) => {
      items.push({
        name: acc.name,
        retailPrice: acc.cost,
        contractorCost: acc.cost * (1 - discount),
      });
    });

    return items;
  }, [basePrice, itemizedAccessories, contractor.discountPercentage, width, depth]);

  // --- Display price (rolling total shown in footer) ---
  const displayedBasePrice = useMemo(() => {
    let total = basePrice || 0;
    if (louverColor === '#8B5A2B') {
      total += calculateLouverCount(width, depth) * 150;
    }
    if (currentStep >= 3) {
      total += accessoriesPrice + woodgrainUpgrade - (louverColor === '#8B5A2B' ? calculateLouverCount(width, depth) * 150 : 0);
    }
    return total;
  }, [basePrice, louverColor, width, depth, currentStep, accessoriesPrice, woodgrainUpgrade]);

  const toggleAccessory = (id: string) => {
    const next = new Set(selectedAccessories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccessories(next);
  };

  // --- Grouped accessory renderer (screens / walls) ---
  const renderGroupedAccessory = (title: string, prefix: string, icon: React.ElementType, imageUrl: string) => {
    const groupAccessories = ACCESSORIES.filter((a) => a.id.startsWith(prefix));
    const anySelected = groupAccessories.some((a) => selectedAccessories.has(a.id));
    const Icon = icon as any;

    return (
      <div className={`flex flex-col rounded-xl border transition-all overflow-hidden bg-[#111] ${anySelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-[#222]'}`}>
        <div className="w-full h-32 overflow-hidden border-b border-[#222] relative">
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
            <div className="flex items-center gap-2 text-white">
              <Icon className="w-4 h-4" />
              <span className="font-bold text-sm">{title}</span>
            </div>
          </div>
        </div>
        <div className="p-2 space-y-2">
          <p className="text-[10px] text-gray-500">Select the sides you would like to add:</p>
          <div className="grid grid-cols-2 gap-1">
            {groupAccessories.map((a) => {
              const isSelected = selectedAccessories.has(a.id);
              const sideName = a.name.split('(')[1].replace(')', '');
              let cost = 0;
              const wallUnitPrice = width * depth < 120 ? 60 : 55;
              if (a.type === 'screen_width') cost = calculateScreenPrice(width, height, numScreenBaysX);
              else if (a.type === 'screen_depth') cost = calculateScreenPrice(depth, height, numScreenBaysZ);
              else if (a.type === 'wall_width') {
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
              } else cost = a.price;

              return (
                <button
                  key={a.id}
                  onClick={() => toggleAccessory(a.id)}
                  className={`flex items-center justify-between px-2 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-[#222] bg-[#0a0a0a] text-gray-400 hover:border-[#333]'
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

  // --- Single accessory renderer ---
  const renderAccessory = (accessory: Accessory) => {
    const isSelected = selectedAccessories.has(accessory.id);
    const Icon = accessory.icon as any;
    let accessoryCost = 0;
    let description = accessory.description;
    const wallUnitPrice = width * depth < 120 ? 60 : 55;

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
      description = `${accessory.description} (${width}' x ${height}' = ${width * height} sq ft)`;
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
      description = `${accessory.description} (${depth}' x ${height}' = ${depth * height} sq ft)`;
    }

    return (
      <button
        key={accessory.id}
        onClick={() => toggleAccessory(accessory.id)}
        className={`flex flex-col items-start rounded-xl border text-left transition-all overflow-hidden ${
          isSelected
            ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
            : 'border-[#222] bg-[#111] hover:border-[#333]'
        }`}
      >
        {accessory.imageUrl && (
          <div className="w-full h-32 overflow-hidden border-b border-[#222]">
            <img src={accessory.imageUrl} alt={accessory.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="p-4 w-full flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-gray-500'}`} />
              <span className={`font-medium text-sm ${isSelected ? 'text-emerald-300' : 'text-gray-200'}`}>{accessory.name}</span>
            </div>
            {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />}
          </div>
          <p className="text-xs text-gray-500 mb-3 flex-1 mt-2">{description}</p>
          <div className="flex justify-between items-center w-full">
            <p className={`text-sm font-medium ${isSelected ? 'text-emerald-400' : 'text-gray-400'}`}>+{formatCurrency(accessoryCost)}</p>
          </div>
          {accessory.id === 'heater' && isSelected && (
            <div className="w-full mt-3 pt-3 border-t border-emerald-500/20" onClick={(e) => e.stopPropagation()}>
              <label className="block text-[10px] font-bold text-emerald-400 mb-2">Add Smart Control?</label>
              <button
                type="button"
                onClick={() => setHeaterControl(heaterControl === 'dimmer' ? 'switch' : 'dimmer')}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  heaterControl === 'dimmer'
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                    : 'border-[#222] bg-[#0a0a0a] hover:border-[#333]'
                }`}
              >
                <img src="/bromic-dimmer.png" alt="Bromic Affinity Smart-Heat Dimmer" className="w-12 h-12 object-contain rounded shrink-0" />
                <div className="flex-1 text-left">
                  <p className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-300' : 'text-gray-300'}`}>Bromic Affinity Smart-Heat Dimmer</p>
                  <p className="text-[10px] text-gray-500">App-controlled dimmer with zones</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-xs font-medium ${heaterControl === 'dimmer' ? 'text-emerald-400' : 'text-gray-400'}`}>+{formatCurrency(1031)}</span>
                  {heaterControl === 'dimmer' && <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5" />}
                </div>
              </button>
            </div>
          )}
        </div>
      </button>
    );
  };

  // --- Step labels ---
  const stepLabels = ['Customer Info', 'Dimensions & Colors', 'Privacy & Protection', 'Optional Features', 'Summary'];

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-57px)] w-full bg-[#0a0a0a] overflow-hidden text-gray-200">
      <Toaster position="top-center" theme="dark" />

      {/* Left: 3D Visualizer + Pricing Overlay */}
      <div className="flex-1 flex flex-col h-[30vh] sm:h-[35vh] md:h-full overflow-hidden">
        {/* 3D Visualizer */}
        <div className="flex-1 relative bg-[#111] overflow-hidden">
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
            houseWall={houseWall}
          />

          {/* Controls overlay on visualizer */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-[#333]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-1">
                  <Sun className="w-3 h-3" /> Louvers
                </span>
                <span className="text-[10px] font-medium text-[#C5A059]">{louverAngle}&deg;</span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                value={louverAngle}
                onChange={(e) => setLouverAngle(Number(e.target.value))}
                className="w-32 h-[2px] bg-gray-600 appearance-none cursor-pointer accent-[#C5A059]"
              />
            </div>

            {(selectedAccessories.has('screen_front') || selectedAccessories.has('screen_back') || selectedAccessories.has('screen_left') || selectedAccessories.has('screen_right')) && (
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded border border-[#333]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-1">
                    <Blinds className="w-3 h-3" /> Screens
                  </span>
                  <span className="text-[10px] font-medium text-[#C5A059]">{screenDrop}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={screenDrop}
                  onChange={(e) => setScreenDrop(Number(e.target.value))}
                  className="w-32 h-[2px] bg-gray-600 appearance-none cursor-pointer accent-[#C5A059]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Pricing Overlay below visualizer (hidden on mobile in compact view) */}
        <div className="hidden md:block p-3 border-t border-[#222] bg-[#0a0a0a] overflow-y-auto max-h-[40%]">
          <PricingOverlay items={pricingItems} discountPercentage={contractor.discountPercentage} />
        </div>
      </div>

      {/* Right: Sidebar Controls */}
      <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[480px] 2xl:w-[560px] bg-[#111] border-t md:border-t-0 md:border-l border-[#222] flex flex-col h-[70vh] sm:h-[65vh] md:h-full shadow-2xl z-20 shrink-0">
        {/* Step Indicator */}
        <div className="px-3 py-3 lg:px-5 lg:py-4 border-b border-[#222] bg-[#0a0a0a] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#C5A059] uppercase tracking-[0.3em]">Phase {currentStep} / 5</span>
            <span className="text-base font-medium text-gray-400">{stepLabels[currentStep - 1]}</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((step) => (
              <button
                key={step}
                onClick={() => step <= currentStep && setCurrentStep(step)}
                disabled={step > currentStep}
                className={`h-[3px] flex-1 transition-all duration-700 ${step <= currentStep ? 'bg-[#C5A059] hover:bg-[#C5A059]/80 cursor-pointer' : 'bg-white/5 cursor-not-allowed'}`}
              />
            ))}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
          {/* STEP 1: Customer Info */}
          {currentStep === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-4">
                <div className="border border-[#222] bg-[#0a0a0a] rounded-lg p-3">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[#C5A059]">{contractor.companyName}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{contractor.contactName} &middot; {contractor.discountPercentage}% discount</p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Client Name *</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Phone *</label>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all" placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Email *</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all" placeholder="john@example.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Address</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all" placeholder="123 Main St" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">City *</label>
                    <input type="text" required value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all" placeholder="Toronto" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Project Notes (Internal)</label>
                  <textarea
                    value={projectNotes}
                    onChange={(e) => setProjectNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[#222] bg-[#0a0a0a] text-gray-200 text-sm focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all resize-none"
                    placeholder="Internal notes about this project..."
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Dimensions & Colors */}
          {currentStep === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Foundation</label>
                    <div className="relative">
                      <select
                        value={foundationStatus}
                        onChange={(e) => { setFoundationStatus(e.target.value); setShowFoundationError(false); }}
                        className={`w-full border-b bg-transparent py-2 text-gray-200 focus:border-[#C5A059] focus:outline-none appearance-none cursor-pointer pr-6 text-sm ${showFoundationError ? 'border-red-500' : 'border-[#333]'}`}
                      >
                        <option value="">Select</option>
                        <option value="existing">Existing</option>
                        <option value="needs">Needs</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><ChevronDown className="w-3 h-3" /></div>
                    </div>
                    {showFoundationError && <p className="text-red-500 text-[10px] mt-1">Please select a foundation status</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Structure</label>
                    <div className="relative">
                      <select
                        value={houseWall}
                        onChange={(e) => setHouseWall(e.target.value as any)}
                        className="w-full border-b border-[#333] bg-transparent py-2 text-gray-200 focus:border-[#C5A059] focus:outline-none appearance-none cursor-pointer pr-6 text-sm"
                      >
                        <option value="none">Freestanding</option>
                        <option value="back">Attached (Rear)</option>
                        <option value="front">Attached (Front)</option>
                        <option value="left">Attached (Left)</option>
                        <option value="right">Attached (Right)</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><ChevronDown className="w-3 h-3" /></div>
                    </div>
                  </div>
                </div>

                {/* Width slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Width</label>
                    <span className="text-lg font-medium text-[#C5A059]">{width}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setWidth(Math.max(7, width - 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Minus className="w-3 h-3" /></button>
                    <input type="range" min="7" max="100" step="1" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="flex-1 h-[2px] bg-[#333] appearance-none cursor-pointer accent-[#C5A059]" />
                    <button onClick={() => setWidth(Math.min(100, width + 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>

                {/* Depth slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Depth</label>
                    <span className="text-lg font-medium text-[#C5A059]">{depth}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setDepth(Math.max(8, depth - 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Minus className="w-3 h-3" /></button>
                    <input type="range" min="8" max="40" step="1" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="flex-1 h-[2px] bg-[#333] appearance-none cursor-pointer accent-[#C5A059]" />
                    <button onClick={() => setDepth(Math.min(40, depth + 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>

                {/* Height slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Height</label>
                    <span className="text-lg font-medium text-[#C5A059]">{height}'</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setHeight(Math.max(8, height - 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Minus className="w-3 h-3" /></button>
                    <input type="range" min="8" max="11" step="1" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="flex-1 h-[2px] bg-[#333] appearance-none cursor-pointer accent-[#C5A059]" />
                    <button onClick={() => setHeight(Math.min(11, height + 1))} className="w-8 h-8 flex items-center justify-center rounded-full border border-[#333] hover:border-[#C5A059] hover:text-[#C5A059] transition-colors shrink-0 text-gray-400"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>

                {/* Color pickers */}
                <div className="pt-4 border-t border-[#222]">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Frame Finish</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                    {COLORS.filter((c) => c.type !== 'wood').map((color) => (
                      <button
                        key={`frame-${color.id}`}
                        onClick={() => handleColorSelection(color, setFrameColor, 'frame')}
                        className={`group flex flex-col items-center p-1 transition-all border relative ${frameColor === color.hex ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-transparent hover:border-[#333]'}`}
                      >
                        {color.isStandard && (
                          <div className="absolute top-0 right-0 px-1 py-0.5 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-[2px]">
                            <span className="text-[5px] uppercase tracking-widest font-bold text-[#C5A059]">Std</span>
                          </div>
                        )}
                        <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-white/10" style={{ backgroundColor: color.hex }} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight text-gray-400">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2">Louver Finish</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                    {COLORS.map((color) => (
                      <button
                        key={`louver-${color.id}`}
                        onClick={() => handleColorSelection(color, setLouverColor, 'louver')}
                        className={`group flex flex-col items-center p-1 transition-all border relative ${louverColor === color.hex ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-transparent hover:border-[#333]'}`}
                      >
                        {color.isStandard && (
                          <div className="absolute top-0 right-0 px-1 py-0.5 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-[2px]">
                            <span className="text-[5px] uppercase tracking-widest font-bold text-[#C5A059]">Std</span>
                          </div>
                        )}
                        <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-white/10" style={{ backgroundColor: color.hex }} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight text-gray-400">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-2 bg-[#0a0a0a] border border-[#C5A059]/10 rounded-lg space-y-1">
                  <p className="text-[10px] italic text-gray-500">*Non standard colours may affect lead time and pricing</p>
                  <p className="text-[10px] italic text-gray-500">*Woodgrain finish may affect lead time as well as cost</p>
                </div>

                <div className="mt-4 pt-4 border-t border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Base Price</span>
                  <span className="text-2xl font-medium text-[#C5A059]">{formatCurrency(displayedBasePrice)}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Privacy & Protection */}
          {currentStep === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Motorized Systems</h4>
                  {renderGroupedAccessory('Motorized Screens', 'screen', Blinds, '/motorizedscreens.png')}
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Fixed Privacy</h4>
                  {renderGroupedAccessory('Privacy Walls', 'wall', PanelRight, '/privacywall.png')}
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Privacy Wall Finish</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-1">
                    {COLORS.map((color) => (
                      <button
                        key={`wall-${color.id}`}
                        onClick={() => handleColorSelection(color, setWallColor, 'wall')}
                        className={`group flex flex-col items-center p-1 transition-all border relative ${wallColor === color.hex ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-transparent hover:border-[#333]'}`}
                      >
                        {color.isStandard && (
                          <div className="absolute top-0 right-0 px-1 py-0.5 bg-[#C5A059]/10 border border-[#C5A059]/20 rounded-[2px]">
                            <span className="text-[5px] uppercase tracking-widest font-bold text-[#C5A059]">Std</span>
                          </div>
                        )}
                        <div className="w-6 h-6 rounded-full mb-1 shadow-sm border border-white/10 relative overflow-hidden" style={{ backgroundColor: color.hex }}>
                          {color.type === 'wood' && (
                            <div className="absolute inset-0 opacity-40 mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(139, 90, 43, 0.4), rgba(139, 90, 43, 0.4) 10px, rgba(160, 106, 59, 0.4) 10px, rgba(160, 106, 59, 0.4) 20px)' }} />
                          )}
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-tighter text-center leading-tight text-gray-400">{color.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-2 italic">*Non standard colours may affect lead time and pricing</p>
                </div>

                <div className="mt-4 pt-4 border-t border-[#222] flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Running Total</span>
                  <span className="text-2xl font-medium text-[#C5A059]">{formatCurrency(displayedBasePrice)}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Optional Features */}
          {currentStep === 4 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Enhance Your Experience</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ACCESSORIES.filter((a) => ['sensor', 'app_control', 'fan', 'heater'].includes(a.id))
                    .sort((a, b) => {
                      const order = ['sensor', 'app_control', 'fan', 'heater'];
                      return order.indexOf(a.id) - order.indexOf(b.id);
                    })
                    .map(renderAccessory)}
                </div>
              </div>
              <div className="pt-4 border-t border-[#222] flex justify-between items-center">
                <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Running Total</span>
                <span className="text-2xl font-medium text-[#C5A059]">{formatCurrency(displayedBasePrice)}</span>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Summary */}
          {currentStep === 5 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="space-y-4">
                <div className="border border-[#222] bg-[#0a0a0a] rounded-lg p-4 space-y-4">
                  <div className="flex flex-col border-b border-[#222] pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-lg font-medium text-gray-200 mb-1">Bespoke Pergola</h4>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest leading-relaxed">
                          {width}' x {depth}' x {height}' <br />
                          {COLORS.find((c) => c.hex === frameColor)?.name} Frame <br />
                          {COLORS.find((c) => c.hex === louverColor)?.name} Louvers <br />
                          {foundationStatus && (
                            <>Foundation: {foundationStatus === 'existing' ? 'Existing Foundation' : 'Needs Foundation'}<br /></>
                          )}
                        </p>
                      </div>
                      <span className="text-lg font-medium text-[#C5A059]">{formatCurrency(basePrice || 0)}</span>
                    </div>
                    {louverColor === '#8B5A2B' && (
                      <div className="flex justify-between items-center text-[10px] pl-3 mt-2">
                        <span className="text-gray-500 italic font-bold">Woodgrain Louver Upgrade</span>
                        <span className="text-gray-400 italic font-bold">{formatCurrency(calculateLouverCount(width, depth) * 150)}</span>
                      </div>
                    )}
                  </div>

                  {/* Accessories list */}
                  <div className="space-y-2">
                    {Array.from(selectedAccessories).map((id) => {
                      const accessory = ACCESSORIES.find((a) => a.id === id);
                      if (!accessory) return null;
                      let cost = 0;
                      const wallUnitPrice = width * depth < 120 ? 60 : 55;

                      if (accessory.type === 'flat') {
                        cost = accessory.price;
                        if (id === 'heater' && heaterControl === 'dimmer') cost += 1031;
                      } else if (accessory.type === 'sqft') {
                        cost = accessory.price * (depth * width);
                      } else if (accessory.type === 'screen_width') {
                        cost = calculateScreenPrice(width, height, numScreenBaysX);
                      } else if (accessory.type === 'screen_depth') {
                        cost = calculateScreenPrice(depth, height, numScreenBaysZ);
                      } else if (accessory.type === 'wall_width') {
                        cost = width * height * wallUnitPrice;
                        if (wallColor === '#8B5A2B') {
                          const numPanelsPerBay = Math.ceil((height * 12) / 7);
                          const panelLength = width / numScreenBaysX;
                          for (let i = 0; i < numScreenBaysX; i++) {
                            cost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
                          }
                        }
                      } else if (accessory.type === 'wall_depth') {
                        cost = depth * height * wallUnitPrice;
                        if (wallColor === '#8B5A2B') {
                          const numPanelsPerBay = Math.ceil((height * 12) / 7);
                          const panelLength = depth / numScreenBaysZ;
                          for (let i = 0; i < numScreenBaysZ; i++) {
                            cost += numPanelsPerBay * (panelLength < 12 ? 100 : 150);
                          }
                        }
                      }

                      return (
                        <div key={id} className="flex justify-between items-center text-[11px]">
                          <span className="text-gray-400">{accessory.name}</span>
                          <span className="text-gray-300">{formatCurrency(cost)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-[#222] flex justify-between items-end">
                    <span className="text-[8px] uppercase tracking-[0.3em] font-bold text-gray-500">Retail Total</span>
                    <span className="text-2xl font-medium text-gray-200">{formatCurrency(totalPrice || 0)}</span>
                  </div>
                </div>

                {/* Contact summary */}
                <div className="space-y-3">
                  <h4 className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Client Information</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {name && (
                      <div className="border-b border-[#222] py-1">
                        <span className="text-[10px] uppercase text-gray-600 block mb-0.5">Name</span>
                        <span className="text-sm text-gray-300">{name}</span>
                      </div>
                    )}
                    {email && (
                      <div className="border-b border-[#222] py-1">
                        <span className="text-[10px] uppercase text-gray-600 block mb-0.5">Email</span>
                        <span className="text-sm text-gray-300">{email}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="border-b border-[#222] py-1">
                        <span className="text-[10px] uppercase text-gray-600 block mb-0.5">Phone</span>
                        <span className="text-sm text-gray-300">{phone}</span>
                      </div>
                    )}
                    {city && (
                      <div className="border-b border-[#222] py-1">
                        <span className="text-[10px] uppercase text-gray-600 block mb-0.5">City</span>
                        <span className="text-sm text-gray-300">{city}</span>
                      </div>
                    )}
                    {projectNotes && (
                      <div className="border-b border-[#222] py-1">
                        <span className="text-[10px] uppercase text-gray-600 block mb-0.5">Project Notes</span>
                        <span className="text-sm text-gray-300 whitespace-pre-wrap">{projectNotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile pricing overlay */}
                <div className="md:hidden">
                  <PricingOverlay items={pricingItems} discountPercentage={contractor.discountPercentage} />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-4 py-3 lg:px-6 lg:py-4 border-t border-[#222] bg-[#111] shrink-0">
          {/* Sticky price */}
          {currentStep < 5 && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#222]">
              <span className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Estimate</span>
              <span className="text-lg font-medium text-[#C5A059]">{formatCurrency(displayedBasePrice)}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between gap-2">
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                className="px-6 py-2.5 text-[11px] border border-[#333] text-gray-400 hover:border-[#C5A059] hover:text-[#C5A059] rounded transition-colors"
              >
                Back
              </button>
            )}

            <div className="flex gap-2 ml-auto">
              {currentStep < 5 ? (
                <button
                  onClick={() => {
                    if (currentStep === 2 && !foundationStatus) {
                      setShowFoundationError(true);
                    } else {
                      setCurrentStep((s) => s + 1);
                    }
                  }}
                  className="px-8 py-2.5 text-[11px] bg-[#C5A059] text-black font-bold rounded hover:bg-[#C5A059]/90 transition-colors"
                >
                  Continue
                </button>
              ) : (
                <>
                  <button
                    onClick={() => toast.success('Quote saved as draft')}
                    className="px-4 py-2.5 text-[11px] border border-[#333] text-gray-400 hover:border-[#C5A059] hover:text-[#C5A059] rounded transition-colors flex items-center gap-1.5"
                  >
                    <Save className="w-3 h-3" /> Save as Draft
                  </button>
                  <button
                    onClick={() => toast.success('Quote sent to client')}
                    className="px-4 py-2.5 text-[11px] bg-[#C5A059] text-black font-bold rounded hover:bg-[#C5A059]/90 transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3 h-3" /> Send to Client
                  </button>
                  <button
                    onClick={() => toast.success('Cost sheet downloaded')}
                    className="px-4 py-2.5 text-[11px] border border-[#333] text-gray-400 hover:border-[#C5A059] hover:text-[#C5A059] rounded transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3 h-3" /> Cost Sheet
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
