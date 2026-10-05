<script lang="ts">
  /**
   * The channel choice: two cards side by side at every width, one selection
   * frame for the pair that moves between them, and Caw as a still picture
   * standing behind the chosen card and looking over its top edge.
   *
   * The group, its roving focus and the arrow keys are bits-ui's RadioGroup.
   * `chosen` is what the person picked; `current` is the channel the fleet
   * follows now, and only that card says so.
   */
  import type { BinaryUpdateChannels } from "@cawco/core/binary-updates";
  import { RadioGroup } from "bits-ui";
  import { blur, fade } from "svelte/transition";
  import lightNightly from "#lib/assets/caw/channel-nightly.png";
  import darkNightly from "#lib/assets/caw/channel-nightly-dark.png";
  import lightStable from "#lib/assets/caw/channel-stable.png";
  import darkStable from "#lib/assets/caw/channel-stable-dark.png";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { displayVersion } from "./model";

  type Channel = "stable" | "nightly";

  let {
    chosen = $bindable(),
    current,
    channels,
  }: {
    chosen: Channel;
    current: Channel;
    channels: BinaryUpdateChannels | null;
  } = $props();

  const CARDS: {
    channel: Channel;
    description: string;
    name: string;
  }[] = [
    {
      channel: "stable",
      name: "Stable",
      description: "Tagged releases. Each one ran as a Nightly build first.",
    },
    {
      channel: "nightly",
      name: "Nightly",
      description: "Every build of main. The newest work, less tested.",
    },
  ];

  /**
   * Caw's head is the height the animated Caw's head has in a 160px box on
   * both cards. Measured with the head from its topmost pixel to the lowest
   * pixel of the beak: ready 129 of 512, stable 168 of 1024, nightly 272 of
   * 1024. Scale = (129 / 512) / (head / 1024), about the line of his box
   * that stands on the card's top edge (56.84%, the box's `caw-peek-rise`).
   */
  const PICTURES = {
    stable: { light: lightStable, dark: darkStable, scale: 1.5357 },
    nightly: { light: lightNightly, dark: darkNightly, scale: 0.9485 },
  } as const;

  const dark = $derived(theme.resolved === "dark");
  const index = $derived(chosen === "stable" ? 0 : 1);
  /** Half a card plus half the gap: where the other card starts and ends. */
  const HALF = "calc(50% + var(--space-3) / 2)";

  const release = (channel: Channel) => channels?.channels[channel];
</script>

<div class="chooser">
  <RadioGroup.Root
    aria-label="Channel"
    class="cards"
    onValueChange={(next) => {
      chosen = next as Channel;
    }}
    orientation="horizontal"
    value={chosen}
  >
    {#if motionOk.current}
      <span
        aria-hidden="true"
        class="frame"
        data-dir={index === 1 ? "end" : "start"}
        style:inset-inline-end={index === 0 ? HALF : "0"}
        style:inset-inline-start={index === 0 ? "0" : HALF}
      ></span>
    {:else}
      {#key chosen}
        <span
          aria-hidden="true"
          class="frame"
          style:inset-inline-end={index === 0 ? HALF : "0"}
          style:inset-inline-start={index === 0 ? "0" : HALF}
          in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-exit") }}
          out:fade={{ duration: dur("--dur-exit") }}
        ></span>
      {/key}
    {/if}

    {#each CARDS as card (card.channel)}
      {@const found = release(card.channel)}
      <RadioGroup.Item class="ccard" value={card.channel}>
        <span class="name">{card.name}</span>
        <span class="description">{card.description}</span>
        <span class="release">
          {#if channels === null}
            —
          {:else if found}
            <code class="num">{displayVersion(found.version)}</code>
          {:else}
            <span class="none">No release yet</span>
          {/if}
        </span>
        {#if card.channel === current}
          <span
            class="status"
            in:blur={{
              duration: dur("--dur-panel"),
              easing: easeOut,
              amount: 2,
            }}
            out:blur={{
              duration: dur("--dur-exit"),
              easing: easeOut,
              amount: 2,
            }}
          >
            <svg aria-hidden="true" class="check" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="10"></circle>
              <path d="M6.2 10.4l2.5 2.5 5.1-5.6"></path>
            </svg>
            The fleet follows {card.name}
          </span>
        {/if}
      </RadioGroup.Item>
    {/each}

    {#key chosen}
      <span
        aria-hidden="true"
        class="caw"
        style:left={index === 0
          ? "calc((100% - var(--space-3)) / 4 - var(--caw-peek) / 2)"
          : "calc(100% - (100% - var(--space-3)) / 4 - var(--caw-peek) / 2)"}
        in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-exit") }}
        out:fade={{ duration: dur("--dur-exit") }}
      >
        <img
          alt=""
          draggable="false"
          src={dark ? PICTURES[chosen].dark : PICTURES[chosen].light}
          style:transform="scale({PICTURES[chosen].scale})"
        >
      </span>
    {/key}
  </RadioGroup.Root>
</div>

<style>
  /* Room above the cards for Caw's box, so nothing overlaps the header. */
  .chooser {
    padding-top: var(--caw-peek-rise);
  }
  .chooser :global(.cards) {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, var(--channel-card-max)));
    gap: var(--space-3);
    inline-size: min(100%, calc(var(--channel-card-max) * 2 + var(--space-3)));
  }
  .chooser :global(.ccard) {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: var(--space-7) var(--space-4) var(--space-4);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-strong);
    font: var(--type-meta);
    text-align: start;
    cursor: pointer;
    transition: var(--transition-control);
  }
  .chooser :global(.ccard) > :global(*) {
    position: relative;
    z-index: 2;
  }
  .chooser :global(.ccard:active) {
    background: var(--surface-fill);
  }
  @media (hover: hover) {
    .chooser :global(.ccard:hover) {
      background: var(--surface-hover);
    }
  }
  .chooser :global(.ccard:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: -2px;
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .description {
    margin-top: var(--space-1);
    color: var(--ink-muted);
  }
  .release {
    margin-top: var(--space-2);
    color: var(--ink-strong);
  }
  .release code {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }
  .none {
    color: var(--ink-muted);
  }
  .status {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: var(--space-2);
    color: var(--ink-strong);
  }
  /* The one frame for the pair: drawn under the cards' text, it is what moves. */
  .frame {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    border: 1px solid var(--brand-solid);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    pointer-events: none;
  }
  /* The leading edge starts at once, the trailing edge after --dur-ghost. */
  @media (prefers-reduced-motion: no-preference) {
    .frame[data-dir="end"] {
      transition:
        inset-inline-end var(--dur-fade) var(--ease-in-out) 0ms,
        inset-inline-start var(--dur-fade) var(--ease-in-out) var(--dur-ghost);
    }
    .frame[data-dir="start"] {
      transition:
        inset-inline-start var(--dur-fade) var(--ease-in-out) 0ms,
        inset-inline-end var(--dur-fade) var(--ease-in-out) var(--dur-ghost);
    }
  }
  /* Caw: his box stands on the chosen card, painted over it. */
  .caw {
    position: absolute;
    top: calc(var(--caw-peek-rise) * -1);
    z-index: 3;
    inline-size: var(--caw-peek);
    block-size: var(--caw-peek);
    pointer-events: none;
  }
  .caw img {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    transform-origin: 50% 56.84%;
    user-select: none;
  }
  .check {
    width: 16px;
    height: 16px;
    flex: none;
    align-self: center;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .check circle {
    fill: var(--status-live-bg);
    stroke: none;
  }
  .check path {
    stroke: var(--status-live-glyph);
    stroke-width: 1.8;
    stroke-dasharray: 12;
    stroke-dashoffset: 0;
    @media (prefers-reduced-motion: no-preference) {
      animation: draw var(--dur-toggle) var(--ease-out) var(--dur-ghost) both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 12;
    }
  }
</style>
