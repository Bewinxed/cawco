<script lang="ts">
  /**
   * A structure's panel page: its box at the frame's height, the one bar,
   * the agent's ask as the first line of content (T16), then the
   * structure's own surface. Its keys (← → step, C comments) answer
   * wherever focus stands inside it; the structure says what they do.
   */
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import type { Judge } from "./judge.svelte";
  import ProtoBar from "./ProtoBar.svelte";
  import { ASK, COMPONENT_NAME } from "./review.svelte";

  let {
    judge,
    height,
    proto,
    width = $bindable(0),
    onstep,
    centre,
    action,
    children,
  }: {
    judge: Judge;
    height: number;
    /** Which structure it is, for a reader of the page's tree. */
    proto: "timeline" | "field" | "pair";
    width?: number;
    /** ← and → on the surface: one step back or on. */
    onstep: (delta: -1 | 1) => void;
    centre?: Snippet;
    action?: Snippet;
    children: Snippet;
  } = $props();

  const keyed = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest("input, textarea, [role=slider]")
    ) {
      return;
    }
    if (event.key === "ArrowRight") {
      onstep(1);
    } else if (event.key === "ArrowLeft") {
      onstep(-1);
    } else if (event.key === "c") {
      judge.commenting = !judge.commenting;
    } else {
      return;
    }
    event.preventDefault();
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the surface's keys (← → step, C comments) answer wherever focus stands inside it, as an application region's do. -->
<div
  aria-label={COMPONENT_NAME}
  {@attach frameSize((node: HTMLElement) => {
    width = node.clientWidth;
  })}
  class="h-(--h) relative flex flex-col overflow-hidden bg-surface-recess text-ink-strong"
  data-proto={proto}
  onkeydown={keyed}
  role="application"
  style:--h="{height}px"
>
  <ProtoBar {action} {centre} compact={width > 0 && width < 640} {judge} />
  <p class="m-0 flex-none px-space-4 pb-space-2 type-body text-ink-strong">
    {ASK}
  </p>
  {@render children()}
</div>
