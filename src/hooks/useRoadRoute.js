import { useEffect, useRef, useState } from 'react';

/**
 * FEATURE (bonus) - Draw the actual road route between two points.
 * -----------------------------------------------------------------------
 * Uses OSRM's FREE public demo server (router.project-osrm.org):
 *   - no API key, no paid tier, no sign-up
 *   - best-effort demo server (rate-limited, no uptime guarantee) - fine for
 *     a school project, not for production
 *
 * If the request fails we return line=null and the map falls back to a plain
 * straight line between the two pins.
 *
 * @param {{lat:number,lng:number}|null} origin
 * @param {{lat:number,lng:number}|null} destination
 * @returns {{ line: [number,number][]|null, distanceKm: number|null, loading: boolean }}
 */
export function useRoadRoute(origin, destination) {
  const [line, setLine] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [loading, setLoading] = useState(false);

  // The coordinate pair (rounded) we last SUCCESSFULLY routed, so re-renders
  // with the same pins don't refetch.
  const doneKeyRef = useRef('');

  const round = (n) => Math.round(n * 1e5) / 1e5;
  const key =
    origin && destination
      ? [round(origin.lat), round(origin.lng), round(destination.lat), round(destination.lng)].join(',')
      : '';

  useEffect(() => {
    if (!key) {
      setLine(null);
      setDistanceKm(null);
      return;
    }
    if (key === doneKeyRef.current) return; // already have this route

    let cancelled = false;
    const controller = new AbortController();

    // Small debounce: if the pins are still being placed/dragged, wait for
    // things to settle before hitting the server.
    const timer = setTimeout(() => {
      setLoading(true);
      const [oLat, oLng, dLat, dLng] = key.split(',').map(Number);
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;

      fetch(url, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const route = data?.routes?.[0];
          if (!route) throw new Error('no route');
          // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
          setLine(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setDistanceKm(route.distance / 1000);
          doneKeyRef.current = key;
        })
        .catch((err) => {
          if (cancelled || err.name === 'AbortError') return;
          setLine(null); // fall back to the straight line
          setDistanceKm(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return { line, distanceKm, loading };
}
