<script lang="ts">
  import { spawnWords } from "@cawco/core";
  /**
   * The starts the New Session form left running (spawn/parked), each as its
   * own row in the home, over Working and Finished (DESIGN.md, The Work
   * Outlives Its Surface Rule: "a session starting as its own row"). A row
   * says what its start is doing while it runs, then what it came to, and
   * stands until the reader acts on it:
   *
   * - running: the Working glyph breathing, and its stage ("Summarising…");
   *   a press opens the form on it again, the start as it stands now;
   * - failed: why, in the error formula, under the row (RowFault), with
   *   Reopen, which opens the form on it with the same picks and prompt;
   * - started: a press opens the session it started.
   *
   * A finished row is dismissed by its ×. The row the form shows while it is
   * open keeps its place but is not drawn (`shownStart`), so the start is
   * never drawn twice and the form hangs from the row's own box: it opens
   * out of the row, and travels back into it as it closes
   * (NewSessionPopover). Rows arrive and leave with the home's own reflow.
   */
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconClose,
    IconError,
    IconSuccess,
    IconWorking,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { cawco } from "../client.svelte";
  import { conversationHref } from "../links";
  import RowFault from "../RowFault.svelte";
  import {
    dropStart,
    type ParkedStart,
    parked,
    reopenStart,
    shownStart,
  } from "./parked.svelte";

  /** The start the open form shows: its row holds its place, undrawn. */
  const shown = $derived(shownStart());

  /** Where it starts, by its first machine's name. */
  const hostOf = (start: ParkedStart): string => {
    const id = start.draft.machineIds[0] ?? "";
    return cawco.machines.find((row) => row.machineId === id)?.hostname ?? id;
  };

  /** The meta line: what it is doing, or what it came to. */
  const lineOf = (start: ParkedStart): string => {
    if (start.state === "running") {
      return start.stage;
    }
    if (start.state === "started") {
      return spawnWords.starting.startedOn(hostOf(start));
    }
    return start.continueFrom
      ? spawnWords.starting.couldntContinue
      : spawnWords.starting.couldntStart;
  };

  /** The row's box, for the form to hang from and open out of. */
  const rowOf = (id: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-parked="${CSS.escape(id)}"]`);

  async function press(start: ParkedStart): Promise<void> {
    if (start.state === "started" && start.target) {
      const { target } = start;
      dropStart(start.id);
      await goto(conversationHref(target, cawco.instanceIndex));
      return;
    }
    reopenStart(start.id, rowOf(start.id));
  }
</script>

{#if parked.list.length > 0}
  <ul
    aria-label={spawnWords.starting.name}
    class="m-0 flex list-none flex-col gap-space-row p-0"
    data-flip
    data-slot="starting"
  >
    {#each parked.list as start (start.id)}
      <li
        class="relative min-w-0 data-shown:invisible"
        aria-hidden={start.id === shown || undefined}
        data-flip="box"
        data-parked={start.id}
        data-shown={start.id === shown || undefined}
        data-state={start.state}
        inert={start.id === shown}
      >
        <div
          class="group/parked relative flex items-center rounded-sm text-ink-strong"
        >
          <!-- The whole row is the one press: back into the form, or into
               the session it started. -->
          <button
            class="press-tint focus-inset flex min-h-space-8 min-w-0 flex-auto items-center gap-space-2 rounded-inherit border-0 bg-transparent py-space-1 ps-space-3 pe-space-3 text-start text-inherit coarse:min-h-c-btn-h-lg"
            aria-busy={start.state === "running" || undefined}
            data-parked-row
            data-rail-row
            onclick={() => press(start)}
            type="button"
          >
            <span
              class="inline-flex size-space-5 shrink-0 items-center justify-center"
              data-box
            >
              {#if start.state === "running"}
                <IconWorking
                  aria-hidden="true"
                  class="breathe size-icon-md text-status-live-glyph"
                />
              {:else if start.state === "failed"}
                <IconError
                  aria-hidden="true"
                  class="size-icon-md text-status-fail-glyph"
                />
              {:else}
                <IconSuccess
                  aria-hidden="true"
                  class="size-icon-md text-status-done-glyph"
                />
              {/if}
            </span>
            <span class="mark-line flex min-w-0 flex-auto flex-col">
              <span
                class="block min-h-space-5 min-w-0 content-center overflow-clip text-ellipsis whitespace-nowrap type-label"
                data-slot="title">{start.title}</span
              >
              <span
                class="block min-h-space-5 min-w-0 content-center overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                data-slot="doing"><MorphText text={lineOf(start)} /></span
              >
            </span>
          </button>
          {#if start.state !== "running"}
            <!-- What it came to stands until the reader is done with it. -->
            <Tip label={spawnWords.starting.dismiss}>
              {#snippet children(tip)}
                <button
                  {...tip}
                  aria-label={spawnWords.starting.dismissNamed(start.title)}
                  class="select-none touch-hit focus-inset me-space-2 inline-grid size-c-btn-h-sm flex-none place-items-center rounded-xs border-none bg-transparent text-ink-muted transition-control hover:bg-surface-hover hover:text-ink-strong"
                  data-parked-dismiss
                  onclick={() => dropStart(start.id)}
                  type="button"
                >
                  <IconClose aria-hidden="true" class="size-icon-md" />
                </button>
              {/snippet}
            </Tip>
          {/if}
        </div>
        {#if start.state === "failed"}
          <RowFault
            again={() => reopenStart(start.id, rowOf(start.id))}
            againLabel={spawnWords.starting.reopen}
            data-parked-fault
            end="var(--space-3)"
            indent="calc(var(--space-3) + var(--space-5) + var(--space-2))"
            reason={start.error}
          />
        {/if}
      </li>
    {/each}
  </ul>
{/if}
