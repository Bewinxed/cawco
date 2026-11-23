<script lang="ts">
  /**
   * The command a tray hands the network's admin: a copy box where the page
   * may write the clipboard (`copy`), else the command alone, selectable
   * whole.
   */
  import CopyBox from "#lib/cawco/CopyBox.svelte";

  let { command, copy }: { command: string; copy: boolean } = $props();
</script>

{#if copy}
  <div class="flex min-w-0 [&>*]:min-w-0 [&>*]:flex-auto">
    <CopyBox label="Command for your admin" text={command} wrap />
  </div>
{:else}
  <code
    class="block min-w-0 rounded-sm border border-ui-2 bg-ui px-space-3 py-space-2 type-code whitespace-pre-wrap text-tx select-all"
    >{command}</code
  >
{/if}
