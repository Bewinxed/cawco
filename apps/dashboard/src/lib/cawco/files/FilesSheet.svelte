<script lang="ts">
  /**
   * Files on a phone: the house bottom drawer (the kit Drawer, vaul; owner:
   * "use the vaul drawer"), its grabber, its one header with Close, its two
   * stops (the lower one it opens on, the list's first rows in sight, and
   * the recipe's full height), its scrim. It holds one list at a time under
   * the kit's segmented control (FilesList `segmented`). Opened from the
   * sidebar's Files row or a finger from the screen's right edge (Shell,
   * EdgePull). Choosing an artifact shows it in the session's panel, which
   * rises as its sheet does on the composer, and puts Files away; Show in
   * conversation takes the transcript to the message.
   */
  import type { ArtifactSummary } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { showArtifact } from "../artifact-api";
  import { toast } from "../toasts.js";
  import { askOpenAt } from "../transcript/open-at.svelte";
  import FilesList from "./FilesList.svelte";
  import {
    type AttachmentRow,
    askForAPage,
    attachToSession,
    files,
  } from "./files.svelte";

  /**
   * vaul's stops, as shares of the screen's height: the lower, where it
   * opens, then full. vaul-svelte opens a sheet at its first stop whatever
   * is bound (huntabyte/vaul-svelte#129), so the stop it opens on is first.
   */
  const SNAPS = [0.75, 1];
  const [LOWER] = SNAPS;
  let snap = $state<number | string | null>(LOWER);
  $effect(() => {
    if (files.sheet) {
      snap = LOWER;
    }
  });

  const instanceId = $derived(files.session);

  async function pick(artifact: ArtifactSummary) {
    const id = instanceId;
    if (!id) {
      return;
    }
    try {
      await showArtifact(id, artifact.id);
      files.sheet = false;
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  /** The empty state's ask into the session's composer; the drawer goes, so the composer has the focus. */
  function ask() {
    if (instanceId && askForAPage(instanceId)) {
      files.returnTo = null;
      files.sheet = false;
    }
  }

  /** Attach a file: the composer's own attach picker opens, and Files goes. */
  function attach() {
    if (instanceId && attachToSession(instanceId)) {
      files.returnTo = null;
      files.sheet = false;
    }
  }

  function show(attachment: AttachmentRow) {
    if (instanceId) {
      askOpenAt(instanceId, attachment.messageId);
    }
    files.sheet = false;
  }
</script>

<Drawer.Root
  bind:open={files.sheet}
  bind:activeSnapPoint={snap}
  shouldScaleBackground={false}
  snapPoints={SNAPS}
>
  <!-- The recipe's height, up to 85vh, from the first frame: vaul's stops are
       shares of the screen's height, so the sheet holds one height at every
       stop. -->
  <Drawer.Content
    data-files-sheet
    height="cap"
    onCloseAutoFocus={(event: Event) => {
      // The focus moved on by itself (the ask, into the composer): it stays.
      // Opened from the sidebar, which went as it rose: the focus goes back
      // to what invoked the sidebar, the burger.
      const back = files.returnTo;
      files.returnTo = null;
      const moved = document.activeElement;
      if (
        moved instanceof HTMLElement &&
        moved !== document.body &&
        !moved.closest("[data-files-sheet]")
      ) {
        event.preventDefault();
        return;
      }
      if (back?.isConnected) {
        event.preventDefault();
        back.focus();
      }
    }}
  >
    <Drawer.Header>
      <Drawer.Title>Files</Drawer.Title>
    </Drawer.Header>
    <!-- At the lower stop the sheet stands that share of the screen lower:
         what it holds ends where the screen does. -->
    <div
      class="flex min-h-0 flex-auto flex-col pb-(--snap-drop)"
      style:--snap-drop="calc((1 - {typeof snap === 'number' ? snap : 1}) *
      100dvh)"
    >
      {#if instanceId}
        {#key instanceId}
          <FilesList
            {instanceId}
            onask={ask}
            onattach={attach}
            onpick={pick}
            onshow={show}
            segmented
          />
        {/key}
      {/if}
    </div>
  </Drawer.Content>
</Drawer.Root>
