# Suggestions: design preview

The owner, on the starters in Caw's column of the project page preview: "this
style for suggestion chips should be revised, show some variations using
impeccable's agents, and have a reusable component other panels can reuse".

One static page: `Suggestions.svelte`
(`apps/dashboard/src/lib/cawco/suggestions/`) in each of its three looks, set
in Caw's first thread and in the empty Decisions tab (the other panel that
would take it), at a desk and on a phone, then each look's states (one,
seven, the longest the hub writes, while being read). Today's StarterCards
lead the page for comparison. Day and Night switch the whole page. A press
puts the words in the composer, the caret after them; nothing is sent.

```sh
python3 -m http.server -d design-previews/suggestions 8080   # any static server on this folder
bun scripts/probe-kit/run.ts suggestions-preview              # the proof (Chromium + WebKit)
bun design-previews/suggestions/capture/capture.ts            # remake parts.js, house.css, fonts/
```

- `parts.js`, `house.css`, `fonts/`: written by `capture/capture.ts`, which
  mounts `capture/Stage.svelte` (every look and set through the real
  component, and today's StarterCards) on the dashboard's dev server, and
  keeps each part's markup and the dashboard's stylesheet cut to the rules
  they reach. Generated; never edited by hand.
- `index.html`, `preview.css`, `preview.js`: the page and its frames, on the
  house's tokens.
- `caw/caw-ready-day.png`, `caw/caw-ready-night.png`: Caw's still by day,
  and by night on the paper rim, from the Caw panel preview's stills.
  `caw/caw-ready-night-mark.png`, his 28px head mark at night: the night still
  with its rim grown to one device pixel at 28px
  (`python3 -I design-previews/suggestions/capture/night-mark.py`), since the
  kit's rim averages 0.35px there.

## The looks

| Look | From | Gives | Costs |
| --- | --- | --- | --- |
| `list` | Lightfield "Some ideas" ([screen](https://mobbin.com/screens/a77b052b-5612-4588-895a-6cc553d5b18d)), Plane AI Suggestions ([screen](https://mobbin.com/screens/e9cd6480-757c-460e-961a-baec177562e4)) | The calmest: sentences on hairlines, the glyph in the lead column; three stand 134px in Caw's column | No reasons |
| `rows` | Cofounder ([screen](https://mobbin.com/screens/be8d45fe-a735-4ad4-b297-7b97a59d21a3)) | Each sentence over its reason | 207px for three in Caw's 380px panel and the 390px Phone frame, 224px in the 358px frame a 390px screen leaves |
| `chips` | Langdock ([screen](https://mobbin.com/screens/b66870ae-8d47-493d-b1b6-e6c01173ad96)), AirOps ([screen](https://mobbin.com/screens/0e0ae5e4-5097-483c-a2d8-f8cddd192d67)), Relevance AI ([screen](https://mobbin.com/screens/22b3b535-c32d-473b-a1fa-6defef04d729)) | The most compact, the kit's own option chip; 104px for three | No reasons; a long sentence makes a tall chip |

Considered and left out: Base44's one-line scrolling strip of chips over its
composer ([screen](https://mobbin.com/screens/f74474fd-dda4-413c-95d2-2f74ab8c9054)):
it cannot wrap a long sentence, so the longest starters would be cut.
