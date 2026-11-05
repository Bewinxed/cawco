<script lang="ts">
  /**
   * The session standing beside the task (from 900 up a third column; under
   * it, in the task's place with Back): its transcript as the session wrote
   * it, its asks answerable here too. While it is read its skeleton stands
   * at its size; when the session stops answering, the panel says so in
   * the error formula with Retry, its place kept.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronLeft, IconClose, IconToolGeneric } from "#lib/icons.js";
  import { clock } from "./format";
  import type { TranscriptLine } from "./records";

  let {
    session,
    lines,
    state = "live",
    form,
    onclose,
    onretry,
  }: {
    session: string;
    lines: TranscriptLine[];
    state?: "live" | "loading" | "stopped";
    form: "desk" | "phone";
    onclose?: () => void;
    onretry?: () => void;
  } = $props();
</script>

<section
  aria-label={words.transcript}
  class="flex min-h-0 min-w-0 flex-col gap-space-4"
  data-slot="session-beside"
>
  <div class="flex min-h-c-top-bar-h items-center gap-space-2">
    {#if form === "phone"}
      <Button
        aria-label={words.closeSession}
        icon={IconChevronLeft}
        onclick={onclose}
        size="icon-sm"
        title={words.closeSession}
        variant="ghost"
      />
    {/if}
    <h2
      class="min-w-0 flex-1 truncate type-label text-ink-strong"
      title={session}
    >
      {session}
    </h2>
    {#if form === "desk"}
      <Button
        aria-label={words.closeSession}
        icon={IconClose}
        onclick={onclose}
        size="icon-sm"
        title={words.closeSession}
        variant="ghost"
      />
    {/if}
  </div>
  {#if state === "loading"}
    <div aria-busy="true" class="flex flex-col gap-space-4">
      <Skeleton height="block" />
      <Skeleton height="item" />
      <Skeleton height="plot" />
      <Skeleton height="item" />
    </div>
  {:else if state === "stopped"}
    <div class="flex flex-col items-start gap-space-3 py-space-6">
      <p class="type-body text-pretty text-ink-strong">
        {words.sessionStoppedAnswering(session)}
      </p>
      <Button
        label={words.retryRead}
        onclick={onretry}
        size="sm"
        variant="outline"
      />
    </div>
  {:else}
    <ol class="flex flex-col gap-space-4">
      {#each lines as line (line.at)}
        <li class="flex flex-col gap-space-1">
          {#if line.role === "tool"}
            <p
              class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
            >
              <IconToolGeneric
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{line.text}</span
              >
              <span class="num ms-auto tabular-nums">{clock(line.at)}</span>
            </p>
          {:else if line.role === "you"}
            <p
              class="self-end rounded-lg bg-surface-recess px-space-3 py-space-2 type-body text-pretty text-ink-strong"
            >
              {line.text}
            </p>
          {:else}
            <p class="type-body text-pretty text-ink-strong">{line.text}</p>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>
