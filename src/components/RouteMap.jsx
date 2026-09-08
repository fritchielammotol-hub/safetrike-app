import React, { useMemo, useEffect } from 'react';
import {
  MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, Clock } from 'lucide-react';

import { DEFAULT_LAT, DEFAULT_LNG } from '../config/supabase';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { useRoadRoute } from '../hooks/useRoadRoute';
import { estimateEtaMinutes, formatDistance } from '../lib/eta';
import { haversineKm } from '../lib/geo';
import { pinIcon, dotIcon } from '../lib/mapIcons';

// Green = pickup / origin, Red = destination. Built once, reused.
const ORIGIN_ICON = pinIcon('#16a34a');
const DEST_ICON = pinIcon('#dc2626');

function MapClick({ onPick }) {
  // Fires for every tap/click on the map surface.
  useMapEvents({ click: (e) => onPick && onPick(e.latlng) });
  return null;
}

// The map often mounts before its (absolutely-positioned) container has its
// final size, which leaves Leaflet's SVG layer at 0x0 so polylines render as
// "M0 0". Recalculating the size after paint - and on window resize - fixes it.
function FixMapSize() {
  const map = useMap();
  useEffect(() => {
    const kick = () => map.invalidateSize();
    const t1 = setTimeout(kick, 60);
    const t2 = setTimeout(kick, 350);
    window.addEventListener('resize', kick);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', kick);
    };
  }, [map]);
  return null;
}

/**
 * RouteMap - the shared live map for the Parent and Student screens.
 * -----------------------------------------------------------------------
 * - Draws the pickup + destination pins.
 * - Shows the driver's marker MOVING ALONG the real route (Feature 1),
 *   with a polyline "trail" of recent points behind it.
 * - Shows a live-updating ETA badge (Feature 3): straight-line distance
 *   left, divided by current speed. No paid routing API.
 *
 * @param {object} props
 * @param {{lat,lng}=} props.origin
 * @param {{lat,lng}=} props.destination
 * @param {string=}    props.driverId    driver to follow (once assigned)
 * @param {string=}    props.rideId      ride whose path we draw
 * @param {boolean}    props.tracking    true once the ride is in progress
 * @param {string}     props.markerColor CSS colour for the tricycle dot
 * @param {(latlng)=>void=} props.onPickDestination  map-click handler (booking)
 * @param {(info:{rawPos,speedKmh})=>void=} props.onDriverMove  fires on each live update
 */
const RouteMap = ({
  origin,
  destination,
  driverId,
  rideId,
  tracking = false,
  markerColor = '#4f46e5',
  onPickDestination,
  onDriverMove,
}) => {
  const { markerPos, rawPos, trail, speedKmh } = useLiveRoute({
    driverId,
    rideId,
    active: tracking && !!driverId,
  });

  // Let the parent screen react to each live position update (e.g. geofencing).
  useEffect(() => {
    if (rawPos && onDriverMove) onDriverMove({ rawPos, speedKmh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPos, speedKmh]);

  // Bonus: the actual street route between pickup and destination (OSRM).
  const { line: roadLine } = useRoadRoute(origin, destination);

  // Feature 3: recompute ETA every time the driver position / speed updates.
  const eta = useMemo(() => {
    if (!tracking || !rawPos || !destination) return null;
    return {
      minutes: estimateEtaMinutes(rawPos, destination, speedKmh),
      km: haversineKm(rawPos, destination),
    };
  }, [tracking, rawPos, destination, speedKmh]);

  const center = origin || destination || { lat: DEFAULT_LAT, lng: DEFAULT_LNG };

  return (
    // `z-0` (an explicit z-index, not `auto`) makes this a stacking context so
    // Leaflet's own panes/controls (z-index up to 1000) stay BEHIND the UI
    // overlays that the Parent/Student screens draw on top (z-10+).
    <div className="absolute inset-0 z-0">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FixMapSize />

        {/* Planned route along the streets (OSRM). Falls back to a straight
            dashed line between the pins if the routing server is unavailable.
            The `key` forces a clean re-mount when the geometry switches from
            the straight fallback to the real road line. */}
        {origin && destination && (
          <Polyline
            key={roadLine ? 'road' : 'straight'}
            positions={
              roadLine && roadLine.length > 1
                ? roadLine
                : [
                    [origin.lat, origin.lng],
                    [destination.lat, destination.lng],
                  ]
            }
            pathOptions={{
              color: '#1e293b',
              weight: 4,
              opacity: 0.6,
              dashArray: roadLine ? undefined : '8 8',
            }}
          />
        )}

        {origin && <Marker position={[origin.lat, origin.lng]} icon={ORIGIN_ICON} />}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={DEST_ICON} />
        )}

        {/* Actual GPS trail travelled so far + moving driver marker */}
        {trail.length > 1 && (
          <Polyline
            positions={trail.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: markerColor, weight: 5, opacity: 0.85 }}
          />
        )}
        {markerPos && tracking && (
          <Marker
            position={[markerPos.lat, markerPos.lng]}
            icon={dotIcon(markerColor)}
          />
        )}

        {onPickDestination && <MapClick onPick={onPickDestination} />}
      </MapContainer>

      {/* Feature 3: live ETA badge */}
      {eta && eta.minutes != null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-slate-900 text-white px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2 pointer-events-none">
          <Clock size={16} className="text-yellow-400" />
          <div className="leading-none">
            <p className="text-sm font-black italic">
              Arriving in ~{eta.minutes} min
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">
              {formatDistance(eta.km)} left • {speedKmh || '~'} km/h
            </p>
          </div>
          <Navigation size={14} className="text-yellow-400 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default RouteMap;
