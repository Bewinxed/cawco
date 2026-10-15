# The preview kit

## Files

Everything the page loads sits inside its folder: the check fails a request off the folder.

- From this skill's `kit/`: `switcher.js`, `switcher.css` and `LICENSE`.
- With dials or a timeline, from the decision-page skill's `kit/` (the folder beside this skill's): `dials.js` and DialKit's vanilla build, `vendor/dialkit/browser.global.js` and `vendor/dialkit/styles.css`.

A project with a bundler imports the same files from where they sit, or copies them in, and builds one entry to a static folder with a relative base (Vite: `base: "./"`, one HTML entry as `root`).

## The page

```html
<link rel="stylesheet" href="dialkit.css">   <!-- DialKit's styles.css, renamed; with dials or a timeline -->
<link rel="stylesheet" href="switcher.css">
<!-- the project's own tokens, fonts and global CSS, and its component build -->
<script src="browser.global.js"></script>    <!-- with dials or a timeline -->
<script src="dials.js"></script>
<script src="switcher.js"></script>
<script>
  const preview = cawcoPreview({
    title: "Status badge: how loud it is",     // what is being judged, one line
    width: 320,                                 // production width in px, or "fill"
    variants: [{ heading: "Emphasis", entries: [
      { id: "today", label: "Today" },          // today first, always
      { id: "quiet", label: "Quiet" },
      { id: "solid", label: "Solid" },
      { id: "outlined", label: "Outlined" },
    ] }],
    states: [{ heading: "Data", entries: [      // optional: a second axis
      { id: "done", label: "Done" },
      { id: "failed", label: "Failed" },
    ] }],
    dials: ["Badge"],                           // the panels and timelines this page
    timelines: ["Enter"],                       // creates, so the check can assert them
    render({ variant, state }, frame) {
      // Draw the real component for this place into `frame`, from fixtures.
    },
  });
</script>
```

`cawcoPreview` mounts the page into `<body>` and draws the place in the URL. It returns `frame` (the stage the component sits in), `dials` and `timeline` (the rail's docks), `place` and `show(axis, id)`. Variants, states or both: `__variant` and `__state` hold the place, and `__fit` holds the phone's Fit. The arrow keys step through the one list in order, across groups and axes, except while focus is in a field, in the component, or in DialKit. `H` hides every control. On a wide screen the rail stands beside the stage; on a narrow one the switcher becomes one select per axis in a bar above the stage, with Fit (a component wider than the screen, scaled to fit) and Controls (the dials and timeline, in the flow). The switcher is deliberately outside the project's design system: one dark neutral surface and the system font. Leave its styles alone.

## Dials and the timeline

`dials.js` keeps every DialKit value in the hub: `cawco.set("dials", { [panel or timeline name]: { [path]: value } })`, restored when the page loads again, read back by you with `artifact_read`. Make the panels after `cawcoPreview`, so they dock in its rail:

```js
cawcoDials("Badge", { radius: [999, 0, 999], fill: "#e8f3ec" })
  .subscribe((v) => frame.style.setProperty("--radius", `${v.radius}px`));

// TODO(production): clip.current is the scrubbable authoring preview; the
// shipped motion takes the tuned timing and curve in the project's own system.
const enter = cawcoTimeline("Enter", {
  pop: { at: 0, duration: 0.3, from: { scale: 0.9, opacity: 0 }, to: { scale: 1, opacity: 1 },
         transition: { type: "spring", visualDuration: 0.3, bounce: 0.2 } },
}, { autoplay: false });
enter.subscribe((t) => { el.style.scale = t.pop.current.scale; el.style.opacity = t.pop.current.opacity; });
```

A panel takes DialKit's control config ([controls](https://github.com/joshpuckett/dialkit#controls)). One stored value holds at most 2,000 characters of JSON, so keep the panels small. A timeline keeps the animation's structure in code: its clips, steps, loops, and the expressions that combine clips. The dock edits timing, values and curves. Bind `clip.current` so every frame can be scrubbed. Don't feed it into a second animation layer that smooths it. A reversible event (a layer swap, a label change) is a zero-duration clip read through `started`. To show a motion held part-way, use `autoplay: false` and `seek(seconds)` once when the state is entered.

A framework adapter (`dialkit/svelte`, `dialkit/vue`, `dialkit/solid`, React's `dialkit`) has a store of its own. Make its panels and timelines in the component, then:

- mount the adapter's `DialRoot` with `mode: "inline"` and `productionEnabled: true` in `preview.dials`;
- mount its timeline in `preview.timeline` (one that portals to `<body>` is moved into `preview.timeline` once it appears);
- call `cawcoKeepDials(DialStore)` with the store from `dialkit/store`.

## The check

`node <this skill>/scripts/check.mjs <folder>` serves the folder on its own origin and stands in a CawCo bridge that holds nothing. It steps each entry, with the other axis at its first entry, at 1440×900 and 390×844, and presses ArrowDown once. It prints `PASS <axis> <id>` or `FAIL <axis> <id>: why`, then `ALL PASS`. It needs `playwright-core` (resolved from the working directory) and a Chromium: Playwright's cached one, or `CHROMIUM=<binary>`.
