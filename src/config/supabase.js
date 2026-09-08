// ---------------------------------------------------------------------------
// SAKAY / SafeTrike - Supabase client
// ---------------------------------------------------------------------------
// This file replaces the old Firebase setup (src/config/firebase.js).
// It creates ONE Supabase client that the whole app shares.
//
// The two values below come from your Supabase project:
//   Supabase dashboard  ->  Project Settings  ->  API
// Put them in a file called ".env" in the project root (see .env.example).
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

// Vite exposes any variable that starts with "VITE_" to the browser code.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when real credentials have been filled in.
// Screens use this to show a friendly "connect Supabase" notice instead of
// crashing while the project is still running on placeholder values.
export const isSupabaseConfigured =
  !!url &&
  !!anonKey &&
  !url.includes('YOUR-PROJECT-ref') &&
  !anonKey.includes('your-anon');

// The shared client. If credentials are missing we still create a client with
// harmless placeholder values so imports don't throw; every call will simply
// fail quietly until real values are provided.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,      // keep the user logged in after a refresh
      autoRefreshToken: true,    // refresh the access token automatically
      detectSessionInUrl: true,  // needed for email-confirmation links
    },
  },
);

// --- Map defaults (Cabanatuan City) -----------------------------------------
// Kept here so components can import them from one place, exactly like before.
export const DEFAULT_LAT = 15.4865;
export const DEFAULT_LNG = 120.9734;
