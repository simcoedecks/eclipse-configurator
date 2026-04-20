import {
  Lightbulb,
  Wind,
  Thermometer,
  Fan,
  Blinds,
  PanelRight,
  Smartphone,
  Speaker,
} from 'lucide-react';

export type AccessoryType = 'flat' | 'sqft' | 'screen_width' | 'screen_depth' | 'wall_width' | 'wall_depth';

export interface Accessory {
  id: string;
  name: string;
  price: number;
  type: AccessoryType;
  icon: React.ElementType;
  description: string;
  imageUrl?: string;
  /** If true, customer can add multiple of this item (e.g. heaters, fans). */
  quantifiable?: boolean;
  /** Maximum quantity if quantifiable (default 4). */
  maxQuantity?: number;
}

export const ACCESSORIES: Accessory[] = [
  { id: 'led', name: 'Integrated LED Lighting', price: 1500, type: 'flat', icon: Lightbulb, description: 'Perimeter lighting system', imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400&h=300' },
  { id: 'sensor', name: 'Wind & Rain Sensor', price: 550, type: 'flat', icon: Wind, description: 'Automated weather sensor that detects wind, rain and temperature changes to automatically close louvers and protect your outdoor space', imageUrl: '/wind-rain-sensor.jpg' },
  { id: 'heater', name: 'Bromic Platinum Smart-Heat 4500W', price: 3431, type: 'flat', icon: Thermometer, description: '4500W premium infrared electric patio heater with sleek low-profile design. Provides powerful radiant heat for year-round outdoor comfort. Installation by a licensed electrician at additional cost.*', imageUrl: '/bromic-heater.jpg', quantifiable: true, maxQuantity: 6 },
  { id: 'fan', name: 'Ceiling Fan', price: 2750, type: 'flat', icon: Fan, description: 'Outdoor-rated ceiling fan with integrated LED light and remote control. Designed for wet locations with weather-resistant construction and quiet motor', imageUrl: '/ceiling-fan.jpg', quantifiable: true, maxQuantity: 4 },
  { id: 'screen_front', name: 'Motorized Screen (Front)', price: 0, type: 'screen_width', icon: Blinds, description: 'Retractable screen for front side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_back', name: 'Motorized Screen (Back)', price: 0, type: 'screen_width', icon: Blinds, description: 'Retractable screen for back side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_left', name: 'Motorized Screen (Left)', price: 0, type: 'screen_depth', icon: Blinds, description: 'Retractable screen for left side', imageUrl: '/motorizedscreens.png' },
  { id: 'screen_right', name: 'Motorized Screen (Right)', price: 0, type: 'screen_depth', icon: Blinds, description: 'Retractable screen for right side', imageUrl: '/motorizedscreens.png' },
  { id: 'wall_front', name: 'Privacy Wall (Front)', price: 55, type: 'wall_width', icon: PanelRight, description: 'Fixed privacy wall for front side', imageUrl: '/privacywall.png' },
  { id: 'wall_back', name: 'Privacy Wall (Back)', price: 55, type: 'wall_width', icon: PanelRight, description: 'Fixed privacy wall for back side', imageUrl: '/privacywall.png' },
  { id: 'wall_left', name: 'Privacy Wall (Left)', price: 55, type: 'wall_depth', icon: PanelRight, description: 'Fixed privacy wall for left side', imageUrl: '/privacywall.png' },
  { id: 'wall_right', name: 'Privacy Wall (Right)', price: 55, type: 'wall_depth', icon: PanelRight, description: 'Fixed privacy wall for right side', imageUrl: '/privacywall.png' },
  { id: 'guillotine_front', name: 'Guillotine Window (Front)', price: 0, type: 'screen_width', icon: Blinds, description: 'Motorized guillotine window for front side', imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=400&h=300' },
  { id: 'app_control', name: 'Smart App Control', price: 550, type: 'flat', icon: Smartphone, description: 'Wi-Fi enabled smart home integration to control louvers, screens, lighting and accessories from your smartphone or tablet anywhere', imageUrl: '/smart-app-control.jpg' },
  { id: 'audio', name: 'Integrated Audio', price: 1200, type: 'flat', icon: Speaker, description: 'Marine-grade outdoor speaker system', imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&q=80&w=400&h=300', quantifiable: true, maxQuantity: 4 },
  { id: 'inlite_scope', name: 'in-lite SCOPE', price: 450, type: 'flat', icon: Lightbulb, description: '12V outdoor architectural spotlights', imageUrl: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&q=80&w=400&h=300', quantifiable: true, maxQuantity: 8 },
  { id: 'inlite_halo', name: 'in-lite HALO', price: 380, type: 'flat', icon: Lightbulb, description: 'Dimmable ambient wall fixtures', imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400&h=300', quantifiable: true, maxQuantity: 8 },
];
