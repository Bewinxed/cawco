<script lang="ts">
  /**
   * The conversation on screen's Files list, where it stands (the bar's card,
   * FilesFace; the phone's drawer, FilesSheet), and what its rows do there.
   * Choosing an artifact shows it in the session's own panel and Files goes
   * (`close`); chosen from the keyboard, the focus goes on to the panel's
   * name. The artifact the hub would not show is said over the list, with
   * Try again, kept through a reload (refusals.svelte.ts). The empty state's
   * ask and Attach move the focus into the session's composer and Files goes
   * (`leave`); Show in conversation takes the transcript to the message and
   * puts Files away.
   */
  import type { ArtifactSummary } from "@cawco/core";
  import { showArtifact } from "../artifact-api";
  import { barGlass } from "../bar-glass.svelte";
  import { failureClause } from "../hub-read";
  import { refusals } from "../refusals.svelte";
  import { askOpenAt } from "../transcript/open-at.svelte";
  import FilesList from "./FilesList.svelte";
  import {
    type AttachmentRow,
    askForAPage,
    attachToSession,
    files,
    focusPanelName,
  } from "./files.svelte";

  let {
    close,
    leave = close,
    segmented = false,
  }: {
    close: () => void;
    /** Files going as the focus moves into the composer; `close` unless said. */
    leave?: () => void;
    /** One list at a time under the segmented control (the phone's drawer). */
    segmented?: boolean;
  } = $props();

  const instanceId = $derived(files.session);
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
    // Chosen from the keyboard: the focus goes on to the panel's name.
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
    close();
    if (byKeyboard) {
      focusPanelName(artifact.id);
    }
  }

  function ask() {
    if (instanceId && askForAPage(instanceId)) {
      leave();
    }
  }

  function attach() {
    if (instanceId && attachToSession(instanceId)) {
      leave();
    }
  }

  function show(attachment: AttachmentRow) {
    if (instanceId) {
      askOpenAt(instanceId, attachment.messageId);
    }
    close();
  }
</script>

{#if instanceId}
  {#key instanceId}
    <FilesList
      {instanceId}
      onask={ask}
      onattach={attach}
      onpick={pick}
      onshow={show}
      {pickRefused}
      {segmented}
    />
  {/key}
{/if}
