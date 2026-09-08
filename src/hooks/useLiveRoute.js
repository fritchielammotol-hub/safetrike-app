import { useEffect, useRef, useState } from 'react';
import { TRACKING } from '../config/zones';
import { getDriverLocation, getRide, subscribeToChanges } from '../lib/db';

/**
 * FEATURE 1 (viewer side) - Watch a driver move along the real route
 * -----------------------------------------------------------------------
 * Used by the Parent and Student screens. Given a driverId + rideId it:
 *
 *   1. Loads the current driver location and the ride's recorded path.
 *   2. Subscribes to Supabase Realtime so new locations / path points
 *      arrive automatically (no polling).
 *   3. Smoothly ANIMATES the marker from its old spot to the new spot,
 *      instead of letting it jump, using requestAnimationFrame.
 *
 * Returns:
 *   markerPos  - { lat, lng } to draw the moving tricycle marker (animated)
 *   trail      - array of { lat, lng } for a <Polyline> showing the route
 *   speedKmh   - latest reported speed
 *   rawPos     - the exact latest server position (un-animated), for ETA maths
 */
export function useLiveRoute({ driverId, rideId, active = true }) {
  const [markerPos, setMarkerPos] = useState(null);
  const [rawPos, setRawPos] = useState(null);
  const [trail, setTrail] = useState([]);
  const [speedKmh, setSpeedKmh] = useState(0);

  // Animation bookkeeping.
  const animRef = useRef(null);
  const fromRef = useRef(null); // where the marker is animating FROM
  const startTimeRef = useRef(0);
  const ANIM_MS = 1000; // glide over 1 second

  // Kick off a glide from the current marker position to `target`.
  const animateTo = (target) => {
    const from = fromRef.current || target;
    fromRef.current = from;
    startTimeRef.current = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const step = (now) => {
      const t = Math.min(1, (now - startTimeRef.current) / ANIM_MS);
      // simple ease-out so it decelerates into place
      const e = 1 - Math.pow(1 - t, 2);
      const lat = from.lat + (target.lat - from.lat) * e;
      const lng = from.lng + (target.lng - from.lng) * e;
      setMarkerPos({ lat, lng });

      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target; // arrived; next glide starts here
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  const applyLocation = (row) => {
    if (!row || row.lat == null || row.lng == null) return;
    const target = { lat: row.lat, lng: row.lng };
    setRawPos(target);
    setSpeedKmh(row.speed || 0);
    animateTo(target);
  };

  const applyPath = (path) => {
    if (!Array.isArray(path)) return;
    const points = path
      .filter((p) => p && p.lat != null && p.lng != null)
      .slice(-TRACKING.TRAIL_LENGTH)
      .map((p) => ({ lat: p.lat, lng: p.lng }));
    setTrail(points);
  };

  // ---- driver location: initial load + realtime ----
  useEffect(() => {
    if (!active || !driverId) return;
    let cancelled = false;

    getDriverLocation(driverId).then(({ data }) => {
      if (!cancelled && data) {
        fromRef.current = { lat: data.lat, lng: data.lng };
        setMarkerPos({ lat: data.lat, lng: data.lng });
        applyLocation(data);
      }
    });

    const stop = subscribeToChanges({
      table: 'driver_locations',
      filter: `driver_id=eq.${driverId}`,
      onChange: (payload) => applyLocation(payload.new),
    });

    return () => {
      cancelled = true;
      stop();
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // applyLocation is a stable local helper; we only want to re-subscribe
    // when the driver we're following actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, driverId]);

  // ---- ride path: initial load + realtime ----
  useEffect(() => {
    if (!active || !rideId) return;
    let cancelled = false;

    getRide(rideId).then(({ data }) => {
      if (!cancelled && data) applyPath(data.path);
    });

    const stop = subscribeToChanges({
      table: 'rides',
      filter: `id=eq.${rideId}`,
      onChange: (payload) => applyPath(payload.new?.path),
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, rideId]);

  return { markerPos, rawPos, trail, speedKmh };
}
