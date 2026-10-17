# Lane S01-cawco-top

## shadcn/no-restyle hits
- AddMachineDialog.svelte:581 DrawerDescription `text-body`, `text-ink-muted`
- AddMachineDialog.svelte:588 DrawerFooter `px-0`, `pb-0` (pre-existing)
- AddMachineDialog.svelte:608 DialogContent `phone:max-w-128` (pre-existing)

## Per-file notes
- AddMachineDialog.svelte: pseudo 1 (`summary::-webkit-details-marker`). Literals: 6px, 8px, 10px, 12px, 14rem, 12rem, 6rem grid, rotate(90deg) (via `transform-(--chev-turn)` + `group-open:`).
