// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Simple ETA (estimated time of arrival)
// ---------------------------------------------------------------------------
// DELIBERATELY simple and free. We do NOT call a paid traffic/routing API
// (Google Directions, Mapbox, HERE...). Those cost money beyond the free tier,
// which isn't feasible for a student project.
//
// Our formula:   time = remaining straight-line distance  /  current speed
// ---------------------------------------------------------------------------

import { haversineKm } from './geo';
import { ETA } from '../config/zones';

/**
 * Work out a usable speed in km/h from whatever we have.
 *
 * @param {number|null} gpsSpeedKmh  speed reported by the Geolocation API
 *                                   (navigator ... coords.speed, already converted to km/h)
 * @param {{lat,lng,t}} prevPoint    previous saved point (t = timestamp in ms)
 * @param {{lat,lng,t}} currPoint    current point
 * @returns {number} a sensible speed in km/h (never 0, never absurd)
 */
export function deriveSpeedKmh(gpsSpeedKmh, prevPoint, currPoint) {
  // 1. Prefer the GPS chip's own speed reading when it looks trustworthy.
  if (
    typeof gpsSpeedKmh === 'number' &&
    isFinite(gpsSpeedKmh) &&
    gpsSpeedKmh >= ETA.MIN_VALID_SPEED_KMH &&
    gpsSpeedKmh <= ETA.MAX_VALID_SPEED_KMH
  ) {
    return gpsSpeedKmh;
  }

  // 2. Otherwise calculate it ourselves from the last two points:
  //    speed = distance between points / time between points
  if (prevPoint && currPoint && currPoint.t > prevPoint.t) {
    const km = haversineKm(prevPoint, currPoint);
    const hours = (currPoint.t - prevPoint.t) / 1000 / 3600;
    const kmh = km / hours;
    if (kmh >= ETA.MIN_VALID_SPEED_KMH && kmh <= ETA.MAX_VALID_SPEED_KMH) {
      return kmh;
    }
  }

  // 3. Fall back to a fixed guess so the ETA is never blank or Infinity.
  return ETA.FALLBACK_SPEED_KMH;
}

/**
 * Estimated minutes until arrival.
 *
 * @param {{lat,lng}} currentPos  tricycle's current position
 * @param {{lat,lng}} destPos     destination
 * @param {number} speedKmh       current speed in km/h
 * @returns {number} whole minutes (rounded up), minimum 1
 */
export function estimateEtaMinutes(currentPos, destPos, speedKmh) {
  if (!currentPos || !destPos) return null;

  const remainingKm = haversineKm(currentPos, destPos);
  const speed = speedKmh && speedKmh > 0 ? speedKmh : ETA.FALLBACK_SPEED_KMH;

  const minutes = (remainingKm / speed) * 60;
  if (!isFinite(minutes)) return null;

  return Math.max(1, Math.ceil(minutes));
}

/** Turn a distance in km into a short label like "1.2 km" or "450 m". */
export function formatDistance(km) {
  if (km == null || !isFinite(km)) return '--';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
