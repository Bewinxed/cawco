// @ts-nocheck: a plain browser script copied into any project; a host that
// type-checks its JS types it at its seam (window.cawcoPreview).
/*
 * The design preview's page: a switcher beside one component, a rail that
 * docks DialKit's panels and timeline, and a stage at the component's
 * production width (switcher.css).
 *
 * The switcher is Jakub Krehel's variant picker and state switcher
 * (github.com/jakubkrehel/skills, variant/picker.md and
 * state-machine/switcher.md), MIT, Copyright (c) 2026 Jakub Krehel; the
 * licence is LICENSE beside this file.
 *
 *   const preview = cawcoPreview({
 *     title: "Folder tabs: how dense the row is",
 *     width: 640,                        // production width, px, or "fill"
 *     variants: [{ heading: "Density", entries: [
 *       { id: "today", label: "Today" },
 *       { id: "compact", label: "Compact" },
 *     ] }],
 *     states: [{ heading: "Gesture", entries: [
 *       { id: "rest", label: "At rest" },
 *       { id: "swipe", label: "Mid-swipe" },
 *     ] }],
 *     dials: ["Tabs"],                   // panel names the page creates
 *     timelines: ["Switch"],             // timeline names the page creates
 *     render({ variant, state }, frame) { … },
 *   });
 *   preview.frame, preview.dials, preview.timeline   // where things mount
 *
 * Variants, states or both: each is an axis of its own, held in the URL as
 * `__variant` and `__state` (and `__fit`), so every place is a link. The
 * arrow keys step through the one list in order, across groups and axes;
 * `H` hides every control. A switch is instant and keeps the scroll.
 */
(() => {
  const RAIL = 264;
  /** A rail that docks a timeline: its header and track read whole from about this width. */
  const RAIL_TIMELINE = 344;
  const GAP = 24;
  const PAD = 24;
  /** The narrowest stage a `"fill"` component is judged at beside the rail. */
  const FILL_MIN = 640;
  const AXES = [
    { key: "variants", axis: "variant", param: "__variant", noun: "Variant" },
    { key: "states", axis: "state", param: "__state", noun: "State" },
  ];
  const ARROW =
    '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v4a3 3 0 0 0 3 3h7" /><path d="m10 7 3 3-3 3" /></svg>';
  const CHEVRON =
    '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4" /></svg>';
  const TYPING =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === true) {
        node.setAttribute(name, "");
      } else if (value !== false && value !== undefined) {
        node.setAttribute(name, String(value));
      }
    }
    node.append(...children);
    return node;
  };

  /** The axes the page declares, each with its entries in list order; throws on a config no page can be built from. */
  const axesOf = (config) => {
    const { width = "fill", render } = config;
    if (typeof render !== "function") {
      throw new Error(
        "cawcoPreview: render({ variant, state }, frame) draws a place."
      );
    }
    if (!(width === "fill" || (Number.isFinite(width) && width > 0))) {
      throw new Error(
        'cawcoPreview: width is a production width in px, or "fill".'
      );
    }
    const axes = AXES.filter(({ key }) => config[key] !== undefined).map(
      (axis) => {
        const groups = config[axis.key];
        if (!(Array.isArray(groups) && groups.length)) {
          throw new Error(
            `cawcoPreview: ${axis.key} holds at least one group.`
          );
        }
        for (const group of groups) {
          if (!(
            group.heading &&
            Array.isArray(group.entries) &&
            group.entries.length
          )) {
            throw new Error(
              "cawcoPreview: every group has a heading and entries."
            );
          }
        }
        const ids = groups.flatMap((group) =>
          group.entries.map((entry) => entry.id)
        );
        if (new Set(ids).size !== ids.length || ids.some((id) => !id)) {
          throw new Error(
            `cawcoPreview: ${axis.key}' ids are unique and not empty.`
          );
        }
        return { ...axis, groups, ids };
      }
    );
    if (!axes.length) {
      throw new Error("cawcoPreview: declare variants, states or both.");
    }
    const variants = axes.find((axis) => axis.key === "variants");
    if (variants && variants.ids[0] !== "today") {
      throw new Error(
        'cawcoPreview: variants open with "today", the component as it ships now.'
      );
    }
    return axes;
  };

  /**
   * The switcher: the grouped list beside the stage, and each axis's groups
   * as a select above it. Both are always there; the width shows one.
   * `labels` and `buttons` are keyed `<axis>:<id>`.
   */
  const switcherOf = (axes, show) => {
    const labels = new Map();
    const buttons = new Map();
    const selects = new Map();
    const list = el("nav", {
      class: "xp-list",
      "aria-label": axes.map((axis) => `${axis.noun}s`).join(" and "),
    });
    const pickers = axes.map((axis) => {
      const select = el("select", { "aria-label": axis.noun });
      axis.groups.forEach((group, index) => {
        const headingId = `xp-${axis.axis}-${index}`;
        const heading = el("span", { class: "xp-heading", id: headingId });
        heading.innerHTML = ARROW;
        heading.append(group.heading);
        const box = el(
          "div",
          { class: "xp-group", role: "group", "aria-labelledby": headingId },
          [heading]
        );
        const options = el("optgroup", { label: group.heading });
        for (const entry of group.entries) {
          const key = `${axis.axis}:${entry.id}`;
          labels.set(key, entry.label);
          const button = el(
            "button",
            {
              type: "button",
              [`data-${axis.axis}`]: entry.id,
              "aria-pressed": "false",
            },
            [entry.label]
          );
          button.addEventListener("click", () => show(axis, entry.id));
          buttons.set(key, button);
          box.append(button);
          options.append(el("option", { value: entry.id }, [entry.label]));
        }
        list.append(box);
        select.append(options);
      });
      select.addEventListener("change", () => show(axis, select.value));
      selects.set(axis.axis, select);
      const picker = el("div", { class: "xp-select" }, [select]);
      picker.insertAdjacentHTML("beforeend", CHEVRON);
      return picker;
    });
    return { buttons, labels, list, pickers, selects };
  };

  /**
   * The docks for DialKit's panels and timeline, and the narrow bar's
   * Controls toggle that opens them in the flow (always open on a wide screen).
   */
  const toolsOf = (dials, timelines) => {
    const controls = el(
      "button",
      {
        type: "button",
        class: "xp-chip xp-controls",
        "aria-expanded": "false",
        "aria-controls": "xp-tools",
        hidden: !(dials.length || timelines.length),
      },
      [timelines.length && !dials.length ? "Timeline" : "Controls"]
    );
    const dialsHost = el("div", {
      class: "xp-dials",
      "data-cawco-dials": true,
    });
    const timelineHost = el("div", {
      class: "xp-timeline",
      "data-cawco-timeline": true,
    });
    const tools = el(
      "div",
      { class: "xp-tools", id: "xp-tools", "data-collapsed": true },
      [dialsHost, timelineHost]
    );
    controls.addEventListener("click", () => {
      const open = controls.getAttribute("aria-expanded") !== "true";
      controls.setAttribute("aria-expanded", String(open));
      tools.toggleAttribute("data-collapsed", !open);
    });
    return { controls, dialsHost, timelineHost, tools };
  };

  /** A key the switcher leaves alone: one with a modifier, one already taken, or one typed into a field, the component or DialKit. */
  const notOurs = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    return (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      Boolean(target?.closest(TYPING)) ||
      Boolean(target?.closest(".xp-frame, .dialkit-root"))
    );
  };
  const STEPS = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };

  window.cawcoPreview = (config) => {
    const axes = axesOf(config);
    const { render, title } = config;
    const width = config.width ?? "fill";
    const dials = config.dials ?? [];
    const timelines = config.timelines ?? [];
    /** Every entry in list order: what the arrow keys step through. */
    const order = axes.flatMap((axis) => axis.ids.map((id) => ({ axis, id })));
    const { buttons, labels, list, pickers, selects } = switcherOf(
      axes,
      (axis, id) => show(axis, id)
    );

    const fit = el(
      "button",
      {
        type: "button",
        class: "xp-chip",
        "aria-pressed": "false",
        hidden: true,
      },
      ["Fit"]
    );
    const { controls, dialsHost, timelineHost, tools } = toolsOf(
      dials,
      timelines
    );
    const rail = el(
      "aside",
      { class: "xp-rail", "aria-label": "Preview controls" },
      [
        ...(title ? [el("p", { class: "xp-title" }, [title])] : []),
        el("div", { class: "xp-bar" }, [...pickers, fit, controls]),
        list,
        tools,
      ]
    );
    const frame = el("div", { class: "xp-frame" });
    const stage = el("main", { class: "xp-stage" }, [frame]);
    const layout = el("div", { class: "xp-layout" }, [rail, stage]);
    const page = el("div", { class: "xp-page" }, [layout]);
    const fixed = typeof width === "number";
    page.style.setProperty("--xp-width", fixed ? `${width}px` : "100%");
    page.style.setProperty(
      "--xp-column",
      fixed ? `${width}px` : "minmax(0, 1fr)"
    );
    document.body.append(page);

    // Wide once the rail, the gap and the component fit side by side.
    const railWidth = timelines.length ? RAIL_TIMELINE : RAIL;
    page.style.setProperty("--xp-rail", `${railWidth}px`);
    const breakpoint = railWidth + GAP + (fixed ? width : FILL_MIN);
    const measure = () => {
      const wide = page.clientWidth - 2 * PAD >= breakpoint;
      page.classList.toggle("xp-wide", wide);
      layout.style.maxInlineSize = wide || !fixed ? "none" : `${width}px`;
    };
    measure();
    new ResizeObserver(measure).observe(page);

    // A component wider than the stage scrolls inside it; Fit scales it to the stage.
    const url = new URL(location.href);
    let fitted = url.searchParams.get("__fit") === "1";
    const sized = () => {
      const over = fixed && width > stage.clientWidth;
      stage.toggleAttribute("data-overflow", over && !fitted);
      stage.toggleAttribute("data-fit", over && fitted);
      fit.hidden = !over;
      fit.setAttribute("aria-pressed", String(fitted));
      if (over) {
        page.style.setProperty("--xp-fit", String(stage.clientWidth / width));
      }
    };
    sized();
    new ResizeObserver(sized).observe(stage);
    fit.addEventListener("click", () => {
      fitted = !fitted;
      write();
      sized();
    });
    /** Where the page is: each axis's entry, from the URL, else its first. */
    const place = {};
    for (const axis of axes) {
      const asked = url.searchParams.get(axis.param);
      place[axis.axis] = axis.ids.includes(asked) ? asked : axis.ids[0];
    }
    /** The entry the arrow keys step from: the last one shown. */
    let at = order.findIndex(({ axis, id }) => place[axis.axis] === id);

    function write() {
      const next = new URL(location.href);
      for (const axis of axes) {
        next.searchParams.set(axis.param, place[axis.axis]);
      }
      if (fitted) {
        next.searchParams.set("__fit", "1");
      } else {
        next.searchParams.delete("__fit");
      }
      history.replaceState(history.state, "", next);
    }

    /** The active button in view inside the list, never by scrolling the page. */
    function reveal(button) {
      const top = button.offsetTop - 6;
      const bottom = button.offsetTop + button.offsetHeight + 6;
      if (top < list.scrollTop) {
        list.scrollTop = top;
      } else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }

    function draw() {
      for (const axis of axes) {
        for (const id of axis.ids) {
          buttons
            .get(`${axis.axis}:${id}`)
            .setAttribute("aria-pressed", String(place[axis.axis] === id));
        }
        selects.get(axis.axis).value = place[axis.axis];
      }
      const { axis, id } = order[at];
      reveal(buttons.get(`${axis.axis}:${id}`));
      write();
      render({ ...place }, frame);
      document.title = axes
        .map((each) => labels.get(`${each.axis}:${place[each.axis]}`))
        .join(" · ");
    }

    function show(axis, id) {
      place[axis.axis] = id;
      at = order.findIndex((entry) => entry.axis === axis && entry.id === id);
      draw();
    }

    window.addEventListener("keydown", (event) => {
      if (notOurs(event)) {
        return;
      }
      if (event.key === "h" || event.key === "H") {
        page.toggleAttribute("data-xp-hidden");
        return;
      }
      const step = STEPS[event.key];
      if (step) {
        event.preventDefault();
        const next = order[(at + step + order.length) % order.length];
        show(next.axis, next.id);
      }
    });

    // What scripts/check.mjs steps through and asserts.
    window.__cawcoPreview = {
      entries: order.map(({ axis, id }) => ({ param: axis.param, id })),
      dials,
      timelines,
    };
    draw();
    return {
      frame,
      dials: dialsHost,
      timeline: timelineHost,
      get place() {
        return { ...place };
      },
      show: (axisName, id) =>
        show(
          axes.find((axis) => axis.axis === axisName),
          id
        ),
    };
  };
})();
