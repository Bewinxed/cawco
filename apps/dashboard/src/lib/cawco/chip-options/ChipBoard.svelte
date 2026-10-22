<script lang="ts">
  /**
   * The chip-options canvas's one fixture: an option's chips as a frame
   * draws them, on the transcript's own surface (`tab-sheet`) in 14px body
   * text, in the scheme the frame names.
   *
   * - `list`: chips one to a line of text, each over its "Kind · state" in
   *   meta, so a frame of every kind or every state reads as a sheet.
   * - `sentence`: the spec's five-kind sentence in a transcript message (the
   *   speaker line, Who, then MessageBody's measure and PROSE), or the
   *   40-word name in one (`long`).
   * - `single`: one chip in a line, for its hover, focus and press.
   * - `peek`: one chip with its peek open over it.
   */
  import { PROSE } from "#lib/prose.js";
  import Who from "../turn/Who.svelte";
  import ChipA from "./ChipA.svelte";
  import ChipB from "./ChipB.svelte";
  import { type ChipSpec, headOf, LONG_NAME, sample } from "./kinds";

  let {
    option = "A",
    scene = "list",
    chips = [],
    scheme = "light",
    long = false,
  }: {
    option?: "A" | "B";
    scene?: "list" | "sentence" | "single" | "peek";
    chips?: ChipSpec[];
    scheme?: "light" | "dark";
    long?: boolean;
  } = $props();

  const Chip = $derived(option === "A" ? ChipA : ChipB);
  const first = $derived(chips[0] ?? sample("session"));
</script>

<div
  class="min-w-0 scheme-light data-[scheme=dark]:scheme-dark bg-tab-sheet p-space-4 text-ink-strong data-peek:pt-c-hover-panel-room"
  data-peek={scene === "peek" ? "" : undefined}
  data-scheme={scheme}
>
  {#if scene === "list"}
    <ul class="flex flex-wrap gap-x-space-6 gap-y-space-4">
      {#each chips as chip (`${chip.kind}:${chip.state ?? ""}`)}
        <li class="grid min-w-0 justify-items-start gap-space-1">
          <span class="max-w-full text-size-body leading-body"
            ><Chip {...chip} /></span
          >
          <span class="type-meta text-ink-muted">{headOf(chip)}</span>
        </li>
      {/each}
    </ul>
  {:else if scene === "sentence"}
    <article class="grid grid-cols-1 gap-space-1">
      <Who name="Caw" timestamp="2026-10-22T09:41:00Z" />
      <div
        class="max-w-c-measure text-size-body leading-body font-normal text-ink-strong"
        data-slot="msg"
      >
        <div class={PROSE}>
          {#if long}
            <p>
              Before you review it, the step is <Chip
                kind="step"
                label={LONG_NAME}
                number={3}
                state="in-progress"
              />, and the session doing it is <Chip
                hue={3}
                kind="session"
                label={LONG_NAME}
                seed="c3f1-session-tray"
                state="working"
              />.
            </p>
          {:else}
            <p>
              I moved <Chip
                kind="task"
                label="Fix tray chip overflow"
                state="running"
              /> to review, ticked <Chip
                kind="todo"
                label="pin the hairline"
                state="ticked"
              /> on it, answered <Chip
                kind="pin"
                label="Pricing table"
                number={12}
                state="unread"
              />, picked <Chip
                kind="decision"
                label="Which head for the phone page"
                state="picked"
              />, and the nightly <Chip
                kind="routine"
                label="Lint sweep"
                state="ok"
                trigger="schedule"
              /> runs on <Chip
                hue={5}
                kind="machine"
                label="studio-mac"
                os="darwin-arm64"
                state="online"
              />.
            </p>
          {/if}
        </div>
      </div>
    </article>
  {:else}
    <p class="text-size-body leading-body">
      Picked up <Chip {...first} open={scene === "peek"} /> after lunch.
    </p>
  {/if}
</div>
