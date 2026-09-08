import { useEffect, useRef, useState } from 'react';
import { TRACKING } from '../config/zones';
import { haversineMeters } from '../lib/geo';
import { upsertDriverLocation, appendRidePathPoint } from '../lib/db';

/**
 * FEATURE 1 (driver side) - Continuous real-time route tracking
 * -----------------------------------------------------------------------
 * Replaces the old one-off getCurrentPosition. This hook:
 *
 *   1. Uses navigator.geolocation.watchPosition() so we get a stream of
 *      GPS fixes as the tricycle moves (high accuracy + sensible timeout).
 *   2. THROTTLES how often we save to the database: we only write when
 *      >= MIN_WRITE_INTERVAL_MS have passed OR the tricycle has moved
 *      >= MIN_WRITE_DISTANCE_M, whichever comes first. This protects the
 *      free Supabase quota and the driver's battery.
 *   3. On every write it also appends the point to the active ride's "path"
 *      so parents can see the actual route travelled, not just the dot.
 *
 * @param {object}  opts
 * @param {boolean} opts.enabled       start/stop tracking (driver "online")
 * @param {string}  opts.driverId      the driver's user id
 * @param {string=} opts.activeRideId  current ride id (for the path trail)
 * @returns {{ position, speedKmh, error, savedCount, lastSavedAt }}
 */
export function useDriverTracking({ enabled, driverId, activeRideId }) {
  const [position, setPosition] = useState(null); // { lat, lng } - updates every tick
  const [speedKmh, setSpeedKmh] = useState(0);
  const [error, setError] = useState(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // The last point we actually WROTE to the database (not every GPS tick).
  const lastSavedRef = useRef(null);
  // Keep the ride id in a ref so the watch callback always sees the latest one.
  const rideIdRef = useRef(activeRideId);
  useEffect(() => {
    rideIdRef.current = activeRideId;
  }, [activeRideId]);

  useEffect(() => {
    if (!enabled || !driverId) return;
    if (!('geolocation' in navigator)) {
      setError('This device has no GPS / geolocation support.');
      return;
    }

    // Called by the browser every time it has a new GPS fix.
    const onFix = async (pos) => {
      const now = Date.now();
      const point = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      // coords.speed is metres/second (or null). Convert to km/h for display.
      const rawSpeed = pos.coords.speed;
      const kmh =
        typeof rawSpeed === 'number' && isFinite(rawSpeed) && rawSpeed >= 0
          ? Math.round(rawSpeed * 3.6)
          : 0;

      // Update the on-screen values on EVERY tick (cheap, local only).
      setPosition(point);
      setSpeedKmh(kmh);
      setError(null);

      // --- Throttle decision: should we SAVE this point? ---
      const last = lastSavedRef.current;
      const movedFarEnough =
        !last || haversineMeters(last, point) >= TRACKING.MIN_WRITE_DISTANCE_M;
      const waitedLongEnough =
        !last || now - last.t >= TRACKING.MIN_WRITE_INTERVAL_MS;

      if (!(movedFarEnough || waitedLongEnough)) return; // skip this tick

      lastSavedRef.current = { ...point, t: now };

      // 1. Update the driver's single "latest location" row.
      const { error: locErr } = await upsertDriverLocation(driverId, {
        lat: point.lat,
        lng: point.lng,
        speed: kmh,
        heading: pos.coords.heading ?? null,
      });
      if (locErr) {
        setError(locErr.message);
        return;
      }

      // 2. Append to the ride's recorded path (if a ride is active).
      if (rideIdRef.current) {
        await appendRidePathPoint(rideIdRef.current, {
          lat: point.lat,
          lng: point.lng,
          t: now,
          speed: kmh,
        });
      }

      setSavedCount((c) => c + 1);
      setLastSavedAt(now);
    };

    const onError = (err) => {
      setError(err.message || 'Could not read GPS position.');
    };

    const watchId = navigator.geolocation.watchPosition(
      onFix,
      onError,
      TRACKING.GEO_OPTIONS,
    );

    // Stop listening when the driver goes offline / leaves the screen.
    return () => {
      navigator.geolocation.clearWatch(watchId);
      lastSavedRef.current = null;
    };
  }, [enabled, driverId]);

  return { position, speedKmh, error, savedCount, lastSavedAt };
}
