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

<div class="bench" class:phone>
  {#if !phone}
    <header class="bar">
      <span data-slot="title" class="title">Finder bench</span>
      <button
        class="jump"
        data-jump
        onclick={() => (open ? hide() : show())}
        type="button"
      >
        Jump <kbd>⌘K</kbd>
      </button>
    </header>
  {/if}

  <main class="page">
    <ol class="sent" aria-label="Sent">
      {#each log.sent as text, i (i)}
        <li class="sent-line">{text}</li>
      {/each}
    </ol>
    <div data-slot="composer" class="composer" data-composer>
      <MentionField
        bind:this={mentionField}
        bind:editor
        bind:value={message}
        onsubmit={send}
        {phone}
      />
      <div data-slot="controls" class="controls">
        <button class="attach" type="button">Attach</button>
        <button
          data-slot="send"
          class="send"
          data-send
          onclick={() => send(message)}
          type="button">Send</button
        >
      </div>
    </div>
    {#if phone}
      <button class="jump phone" data-jump onclick={() => show()} type="button"
        >Jump</button
      >
    {/if}
  </main>

  {#if open}
    {#if phone}
      <div data-slot="sheet" class="sheet" data-finder-card>
        <div class="grabber" aria-hidden="true"></div>
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
      <div
        data-slot="finder-page-card"
        class="card"
        data-finder-card
        role="dialog"
        aria-label="Jump"
        aria-modal="false"
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
  .bench {
    position: relative;
    display: flex;
    flex-direction: column;
    block-size: 100dvh;
    background: var(--background);
    color: var(--ink-strong);
    font: var(--type-body);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    block-size: var(--c-top-bar-h);
    padding-inline: var(--space-6) var(--space-1);
    border-block-end: 1px solid var(--border-hairline);
    background: var(--surface-raised);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .jump {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--c-btn-h);
    padding-inline: var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    font: var(--type-label);
    color: var(--ink-muted);

    & kbd {
      font: var(--type-meta);
    }
  }
  .jump.phone {
    position: absolute;
    inset-block-start: var(--space-3);
    inset-inline-end: var(--space-3);
  }
  .page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-block-size: 0;
    padding: var(--space-5) var(--space-6);
  }
  .sent {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }
  .sent-line {
    padding-block: var(--space-2);
    font: var(--type-code);
    white-space: pre-wrap;
  }
  .composer {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex: none;
    inline-size: min(100%, var(--c-composer-w));
    margin-inline: auto;
    padding: 7px 7px 7px 11px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);

    & > :global(.editor) {
      flex: 1;
      min-inline-size: 0;
    }
  }
  .controls {
    display: flex;
    gap: var(--space-1);
  }
  .attach,
  .send {
    block-size: 34px;
    padding-inline: var(--space-3);
    border-radius: var(--radius-xs);
    font: var(--type-label);
  }
  .attach {
    border: 1px solid var(--border-control);
    background: var(--surface-raised);
    color: var(--ink-strong);
  }
  .send {
    border: 0;
    background: var(--action-solid);
    color: var(--on-action);
  }

  /* The glass's card, as it hangs: right-aligned under the bar, the page live under it. */
  .card {
    position: absolute;
    inset-block-start: var(--c-top-bar-h);
    inset-inline-end: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    inline-size: var(--c-find-w);
    max-block-size: calc(100dvh - var(--c-top-bar-h) - 24px);
    overflow: hidden;
    border: 1px solid var(--border-control);
    border-block-start: 0;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay-hung);
  }

  /* A phone: a sheet from the glass, the field at its foot over the keyboard. */
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding-block-start: var(--space-2);
    background: var(--surface-raised);
  }
  .grabber {
    flex: none;
    inline-size: 36px;
    block-size: 5px;
    margin: 0 auto var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--border-control);
  }
  .sheet > :global(.finder) {
    flex: 1;
  }
</style>
