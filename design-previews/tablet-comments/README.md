# Comments on a tablet: design preview

The owner: "create a compact view forthe comment panelfor tablet viewpoertand
let the comments grow out of it just how the hoveringthing on the top right
does". The advisor's two options (report 80d6af29) drawn on one static page:
the preview pane at a tablet's width (744 iPad mini, 820 iPad Air, 1024 iPad
Pro), the comment-sizing preview in its well, and that page's two real
comments, read from the hub.

```sh
python3 -m http.server -d design-previews/tablet-comments 8080   # any static server on this folder
bun scripts/probe-kit/run.ts tablet-comments-preview               # the proof (Chromium + WebKit)
bun design-previews/tablet-comments/capture/capture.ts             # remake parts.js, house.css, fonts/, hung-shadow.png, page/
```

The address keeps what is shown: `?option=a|b&width=744|820|1024&state=list|thread|none&pin=1|2`.

- **A, a strip; the thread hangs from its row.** CommentRail as a strip
  `--c-comments-compact-w` (200px, the advisor's proposed token) beside the
  well, its rows one line (pill, place, age), its own bar one glass group
  (Search, Sort, +, Close). A row pressed stands open: its place and age give
  way to the thread's four peers (Resolve, Delete, More, Close), it draws its
  own foot (BarGlass's join, the row's radius), and a HangCard hangs from it,
  flush with its end, `c-pin-card-reading-w` wide (two fifths of the page,
  280px at least), over the page. Another row pressed moves the card to it,
  its contents changing in place.
- **B, the list hangs from Comments.** Nothing docks. The head is regrouped
  to three glass groups (the mode switch; New canvas; Reload, Expand,
  Comments, Close), and the list hangs from the trailing one as the glass's
  card (HangCard `glass`, its hung shadow), three tenths of the page wide
  (280 to `c-panel-w`). A row pressed changes the card in place to the
  thread (GlassCard's swap), two fifths of the page wide: Back leads its bar,
  the four peers trail. Back changes it back, at the list's scroll.

What it is made of:

- `parts.js`, `house.css`, `fonts/`, `hung-shadow.png`: written by
  `capture/capture.ts`, which mounts `capture/Stage.svelte` on the
  dashboard's dev server under a finger (a touch page at 2x): CommentRail
  with the two pins, each pin's PinCard, PinMark, four BarGlass groups,
  ArtifactMenu, HangCard hung from a row's box and from a glass group (its
  shadow drawn by motion/hung-shadow as the Shell draws it), and the kit's
  Button for Back. Generated; never edited by hand.
- `page/`: the page under review, the comment-sizing preview as the
  repository holds it, copied by capture.ts. The pins stand on its elements
  by their selectors and points; one whose element is missing is drawn gone.
- `pins.json`: the hub's comment rows for the comment-sizing preview
  (comment_read, all, 2026-10-25T06:36:37Z), each pin's anchor, point, looks
  and whole thread; the elements' captured styles and each pin's title and
  link are left out. The session that answers is named as the hub names it.
  Every age (a row's, a thread's entries') is told against `now`, the
  moment the pins were read: capture/now.js fixes the stage's clock to it,
  so the ages never go stale, and the manifest records it.
- `preview.js`: the frame and the house motion ported line for line: hang's
  open and close (translate alone under a cut that never moves, `--dur-pop`
  in and `--dur-exit` out on `--ease-out`, interruptible, the kit's fade
  with less motion), HangCard's neck, GlassCard's swap (`--dur-exit` out,
  `--dur-morph` in, the box tweening on `--ease-drawer`, trailing edge and
  top held). The two runs carry ids (`hang`, `morph`) so the probe can read
  the clock by them.
- `preview.css`: the bar, the frame, the pane and well, and, marked,
  what each option asks of the parts that they don't do today (the compact
  rows, the open row's foot, B's thread bar).
- `captures/`: each option at each width, the list open and comment 1's
  thread, with `manifest.json`; made by the probe's run.

No card stands on a pill: where a pill on the page falls under a hung
card's footprint, the card's foot stops `--space-2` above the pill's drawn
edge (rings included), so a person always sees the pins (the capture
review's must-fix; a call made here, since the pane's reveal, a scroll of
the page, cannot move a pill out from under a card that runs to the well's
foot). In B at 744 and 820 that leaves the thread's room short.

The frame stands ready only once the page under review has played its own
opening to the end, so A and B differ only by the option.

Not drawn: a pill's own hang with B's card shut
(the pin-hang the builder is making); the composer for a new comment; Day
and Night (the page follows the system; the hung shadow is the day's).
