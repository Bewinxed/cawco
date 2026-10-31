---
version: 1
slug: "src-lib-cawco-bench-arm-a"
primary_target: "src/lib/cawco/bench/arm-a"
related_targets: []
---

# Image settings control (bench arm A)

- **Mode:** Operate (app UI: a settings panel inside a tool).
- **Job:** a section/component that inherits the surface around it. Someone about to generate an image sets its colour and its size, then applies them once. They arrive knowing roughly what they want (a house accent, or a value they copied from elsewhere) and want it accepted or told exactly why not.
- **Where:** `apps/dashboard/src/lib/cawco/bench/arm-a/` (ImageSettings.svelte, its states file, its pure model), mounted at the dev route `/dev/bench/arm-a`. Production width: a side panel, 320–420px wide; it must also hold at a full phone width (390) and stand centred, capped, on a 2560 desk.
- **States it must hold:** default, preset picked, custom colour valid, custom colour invalid (message, typed text kept), size locked (aspect lock on), size out of range (flagged, nearest valid offered), EyeDropper unsupported (no control drawn), applying (pending), applied (done), disabled (whole panel off). Long values such as `oklch(0.6271 0.2577 29.23)` never clip or push the layout. Keyboard throughout.
- **Rules of the values:** colour is one of the house accents (coral + the eight identity accents, their day values) or a custom `#rgb`/`#rrggbb` hex or `oklch(L C H)` (L as 0–1 or %). Size presets 1:1 1024×1024, 4:3, 3:2, 16:9, 9:16, Custom; width and height 256–4096 px in steps of 8. Ratio (reduced) and megapixels shown live. Apply is disabled until both values are valid and something differs from what was last applied.
- **Widths:** 390, 680, 1024, 1440, 2560, light and dark.
- **Untouched:** everything outside the arm-a folder and the dev route (no tokens, no words file, no kit edits). Copy lives in the folder's own words module because `packages/core/src/words/**` is out of scope for this bench.
- **Open questions:** none; the brief is precise (compact confirmation in the report).
- **Primitives:** OptionGroup (radiogroup chips) for swatches and presets; InputGroup + InputGroupInput (mono) for the custom colour with an InputGroupButton for EyeDropper; Input (number field) for width and height; Toggle (bits-ui) with IconLink for the aspect lock; Button with label/pending for Apply and for "Use N" suggestions.

## Direction contract
direction: inherits DESIGN.md
