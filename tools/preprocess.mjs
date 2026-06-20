#!/usr/bin/env node
// Offline GTFS preprocessor.
// Reads the raw feed in ../tas_gtfs and writes compact, app-ready artifacts
// into ../data so the browser never has to parse the multi-megabyte source.
//
// Run with: node tools/preprocess.mjs
//
// Outputs:
//   data/agencies.json   operator details (id, name, url, phone)
//   data/routes.json     route metadata joined with agency name
//   data/stops.json      trimmed stop list (id, name, lat, lon, parent)
//   data/trips.json      trip_id -> { routeId, shapeId, headsign, direction }
//   data/shapes.geojson  one LineString Feature per shape_id
//   data/trip_stops.json trip_id -> [[stopId, arrivalSec], ...] in stop order
//   data/calendar.json   service weekly pattern, date range, and exceptions
//   data/meta.json       feed info + generation stats

import { createReadStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "tas_gtfs");
const OUT = join(ROOT, "data");

// --- Minimal RFC-4180-ish CSV line parser ---------------------------------
// Handles quoted fields, escaped quotes (""), and commas inside quotes.
function parseCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

// Stream a CSV file row-by-row, invoking onRow(record) for each data line.
// Returns a promise that resolves once the whole file is read.
async function streamCsv(path, onRow) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let header = null;
  let count = 0;
  for await (const rawLine of rl) {
    if (rawLine === "") continue;
    const cells = parseCsvLine(rawLine);
    if (!header) {
      header = cells.map((h) => h.trim().replace(/^\uFEFF/, ""));
      continue;
    }
    const record = {};
    for (let i = 0; i < header.length; i++) {
      record[header[i]] = cells[i] !== undefined ? cells[i].trim() : "";
    }
    onRow(record);
    count++;
  }
  return count;
}

// "HH:MM:SS" -> seconds since midnight (GTFS hours can exceed 24). null if blank.
function hmsToSeconds(hms) {
  if (!hms) return null;
  const parts = hms.split(":");
  if (parts.length !== 3) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  return h * 3600 + m * 60 + s;
}

async function readAll(path) {
  const rows = [];
  await streamCsv(path, (r) => rows.push(r));
  return rows;
}

async function main() {
  const t0 = Date.now();
  await mkdir(OUT, { recursive: true });

  // --- agency: full operator records (id, name, url, phone) ---------------
  const agencies = [];
  const agencyById = new Map(); // id -> name (for joining onto routes)
  await streamCsv(join(SRC, "agency.txt"), (r) => {
    if (!r.agency_id) return;
    agencies.push({
      id: r.agency_id,
      name: r.agency_name,
      url: r.agency_url || null,
      phone: r.agency_phone || null,
    });
    agencyById.set(r.agency_id, r.agency_name);
  });

  // --- routes -------------------------------------------------------------
  const routes = [];
  await streamCsv(join(SRC, "routes.txt"), (r) => {
    routes.push({
      id: r.route_id,
      agencyId: r.agency_id,
      agency: agencyById.get(r.agency_id) || r.agency_id || "",
      shortName: r.route_short_name,
      longName: r.route_long_name,
      type: r.route_type ? Number(r.route_type) : null,
      color: r.route_color || null,
      textColor: r.route_text_color || null,
    });
  });

  // --- stops --------------------------------------------------------------
  const stops = [];
  await streamCsv(join(SRC, "stops.txt"), (r) => {
    const lat = parseFloat(r.stop_lat);
    const lon = parseFloat(r.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    stops.push({
      id: r.stop_id,
      code: r.stop_code || null,
      name: r.stop_name,
      lat,
      lon,
      parent: r.parent_station || null,
      locationType: r.location_type ? Number(r.location_type) : 0,
    });
  });

  // --- trips: trip_id -> compact record ----------------------------------
  const trips = {};
  await streamCsv(join(SRC, "trips.txt"), (r) => {
    trips[r.trip_id] = {
      routeId: r.route_id,
      serviceId: r.service_id,
      shapeId: r.shape_id || null,
      headsign: r.trip_headsign || "",
      direction: r.direction_id !== "" ? Number(r.direction_id) : null,
    };
  });

  // --- shapes -> GeoJSON FeatureCollection -------------------------------
  // Group points by shape_id, ordered by shape_pt_sequence.
  const shapePoints = new Map(); // shapeId -> [{ seq, lat, lon }]
  await streamCsv(join(SRC, "shapes.txt"), (r) => {
    const lat = parseFloat(r.shape_pt_lat);
    const lon = parseFloat(r.shape_pt_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const seq = Number(r.shape_pt_sequence);
    let arr = shapePoints.get(r.shape_id);
    if (!arr) {
      arr = [];
      shapePoints.set(r.shape_id, arr);
    }
    arr.push({ seq, lat, lon });
  });

  // --- stop_times -> trip_id -> ordered [stopId, arrivalSec] -------------
  // Powers the per-vehicle "upcoming stops + scheduled ETA" panel. We keep
  // arrival seconds-since-midnight (GTFS allows >24h for after-midnight trips).
  const tripStopRows = new Map(); // tripId -> [{ seq, stopId, arr }]
  await streamCsv(join(SRC, "stop_times.txt"), (r) => {
    const arr = hmsToSeconds(r.arrival_time || r.departure_time);
    if (arr == null) return;
    let list = tripStopRows.get(r.trip_id);
    if (!list) {
      list = [];
      tripStopRows.set(r.trip_id, list);
    }
    list.push({ seq: Number(r.stop_sequence), stopId: r.stop_id, arr });
  });

  const tripStops = {};
  for (const [tripId, list] of tripStopRows) {
    list.sort((a, b) => a.seq - b.seq);
    tripStops[tripId] = list.map((x) => [x.stopId, x.arr]);
  }

  const features = [];
  for (const [shapeId, pts] of shapePoints) {
    pts.sort((a, b) => a.seq - b.seq);
    // GeoJSON coordinates are [lon, lat]; round to ~5 decimals (~1m) to shrink.
    const coordinates = pts.map((p) => [
      Math.round(p.lon * 1e5) / 1e5,
      Math.round(p.lat * 1e5) / 1e5,
    ]);
    features.push({
      type: "Feature",
      properties: { shapeId },
      geometry: { type: "LineString", coordinates },
    });
  }
  const shapesGeojson = { type: "FeatureCollection", features };

  // --- calendar: which services run on which days -------------------------
  // services[serviceId] = { days:[mon..sun 0/1], start:"YYYYMMDD", end:"YYYYMMDD" }
  // exceptions[serviceId][date] = 1 (added) | 2 (removed)
  const services = {};
  await streamCsv(join(SRC, "calendar.txt"), (r) => {
    services[r.service_id] = {
      days: [
        Number(r.monday), Number(r.tuesday), Number(r.wednesday),
        Number(r.thursday), Number(r.friday), Number(r.saturday), Number(r.sunday),
      ],
      start: r.start_date,
      end: r.end_date,
    };
  });

  const exceptions = {};
  await streamCsv(join(SRC, "calendar_dates.txt"), (r) => {
    if (!exceptions[r.service_id]) exceptions[r.service_id] = {};
    exceptions[r.service_id][r.date] = Number(r.exception_type);
  });

  const calendar = { services, exceptions };

  // --- feed meta ----------------------------------------------------------
  const feedRows = await readAll(join(SRC, "feed_info.txt"));
  const feed = feedRows[0] || {};
  const meta = {
    generatedAt: new Date().toISOString(),
    feed: {
      publisher: feed.feed_publisher_name || null,
      url: feed.feed_publisher_url || null,
      lang: feed.feed_lang || null,
      startDate: feed.feed_start_date || null,
      endDate: feed.feed_end_date || null,
      version: feed.feed_version || null,
    },
    counts: {
      agencies: agencies.length,
      routes: routes.length,
      stops: stops.length,
      trips: Object.keys(trips).length,
      shapes: features.length,
      tripStops: Object.keys(tripStops).length,
      services: Object.keys(services).length,
    },
  };

  // --- write outputs ------------------------------------------------------
  await Promise.all([
    writeFile(join(OUT, "agencies.json"), JSON.stringify(agencies)),
    writeFile(join(OUT, "routes.json"), JSON.stringify(routes)),
    writeFile(join(OUT, "stops.json"), JSON.stringify(stops)),
    writeFile(join(OUT, "trips.json"), JSON.stringify(trips)),
    writeFile(join(OUT, "trip_stops.json"), JSON.stringify(tripStops)),
    writeFile(join(OUT, "calendar.json"), JSON.stringify(calendar)),
    writeFile(join(OUT, "shapes.geojson"), JSON.stringify(shapesGeojson)),
    writeFile(join(OUT, "meta.json"), JSON.stringify(meta, null, 2)),
  ]);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("GTFS preprocessing complete in %ss", dt);
  console.table(meta.counts);
  console.log("Output written to %s", OUT);
}

main().catch((err) => {
  console.error("Preprocessing failed:", err);
  process.exit(1);
});
