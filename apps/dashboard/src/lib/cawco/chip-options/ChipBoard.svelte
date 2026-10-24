<script lang="ts">
  /**
   * The chip-options canvases' one fixture: an option's chips as a frame
   * draws them, on the transcript's own surface (`tab-sheet`) in body text,
   * in the scheme the frame names.
   *
   * - `list`: chips one to a line of text, each over its "Kind · state" in
   *   meta, so a frame of every kind or every state reads as a sheet.
   * - `message`: an agent's turn naming every live kind, the speaker line
   *   (Who) over the message's measure and PROSE, as a transcript draws it.
   * - `long`: a turn naming a step and a session by a 40-word name.
   * - `single`: one chip in a line, for its hover, focus and press.
   * - `peek`: one chip with its peek open under it.
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
  }: {
    option?: "A" | "B";
    scene?: "list" | "message" | "long" | "single" | "peek";
    chips?: ChipSpec[];
    scheme?: "light" | "dark";
  } = $props();

  const Chip = $derived(option === "A" ? ChipA : ChipB);
  const first = $derived(chips[0] ?? sample("session"));
  const at = (kind: ChipSpec["kind"], state?: string): ChipSpec => ({
    ...sample(kind),
    ...(state ? { state } : {}),
  });
</script>

<div
  class="min-w-0 scheme-light data-[scheme=dark]:scheme-dark bg-tab-sheet p-space-4 text-ink-strong data-peek:pb-c-hover-panel-room"
  data-peek={scene === "peek" ? "" : undefined}
  data-scheme={scheme}
>
  {#if scene === "list"}
    <ul class="flex flex-wrap gap-x-space-6 gap-y-space-4">
      {#each chips as chip (`${chip.kind}:${chip.state ?? ""}`)}
        <li class="grid min-w-0 max-w-full justify-items-start gap-space-1">
          <span class="max-w-full text-size-body leading-body"
            ><Chip {...chip} /></span
          >
          <span class="type-meta text-ink-muted">{headOf(chip)}</span>
        </li>
      {/each}
    </ul>
  {:else if scene === "message" || scene === "long"}
    <article class="grid grid-cols-1 gap-space-1">
      <Who name="Caw" shown timestamp="2026-10-24T09:41:00Z" />
      <div
        class="max-w-c-measure text-size-body leading-body font-normal text-ink-strong"
        data-slot="msg"
      >
        <div class={PROSE}>
          {#if scene === "long"}
            <p>
              Before you review it, the step is <Chip
                {...at("step", "in-progress")}
                label={LONG_NAME}
              />, and the session doing it is <Chip
                {...at("session", "working")}
                label={LONG_NAME}
              />.
            </p>
          {:else}
            <p>
              I moved <Chip {...at("task", "active")} /> along, ticked <Chip
                {...at("todo", "ticked")}
              /> on it and answered <Chip {...at("pin", "unread")} />. You
              picked <Chip {...at("decision", "picked")} />.
            </p>
            <p>
              <Chip {...at("session", "working")} /> is on <Chip
                {...at("step", "in-progress")}
              /> of <Chip {...at("plan", "working")} />, drawing <Chip
                {...at("canvas")}
              /> and <Chip {...at("preview")} />. The spec is <Chip
                {...at("page")}
              />, the states are on <Chip {...at("sheet")} />, and the prices
              came from <Chip {...at("browser")} />.
            </p>
            <p>
              Last night <Chip {...at("routine", "failed")} /> failed in <Chip
                {...at("project")}
              /> on <Chip {...at("machine", "online")} />.
            </p>
          {/if}
        </div>
      </div>
    </article>
  {:else}
    <p class="text-size-body leading-body">
      {#if scene === "peek"}
        <!-- The chip leads its line, so its peek stands at the frame's padding. -->
        <Chip {...first} open /> is waiting on you.
      {:else}
        Picked up <Chip {...first} /> after lunch.
      {/if}
    </p>
  {/if}
</div>
