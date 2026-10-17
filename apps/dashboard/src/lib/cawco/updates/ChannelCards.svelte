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

<!-- Room above the cards for Caw's box, so nothing overlaps the header. -->
<div
  class="pt-(--caw-peek-rise)"
  style:--cards-w="min(100%, calc(var(--channel-card-max) * 2 + var(--space-3)))"
  style:--cols="repeat(2, minmax(0, var(--channel-card-max)))"
>
  <RadioGroup.Root
    data-cards
    aria-label="Channel"
    class="relative grid w-(--cards-w) grid-cols-(--cols) gap-space-3"
    onValueChange={(next) => {
      chosen = next as Channel;
    }}
    orientation="horizontal"
    value={chosen}
  >
    {#if motionOk.current}
      <span
        data-slot="frame"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 z-1 end-(--frame-end) start-(--frame-start) rounded-md border border-brand-solid bg-surface-recess"
        data-dir={index === 1 ? "end" : "start"}
        style:--frame-end={index === 0 ? HALF : "0"}
        style:--frame-start={index === 0 ? "0" : HALF}
      ></span>
    {:else}
      {#key chosen}
        <span
          data-slot="frame"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 z-1 end-(--frame-end) start-(--frame-start) rounded-md border border-brand-solid bg-surface-recess"
          style:--frame-end={index === 0 ? HALF : "0"}
          style:--frame-start={index === 0 ? "0" : HALF}
          in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-exit") }}
          out:fade={{ duration: dur("--dur-exit") }}
        ></span>
      {/key}
    {/if}

    {#each CARDS as card (card.channel)}
      {@const found = release(card.channel)}
      <RadioGroup.Item
        class="relative flex flex-col rounded-md border border-border-control bg-transparent px-space-4 pt-space-7 pb-space-4 type-meta text-start text-ink-strong transition-control cursor-pointer hover:bg-surface-hover active:bg-surface-fill hover:active:bg-surface-hover focus-visible:-outline-offset-2 focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
        value={card.channel}
      >
        <span data-slot="name" class="relative z-2 type-label text-ink-strong"
          >{card.name}</span
        >
        <span class="relative z-2 mt-space-1 text-ink-muted"
          >{card.description}</span
        >
        <span class="relative z-2 mt-space-2 text-ink-strong">
          {#if channels === null}
            —
          {:else if found}
            <code data-slot="num" class="num font-mono text-size-code"
              >{displayVersion(found.version)}</code
            >
          {:else}
            <span class="text-ink-muted">No release yet</span>
          {/if}
        </span>
        {#if card.channel === current}
          <!-- literal: 8px -->
          <span
            class="mark-line relative z-2 mt-space-2 flex items-center gap-(--gap) text-ink-strong"
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
            style:--gap="8px"
          >
            <svg
              data-slot="check"
              aria-hidden="true"
              class="size-icon-md flex-none self-center fill-none"
              viewBox="0 0 20 20"
            >
              <circle
                cx="10"
                cy="10"
                r="10"
                class="fill-status-live-bg stroke-none"
              ></circle>
              <path
                d="M6.2 10.4l2.5 2.5 5.1-5.6"
                class="stroke-status-live-glyph"
              ></path>
            </svg>
            <span>The fleet follows {card.name}</span>
          </span>
        {/if}
      </RadioGroup.Item>
    {/each}

    {#key chosen}
      <!-- Caw: his box stands on the chosen card, painted over it. -->
      <span
        aria-hidden="true"
        class="pointer-events-none absolute top-(--caw-top) left-(--caw-left) z-3 size-(--caw-peek)"
        in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-exit") }}
        out:fade={{ duration: dur("--dur-exit") }}
        style:--caw-left={index === 0
          ? "calc((100% - var(--space-3)) / 4 - var(--caw-peek) / 2)"
          : "calc(100% - (100% - var(--space-3)) / 4 - var(--caw-peek) / 2)"}
        style:--caw-top="calc(var(--caw-peek-rise) * -1)"
      >
        <!-- literal: 50% 56.84% -->
        <img
          alt=""
          class="absolute inset-0 size-full origin-(--origin) transform-(--scaled) select-none"
          draggable="false"
          src={dark ? PICTURES[chosen].dark : PICTURES[chosen].light}
          style:--origin="50% 56.84%"
          style:--scaled="scale({PICTURES[chosen].scale})"
        />
      </span>
    {/key}
  </RadioGroup.Root>
</div>

<style>
  /* residual: unmapped — the frame's leading edge starts at once, the trailing edge after --dur-ghost (needs transition token: a different delay per property) */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="frame"][data-dir="end"] {
      transition:
        inset-inline-end var(--dur-fade) var(--ease-in-out) 0ms,
        inset-inline-start var(--dur-fade) var(--ease-in-out) var(--dur-ghost);
    }
    [data-slot="frame"][data-dir="start"] {
      transition:
        inset-inline-start var(--dur-fade) var(--ease-in-out) 0ms,
        inset-inline-end var(--dur-fade) var(--ease-in-out) var(--dur-ghost);
    }
  }

  /* residual: svg-paint */
  [data-slot="check"] {
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  [data-slot="check"] path {
    stroke-width: 1.8;
    stroke-dasharray: 12;
    stroke-dashoffset: 0;
  }

  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="check"] path {
      animation: draw var(--dur-toggle) var(--ease-out) var(--dur-ghost) both;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 12;
    }
  }
</style>
