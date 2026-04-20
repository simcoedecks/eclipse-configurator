import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { geocodeAddress, geocodeIp, type GeoPoint } from '../../shared/lib/geocoding';
import { Flame, MapPin, Loader2, RefreshCw } from 'lucide-react';

// Fix Leaflet default marker icons when bundled by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom pin icons (colored divs)
const pendingIcon = L.divIcon({
  className: 'custom-pin',
  html: '<div style="background:#C5A059;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><div style="transform:rotate(45deg);color:#fff;font-weight:bold;font-size:10px;text-align:center;line-height:18px;">$</div></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});
const acceptedIcon = L.divIcon({
  className: 'custom-pin',
  html: '<div style="background:#10b981;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"><div style="transform:rotate(45deg);color:#fff;font-weight:bold;font-size:13px;text-align:center;line-height:21px;">✓</div></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

// Heatmap layer overlay (uses leaflet.heat global plugin).
// Tuned for sparse real-world data — larger radius + minOpacity keeps
// single-point areas still visible as glowing hotspots.
function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const layer = (L as any).heatLayer(points, {
      radius: 60,
      blur: 40,
      minOpacity: 0.55,
      max: 1.0,
      gradient: {
        0.0: '#fef3c7',  // soft pale gold
        0.25: '#C5A059', // brand gold
        0.5: '#f97316',  // orange
        0.75: '#dc2626', // red
        1.0: '#7f1d1d',  // deep crimson
      },
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

export default function LeadMap({ submissions }: { submissions: any[] }) {
  const [showHeat, setShowHeat] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [lookingUp, setLookingUp] = useState(0);
  const lookupQueueRef = useRef<Set<string>>(new Set());

  // For each submission lacking geo data, kick off a geocoding pass (cached in Firestore).
  useEffect(() => {
    const toLookup = submissions.filter(s => !s.geo && !lookupQueueRef.current.has(s.id));
    if (!toLookup.length) return;

    let cancelled = false;
    (async () => {
      for (const sub of toLookup) {
        if (cancelled) break;
        if (lookupQueueRef.current.has(sub.id)) continue;
        lookupQueueRef.current.add(sub.id);
        setLookingUp(c => c + 1);
        try {
          const [fromAddress, fromIp] = await Promise.all([
            geocodeAddress(sub.address, sub.city),
            geocodeIp(sub.submitterIp || sub.acceptance?.signerIp),
          ]);
          if (fromAddress || fromIp) {
            await setDoc(doc(db, 'submissions', sub.id), {
              geo: {
                fromAddress: fromAddress || null,
                fromIp: fromIp || null,
                lookedUpAt: serverTimestamp(),
              },
            }, { merge: true });
          }
        } catch (e) {
          console.warn('geocode sub failed', sub.id, e);
        } finally {
          setLookingUp(c => c - 1);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [submissions]);

  const heatPoints = useMemo<[number, number, number][]>(() => {
    const pts: [number, number, number][] = [];
    submissions.forEach(s => {
      const geo = s.geo;
      if (!geo) return;
      const p = geo.fromAddress || geo.fromIp;
      if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
        // Base weight 0.7 so every lead is visible; accepted deals pop higher
        const intensity = s.acceptance?.signedAt ? 1.0 : 0.7;
        pts.push([p.lat, p.lng, intensity]);
      }
    });
    return pts;
  }, [submissions]);

  const pinSubmissions = useMemo(() => submissions.filter(s => s.geo && (s.geo.fromAddress || s.geo.fromIp)), [submissions]);

  const geoStats = useMemo(() => {
    const total = submissions.length;
    const withGeo = submissions.filter(s => s.geo && (s.geo.fromAddress || s.geo.fromIp)).length;
    const accepted = submissions.filter(s => s.acceptance?.signedAt && s.geo && (s.geo.fromAddress || s.geo.fromIp)).length;
    return { total, withGeo, accepted, pending: withGeo - accepted };
  }, [submissions]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-xs uppercase tracking-widest font-bold text-gray-400">
            North America
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{geoStats.accepted} accepted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-luxury-gold" />
            <span>{geoStats.pending} pending</span>
          </div>
          {geoStats.total > geoStats.withGeo && (
            <span className="text-gray-400 text-xs">· {geoStats.total - geoStats.withGeo} unlocated</span>
          )}
          {lookingUp > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Locating {lookingUp}…
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPins(!showPins)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showPins ? 'bg-luxury-black text-white border-luxury-black' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Pins
          </button>
          <button
            onClick={() => setShowHeat(!showHeat)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showHeat ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <Flame className="w-3.5 h-3.5" />
            Heatmap
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="h-[600px] w-full relative">
        <MapContainer
          center={[45, -90]}
          zoom={3.5}
          minZoom={3}
          maxZoom={18}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', background: '#e6eef5' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {showHeat && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
          {showPins && pinSubmissions.map(sub => {
            const p: GeoPoint = sub.geo.fromAddress || sub.geo.fromIp;
            const isAccepted = !!sub.acceptance?.signedAt;
            const isIpOnly = !sub.geo.fromAddress && !!sub.geo.fromIp;
            const price = sub.configuration?.totalPrice || sub.pricingBreakdown?.total;
            return (
              <Marker key={sub.id} position={[p.lat, p.lng]} icon={isAccepted ? acceptedIcon : pendingIcon}>
                <Popup maxWidth={280}>
                  <div className="text-xs space-y-1.5 min-w-[220px]">
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5 mb-1">
                      <span className="font-bold text-sm">{sub.name}</span>
                      {isAccepted ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">✓ Signed</span>
                      ) : (
                        <span className="text-[9px] bg-luxury-gold/20 text-luxury-black px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Pending</span>
                      )}
                    </div>
                    <div className="text-gray-600">
                      <div>📍 {[sub.address, sub.city].filter(Boolean).join(', ') || 'No address'}</div>
                      {sub.configuration && (
                        <div className="mt-0.5">📐 {sub.configuration.width}' × {sub.configuration.depth}' × {sub.configuration.height}'</div>
                      )}
                      {price && (
                        <div className="mt-0.5 font-semibold text-luxury-gold">
                          💰 {typeof price === 'number' ? price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : price}
                        </div>
                      )}
                      {isIpOnly && (
                        <div className="mt-1 text-[10px] italic text-amber-700">⚠ Pin from IP (no address)</div>
                      )}
                      {sub.createdAt?.toDate && (
                        <div className="mt-1 text-[10px] text-gray-400">
                          {sub.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
                {sub.geo.fromAddress && sub.geo.fromIp && (
                  /* Also show an IP marker in a different style when we have both */
                  <CircleMarker
                    center={[sub.geo.fromIp.lat, sub.geo.fromIp.lng]}
                    radius={5}
                    pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.4, weight: 1 }}
                  />
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-5 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-luxury-gold shadow-sm" />
          Pending (address)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-sm" />
          Accepted (address)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />
          IP-geolocated
        </div>
        <div className="ml-auto text-gray-400">
          Powered by OpenStreetMap · Geocoding by Nominatim · IP by ip-api.com
        </div>
      </div>
    </div>
  );
}
