# Lane S12-home

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| Caw.svelte | 4 | 0/0/0/0/2 | none | none |
| CawFace.svelte | 2 | 0/0/0/0/0 | none | none |
| CawMark.svelte | 3 (2 kept as foreign-dom) | 0/2/0/0/0 | none | none |
| CawPosePicture.svelte | 2 | 0/0/0/0/0 | none | none |
| MovedLogin.svelte | 7 | 0/0/0/0/0 | none | none |
| MovedLogins.svelte | 14 | 0/1/0/0/5 | 28px | none |
| NoticeRow.svelte | 8 | 0/0/2/0/1 | 28px, 44px, 24px, 12px | pointer: coarse |
| PeekSheet.svelte | 1 | 0/0/0/0/0 | 80dvh | none |
| StatusLine.svelte | 4 (svg rule kept) | 0/1(3 decl)/0/0/0 | 28px | none |

## Kind-5 declarations (verbatim)
- Caw.svelte: `clip-path: inset(calc(var(--artboard) * -1) calc(var(--artboard) * -1) 0)` on `[data-slot="layer"][data-behind]`; `opacity: 1` on `canvas[data-caw-shown]`
- MovedLogins.svelte: `grid-template-rows: 0fr`; `grid-template-rows: 1fr` (data-open); `filter: blur(var(--fold-blur))`; `filter: blur(0)` (open); `filter: none` (reduced motion)
- NoticeRow.svelte: `transition: background-color var(--dur-control) var(--ease-out), color var(--dur-control) var(--ease-out), transform var(--dur-toggle) var(--ease-out)`

## needs variant
- data-behind (Caw.svelte layer), data-caw-shown (Caw.svelte canvas)

## needs transition token
- NoticeRow.svelte `.x`: background-color/color var(--dur-control), transform var(--dur-toggle), all var(--ease-out)

## shadcn/no-restyle hits
- MovedLogins.svelte:122 Button `aria-expanded:bg-transparent`
- MovedLogins.svelte:122 Button `hover:aria-expanded:bg-surface-hover`
- PeekSheet.svelte:48 Drawer.Content `vaul-drawer-direction-bottom:pb-(--safe-bottom)`

## shadcn variant
- MovedLogins.svelte:123 data-open:dur-panel transition-duration (fold)
- MovedLogins.svelte group-data-open: on fold-inner (opacity, dur-panel); these resolve the `data-open` attribute

## Other
- MovedLogins: `aria-expanded:bg-transparent` + `hover:aria-expanded:bg-surface-hover` replace `.toggle[aria-expanded=true]:not(:hover)`; hover specificity to confirm in compare. Reduced-motion fold-inner transition-duration under open kept via `motion-reduce:group-data-open:dur-panel`.
- StatusLine foreign-dom rule uses `var(--icon-sm)` (=12px) selected by `[role="status"]`.
- cross-file hook: CawFace root .face → [data-slot="caw-face"]; selected by NeedsCaw.svelte:775 (O6) and CawMark.svelte:116,120
- cross-file hook: CawMark.svelte:42 .mark → [data-slot="mark"] (existing); selected by NeedsCard.svelte:902 and TranscriptSkeleton.svelte:146
