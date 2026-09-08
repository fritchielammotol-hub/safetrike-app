import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, User, Trash2, Map as MapIcon, Activity } from 'lucide-react';

import { supabase } from '../config/supabase';
import { getPendingDrivers, updateProfile, subscribeToChanges } from '../lib/db';

/**
 * SAKAY - Admin command center
 * - Approve / reject pending drivers (profiles table).
 * - Watch live fleet telemetry (driver_locations table, realtime).
 * - See active emergency alerts (alerts table).
 * - Purge demo data before a fresh defense run.
 */
const AdminApp = () => {
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [activeLocations, setActiveLocations] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const refresh = useCallback(async () => {
    const [{ data: drivers }, { data: locs }, { data: al }] = await Promise.all([
      getPendingDrivers(),
      supabase.from('driver_locations').select('*'),
      supabase.from('alerts').select('*').eq('status', 'ACTIVE'),
    ]);
    setPendingDrivers(drivers || []);
    setActiveLocations(locs || []);
    setAlerts(al || []);
  }, []);

  useEffect(() => {
    refresh();
    // Re-load whenever any of the watched tables change.
    const stops = [
      subscribeToChanges({ table: 'driver_locations', onChange: refresh }),
      subscribeToChanges({ table: 'alerts', onChange: refresh }),
      subscribeToChanges({ table: 'profiles', onChange: refresh }),
    ];
    return () => stops.forEach((s) => s());
  }, [refresh]);

  const verifyDriver = async (driverId, newStatus) => {
    await updateProfile(driverId, { verification_status: newStatus });
    refresh();
  };

  const resetDatabase = async () => {
    if (!window.confirm('CRITICAL: wipe all rides, locations, alerts and trip history for a fresh demo. Continue?'))
      return;
    // Delete every row. .neq on a always-present column is the Supabase way
    // to say "match all rows".
    await Promise.all([
      supabase.from('rides').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('driver_locations').delete().neq('driver_id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('trip_history').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);
    alert('System Reset Complete.');
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-900 text-slate-100 font-sans pb-10">
      <header className="p-6 bg-slate-800 border-b border-slate-700 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-tight">Command Center</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              System Oversight v2.0
            </p>
          </div>
        </div>
        <button
          onClick={resetDatabase}
          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-[10px] font-black transition-all border border-red-500/20"
        >
          <Trash2 size={14} /> PURGE DEMO DATA
        </button>
      </header>

      <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vetting queue */}
        <div className="space-y-6">
          <h3 className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest px-2">
            <User size={16} /> Driver Vetting ({pendingDrivers.length})
          </h3>
          {pendingDrivers.length === 0 ? (
            <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 text-center text-slate-500 italic text-sm">
              No pending applications.
            </div>
          ) : (
            pendingDrivers.map((driver) => (
              <div
                key={driver.id}
                className="bg-slate-800 p-5 rounded-3xl border border-slate-700 shadow-xl"
              >
                <div className="mb-4">
                  <p className="font-bold text-lg">{driver.full_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    License: {driver.license_number || '--'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Plate: {driver.plate_number || '--'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => verifyDriver(driver.id, 'Verified')}
                    className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded-xl text-[10px] font-black"
                  >
                    APPROVE
                  </button>
                  <button
                    onClick={() => verifyDriver(driver.id, 'Rejected')}
                    className="flex-1 bg-slate-700 hover:bg-red-900/40 py-2 rounded-xl text-[10px] font-black"
                  >
                    REJECT
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Live ops */}
        <div className="lg:col-span-2 space-y-6">
          {alerts.length > 0 && (
            <section className="bg-red-500/10 border-2 border-red-500 p-6 rounded-[40px] animate-pulse">
              <h3 className="flex items-center gap-2 text-red-500 font-black uppercase text-sm mb-4">
                <AlertTriangle /> CRITICAL SAFETY ALERT
              </h3>
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="bg-red-600 text-white p-4 rounded-2xl flex justify-between items-center shadow-lg"
                  >
                    <div>
                      <p className="font-black text-lg">SOS: {alert.type}</p>
                      <p className="text-[10px] font-bold uppercase opacity-80">
                        {alert.lat != null
                          ? `Location: ${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`
                          : 'Location pending'}
                      </p>
                    </div>
                    <span className="bg-white text-red-600 px-4 py-2 rounded-xl font-black text-[10px]">
                      {alert.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-slate-800 p-6 rounded-[40px] border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                <Activity size={16} className="text-indigo-400" /> Live Fleet Telemetry
              </h3>
              <span className="bg-indigo-500/20 text-indigo-400 text-[10px] px-3 py-1 rounded-full font-black">
                {activeLocations.length} ONLINE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeLocations.map((loc) => (
                <div
                  key={loc.driver_id}
                  className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        loc.speed > 0 ? 'bg-green-500 animate-ping' : 'bg-slate-600'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-bold">
                        Driver: {String(loc.driver_id).substring(0, 6)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {loc.lat != null ? `Lat ${loc.lat.toFixed(4)}` : '--'}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-xl font-black ${
                      loc.speed > 40 ? 'text-red-500' : 'text-slate-300'
                    }`}
                  >
                    {loc.speed} <span className="text-[10px]">KM/H</span>
                  </p>
                </div>
              ))}
            </div>

            {activeLocations.length === 0 && (
              <div className="text-center py-10">
                <MapIcon size={48} className="mx-auto text-slate-700 mb-2" />
                <p className="text-slate-500 text-sm italic">No active drivers on the map.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminApp;
