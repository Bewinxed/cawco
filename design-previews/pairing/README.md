# Pairing: design preview

The pairing flow as one static page: the card and Caw above it at their real
size, Desk (544) and Phone (390), one control per moment and Replay. The code
and its motion are r4's (`PairingQr.svelte`, `PairingPanel.svelte` on
`cawco/pairing-page-r4`, ffea611a5) with only the changes the owner's pins
asked; the endings are report a8f73fdb §3 and §4.

```sh
python3 -m http.server -d design-previews/pairing 8080   # any static server on this folder
PAIRING_ENGINES=chromium PAIRING_LEGS=end,motion PAIRING_MOMENTS=expired …   # a narrower run
```

- `index.html`, `preview.css`, `preview.js`: the page. Tokens are the
  dashboard's built `tokens.css`, copied in, plus r4's QR tokens (top of
  `preview.css`); type is the repository's own Figtree and JetBrains Mono.
- `lib/qr.js`: the code, `cawco://pair/JWKHDQ@bewin-desk`, encoded by the
  dashboard's `uqr` (version 4, 33 modules, ECC H, r4's matrix): each dark
  module a dot, the finder eyes rounded rings round a dot, the head's square
  kept clear. It decodes (ZXing, in the spec).
- `lib/swap.js`: transitions.dev "Text morph" and "Text states swap" on the
  house's tokens, as Web Animations split into read and write phases.
- `caw/`: Caw's drawings, one per moment.

## Motion, recipe by recipe

| Transition | Recipe |
| --- | --- |
| The card's height between moments | transitions.dev Card resize (`--dur-panel`, `--ease-out`), run on the card's wrap |
| The title | transitions.dev Text morph |
| The line under the code; an ending's verdict on Remove device | transitions.dev Text states swap |
| The device card arriving | transitions.dev Panel reveal |
| The busy edge | cruip's animated gradient border, in coral |
| The done check | transitions.dev Success check (fade, 2px blur, from 0.6, the tick drawn from `--dur-ghost` in; no turn, no bob) |
| The fail and clock glyphs, and Remove device's check giving way | transitions.dev Icon swap on DESIGN's status glyph (from 0.92, `--dur-control`) |
| Expired's letters into the verdict | a FLIP (`--dur-panel`, drawer), then the strike (`--dur-morph`) |
| Remove device's rows | a FLIP over `--dur-panel` on ease-out |
| The dots (cloud, arrival, swallow, burst), the head's squeeze and shake, the ping | r4's |

The dots are drawn on one canvas per card. Each moment's dot motion is r4's
paths, delays and curves, written as one track per dot and read from one Web
Animation on the canvas (it changes nothing drawn), so the page's clock, and
the spec's through the DevTools Animation domain, holds and seeks the dots
like any other part. An element per dot made every play restyle and
composite about 840 animated elements in its first frame: 48–89ms of the main
thread on the proof's host, against 16.7ms. The spec reads each dot from the
page's own drawing (`preview.dotsOf`) and decodes the canvas's pixels.

## Caw's stills

Each is a Backlot edit of `assets/mascot/stills/light-ready.png` written to
the Qwen-Image edit recipe (the operation first, naming what moves from
where to where, then the blanket clause: "Everything else stays exactly as
in the input image: the same character drawn the same way, his
proportions, colours and line, two wings and two feet, and the transparent
background."), edited with `keepRest: "loose"` and no `transparent`, then
cut out by a second `transparent: true` call with no instruction. The take
below is the cut-out the page shows. The leaf that made them does not judge
them: a separate reviewer reads anatomy, proportion and character.

| Moment | File | Take (cut-out) |
| --- | --- | --- |
| Asking | `caw/asking.png` | `tk_RrfGx98giYIh8XvoauJbH` |
| Waiting | `caw/waiting.png` | `tk_4MBgKsoG-k9zny9qtFP4z` |
| Last minute | `caw/lastminute.png` | `tk_qpzFqEOgLm30y5iH5l7XU` |
| Checking | `caw/checking.png` | `tk_Pg4KWYmyJkbZ-ydttEIdx` |
| Paired (and Removed, the same card changed in place) | `caw/approved.png` | `tk_XLMcDjIlz0Y9f1uODbtfL` |
| Not let in | `caw/denied.png` | `tk_Q-q2L8tsk-HsTV2vS97oa` |
| That code expired | `caw/expired.png` | `tk_UUycqx4EcxvnLivv9rBYf` |
| That scan didn't match | `caw/nomatch.png` | `tk_cB9JiRetv7txeth1YRB2D` |
| Pairing didn't start (both causes) | `caw/failed.png` | `tk_gMv0Ked3Nln-dsB9KL8VS` |
| The head (r4's app icon) | `caw/badge.png` | r4's |
| The head, face shut | `caw/badge-shut.png` | `tk_yHUMib6tFcuJXcOasbqIn` |

The card's height runs on its wrap, the card filling it: on the spec's
WebKit, a card running its lap (the band's CSS animation of
`--border-angle`) drew no other run's height or transition, so the card
jumped to its new height on the first frame and the words arriving below
were cut by its edge.
