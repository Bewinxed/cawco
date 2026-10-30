# The design graph's controls: references

The step slider, the Steps | Graph switch and the bar they sit on, the
wide window, and the open calls of the graph's Options panel
(`apps/dashboard/src/lib/cawco/preview/graph/options.svelte.ts`). Each
reference names its product, the screen, what it solves here and where it
is. Small, well-made products only.

## The tweet's hint

nim (Dessn), "Custom design controls generated on the fly. Favorite part is
using sliders to visualize how data affects the design."
https://x.com/eminimnim/status/2115617245363609837 (video, 22 s, read frame
by frame).

Its Controls panel sets every slider as **one field**: the name inside it
at the start ("Threads", "Agents running", "Width"), the figure inside it at
the end ("60", "8", "408px"), the field's darker fill up to the value, and
the whole field is what you drag. There is no separate label, track,
thumb or readout. A small dot marks where the value started (the default
under "Default" in Density, a dashed square on the Bouncy curve's slider),
so you see how far you moved it. Its sequence of designs ("Page list 1/3")
is a strip of live thumbnails with the count beside the name, and the
design changes on the canvas the moment the control moves ("Every change
lands on the sidebar the moment you make it").

The hint taken: the slider should be the thing it controls, compact enough
to need no copy around it: the state's name and its place (3/6) inside one
draggable field, the fill's edge marking where the drag began, and the page
changing under the drag.
That is call 1's first side, and call 3's first side for the dials.

## Stage and step progression

| Product | Screen | What it solves here | URL |
|---|---|---|---|
| Dessn | Controls panel (the tweet) | Name and figure inside one draggable field; a mark where the value started. Call 1 `field`, call 3 `field`. | https://x.com/eminimnim/status/2115617245363609837 |
| Dessn | Home page, "Visualize entire user flows": Booking a meeting, Event types → Choose a time → Your details → Confirmed, each a live page in a row | A flow read as its pages side by side, in order. Call 2 `row`. | https://www.dessn.com/ |
| Apple Books | Reader, its scrubber folded to "150 of 483" and a menu button | A sequence's place said in words and folded to a pill when the reader is reading. Call 1 `scrubber`, the folded pill of every side, call 3 `beside`. | https://mobbin.com/screens/a483f043-eb34-423c-ab19-bbf50655cef6 |
| Apple HIG | Page controls: a dot per page, scrubbable, edge dots shrinking past what fits, more than about ten hard to count, a background only while touched | The dot track and when dots stop working. Call 1 `scrubber`. | https://developer.apple.com/design/human-interface-guidelines/page-controls |
| Unfold | Project player: a scrubber over a row of slot thumbnails, "5 of 11 slots in use" | A row of frames with the current one raised and its count. | https://mobbin.com/screens/14e699b6-8aea-4863-962c-ffd259884481 |
| Yami | Product gallery: "7/12" over a thumbnail strip, the current one outlined | The compact n/N with a strip. | https://mobbin.com/screens/d44a502a-f197-4984-9fe1-980de63359ef |
| Polarsteps | Trim: a filmstrip with tick dots and times under it | Ticks under a strip that scrubs. | https://mobbin.com/screens/368262cf-fccc-401f-867c-9966a9340e57 |
| Blinkist | Reader: a floating pill with a segmented progress line, "0/10 … 24 min left" | One segment per chapter in a floating pill. Call 1 `player`. | https://mobbin.com/screens/ea3c48f7-2bb6-4fd2-aec0-01dc925042cf |
| Sentry | Session replay: previous, play, next, a timeline with an event dot per moment | Transport for a recorded sequence: step, play through, scrub. Call 1 `player`. | https://mobbin.com/screens/9190841a-bd92-417a-b274-63b132865717 |
| Otter AI | Transcript: a dotted scrubber with the time in a bubble while dragging | The bubble naming where the drag stands. Call 1 `scrubber`. | https://mobbin.com/screens/e01cb2e6-b43c-4ccc-8765-9012fde4a1a7 |
| Rive | Community: a state machine's states (idle, walk, run) as pills over the artboard | States of one machine pressed to stand. The overview graph's frame per state. | https://mobbin.com/screens/e6fb0a14-88f4-4b37-bf56-b9029c6d9a2e |

## Floating bars that hide, peek and hover

| Product | Screen | What it solves here | URL |
|---|---|---|---|
| Apple HIG | Sheets: detents a sheet rests at, a grabber whose tap cycles them | The phone's timeline on Steps resting at its head detent and opening to the medium one. | https://developer.apple.com/design/human-interface-guidelines/sheets |
| Apple Music | The MiniPlayer as the tab bar's accessory: the playing item's name and Play on one row, a press opens the player (HIG Tab bars) | The timeline folded to the move's name and Play under the page on a phone. | https://developer.apple.com/design/human-interface-guidelines/tab-bars |
| Apple HIG | Tab bars, iOS: the bar minimises into a small control as you scroll and comes back on a tap; visionOS: symbols alone until looked at, then labels | Fold to a pill, peek on rest, back on a press. Every side's Hide. | https://developer.apple.com/design/human-interface-guidelines/tab-bars |
| Apple Books | The folded "150 of 483" pill | What the folded bar says: the place, nothing else. | https://mobbin.com/screens/a483f043-eb34-423c-ab19-bbf50655cef6 |
| Tana | Canvas: a bottom-centred floating toolbar with a chevron that collapses it | Bottom-centre glass bar with its own collapse. | https://mobbin.com/screens/c7c9ca53-53f0-414b-ae58-80818ea27f38 |
| Weavy | Canvas: a compact bottom-centred toolbar, its zoom figure a control | A small bar sized to its content, never the window's width. | https://mobbin.com/screens/a29dd095-a103-43c5-b2e8-5e93c42d30e4 |
| Fabric | A bottom pill whose + grows a menu out of itself | A control that grows out of the pill it folds into. | https://mobbin.com/screens/c8e2800d-e105-4023-b8f2-35410ff90cb9 |
| Cosmos | Phone: a three-glyph floating pill at the foot | Thumb-reach bar on a phone. | https://mobbin.com/screens/76b8e77b-cd77-4b8e-b20c-55eb17bd9167 |
| Obsidian | Phone: a floating bottom toolbar of symbols | Same, with back and forward. | https://mobbin.com/screens/0d1e69ff-4a8c-4e95-b61c-54b77f0ac661 |
| A web audio player (unnamed on Mobbin) | A floating pill: art, name, waveform scrubber, 00:01 / 00:07, transport | Name, place and scrub in one capsule. Call 1 `player`. | https://mobbin.com/screens/2a4d54e8-a91b-4e12-994e-30656022d8cf |
| Stitch | A vertical toolbar docked to the canvas's edge | The tucked tab at the pane's edge (the graph panel's fold). | https://mobbin.com/screens/465a40f8-1af9-4969-90a8-aa5a6dbefd7e |

## The open calls (Options panel)

Each line: the sides, the reference each comes from, and the recommendation.

1. **The steps bar.** `field` (Dessn's controls): one field at the page's
   top, the switch leading, Hide trailing. `scrubber` (Apple Books, HIG
   Page controls, Otter's bubble): the kept name and a dot per stop at the
   page's foot, the name of the stop under the pointer in a bubble, Graph
   one glyph. `player` (Sentry replay, Blinkist, the floating audio
   player): ‹, Play, the name and 3/6, ›, one segment per stop along its
   foot, the switch its own group beside it (iOS 26 tab bar and its
   accessory). Recommended: `field`, the tweet's hint, which holds any
   count of steps and any name on one row at 390.
2. **A wide window.** `row` (Dessn's flow on its home page; Unfold's
   slots): as many states as the component's width lets stand, the kept
   page first, then the stops after it in order; the stop under the
   pointer stands beside the kept page if it is not in the row. `pair`
   (the owner's earlier pick): the kept page and the hovered one.
   Recommended: `row`, his pin "in wide screen u can just stack more
   depending on component/preview size".
3. **The count's figure.** `field` (Dessn: "Threads … 60" inside the
   field) and `beside` (Apple Books: "150 of 483", here "12 of 60" beside
   the slider). The old other side, "12" with "of 60" at the track's end,
   had no reference and is gone. Recommended: `field`.
4. **A phone's graph names its section.** `pinned` (iOS navigation bar:
   the large title moves into the bar once it scrolls away): a slab's name
   in the drawer's bar only while its own has scrolled out. `band` (iOS
   Contacts: the plain list's sticky section header): a band always naming
   the section in view. Both hold. Recommended: `pinned`, less copy and no
   label repeating what the graph names (his pick).

## Calls the references settled

- **Many steps on a phone (scroll or dots).** Not a question once the bar
  is designed: each side of call 1 holds many steps itself (the field's
  one fill and figure; the scrubber's dots, then one line past what
  dots can count, per HIG Page controls; the player's segments), with no
  per-stop label that has to scroll.
- **Pins on other states.** Hidden, grouped in the rail. Air
  (https://mobbin.com/screens/55150090-ff8c-4533-9603-dbc5bb128b56) draws
  only the shown version's pins on the asset and lists every version's in
  the rail, each tagged V1, V2, under an "All versions" filter. Dimmed pins
  had no reference, and a pin drawn on another state's element can sit on
  the wrong thing.
- **A node pin's pill.** At the node's top-right: the platform's badge
  place (HIG Tab bars, badges on the tab's corner). At the name collides
  with a long name's truncation.
- **Dials beside record controls.** Kept: Dessn's panel stands Data (team
  size, threads, agents) beside Layout (density, width) and Open and close
  (transition), one panel, data first.
