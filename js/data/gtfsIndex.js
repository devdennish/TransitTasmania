// Builds in-memory lookups from the raw loaded GTFS so the rest of the app can
// resolve relationships in O(1): route<->trips, id->object, route->shapes.

export function buildIndex({ routes, stops, trips, agencies = [] }) {
  const agenciesById = new Map(); // agency_id -> { id, name, url, phone }
  for (const a of agencies) agenciesById.set(a.id, a);

  const routesById = new Map();
  const routesByShortName = new Map(); // shortName -> routeId (first wins)
  for (const r of routes) {
    routesById.set(r.id, r);
    if (r.shortName && !routesByShortName.has(r.shortName)) {
      routesByShortName.set(r.shortName, r.id);
    }
  }

  const stopsById = new Map();
  for (const s of stops) stopsById.set(s.id, s);

  const tripsByRoute = new Map(); // routeId -> tripId[]
  const shapesByRoute = new Map(); // routeId -> Set<shapeId>

  for (const tripId of Object.keys(trips)) {
    const t = trips[tripId];
    if (!t.routeId) continue;

    let arr = tripsByRoute.get(t.routeId);
    if (!arr) {
      arr = [];
      tripsByRoute.set(t.routeId, arr);
    }
    arr.push(tripId);

    if (t.shapeId) {
      let set = shapesByRoute.get(t.routeId);
      if (!set) {
        set = new Set();
        shapesByRoute.set(t.routeId, set);
      }
      set.add(t.shapeId);
    }
  }

  return { agenciesById, routesById, routesByShortName, stopsById, tripsByRoute, shapesByRoute };
}

// Sort routes the way riders expect: numeric short names ascending, then the
// rest alphabetically.
export function sortRoutes(routes) {
  return [...routes].sort((a, b) => {
    const an = parseInt(a.shortName, 10);
    const bn = parseInt(b.shortName, 10);
    const aNum = Number.isFinite(an);
    const bNum = Number.isFinite(bn);
    if (aNum && bNum && an !== bn) return an - bn;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return (a.shortName || a.longName || "").localeCompare(b.shortName || b.longName || "");
  });
}
