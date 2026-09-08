import React, { useState } from 'react';
import { Shield, LogIn, UserPlus, Loader2, Mail, Lock, User as UserIcon } from 'lucide-react';
import { signIn, signUp } from '../lib/db';

/**
 * SAKAY - Login / Sign-up screen
 * -----------------------------------------------------------------------
 * Replaces the old Firebase "anonymous" login. Now every user has a real
 * email + password account, and a ROLE chosen at sign-up (student, parent,
 * driver, guard, admin). App.jsx shows this screen whenever nobody is
 * logged in; once Supabase reports a session, the matching role app opens.
 */
const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'driver', label: 'Driver' },
  { value: 'guard', label: 'Guard' },
  { value: 'admin', label: 'Admin' },
];

const LoginScreen = () => {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const { error } = await signIn({ email, password });
        if (error) throw error;
        // Success: App.jsx's auth listener takes over from here.
      } else {
        const { data, error } = await signUp({ email, password, role, fullName });
        if (error) throw error;
        // If email confirmation is ON in Supabase, there is no session yet.
        if (!data.session) {
          setMessage({
            type: 'ok',
            text: 'Account created. If asked, confirm via the email link, then sign in.',
          });
          setMode('signin');
        }
      }
    } catch (err) {
      setMessage({ type: 'err', text: err.message || 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-yellow-400 p-3 rounded-2xl shadow-xl mb-3">
            <Shield className="text-slate-900" size={28} />
          </div>
          <h1 className="text-white font-black text-2xl uppercase tracking-tighter">
            SAKAY <span className="text-yellow-400 font-light">App</span>
          </h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-1">
            Student Safety Ecosystem
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[32px] shadow-2xl p-6 space-y-4"
        >
          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${
                mode === 'signin' ? 'bg-slate-900 text-white shadow' : 'text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${
                mode === 'signup' ? 'bg-slate-900 text-white shadow' : 'text-slate-400'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Sign-up-only fields */}
          {mode === 'signup' && (
            <>
              <label className="block">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Full Name
                </span>
                <div className="mt-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4">
                  <UserIcon size={16} className="text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="flex-grow bg-transparent py-3 text-sm font-bold outline-none"
                    placeholder="Juan Dela Cruz"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  I am a...
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold uppercase outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {/* Email */}
          <label className="block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Email
            </span>
            <div className="mt-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4">
              <Mail size={16} className="text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-grow bg-transparent py-3 text-sm font-bold outline-none"
                placeholder="you@example.com"
              />
            </div>
          </label>

          {/* Password */}
          <label className="block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Password
            </span>
            <div className="mt-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4">
              <Lock size={16} className="text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-grow bg-transparent py-3 text-sm font-bold outline-none"
                placeholder="at least 6 characters"
              />
            </div>
          </label>

          {/* Message */}
          {message && (
            <p
              className={`text-[11px] font-bold rounded-xl px-3 py-2 ${
                message.type === 'err'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {message.text}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 bg-yellow-400 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : mode === 'signin' ? (
              <LogIn size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-slate-500 text-[10px] font-medium uppercase tracking-[0.2em] mt-6">
          Sakay App Project &copy; 2026 Cabanatuan City
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
