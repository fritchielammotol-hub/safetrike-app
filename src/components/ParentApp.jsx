import React, { useState, useEffect, useCallback } from 'react';
import L from 'leaflet';
import {
  Activity, CheckCircle, Zap, X, MapPin, CreditCard, Banknote,
  ExternalLink, ShieldAlert, Trash2, History,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

import { DEFAULT_LAT, DEFAULT_LNG } from '../config/supabase';
import {
  createRide, updateRide, getProfile, createAlert, subscribeToChanges,
  getActiveRideForUser,
} from '../lib/db';
import { useGeofence } from '../hooks/useGeofence';
import RouteMap from './RouteMap';
import TripHistory from './TripHistory';

const ParentApp = ({ user }) => {
  const familyId = user.id; // the parent's id ties the family's rides together

  const [activeRide, setActiveRide] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Booking form
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [passengers, setPassengers] = useState([{ id: 1, type: 'student' }]);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Rating
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  // Geofence toast (Feature 2, parent side)
  const [zoneAlert, setZoneAlert] = useState(null);
  const [driverLivePos, setDriverLivePos] = useState(null);

  /* --------------------------- load active ride --------------------------- */
  const refreshRide = useCallback(async () => {
    // A ride in progress, or a finished ride still awaiting a rating.
    // Once feedback is submitted this returns null -> booking form comes back.
    setActiveRide(await getActiveRideForUser(familyId));
  }, [familyId]);

  useEffect(() => {
    refreshRide();
    const stop = subscribeToChanges({
      table: 'rides',
      filter: `student_id=eq.${familyId}`,
      onChange: refreshRide,
    });
    return stop;
  }, [refreshRide, familyId]);

  /* ----------------------- load the assigned driver ---------------------- */
  useEffect(() => {
    if (!activeRide?.driver_id) {
      setDriverProfile(null);
      return;
    }
    getProfile(activeRide.driver_id).then(({ data }) => setDriverProfile(data));
  }, [activeRide?.driver_id]);

  /* --------------------------- geofence alerts -------------------------- */
  const tracking =
    !!activeRide && ['Accepted', 'Picked Up', 'In Progress'].includes(activeRide.status);

  useGeofence(tracking ? driverLivePos : null, (evt) => {
    setZoneAlert(
      evt.type === 'entered'
        ? `Tricycle has arrived at ${evt.zoneLabel}`
        : `Tricycle has left ${evt.zoneLabel}`,
    );
    setTimeout(() => setZoneAlert(null), 7000);
  });

  /* ------------------------------- fare -------------------------------- */
  const calculateTotalFare = () => {
    if (!pickup || !dropoff) return 0;
    const dist = L.latLng(pickup).distanceTo(L.latLng(dropoff)) / 1000;
    const extraKm = Math.ceil(Math.max(0, dist - 3));
    const isGroup = passengers.length > 1;
    return passengers.reduce((total, p) => {
      const base = isGroup
        ? p.type === 'regular' ? 15 : 10
        : p.type === 'regular' ? 20 : 15;
      return total + (base + extraKm * 5);
    }, 0);
  };

  /* ------------------------------ actions ------------------------------ */
  const handleBook = async () => {
    if (!pickup || !dropoff) return alert('Select School and Home!');
    const { error } = await createRide({
      student_id: familyId,
      student_name: 'Family Fetch',
      origin_lat: pickup.lat,
      origin_lng: pickup.lng,
      dest_lat: dropoff.lat,
      dest_lng: dropoff.lng,
      status: 'Requested',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      fare: calculateTotalFare(),
      passengers: passengers.map((p) => p.type),
      payment_method: paymentMethod,
      booking_source: 'parent',
    });
    if (error) alert(error.message);
  };

  const handlePanic = async () => {
    if (!activeRide) return;
    if (!window.confirm('🚨 TRIGGER EMERGENCY ALERT?')) return;
    await createAlert({
      ride_id: activeRide.id,
      type: 'PANIC_EMERGENCY',
      lat: driverLivePos?.lat ?? null,
      lng: driverLivePos?.lng ?? null,
      status: 'ACTIVE',
    });
    await updateRide(activeRide.id, { status: 'Emergency' });
    alert('Emergency alert sent!');
  };

  const submitFeedback = async () => {
    await updateRide(activeRide.id, { rating, comment });
    // Ride now has a rating -> it stops counting as "active". Reset the form
    // state and re-check; the booking screen comes back.
    setShowFeedback(false);
    setRating(5);
    setComment('');
    setActiveRide(null);
    refreshRide();
  };

  const origin = activeRide
    ? { lat: activeRide.origin_lat, lng: activeRide.origin_lng }
    : pickup;
  const destination = activeRide
    ? { lat: activeRide.dest_lat, lng: activeRide.dest_lng }
    : dropoff;

  /* -------------------------------- UI -------------------------------- */
  return (
    <div className="relative h-full w-full bg-slate-100 overflow-hidden font-sans">
      {/* Map background (also handles destination-pick clicks before booking) */}
      <RouteMap
        origin={origin}
        destination={destination}
        driverId={activeRide?.driver_id}
        rideId={activeRide?.id}
        tracking={tracking}
        markerColor="#4f46e5"
        onDriverMove={({ rawPos }) => setDriverLivePos(rawPos)}
        onPickDestination={
          !activeRide
            ? (latlng) => {
                if (!pickup) setPickup(latlng);
                else setDropoff(latlng);
              }
            : undefined
        }
      />

      {/* Geofence toast */}
      {zoneAlert && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[600] bg-yellow-400 text-yellow-950 px-4 py-2 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-wide flex items-center gap-2 animate-in slide-in-from-top">
          <MapPin size={14} /> {zoneAlert}
        </div>
      )}

      {/* History button */}
      <button
        onClick={() => setShowHistory(true)}
        className="absolute top-4 right-4 z-[500] bg-white p-3 rounded-2xl shadow-xl active:scale-95"
        title="Trip history"
      >
        <History size={18} className="text-indigo-600" />
      </button>

      {/* Overlay UI - sits ABOVE the map (RouteMap is z-0) */}
      <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-4">
        <div className="pointer-events-auto flex justify-between items-start mb-auto mt-16">
          {tracking && driverLivePos && (
            <button
              onClick={handlePanic}
              className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex flex-col items-center border-b-4 border-red-800 active:scale-95 animate-pulse ml-auto"
            >
              <ShieldAlert size={24} />
              <p className="text-[8px] font-black uppercase mt-1">Panic</p>
            </button>
          )}
        </div>

        {/* Driver identity modal */}
        {showDriverModal && driverProfile && (
          <div className="pointer-events-auto absolute inset-0 bg-black/40 flex items-center justify-center p-6 z-[100]">
            <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden">
              <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                <h3 className="font-black uppercase italic tracking-tighter">
                  Driver Identity
                </h3>
                <button onClick={() => setShowDriverModal(false)}>
                  <X />
                </button>
              </div>
              <div className="p-6 space-y-4 text-left">
                <h2 className="font-black text-slate-800 text-xl uppercase leading-none">
                  {driverProfile.full_name}
                </h2>
                <div className="bg-slate-50 p-4 rounded-3xl space-y-2">
                  <p className="text-[10px] font-bold uppercase">
                    Plate: {driverProfile.plate_number || '--'}
                  </p>
                  <p className="text-[10px] font-bold uppercase">
                    License: {driverProfile.license_number || '--'}
                  </p>
                  <div className="flex gap-2 pt-2 border-t">
                    <MapPin size={12} />
                    <p className="text-[10px] uppercase font-bold">
                      {driverProfile.address || '--'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDriverModal(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom card */}
        <div className="pointer-events-auto w-full max-w-md mx-auto">
          <div className="bg-white p-6 rounded-[40px] shadow-2xl border-t-4 border-indigo-600 max-h-[75vh] overflow-y-auto">
            {!activeRide ? (
              /* -------- booking form -------- */
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">
                    Barkada Fetch
                  </h3>
                  <button
                    onClick={() =>
                      setPassengers([...passengers, { id: Date.now(), type: 'student' }])
                    }
                    className="text-indigo-600 font-black text-[10px] uppercase bg-indigo-50 px-3 py-1.5 rounded-full"
                  >
                    + Add
                  </button>
                </div>

                <p className="text-[10px] font-bold text-slate-400">
                  {!pickup
                    ? 'Tap the map to set the SCHOOL (pickup).'
                    : !dropoff
                    ? 'Now tap the map to set HOME (drop-off).'
                    : 'Pickup and drop-off set. Review and book.'}
                </p>

                <div className="space-y-2">
                  {passengers.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <select
                        value={p.type}
                        onChange={(e) =>
                          setPassengers(
                            passengers.map((item) =>
                              item.id === p.id ? { ...item, type: e.target.value } : item,
                            ),
                          )
                        }
                        className="flex-grow p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none"
                      >
                        <option value="student">Student</option>
                        <option value="senior">Senior</option>
                        <option value="pwd">PWD</option>
                        <option value="regular">Regular</option>
                      </select>
                      {passengers.length > 1 && (
                        <button
                          onClick={() =>
                            setPassengers(passengers.filter((i) => i.id !== p.id))
                          }
                          className="text-red-400 p-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 ${
                      paymentMethod === 'cash'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-50 text-slate-300'
                    }`}
                  >
                    <Banknote size={20} />
                    <span className="text-[10px] font-black uppercase">Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('gcash')}
                    className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 ${
                      paymentMethod === 'gcash'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-50 text-slate-300'
                    }`}
                  >
                    <CreditCard size={20} />
                    <span className="text-[10px] font-black uppercase">GCash</span>
                  </button>
                </div>

                <div className="bg-slate-900 p-5 rounded-3xl flex justify-between items-center text-white">
                  <p className="text-2xl font-black italic">₱{calculateTotalFare()}.00</p>
                  <button
                    onClick={handleBook}
                    disabled={!pickup || !dropoff}
                    className="bg-indigo-600 px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl disabled:opacity-50"
                  >
                    Book
                  </button>
                </div>
              </div>
            ) : (
              /* -------- active ride -------- */
              <div className="text-center py-2 space-y-4">
                {activeRide.status === 'Completed' ? (
                  <div className="animate-in zoom-in space-y-4">
                    {!showFeedback ? (
                      <>
                        <CheckCircle className="text-green-500 mx-auto" size={48} />
                        <h3 className="font-black text-slate-800 uppercase italic text-xl">
                          Arrived Safely!
                        </h3>
                        {activeRide.payment_method === 'gcash' && driverProfile && (
                          <div className="bg-blue-600 p-6 rounded-[35px] text-white shadow-2xl text-left border-b-8 border-blue-800">
                            <p className="text-[9px] font-black uppercase opacity-60 mb-4 text-center">
                              Remote GCash Portal
                            </p>
                            <div className="flex flex-col items-center">
                              <a
                                href={`gcash://pay?number=${driverProfile.phone}`}
                                className="bg-white p-3 rounded-2xl mb-4 active:scale-95 flex flex-col items-center"
                              >
                                <QRCodeCanvas
                                  value={`https://www.gcash.com/pay?number=${driverProfile.phone}`}
                                  size={130}
                                />
                                <span className="text-[7px] font-black text-blue-600 uppercase mt-2 flex items-center gap-1">
                                  <ExternalLink size={8} /> Tap to open GCash
                                </span>
                              </a>
                              <h2 className="text-2xl font-black tracking-tighter">
                                {driverProfile.phone}
                              </h2>
                              <p className="text-[10px] opacity-80 uppercase font-bold italic">
                                Driver: {driverProfile.full_name}
                              </p>
                              <div className="mt-4 w-full pt-4 border-t border-white/20 flex justify-between items-center text-xs">
                                <p className="font-black uppercase opacity-60">Fare</p>
                                <p className="font-black italic">₱{activeRide.fare}.00</p>
                              </div>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => setShowFeedback(true)}
                          className="w-full py-4 bg-indigo-600 text-white rounded-3xl font-black text-xs uppercase shadow-xl"
                        >
                          Rate your Driver
                        </button>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-center gap-3 py-2">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              onClick={() => setRating(s)}
                              className={rating >= s ? 'text-yellow-400' : 'text-slate-200'}
                            >
                              <Zap size={32} fill="currentColor" />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Comments..."
                          className="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-bold outline-none min-h-[80px]"
                        />
                        <button
                          onClick={submitFeedback}
                          className="w-full py-4 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase"
                        >
                          Submit Feedback
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-yellow-400 p-8 rounded-[40px] shadow-xl border-b-8 border-yellow-600">
                      <p className="text-[10px] font-black text-yellow-900 uppercase opacity-60 tracking-widest">
                        Verification Code
                      </p>
                      <p className="text-5xl font-black text-slate-900 my-2 tracking-[0.2em]">
                        {activeRide.otp}
                      </p>
                      <div className="mt-4 py-2 bg-yellow-500/30 rounded-full text-[10px] font-black text-yellow-900 uppercase italic">
                        Status: {activeRide.status}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Activity className="text-indigo-600 animate-pulse" size={16} />
                      <p className="font-black text-slate-800 uppercase text-xs">
                        Monitoring Child: {activeRide.status}
                      </p>
                    </div>
                    {driverProfile && (
                      <button
                        onClick={() => setShowDriverModal(true)}
                        className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase"
                      >
                        View Driver Identity
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showHistory && (
        <TripHistory studentId={familyId} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
};

export default ParentApp;
