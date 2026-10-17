# Lane S19-features

12 files. 6 had a `<style>`; 5 have no residual-free rewrite beyond the lists below.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOP |
|---|---|---|---|---|---|
| DiffModal | 3 (.head, .scroll, .layer) + modal size | 0/0/0/0/0 | 8px/12px/52px/16px head spacing, 90vh/95vw | none | none |
| DiffView | 3 (.body, .diff-content, .veiled) + inline max-block-size/height | 0/0/0/0/0 | none | none | none |
| DirectoryPicker (no style) | 0; ESLint only | n/a | 30px row | none | none |
| MarkdownEditor | .crepe-host, .failed | 0/76/0/0/0 | 44px hit (`--hit`) | none | none |
| ProviderLogo | 0 | 0/2/0/0/0 | none | none | none |
| MemoryBody | 14 | 0/0/0/0/1 | 420px, 26px, 44px | none | none |
| OutputBlock | .well, pre; inline color | 0 | 10px/12px | none | none |
| ToolProse | .tprose wrapper | 0/17/1/0/0 | none | none | none |
| CodeView | .code-view | 0/1/0/0/0 | none | none | none |
| SchemaBuilder | .swap, .alt | 0 | none | none | none |
| TemplateInput | .template, .completer, button | 0 | 240px, 36px, 44px | `(max-width: 1023px)` → `max-wide:` (theme wide = 1025px) | none |
| WhenFields | .when | 0/0/0/0/1 | none | none | none |

Hooks: MarkdownEditor `class="crepe-host"` → `data-slot="crepe-host"`; ToolProse `.tprose` → `data-slot="tprose"`; CodeView `.code-view` → `data-slot="code-view"`. Their residual selectors follow.

## Kind-5 declarations (verbatim)
- MemoryBody.svelte: `[data-slot="foot"] { line-height: normal; }` (the old `font:` shorthand reset it)
- WhenFields.svelte: `[data-slot="when"] { gap: inherit; }`

## Needs variant / needs transition token
none

## shadcn variant lines
none (`group-state-open:` in MemoryBody uses state-open, not one of the eight)

## Not moved: classes whose rules live outside my files
- `wf-stack wf-row wf-spread wf-btn wf-well wf-fields wf-check wf-mono` (SchemaBuilder, TemplateInput): defined in `workflows/workflows.css` under `.wf`, shared by other files; `shadcn/no-unknown-classes` errors remain (SchemaBuilder 11, TemplateInput 2). Integration.
- `ln` (OutputBlock.svelte:64): no rule anywhere; `no-unknown-classes` error remains. Left as is.

## Changed value expressions (equal computed)
- DirectoryPicker `SKELETON_WIDTHS` `w-28/w-40/w-24` → `7rem/10rem/6rem` via `--skeleton-w` (dynamic class names are not lintable).
- OutputBlock token colour `style:color` → `style:--token-ink` + `text-(color:--token-ink)`.
- DiffView skeleton `height: Npx` and `max-block-size` → `--skeleton-h`, `--cap` + `h-`/`max-h-` (max-block-size → max-height; identical in horizontal writing mode).
- TemplateInput `transform-origin` → `--origin` + `origin-(--origin)`.

## shadcn/no-restyle hits (28)
- DiffModal.svelte:80:16 "gap-0" is not allowed on <DialogContent>
- DiffModal.svelte:80:16 "p-0" is not allowed on <DialogContent>
- DiffModal.svelte:81:12 "phone:max-w-320" is not allowed on <DialogContent>
- DiffModal.svelte:96:32 "truncate" is not allowed on <DialogTitle>: <DialogTitle> owns its typography
- DiffModal.svelte:96:32 "font-mono" is not allowed on <DialogTitle>: <DialogTitle> owns its typography
- DiffModal.svelte:96:32 "text-label" is not allowed on <DialogTitle>: <DialogTitle> owns its typography
- DiffModal.svelte:100:20 "h-6" is not allowed on <CopyButton>
- DiffModal.svelte:100:20 "w-6" is not allowed on <CopyButton>
- DiffView.svelte:121:14 "h-6" is not allowed on <Button>
- DiffView.svelte:121:14 "w-6" is not allowed on <Button>
- DiffView.svelte:121:14 "ml-2" is not allowed on <Button>
- DiffView.svelte:167:20 "rounded-none" is not allowed on <Skeleton>: <Skeleton> owns its shape
- DirectoryPicker.svelte:182:12 "gap-1.5" is not allowed on <CollapsibleTrigger>
- DirectoryPicker.svelte:182:12 "text-meta" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its typography
- DirectoryPicker.svelte:182:12 "text-ink-muted" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its color
- DirectoryPicker.svelte:182:12 "transition-colors" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its motion
- DirectoryPicker.svelte:182:12 "hover:text-ink-strong" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its color
- DirectoryPicker.svelte:233:26 "font-mono" is not allowed on <Button>: <Button> owns its typography. Use a variant: default, outline, secondary, ghost, destructive, grant, link
- DirectoryPicker.svelte:233:26 "text-label" is not allowed on <Button>: <Button> owns its typography. Use a variant: default, outline, secondary, ghost, destructive, grant, link
- DirectoryPicker.svelte:233:26 "font-normal" is not allowed on <Button>: <Button> owns its typography. Use a variant: default, outline, secondary, ghost, destructive, grant, link
- tool-cards/MemoryBody.svelte:199:24 "h-20" is not allowed on <Skeleton>
- tool-cards/MemoryBody.svelte:246:20 "gap-space-2" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its spacing. For space around it, use gap on a plain wrapper around it.
- tool-cards/MemoryBody.svelte:246:20 "p-0" is not allowed on <CollapsibleTrigger>
- tool-cards/MemoryBody.svelte:246:20 "border-0" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its shape
- tool-cards/MemoryBody.svelte:246:20 "bg-transparent" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its color
- tool-cards/MemoryBody.svelte:246:20 "text-ink-strong" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its color
- tool-cards/MemoryBody.svelte:246:20 "text-size-label" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its typography
- tool-cards/MemoryBody.svelte:246:20 "font-medium" is not allowed on <CollapsibleTrigger>: <CollapsibleTrigger> owns its typography
