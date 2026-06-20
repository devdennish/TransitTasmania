// Geometry helpers.

const R = 6371000; // earth radius (m)

// Great-circle distance in metres.
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Project point P onto segment A->B using a local equirectangular approximation
// (fine over the short distances between adjacent bus stops). Returns:
//   t    - clamped position along the segment, 0 at A .. 1 at B
//   dist - distance (m) from P to the closest point on the segment
export function projectOnSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  const lat0 = (aLat * Math.PI) / 180;
  const k = Math.cos(lat0);
  const toXY = (lat, lon) => [((lon * Math.PI) / 180) * k * R, ((lat * Math.PI) / 180) * R];
  const [px, py] = toXY(pLat, pLon);
  const [ax, ay] = toXY(aLat, aLon);
  const [bx, by] = toXY(bLat, bLon);
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dist = Math.hypot(px - cx, py - cy);
  return { t, dist };
}

// Bearing in degrees (0 = north, clockwise) from point a to point b.
export function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
