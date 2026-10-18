<script lang="ts">
  /**
   * A 390 × 844 phone's screen (a device's size, not a design length) for a
   * phone frame, so a phone reads as one: its status bar (47px over the
   * content), the app's top bar (the sidebar toggle, the project's name,
   * Caw's glass tucked against the screen's trailing edge), the project
   * page's board under it, and its home bar's 34px at the foot. Caw's
   * panel stands over it (`children`): as a sheet, over the kit's scrim;
   * hanging (`hang`), from his glass, which takes the panel's material and
   * runs down into its top edge with no scrim.
   */
  import type { Snippet } from "svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { IconSidebar } from "#lib/icons.js";
  import { PROJECT_NAME } from "./states/fixtures";

  let { hang, children }: { hang: boolean; children: Snippet } = $props();

  const BOARD = [
    {
      stage: "Backlog",
      tasks: [
        "Write the pricing page copy",
        "Changelog for 0.9",
        "Swap the hero photo for the harbour at dusk",
      ],
    },
    { stage: "Doing", tasks: ["Fix the booking page's date picker"] },
  ];
</script>

<div
  class={["screen", { hang }]}
  data-design-form="phone"
  data-design-frame-kind={hang ? "hang" : "sheet"}
  data-design-screen
>
  <div class="behind" aria-hidden="true">
    <div class="status">
      <span class="time">9:41</span>
      <span class="cells"><i></i><i></i><i></i><i></i></span>
      <span class="battery"></span>
    </div>
    <div class="bar">
      <span class="toggle"><IconSidebar /></span>
      <span class="project">{PROJECT_NAME}</span>
    </div>
    <div class="board">
      {#each BOARD as column (column.stage)}
        <section class="stage">
          <p class="stage-head">
            <span>{column.stage}</span>
            <span class="count">{column.tasks.length}</span>
          </p>
          {#each column.tasks as title (title)}
            <p class="card">{title}</p>
          {/each}
        </section>
      {/each}
    </div>
  </div>
  <span class="glass" aria-hidden="true" data-design-tab
    ><CawFace size={24} status="ready" /></span
  >
  {#if !hang}<span class="scrim" aria-hidden="true"></span>{/if}
  {@render children()}
</div>

<style>
  .screen {
    --status-bar: 47px;
    --home-bar: 34px;

    container: screen / size;
    position: relative;
    inline-size: 390px;
    block-size: 844px;
    overflow: hidden;
    border-radius: var(--radius-panel);
    background: var(--surface-page);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .behind {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  /* The kit's scrim over the page while the sheet stands. */
  .scrim {
    position: absolute;
    inset: 0;
    background: var(--scrim);
  }
  .status {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    block-size: var(--status-bar);
    padding-inline: var(--space-7);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .time {
    margin-inline-end: auto;
  }
  .cells {
    display: inline-flex;
    align-items: end;
    gap: 2px;
    block-size: 10px;
  }
  .cells i {
    inline-size: 3px;
    border-radius: 1px;
    background: currentColor;
  }
  .cells i:nth-child(1) {
    block-size: 4px;
  }
  .cells i:nth-child(2) {
    block-size: 6px;
  }
  .cells i:nth-child(3) {
    block-size: 8px;
  }
  .cells i:nth-child(4) {
    block-size: 10px;
  }
  .battery {
    inline-size: 22px;
    block-size: 11px;
    margin-inline-start: var(--space-1);
    border: 1px solid currentColor;
    border-radius: 3px;
    background: linear-gradient(currentColor, currentColor) no-repeat 1px 50% /
      70% calc(100% - 2px);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--c-top-bar-h);
    padding-inline: var(--c-bar-phone-edge);
    border-block-end: 1px solid var(--border-hairline);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .toggle {
    display: grid;
    place-items: center;
    color: var(--ink-muted);
  }
  .toggle :global(svg) {
    inline-size: var(--c-bar-toggle-glyph);
    block-size: var(--c-bar-toggle-glyph);
  }
  .board {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-4) var(--c-bar-phone-edge);
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .stage-head {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .card {
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* His glass on the bar: round at its leading side, square at the
     screen's edge, flush with it. Hanging, it takes the panel's material
     and runs down to the bar's floor, its foot open onto the panel's top
     edge, over the scrim's layer. */
  .glass {
    position: absolute;
    z-index: 0;
    inset-inline-end: 0;
    inset-block-start: calc(
      var(--status-bar) + (var(--c-top-bar-h) - var(--c-bar-caw-glass-phone)) /
        2
    );
    display: grid;
    place-items: center;
    inline-size: calc(var(--c-bar-caw-glass-phone) + var(--space-3));
    block-size: var(--c-bar-caw-glass-phone);
    border: 1px solid var(--border-control);
    border-inline-end: 0;
    border-start-start-radius: var(--radius-lg);
    border-end-start-radius: var(--radius-lg);
    background: var(--material-panel);
  }
  .hang .glass {
    z-index: 2;
    block-size: calc(
      var(--c-top-bar-h) - (var(--c-top-bar-h) - var(--c-bar-caw-glass-phone)) /
        2 + 1px
    );
    padding-block-end: calc(
      (var(--c-top-bar-h) - var(--c-bar-caw-glass-phone)) / 2
    );
    border-block-end: 0;
    border-end-start-radius: 0;
    background: var(--surface-raised);
  }
</style>
