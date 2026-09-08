// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Plain-JavaScript geography helpers
// ---------------------------------------------------------------------------
// No external map/geofencing library needed. Just the Haversine formula,
// which gives the great-circle distance between two lat/lng points on Earth.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371000; // mean radius of Earth in metres

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Straight-line ("as the crow flies") distance between two points, in METRES.
 *
 * @param {{lat:number, lng:number}} a  first point
 * @param {{lat:number, lng:number}} b  second point
 * @returns {number} distance in metres
 *
 * How it works: we treat Earth as a sphere. The formula converts the
 * difference in latitude and longitude into an angle, then multiplies that
 * angle by Earth's radius to get a distance along the surface.
 */
export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  // "h" is the square of half the chord length between the points.
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  // 2 * atan2(...) turns that back into the central angle (in radians).
  const angle = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_M * angle;
}

/** Same as above but returned in kilometres, for fare / ETA maths. */
export function haversineKm(a, b) {
  return haversineMeters(a, b) / 1000;
}

/**
 * Is point `p` inside the circle defined by `zone` (centre + radiusM)?
 * @param {{lat:number,lng:number}} p
 * @param {{lat:number,lng:number,radiusM:number}} zone
 * @returns {boolean}
 */
export function isInsideZone(p, zone) {
  return haversineMeters(p, { lat: zone.lat, lng: zone.lng }) <= zone.radiusM;
}
