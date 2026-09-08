# SAKAY / SafeTrike

A tricycle-booking safety app for students in Cabanatuan City.
React + Vite + Tailwind, with **Supabase** (Postgres + Auth + Realtime) as the backend.

Roles: **student**, **parent**, **driver**, **guard**, **admin** — each account picks
its role at sign-up.

---

## What's inside

| Area | Notes |
|------|-------|
| Auth | Supabase email + password. Role stored on the user's `profiles` row. |
| Booking | Student or parent books a ride; driver accepts; guard/OTP verification; GCash or cash. |
| **Live route tracking** | `watchPosition()` on the driver, throttled writes, animated marker + polyline trail on the parent/student map. |
| **Geofencing** | Plain-JS Haversine; "entered/exited" alerts for the school gate + pickup point, with hysteresis. |
| **Dynamic ETA** | `distance ÷ speed`, recalculated on every location update. No paid routing API. |
| **Trip history** | A summary row is written to `trip_history` when a ride completes; parents browse past trips. |

---

## First-time setup

1. **Install dependencies**

   ```bash
   npm install --legacy-peer-deps
   ```

   (`--legacy-peer-deps` is needed because `react-qr-reader` lists an old React
   peer version.)

2. **Create a free Supabase project** at [supabase.com](https://supabase.com).

3. **Create the database.** In the Supabase dashboard open **SQL Editor**, paste
   the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
   and run it. (Optionally also run [`supabase/seed.sql`](supabase/seed.sql) to
   create 5 demo accounts.)

4. **Add your keys.** Copy `.env.example` to `.env` and paste in the values from
   **Project Settings → API**:

   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

5. **Run it**

   ```bash
   npm run dev
   ```

   Until real keys are in `.env`, the app shows a "Connect Supabase" screen
   instead of crashing.

---

## Demo accounts (if you ran `seed.sql`)

| Email | Role | Password |
|-------|------|----------|
| `driver@sakay.test` | driver | `sakay1234` |
| `student@sakay.test` | student | `sakay1234` |
| `parent@sakay.test` | parent | `sakay1234` |
| `guard@sakay.test` | guard | `sakay1234` |
| `admin@sakay.test` | admin | `sakay1234` |

Otherwise, use the **Sign Up** screen and pick a role.

---

## Where the tracking code lives

| File | Purpose |
|------|---------|
| `src/config/zones.js` | All tuning values: throttle interval/distance, geofence zones, ETA limits. **Edit zone coordinates here.** |
| `src/lib/geo.js` | Haversine distance + point-in-circle test. |
| `src/lib/eta.js` | Speed derivation + ETA formula. |
| `src/hooks/useDriverTracking.js` | Driver side: `watchPosition` + throttled writes + path recording. |
| `src/hooks/useLiveRoute.js` | Viewer side: realtime subscribe + animated marker + trail. |
| `src/hooks/useGeofence.js` | Entry/exit detection with hysteresis. |
| `src/components/RouteMap.jsx` | Shared map: pins, moving marker, polyline, live ETA badge. |
| `src/components/TripHistory.jsx` | Past-trips list + detail with route map. |
| `src/lib/db.js` | Thin wrappers around Supabase queries + realtime. |

---

## Manual testing

Live tracking needs two views at once. On a phone + laptop (same Wi-Fi), or two
browser windows:

1. Sign in as **driver**, go **ONLINE**, accept a ride, verify the OTP.
2. Sign in as the **parent/student** who booked — watch the marker move and the
   ETA update as the driver's device physically moves.
3. Walk near one of the geofence coordinates in `src/config/zones.js` to trigger
   an "entered/exited" alert.
4. Press **End Trip** as the driver, then open **Trip History** as the parent.

> `npm run dev` serves over HTTPS (via `@vitejs/plugin-basic-ssl`) so phone
> browsers will grant GPS permission. Accept the self-signed-certificate warning.
