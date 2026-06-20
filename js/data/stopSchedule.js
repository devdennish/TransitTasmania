// Builds a per-stop departures index by inverting trip_stops.json (the same
// file the vehicle panel already lazy-loads), then answers "next departures
// from this stop", filtered to services running today.
//
// No extra large download: we reuse trip_stops and build the inverse index in
// memory the first time a stop schedule is requested.

import { loadTripStops } from "./tripStops.js";
import { activeServices } from "./calendar.js";
import { state } from "../state/store.js";
import { nowInFeedTz } from "../utils/time.js";
import { DEPARTURES_COUNT } from "../config.js";
import { computeProgress, etaToStopSec } from "./tripProgress.js";

let index = null; // stopId -> [{ tripId, sec }] sorted by sec
let inflight = null;

function buildIndex(tripStops) {
  const idx = new Map();
  for (const tripId of Object.keys(tripStops)) {
    for (const [stopId, sec] of tripStops[tripId]) {
      let arr = idx.get(stopId);
      if (!arr) {
        arr = [];
        idx.set(stopId, arr);
      }
      arr.push({ tripId, sec });
    }
  }
  for (const arr of idx.values()) arr.sort((a, b) => a.sec - b.sec);
  return idx;
}

function ensureIndex() {
  if (index) return Promise.resolve(index);
  if (inflight) return inflight;
  inflight = loadTripStops().then((tripStops) => {
    index = buildIndex(tripStops);
    inflight = null;
    return index;
  });
  return inflight;
}

// Returns { departures, now } for a stop, limited to the next
// DEPARTURES_COUNT departures among services running today.
//
// Each departure: { tripId, sec, routeId, headsign, live, liveEtaSec }.
//   sec        scheduled departure (seconds since midnight)
//   live       a tracked vehicle is currently operating this trip
//   liveEtaSec real-time seconds until arrival (position-based) when live
//
// Trips with a live vehicle use their real-time ETA for ordering, and a late
// bus whose scheduled time has already passed is re-included as long as it
// hasn't yet reached this stop.
export async function getStopDepartures(stopId, limit = DEPARTURES_COUNT) {
  const idx = await ensureIndex();
  const tripStops = await loadTripStops();
  const now = nowInFeedTz();
  const active = await activeServices(now.dateStr, now.weekday);

  const byTrip = new Map();

  // 1. Scheduled future departures among today's services.
  for (const { tripId, sec } of idx.get(stopId) || []) {
    if (sec < now.seconds - 60) continue; // already departed (schedule)
    const trip = state.trips[tripId];
    if (!trip || !active.has(trip.serviceId)) continue;
    if (!byTrip.has(tripId)) {
      byTrip.set(tripId, {
        tripId, sec, routeId: trip.routeId, headsign: trip.headsign,
        live: false, liveEtaSec: null,
      });
    }
  }

  // 2. Live augmentation: a tracked bus heading to this stop overrides (or
  //    re-adds) its departure with a real-time, delay-aware ETA.
  for (const v of state.vehicles.values()) {
    if (!v.tripId) continue;
    const stops = tripStops[v.tripId];
    if (!stops || !stops.some(([sid]) => sid === stopId)) continue;

    const eta = etaToStopSec(computeProgress(v, stops), stopId);
    if (eta == null) continue; // already passed this stop, or unplaceable

    const trip = state.trips[v.tripId];
    const schedSec = (stops.find(([sid]) => sid === stopId) || [])[1] ?? null;
    let entry = byTrip.get(v.tripId);
    if (!entry) {
      entry = {
        tripId: v.tripId,
        sec: schedSec != null ? schedSec : now.seconds + eta,
        routeId: trip?.routeId ?? v.routeId,
        headsign: trip?.headsign ?? "",
        live: false,
        liveEtaSec: null,
      };
      byTrip.set(v.tripId, entry);
    }
    entry.live = true;
    entry.liveEtaSec = eta;
  }

  // 3. Order by effective time (live ETA when tracked, else schedule).
  const effective = (e) => (e.liveEtaSec != null ? now.seconds + e.liveEtaSec : e.sec);
  const departures = [...byTrip.values()]
    .sort((a, b) => effective(a) - effective(b))
    .slice(0, limit);

  return { departures, now };
}
