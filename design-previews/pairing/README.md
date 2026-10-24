# Pairing: design preview

The redrawn pairing flow (design spine + report 11d8e183), as one static page:
the card and Caw above it at their real size, Desk (544) and Phone (390) side
by side, one control per moment and Replay, and the open fork as a switch.

```sh
python3 -m http.server -d design-previews/pairing 8080   # any static server on this folder
bun scripts/probe-kit/run.ts pairing-preview   # the proof (Chromium + WebKit)
```

- `index.html`, `preview.css`, `preview.js`: the page. Tokens are the
  dashboard's built `tokens.css`, copied in; type is the repository's own
  Figtree and JetBrains Mono files (`fonts/`).
- `qr.svg`: the real code, `cawco://pair/JWKHDQ@bewin-desk`, encoded by the
  dashboard's `uqr` (version 4, 33 modules, ECC H) with the badge's square
  (modules 11 to 21) cleared; it still decodes (jsQR). The 32 clusters are
  slices of this one image (CSS mask), on a 6×6 grid whose edges fall on
  whole modules (0, 6, 11, 16.5, 22, 27, 33).
- `lib/shards.js`: the 16 shard constants as the report gives them.
- `lib/morph.js`: the house MorphText renderer, split into read and write
  phases so one frame lays the page out twice at most; `lib/torph.mjs` is
  torph 0.1.3, vendored unchanged.
- `caw/`: Caw's poses, one drawing per moment, each a Backlot edit of
  `assets/mascot/stills/light-ready.png` (edited with `keepRest: "loose"` and
  no `transparent`, then cut out by a second `transparent: true` call with no
  instruction), and the `><` badge, an edit of the app icon.
- Motion rule the probe holds: nothing in flight crosses shown words. The
  swallow's parts rise beside the title and turn in to the beak above it,
  and the words that arrive as it ends show once every part is past them;
  in a dead end the outcome's words come in top down on the card's new face,
  the falling glass gone above its edge.

| Pose | Take |
| --- | --- |
| asking | `tk_DCuI45fQT-H3swN0H-YsG` |
| waiting | `tk_9wTsTdSZMvSSXkLkXe-OQ` (cut out of `tk_O2bL7V9qKiiEzqbNf-_U5`, the left wing folded on `tk_2sAbMB1gfCuvYmiq6lWpM`) |
| last minute (urgency) | `tk_GcyM9KYfH-IczdUyLaKjy` (cut out of `tk_FpTXWFymEJwb6TbkbIFr-`) |
| checking | `tk_MvMFxRvLeWpyBtmVtZBpT` |
| swallowing | `tk_H9hHoUZygKjL5CQPYzv7I` (beak at 0.58, 0.72 of the box) |
| approved | `tk_VQzzHUm5cDaGqQ2ZelLW7` |
| denied (the phone turned away) | `tk_rH4Ijc-xtE4KTVGn-wZSH` (cut out of `tk_wnWVyznBL8_jFEvE6ndU2`) |
| scan matches nothing (a wrong code) | `tk_N3TtX6BSC-j8HDOuhbcGZ` (cut out of `tk_dwJtW4_hTYTdCLuLjfie4`) |
| failed before a code (nothing offered yet) | `tk_cadPnrsv591ccq5ItIIb3` (cut out of `tk_nD2oKSeKItattAnRZ0KrV`) |
| expired | `tk_xT-_1mn1lK0CJfm2RGx3F` |
| badge `><` | `tk_yHUMib6tFcuJXcOasbqIn` |
