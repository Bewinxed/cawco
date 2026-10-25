/**
 * The design previews' one state switcher: the `interfaces:state-machine`
 * skill's switcher (its switcher.md), markup, CSS and script in this one
 * file. Every preview switches its states through it, and nothing else:
 * `bun scripts/preview-switcher-check.ts` (in `bun run check`) refuses a
 * preview whose switcher is its own.
 *
 * Deliberately outside the design system: one dark neutral surface, the
 * system font stack, no project variables, the same over light and dark
 * pages. States sit in a vertical list under their group headings, each
 * heading carrying the same small arrow; where the page has no room for the
 * list beside the stage (232px plus the stage's production width, measured
 * by a container query) a select stands above the stage instead. Both are
 * always rendered, so the active state survives a resize.
 *
 * - `__state` in the URL is the source of truth: the switcher writes it and
 *   reads the active state back from it, so every state is a link, and the
 *   browser's back goes back.
 * - The arrow keys (up and down, or left and right) step through every
 *   state in list order, across groups; `H` hides and shows the switcher.
 *   Key handling ignores events with a modifier key, events already
 *   `defaultPrevented`, and events from inputs, textareas, selects and
 *   contenteditable elements.
 * - The active button carries `aria-pressed="true"` and scrolls into view
 *   inside the list; the list carries a label, and each group is a
 *   `role="group"` labelled by its heading.
 * - It switches instantly and keeps the list's scroll position; only the
 *   active label eases its font weight.
 *
 * Two shapes of state:
 *
 * - one state (`axes: false`): the groups partition one list of states, one
 *   of them active, `?__state=<value>`;
 * - axes (`axes: true`): each group is an axis with its own active state,
 *   `?__state=<group>:<value>,<group>:<value>`; each axis has a select of
 *   its own where there is no room for the list.
 *
 * The folder-served previews each carry a byte-identical copy of this file
 * as `<preview>/state-switcher.js` (a folder served on its own reaches
 * nothing outside it); the built ones import this file.
 */

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** The switcher's CSS for a stage `width` px wide in production (switcher.md, "Placement and styling"). */
const css = (width) => `
.state-page {
  container: state-page / inline-size;
  margin-inline: calc(50% - 50vw);
  padding: 24px;
}

.state-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: ${width}px;
  margin-inline: auto;
}

.state-switcher {
  all: unset;
  display: none;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  scrollbar-width: none;
  padding: 6px;
  border-radius: 14px;
  background: rgb(20 20 20 / 0.92);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  font: 13px/1 ${FONT};
  user-select: none;
}

.state-switcher-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.state-switcher-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 6px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(255 255 255 / 0.45);
}

.state-switcher button {
  all: unset;
  flex: none;
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  color: rgb(255 255 255 / 0.6);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 200ms ease-out, font-weight 200ms ease-out;
}

.state-switcher button:hover {
  color: rgb(255 255 255 / 0.85);
}

.state-switcher button[aria-pressed="true"] {
  background: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255);
  font-weight: 500;
}

.state-switcher button:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.7);
  outline-offset: 2px;
}

.state-switcher-selects {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.state-switcher-select {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  color: rgb(255 255 255);
}

.state-switcher-select select {
  all: unset;
  box-sizing: border-box;
  max-width: 100%;
  padding: 10px 36px 10px 16px;
  border-radius: 999px;
  background: rgb(20 20 20 / 0.92);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  font: 500 13px/1 ${FONT};
  cursor: pointer;
}

.state-switcher-select select:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.7);
  outline-offset: 2px;
}

.state-switcher-select svg {
  position: absolute;
  top: 50%;
  right: 14px;
  translate: 0 -50%;
  pointer-events: none;
  color: rgb(255 255 255 / 0.6);
}

.state-page[data-switcher-hidden] :is(.state-switcher, .state-switcher-selects) {
  visibility: hidden;
}

/* 208px list + 24px gap + ${width}px stage */
@container state-page (min-width: ${width + 232}px) {
  .state-layout {
    display: grid;
    grid-template-columns: 208px ${width}px;
    justify-content: center;
    gap: 24px;
    align-items: start;
    max-width: none;
  }

  .state-switcher {
    display: flex;
    position: sticky;
    top: 24px;
  }

  .state-switcher-selects {
    display: none;
  }
}
`;

const ARROW =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v4a3 3 0 0 0 3 3h7" /><path d="m10 7 3 3-3 3" /></svg>';
const CHEVRON =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4" /></svg>';

const PARAM = "__state";

/** Reads `?__state=` as the shape names it: a value, or each axis's value. */
function parse(raw, axes) {
  if (!axes) {
    return raw ?? "";
  }
  const named = {};
  for (const pair of (raw ?? "").split(",")) {
    const at = pair.indexOf(":");
    if (at > 0) {
      named[pair.slice(0, at)] = pair.slice(at + 1);
    }
  }
  return named;
}

function element(tag, attributes = {}, text) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** Whether a key event belongs to something else: a modifier, a handled event, or a field. */
function ignored(event) {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return true;
  }
  const target = event.target;
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
  );
}

let mounted = 0;

/**
 * Mounts the switcher on the page and returns its handle.
 *
 * - `width`: the stage's production width in px; the list stands beside
 *   the stage from 232px plus it, the select above it below that.
 * - `groups`: `[{ key, label, states: [{ value, label }], initial?, axis? }]`,
 *   in the order they were written down, or a function of the current state
 *   returning them (a group shown only in some states).
 * - `axes`: each group its own axis (see above), or, where groups name one
 *   `axis`, several groups the states of one axis (one select for it, a
 *   group of options each); `initial` (one state) or each group's
 *   `initial` (axes) is the state a page with no `__state` opens on, else
 *   the first.
 * - `resolve(next, axis, previous)`: axes only; what a pick also sets.
 * - `onchange(state, previous)`: the state moved by the switcher, its keys,
 *   or the browser's back and forward; or the state shown picked again
 *   (`state` and `previous` alike), to be shown again.
 * - `stage`: the nodes the stage holds; the page's own (the host's
 *   children) by default.
 * - `label`: the list's label.
 *
 * The handle: `state`; `named` (whether the address named a state when
 * the page opened); `stage` (the stage element); `set(next)` (the page
 * moved the state itself: the URL and the list follow, `onchange` is not
 * called); and `refresh()` (a function's groups read again).
 */
export function mountStateSwitcher({
  width,
  groups,
  axes = false,
  initial,
  resolve = (next) => next,
  onchange = () => undefined,
  stage: held,
  label = "States",
  host = document.body,
}) {
  mounted += 1;
  const id = `states-${mounted}`;
  const groupsOf = (state) => (typeof groups === "function" ? groups(state) : groups);
  const axisOf = (group) => (axes ? (group.axis ?? group.key) : "");
  /** Each axis shown, in order, with its groups. */
  const axesOf = (state) => {
    const by = new Map();
    for (const group of groupsOf(state)) {
      by.set(axisOf(group), [...(by.get(axisOf(group)) ?? []), group]);
    }
    return by;
  };

  /** The state the URL names, made whole: every axis at a state its groups have. */
  const normal = (named) => {
    if (!axes) {
      const all = groupsOf(named).flatMap((group) => group.states);
      if (all.some((each) => each.value === named)) {
        return named;
      }
      return all.some((each) => each.value === initial) ? initial : all[0]?.value;
    }
    let state = { ...named };
    // A group shown only in some states reads the state made so far; twice settles it.
    for (let pass = 0; pass < 2; pass += 1) {
      const next = {};
      for (const [axis, its] of axesOf(state)) {
        const all = its.flatMap((group) => group.states);
        const has = (value) => all.some((each) => each.value === value);
        const first = its.find((group) => group.initial !== undefined)?.initial;
        if (has(named[axis])) {
          next[axis] = named[axis];
        } else if (has(first)) {
          next[axis] = first;
        } else {
          next[axis] = all[0]?.value;
        }
      }
      // An axis whose groups are not shown keeps what it names.
      state = { ...named, ...next };
    }
    return state;
  };
  const write = (state) =>
    axes
      ? [...axesOf(state).keys()].map((axis) => `${axis}:${state[axis]}`).join(",")
      : String(state);
  const raw = new URLSearchParams(location.search).get(PARAM);
  const read = () => normal(parse(new URLSearchParams(location.search).get(PARAM), axes));
  const urlOf = (state) => {
    const url = new URL(location.href);
    url.searchParams.set(PARAM, write(state));
    // The comma and colon stand as written: the address reads as the state.
    return `${url.pathname}${url.search.replace(/%2C/gi, ",").replace(/%3A/gi, ":")}${url.hash}`;
  };

  if (!document.querySelector("style[data-state-switcher]")) {
    const style = element("style", { "data-state-switcher": "" });
    style.textContent = css(width);
    document.head.append(style);
  }

  const page = element("div", { class: "state-page" });
  const layout = element("div", { class: "state-layout" });
  const nav = element("nav", { class: "state-switcher", "aria-label": label });
  const selects = element("div", { class: "state-switcher-selects" });
  const stage = element("div", { class: "state-stage" });
  layout.append(nav, selects, stage);
  page.append(layout);
  const nodes = held ?? [...host.childNodes].filter((node) => !(node instanceof HTMLScriptElement));
  stage.append(...nodes);
  host.prepend(page);

  const handle = { state: read(), named: raw !== null, stage, set, refresh };
  /** The last state stepped to, where the arrow keys step on from: `[group, value]`. */
  let cursor = null;

  const pressed = (group, value) => (axes ? handle.state[axisOf(group)] === value : handle.state === value);

  /** Every state in list order, across groups: `[group, value]`. */
  const order = () => groupsOf(handle.state).flatMap((group) => group.states.map((each) => [group, each.value]));

  /** A select of its own for each axis (one for all, one state): its groups' states, each group a group of options where it shares. */
  function drawSelect(axis, its) {
    const wrap = element("div", { class: "state-switcher-select" });
    const select = element("select", {
      "aria-label": axes ? its.map((group) => group.label).join(" · ") : "State",
    });
    if (axes) {
      select.dataset.group = axis;
    }
    select.addEventListener("change", (event) => {
      const [key, value] = JSON.parse(event.target.value);
      pick(its.find((group) => group.key === key), value);
    });
    for (const group of its) {
      const holder = its.length > 1 || !axes ? element("optgroup", { label: group.label }) : select;
      for (const each of group.states) {
        const option = element("option", { value: JSON.stringify([group.key, each.value]) }, each.label);
        option.selected = pressed(group, each.value);
        holder.append(option);
      }
      if (holder !== select) {
        select.append(holder);
      }
    }
    wrap.append(select);
    wrap.insertAdjacentHTML("beforeend", CHEVRON);
    selects.append(wrap);
  }

  function draw() {
    const scroll = nav.scrollTop;
    nav.replaceChildren();
    selects.replaceChildren();
    for (const [axis, its] of axesOf(handle.state)) {
      for (const group of its) {
        const headingId = `${id}-${String(group.key).replace(/[^\w-]/g, "-")}`;
        const box = element("div", {
          class: "state-switcher-group",
          role: "group",
          "aria-labelledby": headingId,
          "data-group": group.key,
          ...(axes ? { "data-axis": axis } : {}),
        });
        const heading = element("span", { class: "state-switcher-heading", id: headingId });
        heading.innerHTML = ARROW;
        heading.append(group.label);
        box.append(heading);
        for (const each of group.states) {
          const button = element(
            "button",
            { type: "button", "data-state": each.value, "aria-pressed": String(pressed(group, each.value)) },
            each.label
          );
          button.addEventListener("click", () => pick(group, each.value));
          box.append(button);
        }
        nav.append(box);
      }
      drawSelect(axis, its);
    }
    nav.scrollTop = scroll;
    reveal();
  }

  /** The active button (in the group last stepped in, on axes) scrolled into view inside the list alone. */
  function reveal() {
    const key = cursor?.[0].key;
    const within = key === undefined ? nav : (nav.querySelector(`[data-group="${CSS.escape(String(key))}"]`) ?? nav);
    const button = within.querySelector('button[aria-pressed="true"]');
    if (!button || nav.clientHeight === 0) {
      return;
    }
    const top = button.offsetTop - nav.offsetTop - 6;
    const bottom = top + button.offsetHeight + 12;
    if (top < nav.scrollTop) {
      nav.scrollTop = top;
    } else if (bottom > nav.scrollTop + nav.clientHeight) {
      nav.scrollTop = bottom - nav.clientHeight;
    }
  }

  function pick(group, value) {
    const previous = handle.state;
    const axis = axisOf(group);
    const next = axes ? normal(resolve({ ...previous, [axis]: value }, axis, previous)) : normal(value);
    cursor = [group, value];
    // The state already shown, picked again: shown again, as a link to the page one is on reloads it.
    if (write(next) === write(previous)) {
      onchange(next, previous);
      return;
    }
    handle.state = next;
    history.pushState(history.state, "", urlOf(next));
    draw();
    onchange(next, previous);
  }

  function set(next) {
    handle.state = axes ? normal({ ...handle.state, ...next }) : normal(next);
    history.replaceState(history.state, "", urlOf(handle.state));
    draw();
  }

  function refresh() {
    set(handle.state);
  }

  addEventListener("popstate", () => {
    const previous = handle.state;
    handle.state = read();
    draw();
    if (write(previous) !== write(handle.state)) {
      onchange(handle.state, previous);
    }
  });

  addEventListener("keydown", (event) => {
    if (ignored(event)) {
      return;
    }
    if (event.key === "h" || event.key === "H") {
      page.toggleAttribute("data-switcher-hidden");
      return;
    }
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) {
      return;
    }
    const all = order();
    const at = cursor
      ? all.findIndex(([group, value]) => group.key === cursor[0].key && value === cursor[1])
      : all.findIndex(([group, value]) => pressed(group, value));
    const [group, value] = all[(Math.max(at, 0) + step + all.length) % all.length];
    event.preventDefault();
    pick(group, value);
  });

  history.replaceState(history.state, "", urlOf(handle.state));
  draw();
  return handle;
}
