# L15-cawco-decisions-3

| file | result |
|---|---|
| Diagram.svelte | `<style>` kept (no Tailwind in this bundle); removed dead `display: block` on `.draw` |
| Image.svelte | `<style>` kept; nothing else |
| Option.svelte | no `<style>`; markup names only page.css `dp-*` classes (allowed by eslint config); nothing to change |
| Preview.svelte | `<style>` kept; removed duplicate `max-block-size` on `.screen` |
| Section.svelte | `<style>` kept; removed dead `text-transform: none` |
| Stack.svelte | `<style>` kept; nothing else |
| Text.svelte | `<style>` kept; nothing else |

Why the `<style>` blocks stay: core's decision-host.ts bundles `src/lib/cawco/decisions/host/**` with Bun + bun-plugin-svelte and Lightning CSS, with no Tailwind (see the comment in apps/dashboard/eslint.config.mjs above the `decisions/host/**` block). Tailwind "works by scanning your project for utility classes, then generating all of the necessary CSS" (https://tailwindcss.com/docs/detecting-classes-in-source-files), so a utility in these files draws nothing. Each block's first line is the `/* tailwind: … */` reason.

## Contracts
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Diagram.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Image.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Preview.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Section.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Stack.svelte
deferred-file: apps/dashboard/src/lib/cawco/decisions/host/Text.svelte

## Removed
removed: Diagram.svelte:134 `display: block` on `.draw` — a div is already block
removed: Preview.svelte:157 `max-block-size: 80vb` on `.screen` — the same declaration `.frame` sets on the same element
removed: Section.svelte:26 `text-transform: none` — nothing sets a transform on h2 (page.css has none)

## Tokens
none

## Gaps
gap: Diagram.svelte:96 hand-rolled "Open as canvas" button — kit Button breaks DESIGN.md's one-primitive rule, but the kit needs Tailwind and this bundle has none; needs the decision host to build the kit first

## Theme additions
none

## Kit swaps
none

fixed: none
