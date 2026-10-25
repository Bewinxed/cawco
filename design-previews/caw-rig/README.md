# Caw, rigged: design preview

Caw as one drawing cut at his pivots, alive: the pose switch moves the stage
(64, 96 and 160 px) to the pose picked on the rig's own blend, from wherever
he stands; below, every pose stands at each size beside the still he is cut
from. Idle picks his calm life or his attentive one; Day or night is the
house theme (its tokens resolve on the root, so the page turns whole). Every
Caw runs his own clock, which stops while he is off screen or the tab is
hidden; with reduced motion he holds his pose.

```sh
python3 -m http.server -d design-previews/caw-rig 8080   # any static server on this folder
bun scripts/probe-kit/run.ts caw-rig-preview               # the proof (Chromium + WebKit)
```

It is built, not written by hand: the page is
`apps/dashboard/src/lib/cawco/caw-rig/preview/` (its build config
`apps/dashboard/scripts/caw-rig-preview.vite.ts`), drawing the rig's own
component, `CawRig.svelte`. To rebuild it:

```sh
bun apps/dashboard/scripts/house-faces.ts
cd apps/dashboard && bunx vite build --config scripts/caw-rig-preview.vite.ts
```

`still.png` is `assets/mascot/stills/light-ready.png`, the still the rig is
cut from, here so the page and its proof can lay frame 0 beside it;
`still-night.png` is `dark-ready.png`, the same drawing on the kit's rim,
which the page shows by night.

How the rig is made, what moves and what it cannot do yet:
`assets/mascot/MOTION.md`.
