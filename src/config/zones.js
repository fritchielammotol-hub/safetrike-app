// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Tracking & Geofence configuration
// ---------------------------------------------------------------------------
// Every "magic number" for the live-tracking features lives here so you can
// tune the system without hunting through component code. Change a value,
// save, and the whole app picks it up.
// ---------------------------------------------------------------------------

// --- FEATURE 1: how often the driver's phone writes its location -----------
// We do NOT want to write to the database on every GPS tick (that would burn
// through the free Supabase quota and drain the driver's battery). Instead we
// write only when EITHER of these is true, whichever happens first:
export const TRACKING = {
  // ...at least this many milliseconds have passed since the last saved point
  MIN_WRITE_INTERVAL_MS: 4000, // 4 seconds

  // ...OR the driver has moved at least this many metres since the last point
  MIN_WRITE_DISTANCE_M: 8, // ~8 metres

  // How many recent points to keep in the on-screen polyline "trail".
  TRAIL_LENGTH: 25,

  // Options passed straight into navigator.geolocation.watchPosition().
  GEO_OPTIONS: {
    enableHighAccuracy: true, // use GPS chip, not just wifi/cell guess
    timeout: 10000,           // give up on a single fix after 10s
    maximumAge: 5000,         // a cached fix up to 5s old is acceptable
  },
};

// --- FEATURE 2: geofence zones -------------------------------------------
// Each zone is a circle: a centre coordinate + a radius in metres.
// "Entered" / "Exited" alerts fire when the tricycle crosses these circles.
// Coordinates below are placeholders near Cabanatuan City - replace the
// lat/lng with the real spots for your defense demo.
export const GEOFENCE_ZONES = [
  {
    id: 'school_gate',
    label: 'School Gate',
    lat: 15.4889,
    lng: 120.9689,
    radiusM: 120, // alert when within 120 m of the gate
  },
  {
    id: 'pickup_point',
    label: 'Designated Pickup Point',
    lat: 15.4835,
    lng: 120.9772,
    radiusM: 100,
  },
];

// Simple hysteresis: how many GPS readings in a row must agree on the new
// side of the line before we actually fire the alert. This stops the alert
// from flickering when the GPS jitters right on the boundary.
export const GEOFENCE_CONFIRM_READINGS = 3;

// --- FEATURE 3: ETA calculation -----------------------------------------
export const ETA = {
  // If we can't measure a trustworthy speed yet, assume this (km/h) so the
  // first ETA shown isn't blank or "Infinity".
  FALLBACK_SPEED_KMH: 18,

  // Ignore silly speed values (GPS glitches) outside this range (km/h).
  MIN_VALID_SPEED_KMH: 3,
  MAX_VALID_SPEED_KMH: 80,
};
