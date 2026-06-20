// Loads the service calendar and computes which service_ids are active on a
// given date, so the stop schedule only shows trips that actually run today.

import { DATA } from "../config.js";

let calendar = null; // { services, exceptions }
let inflight = null;
const activeCache = new Map(); // dateStr -> Set<serviceId>

export function loadCalendar() {
  if (calendar) return Promise.resolve(calendar);
  if (inflight) return inflight;
  inflight = fetch(DATA.calendar)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load calendar: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      calendar = data;
      inflight = null;
      return calendar;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// Returns the Set of service_ids running on dateStr ("YYYYMMDD", weekday 0=Mon).
export async function activeServices(dateStr, weekday) {
  if (activeCache.has(dateStr)) return activeCache.get(dateStr);
  const cal = await loadCalendar();
  const active = new Set();

  for (const [serviceId, svc] of Object.entries(cal.services)) {
    const exception = cal.exceptions[serviceId]?.[dateStr];
    let runs;
    if (exception === 1) runs = true; // explicitly added
    else if (exception === 2) runs = false; // explicitly removed
    else runs = dateStr >= svc.start && dateStr <= svc.end && svc.days[weekday] === 1;
    if (runs) active.add(serviceId);
  }

  // Services that only appear via an "added" exception (no calendar.txt row).
  for (const [serviceId, dates] of Object.entries(cal.exceptions)) {
    if (dates[dateStr] === 1) active.add(serviceId);
  }

  activeCache.set(dateStr, active);
  return active;
}
