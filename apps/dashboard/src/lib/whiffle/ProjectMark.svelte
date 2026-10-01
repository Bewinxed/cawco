<script lang="ts" module>
  /** What a session is doing, as the tile's colour says it. */
  export type MarkStatus = "live" | "attn" | "done" | "fail" | "idle";
  /** Its word, for the row's accessible name: colour is never the only signal. */
  export const STATUS_WORD: Record<MarkStatus, string> = {
    live: "Working",
    attn: "Needs you",
    done: "Finished",
    fail: "Failed",
    idle: "Idle",
  };
</script>

<script lang="ts">
  /**
   * The project's mark: the folder on a hued tile, as the rail's projects
   * list draws it. A project's tile takes its own hue (`hue`); a session's
   * takes its status (`status`), so one glance reads where and how. The fill
   * cross-fades once over --dur-fade when the status moves; nothing about it
   * moves at rest.
   */
  import type { Component } from "svelte";
  import { IconFolder } from "$lib/icons";
  import type { MarkHue } from "./mark";

  let {
    hue,
    status,
    glyph: Glyph = IconFolder,
  }: {
    hue?: MarkHue;
    status?: MarkStatus;
    glyph?: Component<{ class?: string; "aria-hidden"?: boolean | "true" }>;
  } = $props();

  const fill = $derived(
    status ? `var(--status-${status}-glyph)` : `var(--mark-${hue ?? 6})`
  );
</script>

<span aria-hidden="true" class="project-mark" style:--fill={fill}>
  <Glyph aria-hidden="true" class="project-mark-glyph" />
</span>

<style>
  /* The rail's lead slot (18px) with its 12px glyph: 3px of inset, a mark
     rather than a glyph in a box. */
  .project-mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: 18px;
    block-size: 18px;
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);
    color: var(--mark-glyph);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .project-mark :global(.project-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
</style>
