<script lang="ts">
  /**
   * The attempt's session beside the task: its title and state now (glyph,
   * word, hue; the live dot while it works), then its transcript's turns at
   * their clock times, the person's words, the session's and its tools'
   * apart by their mark. An ask it raises is answered in its entry in the
   * record, which stays beside this one.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import LiveDot from "#lib/components/ui/live-dot/live-dot.svelte";
  import { IconAgent, IconToolGeneric, IconUser } from "#lib/icons.js";
  import { clock } from "./clock";
  import type { AttemptSession } from "./model";

  let { session }: { session: AttemptSession } = $props();

  const STATE = {
    working: words.live.working,
    asking: words.live.asking,
    idle: words.live.idle,
    done: words.live.idle,
    stopped: words.live.stopped,
    failed: words.live.failed,
  } as const;
  const MARK = {
    session: IconAgent,
    you: IconUser,
    tool: IconToolGeneric,
  } as const;
</script>

<div class="grid gap-space-group">
  <p class="m-0 mark-line flex flex-wrap items-center gap-x-space-3 type-label">
    {#if session.state === "working"}<LiveDot />{/if}
    <span class="text-ink-strong wrap-anywhere">{session.title}</span>
    <span class="type-meta text-ink-muted">{STATE[session.state]}</span>
  </p>
  <ol class="m-0 grid list-none p-0">
    {#each session.lines as line, i (i)}
      {@const Mark = MARK[line.who]}
      <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
      <li class="grid grid-cols-(--entry-cols) gap-x-space-3 py-space-2">
        <span class="mark-cell type-body text-ink-muted">
          <Mark class="size-icon-md" aria-hidden="true" />
        </span>
        <span
          class={[
            "min-w-0 text-pretty wrap-anywhere",
            line.who === "tool"
              ? "type-code text-ink-muted"
              : "type-body text-ink-strong",
          ]}>{line.text}</span
        >
        <time class="type-meta text-end text-ink-muted num"
          >{clock(line.at)}</time
        >
      </li>
    {/each}
  </ol>
</div>
