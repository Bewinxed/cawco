# Pairing: design preview

The pairing surface as the build spec draws it (`pairing-design.md`, the
designer's fold of the judgement and detector critiques): no card, the
content on the page ground. The object column holds Caw on the axis, one
object slot (the paper's footprint in every moment) and the letter run under
it. The words column puts every word on one start edge. One frame shows per
window, drawn at its real size: Desk at 900px and wider, the 390px Phone
under it.

```sh
bun design-previews/pairing/app/build.ts                   # build index.html and assets/
python3 -m http.server -d design-previews/pairing 8080     # any static server on this folder
bun scripts/probe-kit/run.ts pairing-preview               # the proof (Chromium + WebKit)
PAIRING_LEGS=captures PAIRING_CAPTURES=<dir> PAIRING_ENGINES=chromium bun scripts/probe-kit/run.ts pairing-preview
```

- `app/`: the sources. `index.html`, `main.js` and `preview.js` are the page.
  `preview.css` holds the layout, the QR's own tokens and the hero title step
  (`--text-hero`, preview-only until the owner picks). `CawHost.svelte` mounts
  Caw through the dashboard's `Caw.svelte`, which draws him by Rive from
  `assets/mascot/caw/<status>.riv`. `lib/qr.js` is the code
  (`cawco://pair/JWKHDQ@obelisk-of-light`; the letters are a sample).
  `lib/swap.js` holds transitions.dev's Text morph and Text states swap.
  `caw/` holds the head's two faces.
- `index.html`, `assets/`: the build, on the dashboard's own app.css (tokens,
  house faces). Generated; never edited by hand.

## The bar

**Play into** plays each moment's storyboard from the moment it comes from.
**Replay** plays the last one again. The acts on the surface (Deny, Approve,
New code, Retry, Remove device) play the flow on from where it stands. The
owner has two picks, and the bar gives each a switch and nothing more:

- Denied's New code: quiet (the spec's build) or coral.
- Removed: retired (the spec's build; Remove device lives in Configure ›
  Devices) or kept. Kept, Paired gains Remove device as a ghost act and
  Removed becomes a moment.

## The records

The phone is the owner's own, as the hub and his tailnet record it, nothing
more: the hub's one device (`push_devices`: "iPhone", `ios`) and its tailnet
name and address (`tailscale status`: `iphone182-1`, 100.99.18.79). Over the
public internet and the LAN the hub records no address, so Checking shows no
address line there. The hub is obelisk-of-light.

## Motion

Each change is the spec's storyboard (§7). Every board has one lead, its
beats at the spec's times, and its Web Animations' ids say their role. The
lead's runs are `lead:*`; cues (`cue:*`) draw nothing and change Caw's file,
land the hub's record or start the drift, so one clock holds every beat. The
proof reads each board's first frame on that held clock (the DevTools
Animation domain on Chromium) and checks that it holds the lead's runs alone.
What leaves a place it keeps leaves as a copy where it stood. What stays and
moves slides from where it stood (FLIP), at the board's `follow` beat.
