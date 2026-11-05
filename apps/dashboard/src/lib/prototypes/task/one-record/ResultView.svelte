<script lang="ts">
  /**
   * The result whole, as it opens from a hand-in: what was presented, at
   * the beside column's width or the phone's, the report its session wrote,
   * the commits, who handed it in and its state now with a way to its
   * transcript, and the checks strip at its foot. While the hub reads it, a
   * skeleton at the result's size; a file the hub does not hold yet says so
   * with its path and Read again.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import Markdown from "#lib/components/ui/markdown/markdown.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconArtifactPage,
    IconFolderGit,
    IconTranscript,
  } from "#lib/icons.js";
  import ChecksStrip from "./ChecksStrip.svelte";
  import { clock } from "./clock";
  import type { Entry } from "./model";

  let {
    entry,
    by,
    state = "ready",
    onsession,
  }: {
    entry: Extract<Entry, { kind: "handed" }>;
    /** Who handed it in, as the record names them: its attempt. */
    by: string;
    /** The hub is reading it, or does not hold it. */
    state?: "ready" | "loading" | "missing";
    onsession: () => void;
  } = $props();

  const result = $derived(entry.result);
</script>

<div class="grid gap-space-group">
  <p
    class="m-0 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
  >
    <span>{words.handedInBy}</span>
    <span class="type-label text-ink-strong wrap-anywhere">{by}</span>
    <span class="num">{clock(entry.at)}</span>
    <Button size="sm" variant="ghost" onclick={onsession}>
      <IconTranscript data-icon="inline-start" aria-hidden="true" />
      <span>{words.openTranscript}</span>
    </Button>
  </p>

  {#if state === "loading"}
    <Skeleton height="view" radius="card" />
    <Skeleton height="block" radius="card" />
  {:else if state === "missing"}
    <div
      class="grid gap-space-2 rounded-lg bg-surface-recess p-space-4"
      role="alert"
    >
      <p class="m-0 type-label text-ink-strong">{words.notHeldYet}</p>
      <p class="m-0 type-meta text-pretty text-ink-muted">
        {words.resultMissing(
          result.file?.path ?? result.presented?.name ?? words.result
        )}
      </p>
      <code
        class="justify-self-start rounded-xs bg-code-bg px-space-1 type-code text-ink-strong"
        >{result.file?.path ?? result.presented?.name ?? words.result}</code
      >
      <Button
        class="justify-self-start"
        size="sm"
        variant="outline"
        label={words.readAgain}
      />
    </div>
  {:else}
    <article
      class="grid gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile"
    >
      {#if result.presented}
        <header class="flex items-center gap-space-3">
          <IconArtifactPage
            class="size-icon-lg flex-none text-ink-muted"
            aria-hidden="true"
          />
          <span class="grid min-w-0">
            <span class="type-label text-ink-strong wrap-anywhere"
              >{result.presented.name}</span
            >
            <span class="type-meta text-ink-muted"
              >{words.presented} · {result.presented.kind}</span
            >
          </span>
        </header>
      {/if}
      <p class="m-0 type-row text-pretty text-ink-strong">{result.headline}</p>
      {#if result.report}
        <Markdown source={result.report} />
      {/if}
    </article>
  {/if}

  {#if result.commits.length > 0}
    <section class="grid gap-space-2">
      <h3 class="m-0 type-label text-ink-muted">{words.commits}</h3>
      <ul class="m-0 grid list-none gap-space-1 p-0">
        {#each result.commits as commit (commit.sha)}
          <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
          <li class="grid grid-cols-(--lead-cols) gap-x-space-3">
            <span class="mark-cell type-body text-ink-muted">
              <IconFolderGit class="size-icon-md" aria-hidden="true" />
            </span>
            <span
              class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 type-body"
            >
              <code class="type-code text-ink-strong">{commit.sha}</code>
              {#if commit.subject}<span class="text-ink-strong text-pretty"
                  >{commit.subject}</span
                >{/if}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if result.checks.length > 0}
    <section
      class="grid gap-space-3 border-t border-t-border-hairline pt-space-4"
    >
      <h3 class="m-0 type-label text-ink-muted">{words.checks}</h3>
      <ChecksStrip checks={result.checks} />
    </section>
  {/if}
</div>
