<script lang="ts">
  /**
   * PEEK BENCH (dev only): the session peek beside a conversation the desk
   * has open, fed through the client's own state with no hub
   * (home/peek-fixtures.ts). The peek stands open on a session moving the
   * hub's sign-in to passkeys.
   *
   * `?state=` working | asking | question | signin | several | plan | noplan | ended |
   * failed | unreachable | reading | unread (asking by default);
   * `?steps` the plan's steps opened (`plan` opens them); `?ipad` the sheet
   * rising from the bottom, as an iPad's touch screen has it; `?alone` the
   * sheet alone at its width.
   */
  import { onMount } from "svelte";
  import PeekSheet from "#lib/cawco/home/PeekSheet.svelte";
  import { closePeek, openPeek, peek } from "#lib/cawco/home/peek.svelte.js";
  import {
    OPEN_ID,
    PEEK_SCENES,
    type PeekScene,
    standPeek,
  } from "#lib/cawco/home/peek-fixtures.js";
  import PeekPane from "#lib/cawco/PeekPane.svelte";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { page } from "$app/state";

  const asked = page.url.searchParams.get("state") ?? "asking";
  const scene: PeekScene = PEEK_SCENES.includes(asked as PeekScene)
    ? (asked as PeekScene)
    : "asking";
  const alone = page.url.searchParams.has("alone");
  const ipad = page.url.searchParams.has("ipad");
  let stepsOpen = $state(
    scene === "plan" || page.url.searchParams.has("steps")
  );

  const stood = standPeek(scene);
  openPeek(stood.target);

  onMount(() => () => {
    closePeek();
    stood.leave();
  });
</script>

<svelte:head><title>Peek | CawCo</title></svelte:head>

<!-- The conversation the desk has open, the peek standing beside it. -->
<div class="relative flex h-full min-h-0 bg-surface-recess">
  <SessionPane
    active
    browsing={null}
    browsingCwd=""
    browsingHarness="claude"
    focused
    viewId={OPEN_ID}
    visible
  />
</div>

{#if alone}
  <!-- The sheet as the drawer draws it (its surface inset in its box, the
       pane in from that), at the peek's width, the window's height. -->
  <div
    class="fixed inset-0 z-(--layer-bench) flex justify-center bg-surface-recess p-space-2"
  >
    <div
      class="flex w-c-peek-sheet-w max-w-full flex-col rounded-lg border border-border bg-surface-raised p-space-2 text-ink-strong text-label"
    >
      {#if peek.target}
        <PeekPane bind:stepsOpen onclose={closePeek} target={peek.target} />
      {/if}
    </div>
  </div>
{:else}
  <PeekSheet bind:stepsOpen rises={ipad || undefined} />
  <!-- The bench's way back to the peek once it is put away, standing where a
       Home row's expand mark would: a press opens it as that mark does. -->
  {#if !peek.open}
    <div
      class="fixed bottom-space-4 left-1/2 z-(--layer-bench-controls) -translate-x-1/2"
    >
      <Button
        onclick={() => openPeek(stood.target)}
        size="sm"
        variant="secondary">Peek</Button
      >
    </div>
  {/if}
{/if}
