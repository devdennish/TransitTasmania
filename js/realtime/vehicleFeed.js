// The ONLY place that knows the live feed's wire format. It parses raw frames
// from the Public Transport Tasmania WebSocket, normalizes each record into a
// canonical vehicle object, and pushes the batch to the store. If the feed
// format changes, edit this file and nothing else in the app needs to change.
//
// Wire format (observed):
//   A frame is a pipe-delimited list of records, each prefixed with "V_":
//     V_{json}|V_{json}|V_{json}...
//   Each record:
//     {
//       "type": "APPROACHING",
//       "vehicleId": "MET834",
//       "tripId": "424976-MT2026-MT_N_Wk-Weekday-005_2026-06-19_110_0_16:40:00",
//       "vehicleLocation": { "location": {"latitude":..,"longitude":..}, "heading":.. },
//       "lineNumber": "110",
//       "tripTemplateId": "..."
//     }
//
// Canonical vehicle shape pushed to the store:
//   { id, lat, lon, bearing, tripId, lineNumber, routeId, ts }

import { connectVehicleStream } from "./wsClient.js";
import { upsertVehicles } from "../state/store.js";

// The realtime tripId is the GTFS trip_id plus a "_<YYYY-MM-DD>_<line>_<dir>_<time>"
// suffix. Strip it back to the GTFS trip_id so route/headsign lookups resolve.
function toGtfsTripId(rtTripId) {
  if (!rtTripId) return null;
  return rtTripId.replace(/_\d{4}-\d{2}-\d{2}_.*$/, "");
}

function normalize(rec) {
  const loc = rec.vehicleLocation?.location;
  const lat = Number(loc?.latitude);
  const lon = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const id = rec.vehicleId;
  if (id == null || id === "") return null;

  const headingRaw = rec.vehicleLocation?.heading;
  const bearing = headingRaw != null ? Number(headingRaw) : null;

  return {
    id: String(id),
    lat,
    lon,
    bearing: Number.isFinite(bearing) ? bearing : null,
    tripId: toGtfsTripId(rec.tripId),
    lineNumber: rec.lineNumber != null ? String(rec.lineNumber) : null,
    routeId: null, // resolved in the store via tripId / lineNumber
    ts: Date.now(),
  };
}

function handleFrame(raw) {
  if (typeof raw !== "string" || raw.length === 0) return;

  const batch = [];
  for (const token of raw.split("|")) {
    if (!token.startsWith("V_")) continue; // skip control frames / partials
    const json = token.slice(2);
    let rec;
    try {
      rec = JSON.parse(json);
    } catch {
      continue; // ignore malformed / truncated records
    }
    const v = normalize(rec);
    if (v) batch.push(v);
  }
  if (batch.length) upsertVehicles(batch);
}

export function startVehicleFeed() {
  return connectVehicleStream(handleFrame);
}
