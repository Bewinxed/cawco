# L50-routes-config-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. Rules followed: better-ui (concentric radius kept: badge `rounded-xs`, offer row `rounded-sm`; state dot is `rounded-pill`; no transition-all; hover through the existing variants); better-layout (ladder spacing 2/4/7/11/18, groups spaced by gap and a hairline rule above later groups, `minmax(0, 1fr)` tracks, one 72ch measure for notes, controls placed on the grid by the consumer on a phone).

No `<style>` remains in any of the seven files.

## Files

| File | Moved | Literals → target | Breakpoint edges |
| --- | --- | --- | --- |
| config/phone | group, status line, device row; `<style>` (foreign-dom nth-child rule) removed | 72ch → `c-measure`; 8px → space-2; 10px → space-3; 12px → space-3; 50% → rounded-pill | `max-phone:` (639 → 640 edge) |
| config/previews | group, 6 notes | 72ch → `c-measure`; 8px → space-2 | none |
| config/rules | waiting pill → kit Badge variant="attn" | 1px 6px dropped with the hand-built pill | none |
| config/skills | `.group`, `.note`, `.listing` classes (their `<style>` was lost in the merge), offer row | 8px → space-2; 18px → space-5; 72ch → `c-measure`; 10px → space-3; 240px → `c-offer-text-basis` | none |
| config/spend | `.group`, `.note` classes | 8px → space-2; 72ch → `c-measure` | none |
| config/subagents | group, 6 notes, status line | 72ch → `c-measure`; 8px → space-2 | none |
| config/updates | 2 groups, pending note, fold body | 8px → space-2; 72ch → `c-measure`; 6px → space-2 | none |

## Theme additions

None.

## Kit swaps

kit-swap: apps/dashboard/src/routes/(app)/config/rules/+page.svelte:199 Badge variant="attn" — done (the hand-built "N waiting" pill; `data-slot="num"` kept)
kit-swap: apps/dashboard/src/routes/(app)/config/skills/+page.svelte:354 Button figures="tabular" — done (`class="num"` on the Fetch-again button is the kit's own `figures: tabular`)
kit-swap: apps/dashboard/src/routes/(app)/config/subagents/+page.svelte:259 Spinner (default) — done (`size-icon-md` dropped: the default is the same 16px; `shrink-0` stays the site's)

## Tokens

token: --c-measure 72ch — the running-text measure DESIGN.md Typography gives ("Running text measures 60 to 72ch") for notes, hints and labels; the same token L12 logs, used here on the config pages' notes
token: --c-offer-text-basis 240px — the flex basis of a marketplace plugin offer's text column before the Install button wraps under it (skills page); a real dimension, no ladder step

## Removed

removed: apps/dashboard/src/routes/(app)/config/phone/+page.svelte:254 `[data-slot="device"] > :global(:nth-child(2))` phone rule — a rule into SwitchField's root (a child component with no `class` prop), which only moved the switch to a second row; the grid now places the Remove button (`max-phone:col-start-2 max-phone:row-span-2 max-phone:row-start-1`, centred across both lines) and the switch flows to row 2 by itself
removed: apps/dashboard/src/routes/(app)/config/skills/+page.svelte:564 `m-0 list-none p-0` on the offers `ul` — Preflight resets all three
removed: apps/dashboard/src/routes/(app)/config/phone/+page.svelte:162 `--dot-r: 50%` custom property — a 7px square dot is a circle at `rounded-pill`
removed: apps/dashboard/src/routes/(app)/config/skills/+page.svelte `.caution`, `.offer`, `.text`, `.line`, `.pname` — their rules were already gone from the merged file and no markup used them

## Fixed

fixed: apps/dashboard/src/routes/(app)/config/phone/+page.svelte:219 a phone device row places its own cells instead of reaching into the switch's root — DESIGN.md Layout (the row's tracks belong to the row)
fixed: apps/dashboard/src/routes/(app)/config/skills/+page.svelte:381 the three groups carry their own gap and a hairline rule above the second and third (the merge dropped the scoped `.group + .group`) — DESIGN.md Layout (groups separated by space and a hairline)
fixed: apps/dashboard/src/routes/(app)/config/spend/+page.svelte:59 `.group` / `.note` named classes with no rule (the merge dropped their `<style>`) now carry their utilities — DESIGN.md Typography (meta role, 72ch measure)

## Gaps

None.

## Contracts

None.

## Counts

theme 0 · kit-swap 3 · token 2 · removed 4 · fixed 3 · gap 0
