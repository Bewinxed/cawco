# Transcript cold load: the demo

The transcript's cold load as the design has it (report dbc77f55 §1), to try:
scroll anywhere, refresh, and land back on the same row. Built and static:
open `index.html` from this folder with any static server.

```sh
python3 -m http.server -d design-previews/transcript-cold-load 8080
bun scripts/probe-kit/run.ts transcript-cold-load-preview   # the proof (Chromium + WebKit)
cd design-previews/transcript-cold-load/source && bun install && bun run build   # rebuild
```

The bar holds the hub's latency (0.3 s, 1 s, 2 s), "Spot no longer exists"
(the next load's place is one the hub no longer holds), and Refresh (a real
`location.reload()`).

## What happens on a load

1. The page's load (`source/src/main.js`) runs before anything mounts. It
   stands for the session page's server `load`: it reads the reader's place
   from the `cawco-place` cookie and starts the window read as a promise it
   does not wait on (`hub.js` `load`). The shell, the pane's head and the
   transcript's loading drawing, is drawn at once.
2. The loading state is transitions.dev's UI generation skeleton, the load
   transition of the first `.cm-beam` on https://transitions.dev/ (its
   prompt box), drawn over the transcript's own shape (`generate.js`,
   `Veil.svelte`): a dot field ripples out, guides and corner handles come in,
   the outline and then each block (the who marks, the reader's well, prose
   lines, the rail's tool lines) are traced in small flowing dots. It stands on
   its bottom edge for a tail landing and on its top edge for a kept place.
3. The fake hub answers after the bar's latency with the 120 blocks around
   the place, or the newest 60 for the tail. A place it no longer holds is
   the window read's 409; the load answers the newest page and says so.
4. Only then is virtua mounted, with a cache built from the sizes this tab
   kept by row key (virtua reads `cache` once, when it is made, cut to the
   rows it holds then: prototype finding 1). `restore()` (Transcript.svelte
   on main, b7b06ab9a) puts the row at the view's top, unseen, writing until
   it holds still.
5. The list comes in over the drawing as theirs does: its opacity from 0 and
   its blur from 3px, 475 ms on cubic-bezier(.22, 1, .36, 1), from 930 ms into
   the drawing (or once the rows are landed, if later), the drawing fading
   out 254 ms after it. Until then a drawing that has finished tracing holds
   its pose, its dots still flowing. All of it runs on one Web Animation
   clock, so DevTools holds and seeks it whole.
6. The place is held for 1.5 s while the rows around it measure. Scrolling
   up, older pages come in above with virtua's `shift`; scrolling down,
   newer ones come in below; the row being read does not move. While there
   is a page past either end, that end's strip is the same drawing over one
   tool line (`GenStrip.svelte`).
7. As the reader scrolls, the place goes into the cookie (throttled to one
   write per 300 ms, and on `pagehide`); the sizes go into sessionStorage on
   `pagehide`.

## The place is a cookie

`cawco-place` holds a map of session id → `{ b: block, i: into }` (path `/`,
SameSite=Lax, 180 days), the 20 most recent sessions, so it stays well under
4 KB. The tail is no entry. The address never carries the place. A cookie is
per browser, not per tab: two tabs on one session share one place, the last
one written.

## The hold ends on the reader's input

On an iPhone, virtua 0.53.4 puts off its correction for rows measured above
the view while the view counts as scrolling, and writes it when its 150 ms
scroll-end timer fires. While that jump is pending its `getItemOffset`
subtracts it and its `findItemIndex` does not, so Transcript.svelte's
"is the top row still where it was" test fails on virtua's own write, which
read as the reader and ended the hold early (prototype finding 4). Here a
scroll counts as the reader's only after the reader's input (a wheel, a
finger, a key, a press on the scrollbar); `Transcript.svelte` `readScroll`.

## Files

- `index.html`, `assets/`: the build.
- `source/`: the Svelte source (`src/`), the house fonts, the dashboard's
  built `tokens.css` copied in, and `gen.mjs`, which writes the 720-block
  conversation (`src/rows.json`) from this repository's own text: commit
  bodies and the docs as the agent's prose, source files as its code, real
  paths as its tool calls, commit subjects as the reader's turns.
