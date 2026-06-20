// Fetches the preprocessed static artifacts produced by tools/preprocess.mjs.
// Returns raw parsed JSON; indexing happens in gtfsIndex.js.

import { DATA } from "../config.js";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Core data needed to populate the sidebar and map live vehicles to routes.
// This is light (~2 MB total) so the UI and live feed can come up quickly,
// without waiting on the much larger shapes file (~16 MB).
export async function loadCoreGtfs() {
  const [agencies, routes, stops, trips, meta] = await Promise.all([
    getJson(DATA.agencies).catch(() => []),
    getJson(DATA.routes),
    getJson(DATA.stops),
    getJson(DATA.trips),
    getJson(DATA.meta).catch(() => null),
  ]);
  return { agencies, routes, stops, trips, meta };
}

// Route shape geometry. Only the shapes layer needs this, and only to draw the
// selected route's polyline, so it's loaded separately in the background.
export async function loadShapes() {
  return getJson(DATA.shapes);
}
