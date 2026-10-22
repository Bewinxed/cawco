<script lang="ts">
  /**
   * A machine that joined, as a notice in Caw's panel (NoticeRow): the
   * install's outcome where the person is when it lands. Its row opens Add
   * machine's window on the outcome, whose closing parks it here; its ✕
   * removes it, and the push of it comes down everywhere (hub installs.ts).
   */
  import type { Install } from "@cawco/core";
  import { IconSuccess } from "#lib/icons.js";
  import NoticeRow from "../home/NoticeRow.svelte";
  import { connect } from "./installs.svelte";
  import { machineWord } from "./words";

  let { install, onchoose }: { install: Install; onchoose: () => void } =
    $props();

  const name = $derived(machineWord(install));
</script>

<NoticeRow
  dismissLabel="Dismiss {name} is in the fleet"
  label="{name} is in the fleet"
  ondismiss={() => {
    connect.remove(install.id).catch(() => undefined);
  }}
>
  {#snippet lead()}
    <IconSuccess
      aria-hidden="true"
      class="size-icon-md text-status-done-glyph"
    />
  {/snippet}
  <button
    type="button"
    data-slot="name"
    class="select-none pe-(--x-room) min-w-0 overflow-clip text-start text-ellipsis whitespace-nowrap rounded-xs type-label text-ink-row focus-inset"
    onclick={() => {
      onchoose();
      connect.openInstall(install.id, null);
    }}>{name} is in the fleet.</button
  >
  <span data-slot="sub" class="type-meta text-ink-muted">
    {install.route === "ssh" ? "Added over SSH" : "Added by a command"}
  </span>
</NoticeRow>
