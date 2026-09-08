import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Clock, MapPin, Banknote, CreditCard, ChevronRight, History } from 'lucide-react';

import { listTripHistory } from '../lib/db';
import { formatDistance } from '../lib/eta';

/**
 * FEATURE 4 - Trip history log (viewer)
 * -----------------------------------------------------------------------
 * A simple list of past trips for parents / students, most recent first.
 * Tap a row to see the detail: a mini-map of the recorded route plus the
 * key numbers (distance, duration, fare, driver).
 *
 * The rows come from the `trip_history` table, which the Driver app writes
 * to once, at the moment a ride is completed.
 */

function prettyDuration(seconds) {
  if (!seconds || seconds < 0) return '--';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const TripDetail = ({ trip, onBack }) => {
  const path = Array.isArray(trip.path) ? trip.path : [];
  const center =
    path[0] ||
    (trip.origin_lat != null ? { lat: trip.origin_lat, lng: trip.origin_lng } : null);

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b flex items-center gap-3 bg-slate-50">
        <button onClick={onBack} className="bg-slate-200 p-2 rounded-full rotate-180">
          <ChevronRight />
        </button>
        <div>
          <h3 className="font-black uppercase italic text-slate-800 leading-none">
            {trip.student_name || 'Trip'}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase">
            {prettyDate(trip.completed_at || trip.created_at)}
          </p>
        </div>
      </div>

      {/* Mini route map */}
      <div className="h-56 w-full bg-slate-100 shrink-0">
        {center && (
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {trip.origin_lat != null && (
              <Marker position={[trip.origin_lat, trip.origin_lng]} />
            )}
            {trip.dest_lat != null && (
              <Marker position={[trip.dest_lat, trip.dest_lng]} />
            )}
            {path.length > 1 && (
              <Polyline
                positions={path.map((p) => [p.lat, p.lng])}
                pathOptions={{ color: '#4f46e5', weight: 5, opacity: 0.8 }}
              />
            )}
          </MapContainer>
        )}
      </div>

      <div className="flex-grow overflow-y-auto p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Distance" value={formatDistance(trip.distance_km)} icon={<MapPin size={14} />} />
          <Stat label="Duration" value={prettyDuration(trip.duration_seconds)} icon={<Clock size={14} />} />
          <Stat
            label="Fare"
            value={`₱${trip.fare || 0}`}
            icon={
              trip.payment_method === 'cash' ? (
                <Banknote size={14} />
              ) : (
                <CreditCard size={14} />
              )
            }
          />
          <Stat label="Payment" value={(trip.payment_method || 'cash').toUpperCase()} />
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Driver
          </p>
          <p className="font-black text-slate-800 uppercase">
            {trip.driver_name || 'Verified Driver'}
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          <p>Started: {prettyDate(trip.started_at)}</p>
          <p>Completed: {prettyDate(trip.completed_at)}</p>
          <p>Points recorded: {path.length}</p>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, icon }) => (
  <div className="bg-white border border-slate-100 rounded-2xl p-3">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
      {icon}
      <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <p className="font-black text-slate-800 text-lg italic leading-none">{value}</p>
  </div>
);

const TripHistory = ({ studentId, onClose }) => {
  const [trips, setTrips] = useState(null); // null = loading
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    listTripHistory(studentId).then(({ data }) => setTrips(data || []));
  }, [studentId]);

  return (
    <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in slide-in-from-bottom">
      {selected ? (
        <TripDetail trip={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div className="p-5 border-b flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2">
              <History className="text-indigo-600" />
              <h3 className="font-black uppercase italic text-slate-800">Trip History</h3>
            </div>
            <button onClick={onClose} className="bg-slate-200 p-2 rounded-full">
              <X />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {trips === null && (
              <p className="text-center text-slate-400 text-xs italic py-10">Loading…</p>
            )}
            {trips && trips.length === 0 && (
              <p className="text-center text-slate-400 text-xs italic py-10">
                No completed trips yet.
              </p>
            )}
            {trips &&
              trips.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => setSelected(trip)}
                  className="w-full text-left bg-white border border-slate-100 rounded-3xl p-4 shadow-sm flex items-center justify-between active:scale-[0.98] transition"
                >
                  <div>
                    <p className="font-black text-slate-800 uppercase italic leading-none">
                      {trip.student_name || 'Trip'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                      {prettyDate(trip.completed_at || trip.created_at)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                      {formatDistance(trip.distance_km)} •{' '}
                      {prettyDuration(trip.duration_seconds)} • ₱{trip.fare || 0}
                    </p>
                  </div>
                  <ChevronRight className="text-slate-300" />
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TripHistory;
