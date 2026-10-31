---
version: 1
slug: "ib-cawco-bench-arm-b-imagesettings-svelte-163e1fab"
primary_target: "apps/dashboard/src/lib/cawco/bench/arm-b/ImageSettings.svelte"
related_targets: []
---

# Image settings (bench arm B)

- **Mode:** Operate. A component inheriting the established world: `direction: inherits DESIGN.md`.
- **Job:** set the colour and the size of an image about to be generated, then apply them once. Who arrives: the operator, from a generation surface (a side panel or popover beside the prompt), mid-task; they want a valid colour and size in as few presses as possible and to know exactly what will be applied.
- **Where:** `apps/dashboard/src/lib/cawco/bench/arm-b/ImageSettings.svelte`, mounted at `/dev/bench/arm-b`. Production width: a panel 320–416px wide; it fills a phone at 390 less margins.
- **Mounts:** ui/card, ui/option-group (swatches and presets, one radiogroup each), ui/input-group (colour field with its well; width and height with px), ui/toggle (aspect lock, bits-ui Toggle), ui/button (Pick from screen; Use N; Apply settings with pending and done).
- **References:** Midjourney's Image Size panel draws the shape of the ratio beside its name (16:9 in a drawn frame); Leonardo AI pairs preset size chips with W/H fields joined by a lock. Departure: each preset chip carries its own drawn frame (Show Don't Tell), and the readout names ratio and megapixels in figures; the EyeDropper is a word button in the Colour head because the icon set has no pipette and words beat a wrong glyph.
- **States:** default, preset picked, custom colour valid, custom colour invalid, size locked, size out of range, EyeDropper unsupported, applying, applied, apply failed, disabled.
- **Rules:** colour is hex (#rgb, #rrggbb) or oklch(L C H); an invalid entry keeps what was typed, flags the field and says how to fix it. Size 256–4096 px in steps of 8; an invalid dimension is flagged with the nearest valid one offered as a button. Apply is disabled while anything is invalid or nothing changed since the last apply.
- **Widths:** 390, 680, 1024, 1440, 2560; light and dark.
- **Untouched:** everything outside `bench/arm-b/` and the dev route (copy lives beside the component, not in packages/core/words, by the brief's scope).
- **Open questions:** none; the brief is precise.
