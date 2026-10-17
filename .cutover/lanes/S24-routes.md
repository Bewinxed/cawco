# Lane S24-routes

13 files, all done. Residual counts by kind (1/2/3/4/5): project/[id] 0/12/0/0/2, dev/finder 0/1/0/0/0, usage 0/0/0/0/3, workflows 0/0/0/0/15 (deferred), others none. Spacing ratchet at baseline (469). svelte-check: 0 errors, 1 warning (the foundation's Shot.svelte:212).

## Files
| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| motion/session-limit | 6 | 0/0/0/0/0 | 36rem, 48px, 96px | none |
| motion/traffic | 11 | 0 | none | none |
| motion/updates | 7 | 0 | 980px, 380px | none |
| motion/usage-limits | 1 | 0 | 72rem | none |
| motion/usage-relay | 6 | 0 | 56px, 96px, 12px | none |
| oauth/mcp | 2 | 0 | none | none |
| project/[id] | ~35 | 0/12/0/0/2 | 36rem, 14rem, 15rem/22rem, 72ch, 100cqb | 899 -> max-desk (901 edge), 639 -> max-phone |
| project/new | 8 | 0 | 72rem, 570px, 40rem, 80px | 639 -> max-phone |
| usage | 8 | 0/0/0/0/3 | none | 899 -> max-desk, 639 -> max-phone |
| workflows | 9 | 0/0/0/0/15 | 24px 44px 64px, column list | 760 px query kept residual |
| artifact/[id] | 2 | 0 | 42% | none |
| dev/finder | 12 | 0/1/0/0/0 | 100dvh, 34px, 36px, 5px, 24px | none |
| project/[id]/view/[name] | 1 | 0 | 100dvh | none |

## needs variant
- needs variant: data-on (usage: project chip, 3 declarations, residual)
- needs variant: max-width 760px (workflows)

## needs transition token
none

## kind-5 declarations verbatim
usage:
    border-color: transparent; background: var(--selected-bg); color: var(--selected-ink);  (selector [data-slot="top"] :global([data-slot="select-trigger"][data-on]))
project/[id]:
    --fade-inset-end: calc(var(--bar-reach) - var(--space-3));
    container-type: size;
workflows: the whole `@media (max-width: 760px)` block, 15 declarations, selectors on data-slot hooks.

## shadcn/no-restyle hits
Every `shadcn/no-restyle` line below, file:line, component, class (the contract lines under Contracts repeat them with rule ids).

## shadcn variant
none

## important kept
none (workflows keeps its source `display: none !important` inside the residual block)

## Contracts
deferred-file: apps/dashboard/src/routes/(app)/workflows/+page.svelte
  The `@media (max-width: 760px)` block (needs variant: max-width 760px, no variant carries it), kept verbatim in `<style>` with `[data-slot=...]` selectors replacing `.heading .desktop span.mobile details.mobile .count thead tbody .workflow-row .name .age summary .list-page`; `summary` min-height reads `--summary-min` (44px set on the element). Target: integration adds the 760 variant, then converts it.
deferred-file: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte
  Only the `:global(.kit-pop.view-ask-pop) { inline-size: min(var(--c-panel-w), calc(100vw - 2 * var(--space-3))); padding: 0; border: 0; background: none; box-shadow: none; }` rule: the element is PopoverContent's, which takes no style, and `100vw` is a literal. Target: popover-content / a viewport token.
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1449 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell 
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1466 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell 
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1624 shadcn/require-static-classes | the kit component (or its stylesheet) owns this; integration writes its contract | Dynamically built className on <DropdownMenuTrigger> cannot be checked
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1631 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "min-w-48" is not allowed on <DropdownMenuContent>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1637 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "min-w-40" is not allowed on <DropdownMenuSubContent>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1659 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "h-64" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1704 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "h-48" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1799 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "h-64" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1908 shadcn/no-unknown-classes | the kit component (or its stylesheet) owns this; integration writes its contract | "view-pane-side" is not a class this project's Tailwind knows, so no CSS is generated for 
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1987 shadcn/no-arbitrary-values | the kit component (or its stylesheet) owns this; integration writes its contract | "h-[54px]" hardcodes an off-token value
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1987 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "rounded-sm" is not allowed on <Skeleton>: <Skeleton> owns its shape
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1988 shadcn/no-arbitrary-values | the kit component (or its stylesheet) owns this; integration writes its contract | "h-[54px]" hardcodes an off-token value
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1988 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "rounded-sm" is not allowed on <Skeleton>: <Skeleton> owns its shape
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2001 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "h-64" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2016 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "view-ask-pop" is not allowed on <PopoverContent>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:86 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-64" is not allowed on <DropdownMenuContent>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:90 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "gap-y-space-1" is not allowed on <DropdownMenuPendingItem>: <DropdownMenuPendingItem> own
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:101 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "gap-y-space-1" is not allowed on <DropdownMenuPendingItem>: <DropdownMenuPendingItem> own
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:168 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-40" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:170 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-16" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:171 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-20" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:173 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-6" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:175 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "w-14" is not allowed on <Skeleton>: the grammar does not recognize it
contract: apps/dashboard/src/routes/(app)/workflows/+page.svelte:184 shadcn/no-arbitrary-values | the kit component (or its stylesheet) owns this; integration writes its contract | "max-w-[420px]" hardcodes an off-token value
contract: apps/dashboard/src/routes/project/[id]/view/[name]/+page.svelte:95 shadcn/no-restyle | the kit component (or its stylesheet) owns this; integration writes its contract | "h-64" is not allowed on <Skeleton>: the grammar does not recognize it
