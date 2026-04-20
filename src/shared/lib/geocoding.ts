/**
 * Geocoding helpers for the admin map.
 * Uses free public APIs with no keys required:
 *   - OpenStreetMap Nominatim for address → lat/lng (1 req/sec limit)
 *   - ip-api.com for IP → lat/lng + country (45 req/min, no key)
 *
 * Results are cached on the Firestore submission doc as `geo` so we only
 * call the APIs once per lead.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  source: 'address' | 'ip';
  label?: string; // city, country from the service
}

export interface GeoData {
  fromAddress?: GeoPoint | null;
  fromIp?: GeoPoint | null;
  lookedUpAt?: any; // Timestamp
}

// Simple rate limiter so we respect Nominatim's "max 1 req/sec" policy
let lastNominatimCall = 0;
async function waitForNominatim() {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1100) {
    await new Promise(r => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimCall = Date.now();
}

export async function geocodeAddress(address: string | undefined, city: string | undefined): Promise<GeoPoint | null> {
  const q = [address, city].filter(Boolean).join(', ').trim();
  if (!q) return null;
  try {
    await waitForNominatim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=us,ca&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim requires a real User-Agent identifier
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      source: 'address',
      label: first.display_name,
    };
  } catch (e) {
    console.warn('geocodeAddress failed:', e);
    return null;
  }
}

export async function geocodeIp(ip: string | undefined): Promise<GeoPoint | null> {
  if (!ip || ip === 'unknown' || ip === 'client-recorded') return null;
  // Strip IPv6-mapped prefix if present
  const cleanIp = ip.replace(/^::ffff:/, '');
  if (!/^[\d.a-fA-F:]+$/.test(cleanIp)) return null;
  try {
    const url = `https://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,country,regionName,city,lat,lon,query`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success' || typeof data.lat !== 'number') return null;
    return {
      lat: data.lat,
      lng: data.lon,
      source: 'ip',
      label: [data.city, data.regionName, data.country].filter(Boolean).join(', '),
    };
  } catch (e) {
    console.warn('geocodeIp failed:', e);
    return null;
  }
}
