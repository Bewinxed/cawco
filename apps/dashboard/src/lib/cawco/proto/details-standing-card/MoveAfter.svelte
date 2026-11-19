<script lang="ts">
  /**
   * Move, after: what was proven (files, bytes, the commit), each
   * conversation and where it stands now, anything left in the old folder
   * by name with why and Try removing again, and what ended with the move.
   * Called off, it says what that left on disk and that sessions resumed in
   * the old folder. Done returns to the details, where the place shows its
   * new folder.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconError, IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import type { MoveResult } from "./details";
  import Face from "./Face.svelte";
  import Group from "./Group.svelte";
  import { standingWords } from "./words";

  const words = standingWords.after;

  let {
    form,
    result,
    to,
    onremove,
    ondone,
  }: {
    form: "card" | "sheet";
    result: MoveResult;
    /** The folder it moved to, or stayed in when called off. */
    to: string;
    onremove: () => void;
    ondone: () => void;
  } = $props();
</script>

<Face
  {form}
  onback={ondone}
  title={result.calledOff ? words.calledOffTitle : words.title}
>
  {#snippet lead()}
    {#if result.proven}
      <div class="flex min-w-0 flex-col gap-space-1">
        <span class="mark-line flex min-w-0 items-center gap-space-2">
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md flex-none text-status-done-ink"
            data-box
          />
          <span class="type-label text-ink-strong tabular-nums"
            >{words.proven(
              result.proven.files,
              result.proven.bytes
            )}{#if result.proven.commit}
              {words.atCommit(result.proven.commit)}{/if}</span
          >
        </span>
        <span
          class="dir-rtl truncate text-end type-meta text-ink-muted"
          title={to}><bdi>{to}</bdi></span
        >
      </div>
    {:else if result.calledOff}
      <p class="m-0 type-body text-ink-strong text-pretty">
        {result.calledOff}
        {words.calledOff}
      </p>
    {/if}
    <Group title={words.sessions}>
      <ul class="m-0 flex min-w-0 list-none flex-col gap-space-3 p-0">
        {#each result.sessions as one (one.id)}
          <li class="flex min-w-0 gap-space-2">
            <!-- mark-line: the outcome's glyph stands in the row's lead column, on the title's line -->
            <span class="flex h-lh flex-none items-center type-label">
              {#if one.outcome === "running"}
                <IconSuccess
                  aria-label={words.running}
                  class="size-icon-sm text-status-done-ink"
                />
              {:else if one.outcome === "summary"}
                <IconWarningTriangle
                  aria-label={words.summary}
                  class="size-icon-sm text-status-attn-ink"
                />
              {:else}
                <IconError
                  aria-label={words.stopped}
                  class="size-icon-sm text-status-fail-ink"
                />
              {/if}
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="min-w-0 truncate type-label text-ink-strong"
                >{one.title}</span
              >
              <span class="type-meta text-ink-muted text-pretty"
                >{one.detail}</span
              >
            </span>
          </li>
        {/each}
      </ul>
    </Group>
  {/snippet}
  {#snippet trail()}
    {#if result.leftBehind.length > 0}
      <Group title={words.left}>
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-2 p-0">
          {#each result.leftBehind as one (one.path)}
            <li class="flex min-w-0 flex-col">
              <span class="type-code text-ink-strong">{one.path}</span>
              <span class="type-meta text-ink-muted text-pretty">{one.why}</span
              >
            </li>
          {/each}
        </ul>
        <div class="flex min-w-0 items-center gap-space-3">
          <span class="min-w-0 flex-auto type-meta text-ink-muted"
            >{words.duplicate}</span
          >
          <Button onclick={onremove} size="xs" variant="outline"
            >{words.removeAgain}</Button
          >
        </div>
      </Group>
    {/if}
    {#if result.ended.length > 0}
      <Group title={words.ended}>
        <ul class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
          {#each result.ended as one (one)}
            <li class="type-meta text-ink-muted text-pretty">{one}</li>
          {/each}
        </ul>
      </Group>
    {/if}
  {/snippet}
  {#snippet acts()}
    <Button onclick={ondone} size="sm" variant="outline">{words.done}</Button>
  {/snippet}
</Face>
