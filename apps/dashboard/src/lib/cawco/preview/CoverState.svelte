<script lang="ts" module>
  /** What the loading cover says: a line of words, or a sheet's stage starting in its folder `dir`. */
  export type CoverWaiting = { line: string } | { dir: string };
</script>

<script lang="ts">
  /**
   * The preview's loading cover's line while the page is on its way
   * (PreviewPane `stageWaiting`): the live mark, then what it waits on. A
   * stage starting in its folder names the folder (sheetWords `starting`),
   * held on one row of its own box, never spilling (the owner: "look at the
   * path above spilling out ... this is terrible ux for a loading/pending
   * state"): on the words' row when it fits, else the next; its middle goes
   * to an ellipsis first so its last folder stays, then that folder's end;
   * the whole path on hover.
   */
  import { sheetWords } from "@cawco/core";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";

  let { waiting }: { waiting: CoverWaiting } = $props();

  /** The words around the folder, and the folder parted at its last folder (a trailing slash kept with it). */
  const parts = $derived.by(() => {
    if (!("dir" in waiting) || waiting.dir === "") {
      return null;
    }
    const { dir } = waiting;
    const line = sheetWords.starting(dir);
    const at = line.indexOf(dir);
    if (at < 0) {
      return null;
    }
    const cut = dir.lastIndexOf("/", dir.length - 2) + 1;
    return {
      line,
      before: line.slice(0, at),
      head: dir.slice(0, cut),
      tail: dir.slice(cut),
      after: line.slice(at + dir.length),
    };
  });
</script>

<!-- A sheet's stage on its way: the project's own dev toolchain (Vite, Astro or Nuxt), started or woken by the daemon. -->
<p
  class="mark-line mt-space-3 mx-0 mb-0 flex items-start gap-space-2 text-ink-muted type-meta animate-wait-grace-in group-data-ready/cover:animation-paused group-data-ready/cover:after:animation-paused"
  data-slot="cover-state"
>
  <span class="mark-cell"><LiveDot /></span><span class="min-w-0"
    >{#if parts && "dir" in waiting}{parts.before}<span
        class="inline-flex max-w-full align-top whitespace-nowrap pointer-events-auto"
        data-slot="cover-path"
        title={waiting.dir}
        ><span class="min-w-0 truncate" data-slot="cover-path-head"
          >{parts.head}</span
        ><span class="max-w-full shrink-0 truncate" data-slot="cover-path-tail"
          >{parts.tail}{parts.after}</span
        ></span
      >{:else if "dir" in waiting}{sheetWords.starting(
        waiting.dir
      )}{:else}{waiting.line}{/if}</span
  >
</p>
