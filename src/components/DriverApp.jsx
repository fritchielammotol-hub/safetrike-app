import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, Navigation, Loader2, Banknote, CreditCard, X, Save, User, Users,
  LayoutDashboard, MapPin, Radio, AlertTriangle,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

import { supabase } from '../config/supabase';
import {
  updateRide, updateProfile, createTripHistory, subscribeToChanges,
} from '../lib/db';
import { haversineKm } from '../lib/geo';
import { useDriverTracking } from '../hooks/useDriverTracking';
import { useGeofence } from '../hooks/useGeofence';

// Ride statuses that count as "currently being driven".
const ACTIVE_STATUSES = ['Accepted', 'Picked Up', 'In Progress'];

const DriverApp = ({ user, profile }) => {
  const driverId = user.id;

  // Operational state
  const [isOnline, setIsOnline] = useState(false);
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [pastRides, setPastRides] = useState([]);
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [newPhone, setNewPhone] = useState(profile?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  // Geofence alert banner (Feature 2)
  const [zoneAlert, setZoneAlert] = useState(null);

  const avgRating = (() => {
    const rated = pastRides.filter((r) => r.rating);
    if (!rated.length) return 0;
    return (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1);
  })();

  /* ------------------------------------------------------------------ */
  /*  Load rides (market + active + history) and keep them fresh         */
  /* ------------------------------------------------------------------ */
  const refreshRides = useCallback(async () => {
    // 1. Open ride requests (only matters while online)
    const { data: reqs } = await supabase
      .from('rides')
      .select('*')
      .eq('status', 'Requested')
      .order('created_at', { ascending: true });
    setRequests(reqs || []);

    // 2. My current active ride
    const { data: act } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);
    setActiveRide(act && act[0] ? act[0] : null);

    // 3. My completed rides (for earnings + rating)
    const { data: done } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverId)
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false });
    setPastRides(done || []);
  }, [driverId]);

  // Initial load once, then re-load on any change to the rides table.
  useEffect(() => {
    refreshRides();
    const stop = subscribeToChanges({ table: 'rides', onChange: refreshRides });
    return stop;
  }, [refreshRides]);

  /* ------------------------------------------------------------------ */
  /*  FEATURE 1 - continuous GPS tracking (only while online)            */
  /* ------------------------------------------------------------------ */
  const { position, speedKmh, error: gpsError, savedCount } = useDriverTracking({
    enabled: isOnline,
    driverId,
    activeRideId: activeRide?.id || null,
  });

  /* ------------------------------------------------------------------ */
  /*  FEATURE 2 - geofence entry/exit alerts                            */
  /* ------------------------------------------------------------------ */
  useGeofence(position, (evt) => {
    setZoneAlert(
      `${evt.type === 'entered' ? 'Entered' : 'Exited'} ${evt.zoneLabel}`,
    );
    // auto-hide after 6s
    setTimeout(() => setZoneAlert(null), 6000);
  });

  /* ------------------------------------------------------------------ */
  /*  Actions                                                           */
  /* ------------------------------------------------------------------ */
  const acceptRide = async (rideId) => {
    setLoading(true);
    const { error } = await updateRide(rideId, {
      status: 'Accepted',
      driver_id: driverId,
      accepted_at: new Date().toISOString(),
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!activeRide) return;
    if (otpInput === activeRide.otp) {
      await updateRide(activeRide.id, {
        status: 'Picked Up',
        picked_up_at: new Date().toISOString(),
      });
      setOtpInput('');
    } else {
      alert('Incorrect OTP!');
    }
  };

  // FEATURE 4 - write a trip_history summary when the ride ends.
  const completeTrip = async () => {
    if (!activeRide) return;
    setLoading(true);

    const path = Array.isArray(activeRide.path) ? activeRide.path : [];

    // Distance travelled = sum of the little hops in the recorded path.
    let distanceKm = 0;
    for (let i = 1; i < path.length; i++) {
      distanceKm += haversineKm(path[i - 1], path[i]);
    }
    // Fallback if we somehow have no path: straight line origin -> destination.
    if (distanceKm === 0 && activeRide.origin_lat != null) {
      distanceKm = haversineKm(
        { lat: activeRide.origin_lat, lng: activeRide.origin_lng },
        { lat: activeRide.dest_lat, lng: activeRide.dest_lng },
      );
    }

    const startedAt = activeRide.picked_up_at || activeRide.accepted_at || activeRide.created_at;
    const completedAt = new Date().toISOString();
    const durationSeconds = startedAt
      ? Math.round((new Date(completedAt) - new Date(startedAt)) / 1000)
      : 0;

    await createTripHistory({
      ride_id: activeRide.id,
      student_id: activeRide.student_id,
      driver_id: driverId,
      driver_name: profile?.full_name || 'Driver',
      student_name: activeRide.student_name,
      origin_lat: activeRide.origin_lat,
      origin_lng: activeRide.origin_lng,
      dest_lat: activeRide.dest_lat,
      dest_lng: activeRide.dest_lng,
      distance_km: Number(distanceKm.toFixed(2)),
      duration_seconds: durationSeconds,
      fare: activeRide.fare,
      payment_method: activeRide.payment_method,
      path,
      started_at: startedAt,
      completed_at: completedAt,
    });

    await updateRide(activeRide.id, {
      status: 'Completed',
      completed_at: completedAt,
    });

    setActiveRide(null);
    setLoading(false);
  };

  const handleUpdatePhone = async () => {
    setIsSaving(true);
    const { error } = await updateProfile(driverId, { phone: newPhone });
    if (error) alert(error.message);
    else alert('Phone updated!');
    setIsSaving(false);
  };

  const totalEarnings = pastRides.reduce((a, b) => a + (b.fare || 0), 0);

  /* ------------------------------------------------------------------ */
  /*  UI                                                                */
  /* ------------------------------------------------------------------ */
  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden font-sans">
      {/* Header */}
      <div className="relative bg-emerald-900 p-5 text-white flex justify-between items-center shadow-xl z-[100]">
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 p-1 rounded-xl active:bg-emerald-800 transition-colors"
        >
          <div className="bg-emerald-700 p-2 rounded-lg border border-emerald-500 shadow-inner">
            <LayoutDashboard size={20} className="text-yellow-400" />
          </div>
          <div className="text-left">
            <h2 className="font-black text-xs uppercase leading-none tracking-tighter">
              {profile?.full_name || 'Dashboard'}
            </h2>
            <span className="text-[10px] font-black text-yellow-400 italic">
              {avgRating > 0 ? `${avgRating} ⭐` : 'New Driver'}
            </span>
          </div>
        </button>
        <button
          onClick={() => setIsOnline((v) => !v)}
          className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest transition-all shadow-lg ${
            isOnline ? 'bg-emerald-400 text-emerald-900' : 'bg-red-500 text-white'
          }`}
        >
          {isOnline ? '● ONLINE' : '○ OFFLINE'}
        </button>
      </div>

      {/* Live tracking status strip (Feature 1 feedback for the driver) */}
      {isOnline && (
        <div className="bg-emerald-800 text-emerald-50 px-4 py-2 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
          <Radio size={12} className="animate-pulse text-yellow-400" />
          {gpsError ? (
            <span className="text-red-300">GPS: {gpsError}</span>
          ) : position ? (
            <span>
              Live • {speedKmh} km/h • {savedCount} points saved
            </span>
          ) : (
            <span>Acquiring GPS signal…</span>
          )}
        </div>
      )}

      {/* Geofence alert banner (Feature 2) */}
      {zoneAlert && (
        <div className="bg-yellow-400 text-yellow-950 px-4 py-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide animate-in slide-in-from-top">
          <MapPin size={14} /> {zoneAlert}
        </div>
      )}

      {/* Main content */}
      <div className="flex-grow p-4 overflow-y-auto">
        {activeRide ? (
          <div className="bg-white p-6 rounded-[32px] shadow-2xl border-t-8 border-emerald-500 space-y-6">
            <div className="flex justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-black italic uppercase text-slate-800">
                  {activeRide.student_name}
                </h3>
                <p className="text-[10px] font-black text-blue-600 uppercase">
                  {activeRide.booking_source === 'parent'
                    ? '👨‍👩‍👧 Parent Fetch'
                    : '🧑‍🎓 Student Ride'}
                </p>
              </div>
              <p className="text-3xl font-black text-emerald-600 italic tracking-tighter">
                ₱{activeRide.fare}
              </p>
            </div>

            {/* Passengers */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-emerald-600" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Passengers
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeRide.passengers?.map((p, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 uppercase"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Step 1: verification */}
            {activeRide.status === 'Accepted' && (
              <div className="space-y-4">
                {activeRide.booking_source === 'parent' ? (
                  <div className="bg-slate-900 p-6 rounded-[32px] text-center space-y-4 border-b-8 border-orange-500">
                    <div className="bg-white p-3 rounded-2xl inline-block shadow-inner">
                      <QRCodeCanvas value={activeRide.id} size={150} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white uppercase italic animate-pulse">
                        Scan at Guard Gate
                      </p>
                      <div className="mt-2 py-2 bg-orange-600 rounded-xl text-white font-black text-lg tracking-[0.4em]">
                        {activeRide.otp}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 p-6 rounded-3xl border-2 border-dashed border-blue-200">
                    <p className="text-[10px] font-black text-blue-600 uppercase text-center tracking-widest mb-4">
                      Input Student OTP
                    </p>
                    <input
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      className="w-full bg-transparent text-center text-6xl font-black text-slate-800 outline-none"
                      maxLength={4}
                      placeholder="0000"
                      type="tel"
                    />
                    <button
                      onClick={verifyOtp}
                      className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase shadow-lg"
                    >
                      Start Ride
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: in transit */}
            {['Picked Up', 'In Progress'].includes(activeRide.status) && (
              <div className="space-y-4">
                <div className="bg-slate-900 p-8 rounded-[32px] text-white text-center shadow-lg">
                  <Navigation
                    className="mx-auto mb-2 animate-bounce text-yellow-400"
                    size={32}
                  />
                  <p className="font-black text-xl italic uppercase tracking-tighter">
                    In Transit
                  </p>
                  <p className="text-[10px] opacity-70 font-black tracking-[0.2em]">
                    {speedKmh} KM/H
                  </p>
                </div>
                <button
                  onClick={completeTrip}
                  disabled={loading}
                  className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black text-lg shadow-xl uppercase italic tracking-widest active:scale-95 disabled:opacity-60"
                >
                  {loading ? 'Saving…' : 'End Trip'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Marketplace */
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2">
              Nearby Requests ({requests.length})
            </p>
            {!isOnline ? (
              <div className="p-10 text-center bg-white rounded-[40px] border-4 border-dashed border-slate-100 opacity-60">
                <p className="text-[10px] font-black text-slate-400 uppercase italic">
                  You are offline. Go online to receive rides.
                </p>
              </div>
            ) : requests.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-[40px] border-4 border-dashed border-slate-100 opacity-50">
                <Loader2 className="animate-spin mx-auto mb-2 text-slate-300" />
                <p className="text-[10px] font-black text-slate-300 uppercase italic">
                  Scanning for passengers…
                </p>
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white p-5 rounded-[28px] shadow-md flex justify-between items-center border-l-[12px] border-emerald-500"
                >
                  <div>
                    <h4 className="font-black text-slate-800 uppercase italic leading-none mb-1">
                      {req.student_name}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400">
                      ₱{req.fare} • {req.passengers?.length || 0} Pax
                    </p>
                  </div>
                  <button
                    onClick={() => acceptRide(req.id)}
                    disabled={loading}
                    className="bg-emerald-600 text-white h-12 w-12 rounded-full flex items-center justify-center shadow-lg active:scale-90 border-4 border-white"
                  >
                    <Zap size={20} fill="white" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Profile modal */}
      {showProfile && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in slide-in-from-bottom">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2">
              <User className="text-emerald-600" />
              <h3 className="font-black uppercase italic text-slate-800">
                Profile & History
              </h3>
            </div>
            <button
              onClick={() => setShowProfile(false)}
              className="bg-slate-200 p-2 rounded-full"
            >
              <X />
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-900 p-5 rounded-[32px] text-white">
                <p className="text-[10px] font-black uppercase opacity-50">Total Fare</p>
                <p className="text-2xl font-black italic">₱{totalEarnings}</p>
              </div>
              <div className="bg-yellow-400 p-5 rounded-[32px] text-yellow-900">
                <p className="text-[10px] font-black uppercase opacity-50">Rating</p>
                <p className="text-2xl font-black">{avgRating || '0.0'}/5.0</p>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-[32px] space-y-4 border border-slate-100">
              <h4 className="font-black text-[10px] uppercase text-slate-400">
                GCash / Maya Number
              </h4>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="flex-grow p-4 bg-white border rounded-2xl font-black text-sm"
                  placeholder="09XXXXXXXXX"
                />
                <button
                  onClick={handleUpdatePhone}
                  className="bg-emerald-600 text-white px-6 rounded-2xl active:scale-90 shadow-lg"
                >
                  {isSaving ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Save size={20} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-4 pb-10">
              <h4 className="font-black text-[10px] uppercase text-slate-400 ml-2">
                Recent Trips
              </h4>
              {pastRides.length === 0 && (
                <p className="text-[11px] text-slate-400 italic ml-2">No completed trips yet.</p>
              )}
              {pastRides.map((ride) => (
                <div
                  key={ride.id}
                  className="p-4 bg-white rounded-2xl flex justify-between items-center border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-50 p-2 rounded-lg">
                      {ride.payment_method === 'cash' ? (
                        <Banknote size={16} className="text-emerald-600" />
                      ) : (
                        <CreditCard size={16} className="text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-black text-xs uppercase">{ride.student_name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">
                        {ride.payment_method} •{' '}
                        {ride.rating ? `${ride.rating}⭐` : 'No Rating'}
                      </p>
                    </div>
                  </div>
                  <p className="font-black text-emerald-600">₱{ride.fare}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverApp;
