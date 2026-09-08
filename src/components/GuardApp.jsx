import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import { Shield, Camera, Truck, Users, CheckCircle } from 'lucide-react';

import { getRide, getProfile, updateRide } from '../lib/db';

/**
 * SAKAY - Guard gate terminal
 * The guard scans the driver's QR code (which is the ride id). We look up
 * the ride + driver, show the boarding list, and let the guard authorise
 * the release (which moves the ride to "Picked Up").
 */
const GuardApp = () => {
  const [scanning, setScanning] = useState(false);
  const [rideData, setRideData] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);

  const handleScan = async (result) => {
    if (!result?.text) return;
    setScanning(false);
    try {
      const { data: ride, error } = await getRide(result.text);
      if (error || !ride) {
        alert('Invalid QR');
        return;
      }
      setRideData(ride);
      if (ride.driver_id) {
        const { data: driver } = await getProfile(ride.driver_id);
        setDriverProfile(driver);
      }
    } catch {
      alert('Invalid QR');
    }
  };

  const authorizeRelease = async () => {
    await updateRide(rideData.id, {
      status: 'Picked Up',
      picked_up_at: new Date().toISOString(),
    });
    alert('Authorized!');
    setRideData(null);
    setDriverProfile(null);
  };

  return (
    <div className="h-full bg-orange-50 flex flex-col font-sans overflow-hidden">
      <div className="bg-orange-700 p-6 text-white flex justify-between items-center shadow-xl z-20">
        <div>
          <h1 className="font-black italic uppercase text-lg leading-none">SafeTrike Gate</h1>
          <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
            Security Terminal
          </p>
        </div>
        <Shield size={28} className="text-orange-300" />
      </div>

      <div className="flex-grow p-6 flex flex-col items-center justify-center">
        {!scanning && !rideData ? (
          <button
            onClick={() => setScanning(true)}
            className="bg-orange-600 text-white p-12 rounded-[50px] shadow-2xl flex flex-col items-center gap-4 active:scale-95 border-b-8 border-orange-800"
          >
            <Camera size={56} />
            <span className="font-black uppercase tracking-tighter text-sm">Scan Driver QR</span>
          </button>
        ) : scanning ? (
          <div className="w-full max-w-sm rounded-[40px] overflow-hidden shadow-2xl border-8 border-white bg-black">
            <QrReader
              onResult={handleScan}
              constraints={{ facingMode: 'environment' }}
              style={{ width: '100%' }}
            />
            <button
              onClick={() => setScanning(false)}
              className="w-full py-4 text-white font-bold text-xs uppercase"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl p-6 border-t-[12px] border-green-500 animate-in zoom-in">
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center gap-4 mb-4">
              <Truck size={24} className="text-green-600" />
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase">Driver Info</p>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">
                  {driverProfile?.full_name || 'Unknown'}
                </h3>
                <p className="text-[10px] font-bold text-green-600 italic uppercase">
                  PLATE: {driverProfile?.plate_number || '--'}
                </p>
              </div>
            </div>
            <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-indigo-600" />
                <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">
                  Verify Boarding List
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {rideData.passengers?.map((type, i) => (
                  <div
                    key={i}
                    className="bg-white px-3 py-2 rounded-xl border border-indigo-100 flex items-center gap-2"
                  >
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                    <span className="text-[10px] font-black uppercase text-indigo-900 tracking-tighter">
                      {type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <button
                onClick={authorizeRelease}
                className="w-full py-5 bg-green-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-green-100 flex items-center justify-center gap-3 active:scale-95"
              >
                <CheckCircle size={24} /> AUTHORIZE RELEASE
              </button>
              <button
                onClick={() => {
                  setRideData(null);
                  setDriverProfile(null);
                }}
                className="w-full py-3 text-slate-400 font-black text-[10px] uppercase"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuardApp;
