<script lang="ts">
  /**
   * The first identity hue (`--mark-1`) on real tiles beside the coral
   * action, by day and by night side by side, as a design fixture: Cawco-Dev's
   * project tile and the three of its running sessions whose folders land on
   * hue 1 (project-data.ts), each on the tree mark (ProjectMark,
   * SessionMark), over the New session form's coral Start. `day` and `night`
   * are the hue a direction proposes; each half draws in its own scheme, so
   * every token resolves as that scheme does.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import ProjectMark from "../../ProjectMark.svelte";
  import SessionMark from "../../SessionMark.svelte";
  import { ON_MARK_ONE, PROJECT } from "./project-data";

  let {
    width,
    day,
    night,
  }: {
    /** The two halves together, px. */
    width: number;
    /** mark-1 by day, an oklch() colour. */
    day: string;
    /** mark-1 by night, an oklch() colour. */
    night: string;
  } = $props();
</script>

{#snippet half(scheme: "light" | "dark")}
  <div
    data-scheme={scheme}
    class="flex min-w-0 flex-1 flex-col gap-space-4 bg-surface-recess p-space-5 text-ink-strong data-[scheme=dark]:scheme-dark data-[scheme=light]:scheme-light"
  >
    <ul class="flex flex-col gap-space-1">
      <li
        class="mark-line flex min-h-c-btn-h items-center gap-space-3 type-label"
      >
        <ProjectMark
          count={1}
          hue={8}
          name={PROJECT.name}
          ontoggle={() => undefined}
        />
        <span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-row"
          >{PROJECT.name}</span
        >
      </li>
      {#each ON_MARK_ONE as session (session.id)}
        <li
          class="mark-line flex min-h-c-btn-h items-center gap-space-3 ps-space-5 type-label"
        >
          <SessionMark id={session.id} place={session.place} status="live" />
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-row"
            >{session.title}</span
          >
        </li>
      {/each}
    </ul>
    <div class="flex justify-end">
      <Button press="pressable">Start</Button>
    </div>
  </div>
{/snippet}

<div
  data-slot="mark-hues"
  class="flex w-(--frame-w)"
  style:--frame-w="{width}px"
  style:--mark-1="light-dark({day}, {night})"
>
  {@render half("light")}
  {@render half("dark")}
</div>
