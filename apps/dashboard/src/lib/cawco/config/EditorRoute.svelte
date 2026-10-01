<script lang="ts">
  /**
   * What an editor URL shows: the editor's skeleton while its section's rows
   * are read, then the editor, or, for a row that is not there, the shared
   * empty state. The skeleton stands in the editor's layout, so the editor
   * cross-fades in over it over --dur-control and nothing moves; an editor
   * opened with its rows already read (a drill from its list) shows at once.
   */
  import type { Snippet } from "svelte";
  import { crossIn, dur, easeOut } from "$lib/cawco/motion/curves.svelte";
  import EditorSkeleton from "./EditorSkeleton.svelte";
  import Missing from "./Missing.svelte";
  import type { ConfigSection } from "./sections";

  let {
    section,
    loaded,
    found,
    problem,
    what,
    saveLabel,
    children,
  }: {
    section: ConfigSection;
    /** The section's rows have been read. */
    loaded: boolean;
    /** The row the URL names is among them, or the URL is for a new one. */
    found: boolean;
    /** Why the rows could not be read, or null. */
    problem: string | null;
    /** What the row is called, for "That rule is gone". */
    what: string;
    /** The label the editor's Save carries, for its skeleton. */
    saveLabel: string;
    children: Snippet;
  } = $props();

  /**
   * The skeleton leaving: pinned over the route's whole box, the one it
   * filled alone, while what replaces it fades in over it. Its own box is
   * not measured here: the editor arriving is already in the route's column
   * when this runs, and the skeleton measured then is squeezed to its share.
   */
  function leave(node: HTMLElement) {
    Object.assign(node.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
</script>

<div class="route">
  {#if !loaded}
    <div class="stand" out:leave>
      <EditorSkeleton {problem} {saveLabel} {section} />
    </div>
  {:else if !found}
    <div class="stand" in:crossIn><Missing {section} {what} /></div>
  {:else}
    <div class="stand" in:crossIn>{@render children()}</div>
  {/if}
</div>

<style>
  .route,
  .stand {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .route {
    position: relative;
  }
</style>
