// Renders the stop list. With ~3400 stops we cap the rendered rows and lean on
// the search box; clicking a stop selects it and flies the map there.

import { el, clear } from "../utils/dom.js";
import { state, on, selectStop } from "../state/store.js";
import { focusStop } from "../map/stopsLayer.js";

const MAX_ROWS = 200;

let listEl = null;
let filterText = "";
const itemsById = new Map();

export function initStopList(rootEl) {
  listEl = rootEl;
  render();
  // Static data may load after the sidebar is wired up; re-render when it does.
  on("static:loaded", render);
  on("selection:changed", highlightSelected);
}

export function setStopFilter(text) {
  filterText = text.trim().toLowerCase();
  render();
}

function render() {
  clear(listEl);
  itemsById.clear();

  const all = state.stops.filter((s) => s.locationType !== 1);
  const filtered = filterText
    ? all.filter(
        (s) =>
          s.name.toLowerCase().includes(filterText) ||
          (s.code || "").toLowerCase().includes(filterText)
      )
    : all;

  if (!filtered.length) {
    listEl.append(el("li", { class: "empty", text: "No matching stops" }));
    return;
  }

  const shown = filtered.slice(0, MAX_ROWS);
  for (const stop of shown) {
    const li = el(
      "li",
      {
        class: "list-item",
        dataset: { stopId: stop.id },
        onClick: () => {
          selectStop(stop.id);
          focusStop(stop.id);
        },
      },
      [
        el("span", { class: "stop-dot", style: "flex:0 0 auto" }),
        el("span", { class: "list-item__text" }, [
          el("span", { class: "list-item__primary", text: stop.name }),
          el("span", { class: "list-item__secondary", text: `Stop ${stop.code || stop.id}` }),
        ]),
      ]
    );
    if (stop.id === state.selectedStopId) li.classList.add("list-item--selected");
    itemsById.set(stop.id, li);
    listEl.append(li);
  }

  if (filtered.length > MAX_ROWS) {
    listEl.append(
      el("li", {
        class: "empty",
        text: `Showing ${MAX_ROWS} of ${filtered.length}. Refine your search.`,
      })
    );
  }
}

function highlightSelected() {
  for (const [id, li] of itemsById) {
    li.classList.toggle("list-item--selected", id === state.selectedStopId);
  }
}
