<script lang="ts">
  /**
   * FINDER BENCH (dev only): the finder's components on the real hub.
   * Find itself stands in the shell, the glass's Jump card (FinderCard); the
   * @ field stands here until the composer takes it. On a desk, Find hangs
   * as the glass's card under a 44px bar, right-aligned, `c-find-w` wide, the
   * page live under it; on a phone it is a sheet with the field at its foot.
   * A composer at the page's foot holds the @ field.
   *
   * `window.__finder` holds what was opened, what was sent, and the state.
   */
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Finder from "#lib/cawco/find/Finder.svelte";
  import type { FindResult, WaitingItem } from "#lib/cawco/find/find-client.js";
  import {
    FinderState,
    type MachineAct,
    type Opening,
  } from "#lib/cawco/find/finder-state.svelte.js";
  import MentionField from "#lib/cawco/find/MentionField.svelte";

  const narrow = new MediaQuery("(max-width: 640px)");
  const phone = $derived(narrow.current);

  const finder = new FinderState();
  let open = $state(false);
  let field = $state<HTMLInputElement | null>(null);
  let message = $state("");
  let mentionField = $state<ReturnType<typeof MentionField> | null>(null);
  let editor = $state<HTMLDivElement | null>(null);
  let opener: HTMLElement | null = null;

  const log = {
    opened: [] as {
      kind: string;
      id: string;
      title: string;
      moment: string | null;
    }[],
    waiting: [] as { kind: string; id: string }[],
    machine: [] as { id: string; act: MachineAct }[],
    sent: [] as string[],
  };

  function show() {
    opener = document.activeElement as HTMLElement | null;
    open = true;
    finder.open();
    queueMicrotask(() => field?.focus());
  }
  function hide() {
    open = false;
    finder.close();
    opener?.focus();
  }

  const opened = ({ result, moment }: Opening) => {
    log.opened.push({
      kind: result.kind,
      id: result.id,
      title: result.title,
      moment: moment?.docId ?? null,
    });
    hide();
  };
  const openedWaiting = (item: WaitingItem) => {
    log.waiting.push({ kind: item.kind, id: item.id });
    hide();
  };
  const machine = (result: FindResult, act: MachineAct) => {
    log.machine.push({ id: result.id, act });
    hide();
  };
  const send = (text: string) => {
    if (!text.trim()) {
      return;
    }
    log.sent.push(text);
    mentionField?.reset();
  };

  onMount(() => {
    Object.assign(window, { __finder: { log, finder, show, hide } });
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          hide();
        } else {
          show();
        }
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });
</script>

<!-- literal: 100dvh -->
<div
  class="relative flex h-(--bench-h) flex-col bg-(--background) type-body text-ink-strong"
  data-phone={phone || undefined}
  style:--bench-h="100dvh"
>
  {#if !phone}
    <header
      class="flex h-c-top-bar-h flex-none items-center justify-between border-b border-b-border-hairline bg-surface-raised ps-space-6 pe-space-1"
    >
      <span data-slot="title" class="type-label text-ink-muted"
        >Finder bench</span
      >
      <button
        class="inline-flex h-c-btn-h items-center gap-space-2 rounded-md border-none border-current bg-transparent px-space-3 type-label text-ink-muted"
        data-jump
        onclick={() => (open ? hide() : show())}
        type="button"
      >
        Jump <kbd class="type-meta">⌘K</kbd>
      </button>
    </header>
  {/if}

  <main class="flex min-h-0 flex-1 flex-col px-space-6 py-space-5">
    <ol
      class="m-0 flex-1 list-none overflow-y-auto p-0"
      aria-label="Sent"
    >
      {#each log.sent as text, i (i)}
        <li class="py-space-2 type-code whitespace-pre-wrap">{text}</li>
      {/each}
    </ol>
    <!-- literal: 34px -->
    <div
      data-slot="composer"
      class="relative mx-auto flex w-(--composer-w) flex-none items-end gap-space-2 rounded-lg border border-border-control bg-surface-raised py-space-2 pr-space-2 pl-space-3 shadow-tile"
      data-composer
      style:--composer-w="min(100%, var(--c-composer-w))"
    >
      <MentionField
        bind:this={mentionField}
        bind:editor
        bind:value={message}
        class="min-w-0 flex-1"
        onsubmit={send}
        {phone}
      />
      <div data-slot="controls" class="flex gap-space-1">
        <button
          class="h-(--btn-h) rounded-xs border border-border-control bg-surface-raised px-space-3 type-label text-ink-strong"
          style:--btn-h="34px"
          type="button">Attach</button
        >
        <button
          data-slot="send"
          class="h-(--btn-h) rounded-xs border-none border-current bg-action-solid px-space-3 type-label text-on-action"
          data-send
          onclick={() => send(message)}
          style:--btn-h="34px"
          type="button">Send</button
        >
      </div>
    </div>
    {#if phone}
      <button
        class="absolute top-space-3 end-space-3 inline-flex h-c-btn-h items-center gap-space-2 rounded-md border-none border-current bg-transparent px-space-3 type-label text-ink-muted"
        data-jump
        onclick={() => show()}
        type="button">Jump</button
      >
    {/if}
  </main>

  {#if open}
    {#if phone}
      <!-- A phone: a sheet from the glass, the field at its foot over the keyboard. -->
      <div
        data-slot="sheet"
        class="fixed inset-0 z-20 flex flex-col bg-surface-raised pt-space-2"
        data-finder-card
      >
        <!-- literal: 36px, 5px -->
        <div
          class="mx-auto mb-space-2 h-(--grabber-h) w-(--grabber-w) flex-none rounded-pill bg-border-control"
          aria-hidden="true"
          style:--grabber-h="5px"
          style:--grabber-w="36px"
        ></div>
        <Finder
          bind:field
          {finder}
          onclose={hide}
          onmachine={machine}
          onopen={opened}
          onopenwaiting={openedWaiting}
          phone
        />
      </div>
    {:else}
      <!-- The glass's card, as it hangs: right-aligned under the bar, the page live under it. -->
      <!-- literal: 100dvh, 24px -->
      <div
        data-slot="finder-page-card"
        class="absolute end-0 top-c-top-bar-h z-20 flex max-h-(--card-max-h) w-c-find-w flex-col overflow-hidden rounded-b-lg border border-border-control border-t-none bg-surface-raised shadow-overlay-hung"
        data-finder-card
        role="dialog"
        aria-label="Jump"
        aria-modal="false"
        style:--card-max-h="calc(100dvh - var(--c-top-bar-h) - 24px)"
      >
        <Finder
          bind:field
          {finder}
          onclose={hide}
          onmachine={machine}
          onopen={opened}
          onopenwaiting={openedWaiting}
        />
      </div>
    {/if}
  {/if}
</div>

<style>
  /* residual: foreign-dom */
  [data-slot="sheet"] > :global([data-slot="finder"]) {
    flex: 1;
  }
</style>
