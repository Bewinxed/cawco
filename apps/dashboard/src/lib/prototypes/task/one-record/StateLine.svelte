<script lang="ts">
  /**
   * The state line, pinned under the head: where the task is and what it
   * waits on, as one sentence of derived facts, never an entry. Its stage
   * and kind; its liveness as glyph, then word, then hue; why it is not
   * running when that is the news; and its two doors: the waits (drawn only
   * when it has any, with how many settled) and the file. A door opens what
   * it names beside the record on a desk, in its place on a phone.
   *
   * While the hub isn't answering the line keeps the last read and says so,
   * and the needs-you word gives way to the stale one: nothing claims the
   * task waits on you from a read that may be old.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import { IconChevronRight, IconCloudCross } from "#lib/icons.js";
  import { liveGlyph, TONE_INK } from "./glyphs";
  import type { Opened, TaskView } from "./model";

  let {
    view,
    opened = null,
    stale = null,
    onopen,
  }: {
    view: TaskView | null;
    opened?: Opened | null;
    /** When the last good read was, while the hub isn't answering. */
    stale?: string | null;
    onopen: (opened: Opened) => void;
  } = $props();

  const live = $derived(view ? liveGlyph(view.live) : null);
  const settled = $derived(
    view?.waits.filter((wait) => wait.settled).length ?? 0
  );
</script>

<div
  data-slot="state-line"
  class="sticky top-0 z-1 flex flex-wrap items-center gap-x-space-4 gap-y-space-1 bg-surface-page py-space-3 type-label"
>
  {#if view && live}
    <span class="flex items-center gap-space-2 mark-line">
      <span class="text-ink-strong">{view.stage}</span>
      <span class="type-meta text-ink-muted">{words.kind[view.kind]}</span>
    </span>
    {#if stale === null}
      <span
        class={["flex items-center gap-space-1 mark-line", TONE_INK[live.tone]]}
      >
        <live.glyph data-box class="size-icon-md" aria-hidden="true" />
        <span class={live.tone === "muted" ? "text-ink-strong" : ""}
          >{words.live[view.live]}</span
        >
      </span>
    {:else}
      <span class="flex items-center gap-space-1 mark-line text-ink-muted">
        <IconCloudCross class="size-icon-md" aria-hidden="true" />
        <span>{words.staleAct}</span>
      </span>
    {/if}
    {#if view.why === "waitsForDispatch"}
      <span class="type-meta text-ink-muted">{words.waitsForDispatch}</span>
    {/if}
    {#if view.unblocks > 0}
      <span class="type-meta text-ink-muted"
        >{words.unblocks(view.unblocks)}</span
      >
    {/if}
    <span class="ms-auto flex items-center gap-space-1">
      {#if view.waits.length > 0}
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={opened?.what === "waits"}
          onclick={() => onopen({ what: "waits" })}
        >
          <span>{words.waitsOn(view.waits.length, settled)}</span>
          <IconChevronRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      {/if}
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={opened?.what === "file"}
        onclick={() => onopen({ what: "file" })}
      >
        <span>{words.fileDoor}</span>
        <IconChevronRight data-icon="inline-end" aria-hidden="true" />
      </Button>
    </span>
  {:else}
    <Skeleton line="label" width="label" radius="text" />
    <Skeleton line="label" width="word" radius="text" />
    <span class="ms-auto"><Skeleton height="control-sm" width="short" /></span>
  {/if}
</div>
