// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Small database helper layer
// ---------------------------------------------------------------------------
// These are thin, well-named wrappers around the Supabase client so the React
// components stay easy to read. Every function that talks to the database
// returns Supabase's normal { data, error } shape unless noted otherwise.
//
// "Realtime" = Supabase pushes a message to the browser whenever a row in a
// watched table changes. We use it for live driver location + ride status.
// ---------------------------------------------------------------------------

import { supabase } from '../config/supabase';

// ===========================  AUTH  ========================================

// Create a new account. `role` and `fullName` are stored on the user so the
// database trigger can build their profile row automatically.
export async function signUp({ email, password, role, fullName }) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { role, full_name: fullName } },
  });
}

export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// ===========================  PROFILES  ====================================

export async function getProfile(userId) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

// Used as a safety net in case the sign-up trigger isn't installed yet.
export async function ensureProfile(userId, role, fullName) {
  return supabase
    .from('profiles')
    .upsert({ id: userId, role, full_name: fullName }, { onConflict: 'id' });
}

export async function updateProfile(userId, patch) {
  return supabase.from('profiles').update(patch).eq('id', userId);
}

export async function getPendingDrivers() {
  return supabase
    .from('profiles')
    .select('*')
    .eq('role', 'driver')
    .eq('verification_status', 'Pending');
}

// ===========================  RIDES  ======================================

export async function createRide(ride) {
  return supabase.from('rides').insert(ride).select().single();
}

export async function updateRide(rideId, patch) {
  return supabase.from('rides').update(patch).eq('id', rideId);
}

export async function getRide(rideId) {
  return supabase.from('rides').select('*').eq('id', rideId).single();
}

// Ride states that mean "a trip is happening right now".
const IN_PROGRESS_STATUSES = ['Requested', 'Accepted', 'Picked Up', 'In Progress'];

/**
 * The one ride a student / parent should currently be looking at:
 *   - a ride that is still in progress, OR
 *   - a just-finished ride they haven't rated yet (so the "Arrived / rate"
 *     screen shows once, then goes away after feedback).
 * Returns the ride object, or null when they're free to book again.
 */
export async function getActiveRideForUser(userId) {
  // 1. Something in progress?
  const { data: live } = await supabase
    .from('rides')
    .select('*')
    .eq('student_id', userId)
    .in('status', IN_PROGRESS_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (live && live[0]) return live[0];

  // 2. A completed ride still waiting for a rating?
  const { data: unrated } = await supabase
    .from('rides')
    .select('*')
    .eq('student_id', userId)
    .eq('status', 'Completed')
    .is('rating', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  return unrated && unrated[0] ? unrated[0] : null;
}

// Append one GPS point to a ride's recorded "path" trail.
// We read the current array, push, and write it back. Fine for a demo; a
// production app might use a separate points table instead.
export async function appendRidePathPoint(rideId, point) {
  const { data, error } = await supabase
    .from('rides')
    .select('path')
    .eq('id', rideId)
    .single();
  if (error) return { error };
  const path = Array.isArray(data?.path) ? data.path : [];
  path.push(point);
  return supabase.from('rides').update({ path }).eq('id', rideId);
}

// ===========================  DRIVER LOCATIONS  ===========================

// Insert-or-update the driver's single "latest position" row.
export async function upsertDriverLocation(driverId, { lat, lng, speed, heading }) {
  return supabase.from('driver_locations').upsert(
    {
      driver_id: driverId,
      lat,
      lng,
      speed,
      heading: heading ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id' },
  );
}

export async function getDriverLocation(driverId) {
  return supabase
    .from('driver_locations')
    .select('*')
    .eq('driver_id', driverId)
    .single();
}

export async function getAllDriverLocations() {
  return supabase.from('driver_locations').select('*');
}

// ===========================  ALERTS  ====================================

export async function createAlert(alert) {
  return supabase.from('alerts').insert(alert);
}

// ===========================  TRIP HISTORY  ==============================

export async function createTripHistory(row) {
  return supabase.from('trip_history').insert(row);
}

// Newest first. Pass a studentId to get just that family's trips.
export async function listTripHistory(studentId) {
  let q = supabase
    .from('trip_history')
    .select('*')
    .order('created_at', { ascending: false });
  if (studentId) q = q.eq('student_id', studentId);
  return q;
}

// ===========================  REALTIME  ==================================
// Subscribe to changes on a table. Returns an "unsubscribe" function you
// should call in a useEffect cleanup.
//
//   const stop = subscribeToChanges({
//     table: 'rides',
//     filter: `id=eq.${rideId}`,   // optional, Supabase filter syntax
//     onChange: (payload) => { ...payload.new... },
//   });
//   // later: stop();
//
export function subscribeToChanges({ table, filter, onChange }) {
  const channelName = `rt-${table}-${filter || 'all'}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      (payload) => onChange(payload),
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
