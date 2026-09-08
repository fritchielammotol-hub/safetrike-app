import React, { useState, useEffect } from 'react';
import { Shield, Home, Loader, LogOut, Download } from 'lucide-react';

import { supabase, isSupabaseConfigured } from './config/supabase';
import { getProfile, ensureProfile, signOut } from './lib/db';

import LoginScreen from './components/LoginScreen';

// Modular role apps
import StudentApp from './components/StudentApp';
import ParentApp from './components/ParentApp';
import DriverApp from './components/DriverApp';
import GuardApp from './components/GuardApp';
import AdminApp from './components/AdminApp';

const VALID_ROLES = ['student', 'parent', 'driver', 'guard', 'admin'];

/* -------------------------------------------------------------------------- */
/*  PWA install prompt (unchanged from before)                                */
/* -------------------------------------------------------------------------- */
const PWAInstallPrompt = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[9999] bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-bounce">
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <Download size={20} />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Install SAKAY App</p>
          <p className="text-[10px] opacity-80 uppercase font-black">Fast access & Full Screen</p>
        </div>
      </div>
      <button
        onClick={handleInstallClick}
        className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-black shadow-lg active:scale-95"
      >
        INSTALL
      </button>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Shown when .env still has placeholder Supabase values                      */
/* -------------------------------------------------------------------------- */
const ConfigNotice = () => (
  <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-8 font-sans">
    <div className="max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-8 space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="text-yellow-400" size={28} />
        <h1 className="font-black text-lg uppercase tracking-tight">Connect Supabase</h1>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">
        This app now runs on <strong>Supabase</strong> instead of Firebase, but no
        project is connected yet.
      </p>
      <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1">
        <li>Create a free project at supabase.com</li>
        <li>Run <code className="text-yellow-400">supabase/migrations/0001_init.sql</code> in the SQL Editor</li>
        <li>
          Copy <code className="text-yellow-400">.env.example</code> to{' '}
          <code className="text-yellow-400">.env</code> and paste your Project URL + anon key
        </li>
        <li>Restart <code className="text-yellow-400">npm run dev</code></li>
      </ol>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  MAIN APP                                                                  */
/* -------------------------------------------------------------------------- */
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // A QR deep-link like  ?role=driver  can still force a specific view.
  const [lockedRole, setLockedRole] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // 1. Read any existing session (page refresh keeps you logged in).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    // 2. React to future sign-in / sign-out events.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });

    // 3. Handle the QR deep link.
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (roleParam && VALID_ROLES.includes(roleParam)) setLockedRole(roleParam);

    return () => sub.subscription.unsubscribe();
  }, []);

  // Whenever we have a session, load (or create) the user's profile row.
  // We only want this to re-run when the *user id* changes, not on every
  // background token refresh - hence the single-value dependency.
  const sessionUser = session?.user;
  useEffect(() => {
    if (!sessionUser) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      let { data, error } = await getProfile(sessionUser.id);

      // Safety net: if the sign-up trigger hasn't run, build a profile from
      // the metadata we stored at sign-up.
      if (error || !data) {
        const meta = sessionUser.user_metadata || {};
        await ensureProfile(sessionUser.id, meta.role || 'student', meta.full_name || '');
        ({ data } = await getProfile(sessionUser.id));
      }

      if (!cancelled) {
        setProfile(data);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  const handleSignOut = async () => {
    await signOut();
    setLockedRole(null);
    // Clean the ?role= param off the URL.
    window.history.pushState({}, '', window.location.pathname);
  };

  /* ----------------------------- render states ----------------------------- */
  if (!isSupabaseConfigured) return <ConfigNotice />;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="p-4 bg-white rounded-full shadow-lg mb-4 animate-bounce">
          <Shield className="text-blue-600" size={40} />
        </div>
        <Loader className="animate-spin text-blue-500 w-8 h-8 mb-2" />
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
          Initialising SAKAY...
        </p>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  // Which role app to show: the QR lock wins, otherwise the account's role.
  const role = lockedRole || profile?.role || 'student';
  const user = session.user;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col h-screen overflow-hidden">
      {/* Slim top bar: who you are + sign out */}
      <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center z-[5000] shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-400 p-1 rounded-md">
            <Shield className="text-slate-900" size={14} />
          </div>
          <span className="font-black text-[11px] uppercase tracking-tighter">
            SAKAY
          </span>
          <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest ml-1">
            {role}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition"
        >
          <LogOut size={12} /> Sign Out
        </button>
      </div>

      {/* Active role app */}
      <main className="flex-grow w-full overflow-hidden">
        {role === 'student' && <StudentApp user={user} profile={profile} />}
        {role === 'parent' && <ParentApp user={user} profile={profile} />}
        {role === 'driver' && <DriverApp user={user} profile={profile} />}
        {role === 'guard' && <GuardApp user={user} profile={profile} />}
        {role === 'admin' && <AdminApp user={user} profile={profile} />}
      </main>

      <PWAInstallPrompt />
    </div>
  );
}
