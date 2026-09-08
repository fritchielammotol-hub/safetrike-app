# SAKAY / SafeTrike — Implementation Notes for the Research Paper

Plain-English description of what was built, for the **Methodology** and
**Results / Limitations** sections. Dates: work done 2026-09-08.

---

## 1. Backend migration: Firebase → Supabase

**Methodology.** The system was moved from Google Firebase (Anonymous Auth +
Firestore NoSQL) to **Supabase**, an open-source backend that provides a
PostgreSQL relational database, an authentication service, and a Realtime
service over WebSockets. The reasons were: (a) a relational schema with typed
columns and foreign keys is easier to reason about and to present than nested
NoSQL documents; (b) Supabase's free tier is sufficient for the study; and
(c) real user accounts could be added without extra cost.

The database is defined in one SQL migration file
(`supabase/migrations/0001_init.sql`) containing five tables — `profiles`,
`rides`, `driver_locations`, `alerts`, and `trip_history` — plus Row Level
Security policies and a trigger that automatically creates a profile row when a
user signs up. Realtime replication is enabled on `rides`, `driver_locations`,
and `alerts`.

**Authentication.** Anonymous sign-in was replaced with **email + password
accounts**. Each account selects a role at sign-up (student, parent, driver,
guard, admin); the role is stored on the `profiles` table and determines which
interface loads. This adds an access-control layer the previous version did not
have.

**Limitations.** Row Level Security policies are intentionally permissive (any
signed-in user can read/write any row) to keep the prototype simple; a
production deployment would scope rows to the owning user. The path history is
stored as a JSON array on the ride row and updated with a read-modify-write,
which is adequate for a single driver writing every few seconds but is not
safe under heavy concurrent writes.

---

## 2. Feature 1 — Continuous real-time route tracking

**Methodology.** The driver interface uses the browser Geolocation API's
`navigator.geolocation.watchPosition()` with `enableHighAccuracy: true`,
`timeout: 10000 ms`, and `maximumAge: 5000 ms`. This produces a continuous
stream of GPS fixes instead of the single reading used previously.

To protect the database quota and the driver's battery, writes are
**throttled**: a new position is saved only when at least **4 seconds** have
elapsed since the last saved point *or* the device has moved at least
**8 metres** (whichever occurs first). Each saved point updates the driver's
row in `driver_locations` and is appended to the current ride's recorded
`path`.

The parent and student interfaces subscribe to `driver_locations` through
Supabase Realtime. Incoming positions are **interpolated**: the on-screen
marker glides from its previous coordinate to the new one over one second using
`requestAnimationFrame`, so the marker follows the route rather than jumping.
The last 25 recorded points are drawn as a Leaflet `Polyline` to show the path
travelled.

**Results.** The map marker moves smoothly along the actual road path and the
trail line is visible behind it. Database writes occur roughly every 4 seconds
during motion rather than on every GPS tick (observed reduction of one to two
orders of magnitude depending on device GPS rate).

**Limitations.** Accuracy depends entirely on the device GPS; indoors or in
urban canyons the fix can drift. The trail is a straight-line polyline between
sampled points, not a road-snapped route.

---

## 3. Feature 2 — Geofencing

**Methodology.** A plain-JavaScript **Haversine formula**
(`src/lib/geo.js`) computes the great-circle distance in metres between two
latitude/longitude points. No external geofencing library is used.

Two circular zones are configured in `src/config/zones.js` — the *school gate*
and a *designated pickup point* — each with a centre coordinate and a radius.
On every position update the system tests whether the tricycle is inside each
circle. A notification is fired only on a **transition** (outside → inside =
"entered"; inside → outside = "exited"), not repeatedly while the vehicle
remains inside a zone.

To prevent false alerts from GPS jitter near a boundary, **hysteresis** is
applied: the new state must be observed on **3 consecutive readings** before
the transition is accepted and the alert is shown.

**Results.** Entering or leaving a configured zone raises a single on-screen
alert on both the driver and parent interfaces. Brief GPS fluctuations at the
boundary do not produce repeated alerts.

**Limitations.** Zones are circles defined in code; there is no user interface
to draw or edit them. The zone coordinates in the repository are placeholders
and must be set to real locations before a field test.

---

## 4. Feature 3 — Dynamic ETA recalculation

**Methodology.** The estimated time of arrival is computed with a deliberately
simple, cost-free formula:

```
ETA (minutes) = remaining straight-line distance to destination (km)
                ÷ current speed (km/h) × 60
```

Remaining distance uses the same Haversine function. Speed is taken from the
Geolocation API's `coords.speed` property when it reports a plausible value
(between 3 and 80 km/h); otherwise it is derived from the distance and time
between the two most recent GPS points; if neither is available a fixed
fallback speed is used so the estimate is never blank. The ETA is recalculated
on every position update received by the viewer and displayed as
"Arriving in ~X min".

**Results.** The ETA updates live as the ride progresses and decreases as the
tricycle approaches the destination.

**Limitations.** This is a straight-line estimate. It does **not** account for
the road network, turns, one-way streets, stops, or traffic. A traffic-aware
routing API (Google Directions, Mapbox, HERE) was deliberately **not** used
because those require a paid plan beyond the free quota, which is outside the
budget of this student project. The estimate is therefore an approximation that
is most accurate on direct routes and least accurate where roads are indirect.

---

## 5. Feature 4 — Trip history log

**Methodology.** When a driver marks a ride complete, the system writes one
summary record to the `trip_history` table containing: origin and destination
coordinates, start and completion timestamps, trip duration, distance travelled
(summed from the recorded GPS path), fare, payment method, driver name, and the
full recorded path.

A "Trip History" screen on the parent and student interfaces lists past trips
newest-first. Each entry can be opened to show a detail view with the numbers
above and a small map that redraws the recorded route as a polyline.

**Results.** Completed rides appear in the history list immediately. The detail
view reconstructs the travelled route from the stored path points.

**Limitations.** Distance is the sum of straight-line segments between sampled
GPS points, so it slightly under-reads compared to the true road distance, and
more so when the throttle skips points during slow movement.

---

## 6. Technology summary (for a methodology table)

| Component | Technology |
|-----------|------------|
| Front-end framework | React 19 + Vite |
| Styling | Tailwind CSS 3 |
| Maps | Leaflet + React-Leaflet, OpenStreetMap tiles (free) |
| Backend | Supabase — PostgreSQL, Auth, Realtime |
| Location | Browser Geolocation API (`watchPosition`) |
| Distance / geofence / ETA | Custom JavaScript (Haversine), no external service |
| QR codes | `qrcode.react`, `react-qr-reader` |

No paid APIs or API keys are used beyond the Supabase project's own URL and
public anon key.
