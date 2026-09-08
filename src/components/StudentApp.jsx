import React, { useState, useEffect, useCallback } from 'react';
import L from 'leaflet';
import {
  Loader, Trash2, CheckCircle, Navigation, Zap, CreditCard, Banknote,
  Star, QrCode, Copy, ExternalLink, History,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

import { DEFAULT_LAT, DEFAULT_LNG } from '../config/supabase';
import {
  createRide, updateRide, getProfile, subscribeToChanges, getActiveRideForUser,
} from '../lib/db';
import RouteMap from './RouteMap';
import TripHistory from './TripHistory';

const StudentApp = ({ user, profile }) => {
  const studentId = user.id;

  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const [passengers, setPassengers] = useState([{ id: 1, type: 'student' }]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  // One-time GPS read just to pre-fill the pickup pin (unchanged behaviour).
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setPickupCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPickupCoords({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }),
    );
  }, []);

  /* --------------------------- active ride --------------------------- */
  const refreshRide = useCallback(async () => {
    // In-progress ride, or a finished one still awaiting a rating.
    setActiveRide(await getActiveRideForUser(studentId));
  }, [studentId]);

  useEffect(() => {
    refreshRide();
    const stop = subscribeToChanges({
      table: 'rides',
      filter: `student_id=eq.${studentId}`,
      onChange: refreshRide,
    });
    return stop;
  }, [refreshRide, studentId]);

  useEffect(() => {
    if (!activeRide?.driver_id) {
      setDriverProfile(null);
      return;
    }
    getProfile(activeRide.driver_id).then(({ data }) => setDriverProfile(data));
  }, [activeRide?.driver_id]);

  /* ------------------------------ fare ------------------------------ */
  const calculateTotalFare = () => {
    if (!pickupCoords || !dropoffCoords) return 0;
    const dist = L.latLng(pickupCoords).distanceTo(L.latLng(dropoffCoords)) / 1000;
    const extraKm = Math.ceil(Math.max(0, dist - 3));
    const isGroup = passengers.length > 1;
    return passengers.reduce((total, p) => {
      const base = isGroup
        ? p.type === 'regular' ? 15 : 10
        : p.type === 'regular' ? 20 : 15;
      return total + (base + extraKm * 5);
    }, 0);
  };

  const handleCopy = (num) => {
    navigator.clipboard.writeText(num);
    alert('Copied: ' + num);
  };

  const handleBook = async () => {
    if (!dropoffCoords) return alert('Select destination!');
    setLoading(true);
    const { error } = await createRide({
      student_id: studentId,
      student_name: profile?.full_name || 'Student',
      origin_lat: pickupCoords.lat,
      origin_lng: pickupCoords.lng,
      dest_lat: dropoffCoords.lat,
      dest_lng: dropoffCoords.lng,
      status: 'Requested',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      fare: calculateTotalFare(),
      passengers: passengers.map((p) => p.type),
      payment_method: paymentMethod,
      booking_source: 'student',
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  const submitFeedback = async () => {
    await updateRide(activeRide.id, { rating, comment });
    // Rated -> no longer an active ride. Reset and go back to booking.
    setShowFeedback(false);
    setRating(5);
    setComment('');
    setActiveRide(null);
    refreshRide();
  };

  const tracking =
    !!activeRide && ['Accepted', 'Picked Up', 'In Progress'].includes(activeRide.status);

  const origin = activeRide
    ? { lat: activeRide.origin_lat, lng: activeRide.origin_lng }
    : pickupCoords;
  const destination = activeRide
    ? { lat: activeRide.dest_lat, lng: activeRide.dest_lng }
    : dropoffCoords;

  return (
    <div className="relative h-full w-full bg-slate-50 overflow-hidden font-sans">
      <RouteMap
        origin={origin}
        destination={destination}
        driverId={activeRide?.driver_id}
        rideId={activeRide?.id}
        tracking={tracking}
        markerColor="#2563eb"
        onPickDestination={!activeRide ? (latlng) => setDropoffCoords(latlng) : undefined}
      />

      <button
        onClick={() => setShowHistory(true)}
        className="absolute top-4 right-4 z-[500] bg-white p-3 rounded-2xl shadow-xl active:scale-95"
        title="Trip history"
      >
        <History size={18} className="text-blue-600" />
      </button>

      <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4 z-20">
        <div className="pointer-events-auto w-full max-w-md mx-auto bg-white p-6 rounded-[40px] shadow-2xl border-t border-slate-100 space-y-4 max-h-[75vh] overflow-y-auto">
          {!activeRide ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">
                  Boarding Details
                </h3>
                <button
                  onClick={() =>
                    passengers.length < 5 &&
                    setPassengers([...passengers, { id: Date.now(), type: 'student' }])
                  }
                  className="text-blue-600 font-black text-[10px] uppercase bg-blue-50 px-4 py-2 rounded-full"
                >
                  + Add Pax
                </button>
              </div>

              <p className="text-[10px] font-bold text-slate-400 px-1">
                {dropoffCoords ? 'Destination set. Review and book.' : 'Tap the map to set your destination.'}
              </p>

              <div className="space-y-2">
                {passengers.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <select
                      value={p.type}
                      onChange={(e) =>
                        setPassengers(
                          passengers.map((i) =>
                            i.id === p.id ? { ...i, type: e.target.value } : i,
                          ),
                        )
                      }
                      className="flex-grow p-4 bg-slate-50 rounded-2xl text-xs font-bold uppercase outline-none border border-slate-100"
                    >
                      <option value="student">Student</option>
                      <option value="senior">Senior</option>
                      <option value="pwd">PWD</option>
                      <option value="regular">Regular</option>
                    </select>
                    {passengers.length > 1 && (
                      <button
                        onClick={() => setPassengers(passengers.filter((i) => i.id !== p.id))}
                        className="text-red-400 p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex items-center justify-center gap-2 p-4 rounded-2xl border-2 ${
                    paymentMethod === 'cash'
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-slate-50 text-slate-300'
                  }`}
                >
                  <Banknote size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Cash</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('gcash')}
                  className={`flex items-center justify-center gap-2 p-4 rounded-2xl border-2 ${
                    paymentMethod === 'gcash'
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-slate-50 text-slate-300'
                  }`}
                >
                  <CreditCard size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">GCash</span>
                </button>
              </div>

              <div className="bg-slate-900 p-6 rounded-[30px] flex justify-between items-center text-white">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase leading-none mb-1">
                    Fare
                  </p>
                  <p className="text-3xl font-black italic">₱{calculateTotalFare()}.00</p>
                </div>
                <button
                  onClick={handleBook}
                  disabled={!dropoffCoords || loading}
                  className="bg-blue-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/40 disabled:opacity-50"
                >
                  {loading ? <Loader className="animate-spin" size={16} /> : 'Book'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              {activeRide.status === 'Completed' ? (
                <div className="space-y-4 animate-in zoom-in">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle className="text-green-600" size={32} />
                  </div>
                  <h3 className="font-black text-slate-800 uppercase italic text-2xl">
                    Arrived Safely!
                  </h3>

                  {activeRide.payment_method === 'gcash' && (
                    <div className="bg-blue-600 p-6 rounded-[35px] text-white shadow-2xl border-b-8 border-blue-800">
                      <div className="flex flex-col items-center">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-70 mb-4">
                          Tap QR to Open GCash
                        </p>
                        <a
                          href={`gcash://pay?number=${driverProfile?.phone || '09123456789'}`}
                          className="bg-white p-3 rounded-2xl shadow-inner mb-4 active:scale-90 flex flex-col items-center"
                        >
                          <QRCodeCanvas
                            value={`https://www.gcash.com/pay?number=${driverProfile?.phone || '09123456789'}`}
                            size={140}
                            level="H"
                          />
                          <div className="mt-2 flex items-center gap-1 text-[8px] font-black text-blue-600 uppercase">
                            <ExternalLink size={10} /> Launch App
                          </div>
                        </a>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <h2 className="text-3xl font-black tracking-tighter">
                            {driverProfile?.phone || '09XXXXXXXXX'}
                          </h2>
                          <button
                            onClick={() => handleCopy(driverProfile?.phone || '')}
                            className="p-1.5 bg-white/20 rounded-lg active:bg-white/40"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] font-bold italic opacity-80 uppercase leading-none mb-4">
                          Driver: {driverProfile?.full_name || 'Verified Driver'}
                        </p>
                        <div className="mt-2 w-full pt-4 border-t border-white/20 flex justify-between items-center">
                          <p className="text-[10px] font-black uppercase opacity-60 italic">
                            Fare Due
                          </p>
                          <p className="text-xl font-black italic">₱{activeRide.fare}.00</p>
                        </div>
                      </div>
                      <QrCode className="absolute top-[-20px] left-[-20px] opacity-10" size={100} />
                    </div>
                  )}

                  {!showFeedback ? (
                    <button
                      onClick={() => setShowFeedback(true)}
                      className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase shadow-xl"
                    >
                      Rate & Close
                    </button>
                  ) : (
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-center gap-3">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            onClick={() => setRating(s)}
                            className={rating >= s ? 'text-yellow-400' : 'text-slate-200'}
                          >
                            <Star size={28} fill="currentColor" />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Comment..."
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-3xl text-xs font-bold outline-none h-24"
                      />
                      <button
                        onClick={submitFeedback}
                        className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase"
                      >
                        Submit
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-yellow-400 p-8 rounded-[40px] shadow-xl border-b-8 border-yellow-600">
                    <p className="text-[11px] font-black text-yellow-900 uppercase tracking-widest opacity-60">
                      Boarding Code
                    </p>
                    <p className="text-6xl font-black text-slate-900 my-2 tracking-[0.2em]">
                      {activeRide.otp}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4 py-2 bg-yellow-500/30 rounded-full">
                      <Navigation className="animate-bounce" size={16} />
                      <p className="text-[11px] font-black text-yellow-900 uppercase italic tracking-tighter">
                        {activeRide.status}
                      </p>
                    </div>
                  </div>
                  {driverProfile && (
                    <div className="bg-slate-900 p-5 rounded-[30px] flex items-center justify-between text-white border-l-8 border-blue-500 shadow-2xl">
                      <div className="text-left">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">
                          Your Driver
                        </p>
                        <h4 className="text-lg font-black uppercase italic tracking-tight leading-none">
                          {driverProfile.full_name}
                        </h4>
                        <p className="text-[10px] font-bold opacity-60 uppercase">
                          {driverProfile.plate_number}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-600 rounded-2xl">
                        <Zap className="text-white" fill="white" size={20} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <TripHistory studentId={studentId} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
};

export default StudentApp;
