// Central configuration. Edit values here rather than scattering constants.

// Tasmania-wide view (covers Hobart, Launceston, the north-west and east coast).
export const MAP_CENTER = [-42.0, 146.8];
export const MAP_ZOOM = 8;

// Base map tiles per theme (CARTO basemaps).
export const TILE_URL_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const TILE_URL_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
// Backwards-compatible default (dark).
export const TILE_URL = TILE_URL_DARK;
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Live vehicle position WebSocket (Public Transport Tasmania real-time feed).
// Override with ?ws=wss://... in the URL.
export const WS_URL =
  new URLSearchParams(location.search).get("ws") ||
  "wss://real-time.transport.tas.gov.au/timetable/websocket/all?map";

// Text frame sent on connect to request the full live vehicle set.
export const WS_INIT_MESSAGE = "V_ALL";

// Reconnect backoff (ms): starts at MIN, doubles up to MAX.
export const WS_RECONNECT_MIN = 1000;
export const WS_RECONNECT_MAX = 15000;

// Drop a vehicle from the map if we haven't heard from it in this long (ms).
export const VEHICLE_STALE_MS = 90_000;
export const VEHICLE_SWEEP_INTERVAL_MS = 15_000;

// Paths to preprocessed static data (relative to index.html).
export const DATA = {
  agencies: "./data/agencies.json",
  routes: "./data/routes.json",
  stops: "./data/stops.json",
  trips: "./data/trips.json",
  shapes: "./data/shapes.geojson",
  tripStops: "./data/trip_stops.json",
  calendar: "./data/calendar.json",
  meta: "./data/meta.json",
};

// How many upcoming stops to show in the vehicle details panel.
export const UPCOMING_STOP_COUNT = 6;

// How many upcoming departures to show in the stop schedule panel.
export const DEPARTURES_COUNT = 12;

// IANA timezone the GTFS schedule clock is in (see agency.txt).
export const FEED_TIMEZONE = "Australia/Hobart";

// Only render individual stop markers at/above this zoom (avoids drawing 3400 dots).
export const STOP_RENDER_MIN_ZOOM = 13;

// Bus marker color per operator (GTFS agency name). Picked to be distinct and
// to read well behind a white bus glyph. Unknown operators fall back below.
export const OPERATOR_COLORS = {
  "Metro Tasmania": "#2f9e44", // green
  Kinetic: "#1c7ed6", // blue
  Tassielink: "#e8590c", // orange
  "Calow's Coaches": "#9c36b5", // purple
  "Manion's Coaches": "#c2255c", // magenta
  "Derwent Ferries": "#0c8599", // teal (ferry)
};
export const OPERATOR_COLOR_DEFAULT = "#6b7280"; // gray
