// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Leaflet marker icons (no external CDN)
// ---------------------------------------------------------------------------
// Leaflet's built-in marker points its pin image at a URL that breaks under
// a bundler like Vite. The usual "fix" is to load those images from a CDN,
// but that fails on school networks, ad-blockers, or offline. Instead we:
//
//   1. Bundle Leaflet's own marker images with the app (import them so Vite
//      copies them into /dist), so every plain <Marker> still shows a pin.
//   2. Provide our own lightweight SVG pin + dot icons that need no image
//      files at all.
// ---------------------------------------------------------------------------

import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Make the DEFAULT Leaflet marker use the bundled images (fixes invisible pins).
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

/**
 * A coloured teardrop pin drawn entirely with inline SVG - no image request.
 * Use for pickup / destination markers.
 */
export function pinIcon(color = '#4f46e5') {
  const svg = `
    <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [30, 42],
    iconAnchor: [15, 42], // tip of the pin sits on the exact spot
    popupAnchor: [0, -38],
  });
}

/**
 * A pulsing round dot - used for the live tricycle position.
 */
export function dotIcon(color = '#4f46e5') {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${color};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
