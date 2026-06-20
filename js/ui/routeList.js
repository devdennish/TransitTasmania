// Renders the scrollable route list and wires clicks to store.selectRoute.

import { el, clear, contrastText } from "../utils/dom.js";
import { state, on, selectRoute } from "../state/store.js";
import { sortRoutes } from "../data/gtfsIndex.js";

let listEl = null;
let filterText = "";
const itemsById = new Map(); // routeId -> <li>

export function initRouteList(rootEl) {
  listEl = rootEl;
  render();
  // Static data may load after the sidebar is wired up; re-render when it does.
  on("static:loaded", render);
  on("selection:changed", highlightSelected);
}

export function setRouteFilter(text) {
  filterText = text.trim().toLowerCase();
  render();
}

function matches(route) {
  if (!filterText) return true;
  return (
    (route.shortName || "").toLowerCase().includes(filterText) ||
    (route.longName || "").toLowerCase().includes(filterText) ||
    (route.agency || "").toLowerCase().includes(filterText)
  );
}

function render() {
  clear(listEl);
  itemsById.clear();

  const routes = sortRoutes(state.routes).filter(matches);
  if (!routes.length) {
    listEl.append(el("li", { class: "empty", text: "No matching routes" }));
    return;
  }

  for (const route of routes) {
    const bg = route.color ? `#${route.color}` : "#4da3ff";
    const li = el(
      "li",
      {
        class: "list-item",
        dataset: { routeId: route.id },
        onClick: () => selectRoute(route.id),
      },
      [
        el("span", {
          class: "route-badge",
          text: route.shortName || route.id,
          style: `background:${bg};color:${contrastText(route.color)}`,
        }),
        el("span", { class: "list-item__text" }, [
          el("span", { class: "list-item__primary", text: route.longName || route.shortName }),
          el("span", { class: "list-item__secondary", text: route.agency || "" }),
        ]),
      ]
    );
    if (route.id === state.selectedRouteId) li.classList.add("list-item--selected");
    itemsById.set(route.id, li);
    listEl.append(li);
  }
}

function highlightSelected() {
  for (const [id, li] of itemsById) {
    li.classList.toggle("list-item--selected", id === state.selectedRouteId);
  }
  const selected = itemsById.get(state.selectedRouteId);
  if (selected) selected.scrollIntoView({ block: "nearest" });
}
