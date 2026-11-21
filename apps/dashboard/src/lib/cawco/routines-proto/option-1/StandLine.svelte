<script lang="ts">
  /**
   * Where things stand, in one line heading the view: how many routines,
   * how many need the person, what is running, the next run, and the counts
   * of the two side groups; each count jumps to its group. A stale reading
   * says when it was read, and the count of what needs the person is
   * withheld.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";

  let {
    routines,
    needs,
    running,
    next,
    waiting,
    failing,
    readAt = null,
  }: {
    routines: number;
    needs: number;
    /** The routine running now, by name; null when none is. */
    running: string | null;
    /** The next run: which routine, and when on the person's clock. */
    next: { name: string; at: string } | null;
    /** Outside actions waiting on the person. */
    waiting: number;
    /** Outside sources failing. */
    failing: number;
    /** Not live: when the reading was taken. */
    readAt?: string | null;
  } = $props();
</script>

<p
  class="flex flex-wrap items-center gap-x-space-4 gap-y-space-1 m-0 type-body text-ink-muted"
>
  <span class="text-ink-strong">{routines} routines</span>
  {#if readAt === null && needs > 0}
    <Button
      href="#routines-needs"
      label="{needs} need you"
      pad="none"
      size="xs"
      variant="link"
    />
  {/if}
  {#if running}
    <span class="mark-line inline-flex items-center gap-space-2"
      ><LiveDot /><span>{running} is running</span></span
    >
  {/if}
  {#if next}
    <span>Next: {next.name} at <span class="num">{next.at}</span></span>
  {/if}
  {#if waiting > 0}
    <Button
      href="#routines-outside"
      label="{waiting} action waits on you"
      pad="none"
      size="xs"
      variant="link"
    />
  {/if}
  {#if failing > 0}
    <Button
      href="#routines-sources"
      label="{failing} source failing"
      pad="none"
      size="xs"
      variant="link"
    />
  {/if}
  {#if readAt !== null}
    <!-- Live is the reading's ordinary state and says nothing; only a stale
         one is marked (the shell's hub band says why). -->
    <span class="ms-auto type-meta">Read at {readAt}</span>
  {/if}
</p>
