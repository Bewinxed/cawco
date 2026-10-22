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
  import { failureClause } from "../hub-read";
  import { refusals } from "../refusals.svelte";
  import { SIDE_FLOOR_PX } from "../side/floor";
  import { askOpenAt } from "../transcript/open-at.svelte";
  import FilesList from "./FilesList.svelte";
  import {
    type AttachmentRow,
    askForAPage,
    attachToSession,
    files,
    floatPlace,
  } from "./files.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const instanceId = $derived(files.session);
  /**
   * The artifact the hub would not show, and why: said over the list
   * (FilesList), kept through a reload (refusals.svelte.ts).
   */
  const pickKey = $derived(`files-pick:${files.session}`);
  const pickRefused = $derived.by(() => {
    const said = refusals.get(pickKey);
    if (!said) {
      return null;
    }
    const asked = said.asked as Pick<ArtifactSummary, "id" | "name">;
    return { reason: said.reason, again: () => pick(asked) };
  });

  async function pick(artifact: Pick<ArtifactSummary, "id" | "name">) {
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
    refusals.delete(`files-pick:${id}`);
    try {
      await showArtifact(id, artifact.id);
    } catch (error) {
      refusals.set(`files-pick:${id}`, {
        reason: `${artifact.name} was not shown: ${failureClause(error)}. Files stays open.`,
        asked: { id: artifact.id, name: artifact.name },
      });
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

  /** The empty state's ask into the session's composer; Files goes, so the composer has the focus. */
  function ask() {
    if (instanceId && askForAPage(instanceId)) {
      onclose();
    }
  }

  /** Attach a file: the composer's own attach picker opens, and Files goes. */
  function attach() {
    if (instanceId && attachToSession(instanceId)) {
      onclose();
    }
  }

  function show(attachment: AttachmentRow) {
    if (instanceId) {
      askOpenAt(instanceId, attachment.messageId);
    }
    onclose();
  }
</script>

<div class="flex min-h-0 flex-auto flex-col" data-files-panel>
  {#if instanceId}
    {#key instanceId}
      <FilesList
        chosen={files.picked?.instanceId === instanceId
          ? files.picked.id
          : null}
        {instanceId}
        onask={ask}
        onattach={attach}
        onpick={pick}
        onshow={show}
        {pickRefused}
      />
    {/key}
  {/if}
</div>
