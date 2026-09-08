import { useEffect, useRef, useState } from 'react';
import { GEOFENCE_ZONES, GEOFENCE_CONFIRM_READINGS } from '../config/zones';
import { isInsideZone } from '../lib/geo';

/**
 * FEATURE 2 - Geofencing with entry / exit alerts + hysteresis
 * -----------------------------------------------------------------------
 * Give this hook the tricycle's current position. For each configured zone
 * (see src/config/zones.js) it decides whether the tricycle is inside or
 * outside the circle, and fires a ONE-TIME alert the moment it crosses:
 *
 *     was outside, now inside  ->  "entered"
 *     was inside,  now outside ->  "exited"
 *
 * It does NOT keep firing while the tricycle simply stays inside a zone.
 *
 * HYSTERESIS: GPS readings jitter a few metres even when standing still, so
 * right on the boundary the state could flip back and forth. To stop that,
 * we require GEOFENCE_CONFIRM_READINGS readings in a row on the NEW side
 * before we accept the change and fire the alert.
 *
 * @param {{lat:number,lng:number}|null} position  current tricycle position
 * @param {(evt:{zoneId,zoneLabel,type,at})=>void} onTransition  called once per crossing
 * @returns {{ statuses: Record<string,'inside'|'outside'|'unknown'>, lastEvent }}
 */
export function useGeofence(position, onTransition) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(GEOFENCE_ZONES.map((z) => [z.id, 'unknown'])),
  );
  const [lastEvent, setLastEvent] = useState(null);

  // Per-zone memory that must survive re-renders without causing them.
  //   confirmed : the state we currently believe ('inside' | 'outside' | 'unknown')
  //   candidate : the state we're waiting to confirm
  //   streak    : how many readings in a row have agreed with `candidate`
  const zoneStateRef = useRef(
    Object.fromEntries(
      GEOFENCE_ZONES.map((z) => [
        z.id,
        { confirmed: 'unknown', candidate: null, streak: 0 },
      ]),
    ),
  );

  // Keep the callback in a ref so we don't need it in the deps array.
  const cbRef = useRef(onTransition);
  useEffect(() => {
    cbRef.current = onTransition;
  }, [onTransition]);

  useEffect(() => {
    if (!position) return;

    let changed = false;
    const nextStatuses = { ...statuses };

    for (const zone of GEOFENCE_ZONES) {
      const reading = isInsideZone(position, zone) ? 'inside' : 'outside';
      const st = zoneStateRef.current[zone.id];

      // First ever reading for this zone: accept it silently, no alert.
      if (st.confirmed === 'unknown') {
        st.confirmed = reading;
        st.candidate = null;
        st.streak = 0;
        nextStatuses[zone.id] = reading;
        changed = true;
        continue;
      }

      // Reading matches what we already believe -> reset any pending flip.
      if (reading === st.confirmed) {
        st.candidate = null;
        st.streak = 0;
        continue;
      }

      // Reading disagrees -> build up (or start) a streak on the new side.
      if (st.candidate === reading) {
        st.streak += 1;
      } else {
        st.candidate = reading;
        st.streak = 1;
      }

      // Enough agreeing readings? Accept the flip and fire ONE alert.
      if (st.streak >= GEOFENCE_CONFIRM_READINGS) {
        st.confirmed = reading;
        st.candidate = null;
        st.streak = 0;
        nextStatuses[zone.id] = reading;
        changed = true;

        const evt = {
          zoneId: zone.id,
          zoneLabel: zone.label,
          type: reading === 'inside' ? 'entered' : 'exited',
          at: Date.now(),
        };
        setLastEvent(evt);
        cbRef.current?.(evt);
      }
    }

    if (changed) setStatuses(nextStatuses);
    // We intentionally depend only on `position`; everything else is refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  return { statuses, lastEvent };
}
