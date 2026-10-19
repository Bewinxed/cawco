<script lang="ts">
  /**
   * Files as a face of the bar glass's one card (GlassCard): it hangs from
   * the glass as Caw's panel, the machines and Jump do, one shape with it,
   * floating over the page and never moving the conversation (owner: "it
   * should be a floating panel … dont allow it to disable page control").
   * Choosing an artifact shows it in the session's panel, floating on
   * Files' leading side (FilesFloat); where the page leaves no room for the
   * panel at its least width (SIDE_FLOOR_PX) beside Files, it opens in the
   * session's panel as it always has, and Files goes. Show in conversation
   * takes the transcript to the message and puts Files away.
   */
  import type { ArtifactSummary } from "@cawco/core";
  import { showArtifact } from "../artifact-api";
  import { barGlass } from "../bar-glass.svelte";
  import { cawco } from "../client.svelte";
  import { SIDE_FLOOR_PX } from "../side/floor";
  import { toast } from "../toasts.js";
  import { askOpenAt } from "../transcript/open-at.svelte";
  import FilesList from "./FilesList.svelte";
  import { type AttachmentRow, files, floatPlace } from "./files.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const instanceId = $derived(files.session);

  async function pick(artifact: ArtifactSummary) {
    const id = instanceId;
    if (!id) {
      return;
    }
    // Whether the panel stood open before Files first opened it: kept from
    // the first pick while Files stays open.
    const panelWasOpen =
      files.picked?.instanceId === id
        ? files.picked.panelWasOpen
        : cawco.previews[id]?.state === "open";
    const byKeyboard = !barGlass.byPointer;
    try {
      await showArtifact(id, artifact.id);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    if ((floatPlace()?.width ?? 0) < SIDE_FLOOR_PX) {
      onclose();
      return;
    }
    files.picked = {
      instanceId: id,
      id: artifact.id,
      panelWasOpen,
      byKeyboard,
    };
  }

  function show(attachment: AttachmentRow) {
    if (instanceId) {
      askOpenAt(instanceId, attachment.messageId);
    }
    onclose();
  }
</script>

<div class="files-face" data-files-panel>
  {#if instanceId}
    {#key instanceId}
      <FilesList
        chosen={files.picked?.instanceId === instanceId
          ? files.picked.id
          : null}
        {instanceId}
        onpick={pick}
        onshow={show}
      />
    {/key}
  {/if}
</div>

<style>
  /* css-scope .files-pop: GlassCard names its Files face with it; this face draws that frame */
  /* Files' frame, as Caw's panel draws his (`.caw-pop`): the panel's
     width, its rows `--space-2` in from the drawn edge, as tall as what it
     holds up to his panel's height or the room under the glass, its regions
     sharing that height (FilesList). */
  :global(.kit-pop.files-pop) {
    display: flex;
    flex-direction: column;
    inline-size: min(var(--c-panel-w), calc(100vw - 24px));
    max-block-size: min(
      var(--c-caw-panel-h),
      calc(var(--bits-popover-content-available-height, 85dvh) - 2px)
    );
    padding: var(--space-2);
  }
  .files-face {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
</style>
