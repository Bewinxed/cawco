# Lane L12-cawco-config-3

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. Rules followed: better-ui (concentric radii kept, no transition-all, hover/touch through existing variants); better-layout (ladder spacing, minmax(0,1fr) phone grid, one 72ch measure).

7 files done of 7. No `<style>` kept: MemoryEditor's whole scoped sheet is gone (every rule moved to utilities, the rest was dead).

| file | rules moved | literals handled (S2) | breakpoint edges |
|---|---|---|---|
| SwitchField | 3 literals | 10px → space-3; 72ch → `--c-measure` | none |
| DelegateTypeEditor | `.note` (3 sites); `.problem` dead, removed | 72ch → `--c-measure` | none |
| HookEditor | 21 literal sites | 8px → space-2, 12px/10px → space-3, 6px → space-2, 72ch, 32ch, 6rem → tokens; `1fr 1fr` → `phone:grid-cols-2` | `phone:` kept (640) |
| McpEditor | `.fold` (3), `.note` (7); `.kind`, `.problem` dead, removed | 8px → space-2; 72ch | none |
| MemoryEditor | 12 scoped rules (`.facts`, `.tokens`, `.unsaved`, `.shortcut`, `.conflict`, `.caution`, `.note`) | 12px → space-3, 8px/6px → space-2, 10px → space-3, 320px, 6rem, 72ch → tokens | `not (any-pointer: fine)` → `no-fine-pointer:` |
| RuleEditor | 4 literal sites | 8px → space-2; 72ch | none |
| SubagentEditor | 3 literal sites | 72ch | none |

## Removed
- removed: MemoryEditor.svelte (old `<style>`) `.switch`, `.title`, `.history`, `.reveal`, `.list`, `.entry`, `.line`, `.more`, `.swap`, `.acts`, `.said`, `.label`, `.busy` — selectors matching no element in the markup (the conversion already carries them as utilities)
- removed: DelegateTypeEditor.svelte `.problem` rule — no element used it
- removed: McpEditor.svelte `.kind`, `.problem` rules — `.kind` was already `relative flex flex-col` on the element, `.problem` unused
- removed: MemoryEditor.svelte Spinner `size-4` — the kit Spinner already draws `size-icon-md` (16px); written as `size-icon-md shrink-0` as HookEditor's twin site does

## Tokens
- token: --c-measure 72ch — the running-text measure DESIGN.md Typography gives ("Running text measures 60 to 72ch") for notes, hints and labels in every config editor; no ladder step holds a text measure
- token: --c-reach-max 32ch — the cap on HookEditor's "which machines have it" line in the editor head; a real dimension, no ladder step
- token: --c-detail-max 6rem — the height cap of the scrolling failure-detail block under a machine row (HookEditor, MemoryEditor); a real dimension
- token: --c-editor-well-min 320px — MemoryEditor's markdown well min height, so the editor never collapses to its toolbar; a real dimension

## Gaps
- gap: MemoryEditor.svelte underline offset 3px → `underline-offset-2`: the kit/config lanes use offset 2, DESIGN.md names no offset token

## Theme additions
theme: variant no-fine-pointer
```css
@custom-variant no-fine-pointer {
  @media not (any-pointer: fine) {
    @slot;
  }
}
```

## Kit swaps
none (the two `shadcn/no-restyle` hits on Spinner `size-4` are cleared, see Removed)

## Contracts
none

## no-restyle hits
none

## shadcn variant
none

## Lists
- kind-5 declarations: none
- needs variant: `no-fine-pointer` (above)
- needs transition token: none
- needs colour token: none
- literals preserved: none
- fixed: MemoryEditor.svelte:524 the ⌘S hint hides on a touch-only phone through `no-fine-pointer:hidden` (DESIGN.md Focus and hit areas: a keyboard hint is said only where a keyboard can press it)

## Design critique (interface-craft, from markup and classes, against DESIGN.md)
- fixed: config editors' notes, hints and labels share one measure (`max-w-(--c-measure)`, 72ch, DESIGN.md Typography) and one role (`type-meta text-ink-muted`) instead of three scoped copies
- fixed: every gap, pad and radius now sits on the 4/7/11/14… ladder (8px → space-2, 10/12px → space-3); the phone pair grid is `phone:grid-cols-2` (minmax(0,1fr) tracks, so a long MCP server name cannot widen a column)
- gap: Not verified in a browser or by ui-observer: no `/motion` bench or stories file renders these editors in this workspace; the ladder steps move 8px gaps 1px and 10/12px gaps 1px
