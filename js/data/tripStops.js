// Lazy loader for per-trip stop schedules (data/trip_stops.json, ~6MB).
//
// This file is only needed when the user inspects a vehicle, so we fetch it on
// first request and cache the parsed result (and the in-flight promise, so
// concurrent clicks share a single download).

import { DATA } from "../config.js";

let cache = null; // { [tripId]: [[stopId, arrivalSec], ...] }
let inflight = null;

export function loadTripStops() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(DATA.tripStops)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load trip stops: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      cache = data;
      inflight = null;
      return cache;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// Returns the ordered [stopId, arrivalSec] list for a trip, or null.
export async function getTripStops(tripId) {
  if (!tripId) return null;
  const all = await loadTripStops();
  return all[tripId] || null;
}
