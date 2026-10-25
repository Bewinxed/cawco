# Pairing: design preview

The pairing flow as one static page: the card and Caw above it at their real
size, Desk (544) and Phone (390), one control per moment and Replay. The code
and its motion are r4's (`PairingQr.svelte`, `PairingPanel.svelte` on
`cawco/pairing-page-r4`, ffea611a5) with only the changes the owner's pins
asked. Paired and Removed are report a8f73fdb §3's ledger, in the words
report 24b5859f (a Fable writer) wrote; under the code nothing is said while
waiting.

The four failures are the designer's (report 0b7eb35b and its addendum),
built as written, every word theirs: **the well keeps what the hub gave**.
The thing the hub gave stays in place and wears the failure, with the one way
forward on it; r4's death (the dots' burst and fall, the card folding to a
sentence) is gone, and only the head's squeeze and shake, face shut, stays.

- The code expired: the code dims to `--qr-dim-opacity` and stays; the head
  shuts and goes; one strike draws across the six letters; the clock and
  "No one scanned it in ten minutes." take the line; New code, coral, where
  the head was. The ring stays the hairline; the height is the code card's.
- Wrong code scanned: the live code stays as it is, ping and all; its
  paper's edge and the ring take the fail ink; the ✕ and one of two lines,
  by the scan's reason ("That code expired. Scan this one." for a spent code
  of this hub, "Not a code from this hub. Scan this one." otherwise, a
  switch on the page); no button.
- Denied: the phone's drawing dims to 0.5 and a bare ✕ lands on its screen;
  its facts stay, "asked" becomes "denied" and its seconds restart; Approve
  leaves and Deny's box becomes New code, in the quiet outline by default
  and coral behind the page's switch (the owner's pick). The ring takes the
  fail ink; the height is the device card's.
- The hub didn't answer: the cloud stops where it stands (held, never
  snapped home); the head shuts and goes; the ✕ and "No code was made
  (502)." take the line; Retry, coral, where the head was; Retry lets the
  cloud drift on from where it stood.

The status glyphs are the designer's ruling: the house's bare Close (`M6 6l12
12M18 6L6 18`) and Tick (`M5 12.5l4.5 4.5L19 7.5`) and Solar's linear clock
(a 10 circle and `M12 8V12L14.5 14.5`), each a 1.5 stroke with round caps on
the 24 grid, no fill and no disc. They are 16px (`--icon-md`) on the line
under the code and in Paired's and Removed's ledger, and a quarter of the
phone's box on Denied's screen (24px on the desk, 20px on the phone). Each
mark sits on the x-height middle of the words beside it by the dashboard's
mark line recipe (`.mark-line`, `.mark-cell`, `.mark-text`, copied into
`preview.css`), within half a pixel in both engines.

"Pairing is off" is gone with no drawing of its own: the card only shows
while the hub is in pairing mode, so it never meets that answer.

The phone on the cards is the owner's own, as recorded and nothing more:
the hub's one device (`push_devices`: name "iPhone", platform `ios`;
`owner_devices` holds none) and its tailnet name and address (`tailscale
status`: `iphone182-1`, 100.99.18.79). The hub keeps no OS version, app
version, place, or public or LAN address, so the cards say none: the public
and LAN Checking moments show no address line.

```sh
python3 -m http.server -d design-previews/pairing 8080   # any static server on this folder
bun scripts/probe-kit/run.ts pairing-preview               # the proof (Chromium + WebKit)
PAIRING_ENGINES=chromium PAIRING_LEGS=end,motion PAIRING_MOMENTS=expired …   # a narrower run
PAIRING_ENGINES=chromium PAIRING_LEGS=captures bun scripts/probe-kit/run.ts pairing-preview   # the designer's captures
```

- `index.html`, `preview.css`, `preview.js`: the page. Tokens are the
  dashboard's built `tokens.css`, copied in, plus r4's QR tokens (top of
  `preview.css`); type is the repository's own Figtree and JetBrains Mono.
- `lib/qr.js`: the code, `cawco://pair/JWKHDQ@obelisk-of-light` (the owner's
  hub; the six letters are the preview's sample), encoded by the
  dashboard's `uqr` (version 5, 37 modules, ECC H, r4's matrix): each dark
  module a dot, the finder eyes rounded rings round a dot, the head's square
  kept clear. It decodes (ZXing, in the spec).
- `lib/swap.js`: transitions.dev "Text morph" and "Text states swap" on the
  house's tokens, as Web Animations split into read and write phases.
- `caw/`: Caw's drawings, one per moment, each with its night still
  (`<moment>-night.png`).
- `captures/`: the four failures at rest (Wrong code scanned with each of its
  lines, Denied with its quiet and its coral New code), the Desk and Phone
  frames each shot alone, in a window 390 and 1440 wide, by day, at DPR 1
  (`<moment>[-<variant>]-<frame>-<width>-day.png`), listed with a caption
  each in `manifest.json`.

The page has both schemes (`color-scheme: light dark`, the tokens'
`light-dark()`), following the reader's system.

## Motion, recipe by recipe

| Transition | Recipe |
| --- | --- |
| The card's height between moments | transitions.dev Card resize (`--dur-panel`, `--ease-out`), run on the card's wrap |
| The title | transitions.dev Text morph |
| The line under the code; an ending's verdict on Remove device; Denied's "asked" to "denied" | transitions.dev Text states swap |
| The device card arriving | transitions.dev Panel reveal |
| The busy edge | cruip's animated gradient border, in coral |
| The done check | transitions.dev Success check (fade, 2px blur, from 0.6, the tick drawn from `--dur-ghost` in; no turn, no bob) |
| The line's mark (the live dot, the clock, the ✕), Denied's ✕ on the phone, and Remove device's check giving way | transitions.dev Icon swap on DESIGN's status glyph (from 0.92, a 2px blur, `--dur-control`) |
| Expired's strike across the letters | left to right over `--dur-morph` on ease-out |
| New code and Retry arriving at the code's centre | a fade from 0.92 over `--dur-pop` |
| The code dimming on Expired | `--dur-settle` on ease-out |
| Remove device's rows; Denied's New code taking the row | a FLIP over `--dur-panel` on ease-out |
| The ring and Wrong code's paper edge taking the fail ink | `--dur-pop` on ease-out |
| The dots (cloud, arrival), the head's squeeze and shake | r4's |
| The swallow (the scan) | r4's pour, inner first, each dot and finder eye late by its distance from the head, on `--ease-crossfade` over `--dur-pop`; the paper and head fade with the last of it (`--dur-pop` from `--dur-panel`), and the device arrives on the frame it ends. On r4's ease-in-out each piece sat still for its first third and then moved near a third of its way in one frame, so the finder eyes, starting last, hung and jumped, and the paper then vanished in a frame (the owner: "a lag then it jumps to the end") |
| The ping | r4's ring, growing `--qr-ping-reach` (`--space-3`) past the card on every side, under the title's `--space-4` gap, so it never meets the title |

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
| Paired | `caw/approved.png` | `tk_vdFvg-7_BXJtsxZg8_37W`, cut out of `tk_5MKhbxfDbzzuMFIGJzA9x` |
| Removed | `caw/removed.png` | `tk_h71NPWAoipVsFPRpJtyDM`, cut out of `tk_ndbwdeDBJ35JXI4E7jExY` |
| Denied | `caw/denied.png` | `tk_Q-q2L8tsk-HsTV2vS97oa` |
| The code expired | `caw/expired.png` | `tk_UUycqx4EcxvnLivv9rBYf` |
| Wrong code scanned | `caw/nomatch.png` | `tk_vYCT4PHo2PzsWV2p8AFkc`, cut out of `tk_zHhwGrEet-1dbYUGCLf48` |
| The hub didn't answer | `caw/failed.png` | `tk_gMv0Ked3Nln-dsB9KL8VS` |
| The head (r4's app icon) | `caw/badge.png` | r4's |
| The head, face shut | `caw/badge-shut.png` | `tk_yHUMib6tFcuJXcOasbqIn` |

Paired, Removed and Wrong code were remade from the cut-out of
the open-eyed source, `tk_689t8aVLxt1_jA_ojCjfk`, on Qwen-Image's edit
guide (QwenLM/Qwen-Image `prompt_utils.py`, the edit enhancer: "Keep the
enhanced prompt direct and specific"; its example "Replace the man's hat
with a dark brown beret; keep smile, short hair, and gray jacket
unchanged"): the operation, then one clause keeping the rest, `keepRest:
"loose"`, then cut out by a `transparent: true` call. Their instructions:

- Paired: "Raise both wings a little higher in a small, calm cheer, each
  wing the same size and shape as in the input; keep his open eyes, beak,
  body, two feet and the transparent background unchanged."
- Removed: "Lower both wings to hang straight down at his sides at their
  full length, folded but whole, and add a beige smartphone with a dark
  screen lying on the ground beside his right foot, about as long as his
  foot; keep his open eyes, calm face, beak, body, two feet and the
  transparent background unchanged."
- Wrong code: "Add a small beige smartphone pinched at the red
  tip of the wing on the right, the wing raised a little so the phone is in
  front of his beak, screen toward his eye; keep his open eyes, the wing on
  the left, beak, body, two feet and the transparent background unchanged."

Each cut-out came back with a pale sticker outline (27–55% of its edge
band light, against the source's 0.2%); `halo.py` cleared it, then the
bluish-grey bits of that outline left in pockets its flood cannot reach
(off his palette: `b > r + 5`, light) were cleared too, and on Removed the
phone's warm beige the flood had taken (`r − b ≥ 25`) was put back from
the cut-out. What stays light in the edge band is the phones' own beige.
Then the 512 take was halved to 256.

**By night** each still is drawn on the house's paper rim (`--paper`,
#f4f0e6), as the Caw panel and Decisions list previews' night stills are:
the rim grown 3.6px round his whole silhouette at 256 (an antialiased
round dilation of his alpha, drawn under him), which the spec measures at a
median 3px, so 0.94px on screen at Desk's 80px and 0.75px at Phone's 64px
(the Decisions list's hero reads 0.75px at 80 on the same rule). The QR's
head stays as it is: it sits on the code's paper, light in both schemes.
