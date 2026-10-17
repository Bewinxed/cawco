# `--shadow-tile` and every theme key written `--x: var(--x)`

## The report
Set 5 saw the tile (project/CardFace.svelte:39, `shadow-tile`) and the task cards lose their box-shadow outright.

## What the theme did
theme.css wrote 50 keys as their own token (`--shadow-tile: var(--shadow-tile)`, `--radius-sm`, `--font-mono`, `--leading-*`, `--ease-*` …) in `@theme inline`. Tailwind emits every one into `@layer theme { :root, :host { … } }`.

On the document that held, because tokens.css's `:root { --shadow-tile: 0 1px 2px … }` comes later in the same layer at equal specificity. Measured in Chromium 156 against the real vite build (chromium-shadow-built.txt, chromium-selfref.txt):
- the tile and the task card computed the token's layers, light and dark;
- all 50 keys resolved on `:root` and on a child.

That holds only while tokens.css's declaration follows Tailwind's. Under `:host`, or wherever the order flips, `--x: var(--x)` is a cycle: the variable is invalid at computed-value time, so `box-shadow` computes to `none` and `border-radius` to `0px`. In a shadow root that adopts the built stylesheet (chromium-host-cycle.txt):

    built-before.css: --shadow-tile (invalid) | box-shadow …none | border-radius 0px

## The fix (packages/hub/src/design-tokens.ts)
A key that shares its token's name goes in an `@theme inline reference` block. Its utility compiles the same (`.shadow-tile { --tw-shadow: var(--shadow-tile); … }`), and Tailwind writes none of those keys into `:root`. The token's own declaration is the only one.

Every other key stays in `@theme inline`; the key set is unchanged.

**Biome:** 2.5.15, the latest, fails to parse the two-option `@theme inline reference` ("expected `{` but instead found `reference`"). `@theme reference` alone parses, but Tailwind then writes a self-fallback into every utility (`var(--radius-sm, var(--radius-sm))`). So biome.jsonc excludes the generated theme.css, as it does other generated files. It is still held to its generator by `build-tokens.ts --check`, and compiled by Tailwind there and in vite build.

    built-diff.txt: rule fragments only in the previous build: 1; only in the new: 1
                    self-referencing --x:var(--x) in previous build: 50; in new build: 0
    chromium-host-cycle.txt, new build: --shadow-tile 0 1px 2px light-dark(… | box-shadow … oklch(0.295 0.01 70 / 0.07) 0px 1px 2px 0px, … | border-radius 8px

The one fragment that differs is Tailwind's `:root, :host` theme block, without the 50; every utility is byte-identical.

The tile and task card in the new build, light (dark the same shape) — Tailwind's four blank layers, then the token's own:

    tile: rgba(0, 0, 0, 0) 0px 0px 0px 0px ×4, oklch(0.295 0.01 70 / 0.07) 0px 1px 2px 0px, oklch(0.295 0.01 70 / 0.035) 0px 0px 0px 1px
