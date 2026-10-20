<script lang="ts">
  /**
   * The session's own permission picker, asked where the person acted when
   * the session must start again to do what they asked (a send that wakes
   * it, a rewind) and no mode is named for it: its row records none, and
   * none was ever chosen for its harness on its machine (core `SendRefusal`
   * `mode-unchosen`). The rows are the ones the session's details card
   * offers (ToolChips' permission chip: PermissionSection in an NsPopover),
   * for its harness on its machine, those the machine doesn't take disabled
   * with why. The pick goes to `onpick`, which starts the session again on
   * it (`relaunchSession`) and then does what was asked.
   *
   * It hangs from `anchor`, the control the person pressed (the row's
   * Choose a mode, its Send edited message), which takes the focus back as
   * it closes.
   */
  import type { HarnessKind, PermissionMode } from "@cawco/core";
  import { cawco } from "../client.svelte";
  import { modeRefusal, permissionModesFor } from "../permission-modes";
  import NsPopover from "../spawn/NsPopover.svelte";
  import PermissionSection from "../spawn/PermissionSection.svelte";

  let {
    id,
    open,
    onchange,
    machineId,
    harness,
    onpick,
    anchor,
  }: {
    id: string;
    open: boolean;
    onchange: (open: boolean) => void;
    machineId: string;
    harness: HarnessKind;
    /** A mode picked: start the session again on it, then go on. */
    onpick: (mode: PermissionMode) => unknown;
    /** The control it hangs from, which the focus goes back to. */
    anchor: HTMLElement | null;
  } = $props();

  const machine = $derived(
    cawco.machines.find((row) => row.machineId === machineId)
  );
  const report = $derived(
    machine?.harnesses?.find((row) => row.harness === harness)
  );
  const modes = $derived(
    permissionModesFor(harness).map((mode) => {
      const refused = modeRefusal(
        machine?.hostname ?? machineId,
        harness,
        mode.value,
        report
      );
      return {
        value: mode.value,
        disabled: refused !== null,
        reason: refused ?? undefined,
      };
    })
  );
</script>

<NsPopover
  align="start"
  aria-label="Permission mode"
  {anchor}
  {id}
  label="Choose a permission mode"
  {onchange}
  onclosefocus={() => {
    anchor?.focus({ preventScroll: true });
    return anchor !== null;
  }}
  follows
  {open}
  width={340}
>
  <PermissionSection
    embedded
    {harness}
    {modes}
    onchange={onpick}
    restarts
    value={null}
  />
</NsPopover>
