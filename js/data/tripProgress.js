// Position-based progress along a trip, shared by the vehicle panel and the
// stop departures board.
//
// Given a live vehicle and its trip's ordered stops, we figure out where the
// bus actually is (by projecting it onto the stop-to-stop segments) rather than
// trusting the clock. ETAs are then anchored to that position using scheduled
// travel times, so they stay correct when a service runs late or early.

import { state } from "../state/store.js";
import { haversineMeters, projectOnSegment } from "../utils/geo.js";
import { nowInFeedTz } from "../utils/time.js";

// tripStops: [[stopId, arrivalSec], ...] in stop order.
// Returns { pts, nextIdx, etaToNextSec, delaySec } or null if we can't place
// the bus (e.g. stops lack coordinates).
export function computeProgress(vehicle, tripStops) {
  if (!tripStops || tripStops.length < 2) return null;
  if (!vehicle || !Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lon)) return null;

  const pts = [];
  for (const [stopId, arr] of tripStops) {
    const s = state.stopsById.get(stopId);
    if (s) pts.push({ stopId, arr, lat: s.lat, lon: s.lon });
  }
  if (pts.length < 2) return null;

  let nearest = 0;
  let nd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = haversineMeters(vehicle.lat, vehicle.lon, pts[i].lat, pts[i].lon);
    if (d < nd) {
      nd = d;
      nearest = i;
    }
  }

  const segments = [];
  if (nearest > 0) segments.push([nearest - 1, nearest]);
  if (nearest < pts.length - 1) segments.push([nearest, nearest + 1]);

  let best = null;
  for (const [a, b] of segments) {
    const proj = projectOnSegment(
      vehicle.lat, vehicle.lon,
      pts[a].lat, pts[a].lon,
      pts[b].lat, pts[b].lon
    );
    if (!best || proj.dist < best.dist) best = { a, b, t: proj.t, dist: proj.dist };
  }

  if (!best) {
    return { pts, nextIdx: pts.length - 1, etaToNextSec: 0, delaySec: null };
  }

  const aArr = pts[best.a].arr;
  const bArr = pts[best.b].arr;
  const segDur = Math.max(0, bArr - aArr);
  const etaToNextSec = Math.max(0, segDur * (1 - best.t));
  const schedAtPos = aArr + segDur * best.t;
  const delaySec = nowInFeedTz().seconds - schedAtPos;

  return { pts, nextIdx: best.b, etaToNextSec, delaySec };
}

// Seconds until the bus reaches stopId, or null if it has already passed that
// stop (or the stop isn't on the trip). Anchored to the bus position, so it
// reflects real lateness.
export function etaToStopSec(progress, stopId) {
  if (!progress) return null;
  const { pts, nextIdx, etaToNextSec } = progress;
  for (let i = nextIdx; i < pts.length; i++) {
    if (pts[i].stopId === stopId) {
      return Math.max(0, etaToNextSec + (pts[i].arr - pts[nextIdx].arr));
    }
  }
  return null;
}
