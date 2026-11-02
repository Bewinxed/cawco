<script lang="ts">
  /**
   * A clip's editor (the owner's answer: a full editor, presets first, the
   * rest for whoever wants it). First the ladder's lengths and the house
   * curves and spring, by name, one press each; under Advanced any length
   * and delay, any cubic-bezier, and a spring's bounce, mass, stiffness and
   * damping. Every change plays on the stage at once; the clip's row says
   * it was tuned, before and after, so a remark on it carries both, and
   * the agent reads the tuning back (component-canvas: `tuned`).
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { untrack } from "svelte";
  import { dur, ease } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconTuning } from "#lib/icons.js";
  import {
    type Clip,
    CURVES,
    LADDER,
    type Spring,
    springEasing,
    springOf,
    type Tuning,
  } from "./motion";

  let {
    clip,
    ontune,
    onreset,
  }: {
    clip: Clip;
    ontune: (tuning: Tuning) => void;
    onreset: () => void;
  } = $props();

  /** The ladder's lengths offered first: those a clip of a surface takes. */
  const LENGTHS = LADDER.filter((name) =>
    [
      "--dur-control",
      "--dur-exit",
      "--dur-morph",
      "--dur-pop",
      "--dur-panel",
      "--dur-lift",
      "--dur-settle",
    ].includes(name)
  );
  const HOUSE_SPRING = springOf(0.4, 0);
  const NUMBERS = /-?\d*\.?\d+/gu;

  let duration = $state(untrack(() => clip.duration));
  let delay = $state(untrack(() => clip.delay));
  let easing = $state(untrack(() => clip.easing));
  let spring = $state<Spring | null>(null);
  let advanced = $state(false);

  const bezier = $derived.by(() => {
    const said = easing.startsWith("cubic-bezier")
      ? (easing.match(NUMBERS) ?? []).map(Number)
      : [];
    return said.length === 4
      ? said
      : (ease("--ease-out").match(NUMBERS) ?? []).map(Number);
  });

  const send = () => {
    if (spring) {
      const drawn = springEasing(spring);
      ({ duration } = drawn);
      ontune({ delay, duration, easing: drawn.easing, spring });
      return;
    }
    ontune({ delay, duration, easing, spring: null });
  };
  const setBezier = (at: number, value: number) => {
    const next = [...bezier];
    next[at] = value;
    // golar-ignore-next-line house/no-raw-motion -- the curve the person types for the component under review, never the dashboard's own motion
    easing = `cubic-bezier(${next.join(", ")})`;
    spring = null;
    send();
  };
  const setSpring = (key: keyof Spring, value: number) => {
    const base = spring ?? HOUSE_SPRING;
    spring =
      key === "bounce"
        ? { ...springOf(Math.max(duration, 1) / 1000, value), mass: base.mass }
        : { ...base, [key]: value };
    send();
  };
  const tokenWord = (name: string) => name.replace("--dur-", "");
  const field =
    "h-c-btn-h-sm w-full min-w-0 rounded-md border border-border-control bg-surface-raised px-space-2 type-label text-ink-strong num";
  const chip = (on: boolean) => [
    "pointer-hit touch-hit h-c-btn-h-sm rounded-sm px-space-2 type-label transition-control",
    on
      ? "bg-selected-bg text-selected-ink"
      : "text-ink-row can-hover:hover:bg-surface-hover",
  ];
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        aria-label={words.edit(clip.element)}
        class="pointer-hit touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-md text-ink-muted transition-control can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
        title={words.edit(clip.element)}
        type="button"
      >
        <IconTuning aria-hidden="true" class="size-icon-md" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="end" side="top">
    <div
      data-slot="clip-editor"
      class="flex w-c-graph-node-w max-w-full flex-col gap-space-3 p-space-2"
    >
      <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
        <legend class="mb-space-2 type-label text-ink-muted"
          >{words.length}</legend
        >
        <div class="flex flex-wrap gap-space-1">
          {#each LENGTHS as name (name)}
            {@const ms = Math.round(dur(name))}
            <button
              type="button"
              aria-pressed={!spring && duration === ms}
              class={chip(!spring && duration === ms)}
              onclick={() => {
                duration = ms;
                spring = null;
                send();
              }}
            >
              {tokenWord(name)} <span class="num text-ink-muted">{ms}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      {#if !clip.framed}
        <!-- A clip whose curve lives in its frames changes its length alone. -->
        <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
          <legend class="mb-space-2 type-label text-ink-muted"
            >{words.curve}</legend
          >
          <div class="flex flex-wrap gap-space-1">
            {#each [...CURVES, "linear"] as name (name)}
              {@const value =
                name === "linear" ? "linear" : ease(name as `--ease-${string}`)}
              <button
                type="button"
                aria-pressed={!spring && easing === value}
                class={chip(!spring && easing === value)}
                onclick={() => {
                  easing = value;
                  spring = null;
                  send();
                }}
              >
                {words.curves[name] ?? name}
              </button>
            {/each}
            <button
              type="button"
              aria-pressed={spring !== null}
              class={chip(spring !== null)}
              onclick={() => {
                spring = HOUSE_SPRING;
                send();
              }}
            >
              {words.spring}
            </button>
          </div>
        </fieldset>
      {/if}

      <button
        type="button"
        aria-expanded={advanced}
        class="pointer-hit touch-hit self-start rounded-sm type-label text-link-ink"
        onclick={() => {
          advanced = !advanced;
        }}
      >
        {words.advanced}
      </button>
      {#if advanced}
        <div class="grid grid-cols-2 gap-space-2" in:unfold out:unfold>
          <label class="flex flex-col gap-space-1 type-meta text-ink-muted">
            {words.length}
            <input
              class={field}
              min="0"
              step="10"
              type="number"
              value={duration}
              onchange={(event) => {
                duration = Number(event.currentTarget.value);
                spring = null;
                send();
              }}
            />
          </label>
          <label class="flex flex-col gap-space-1 type-meta text-ink-muted">
            {words.delay}
            <input
              class={field}
              min="0"
              step="10"
              type="number"
              value={delay}
              onchange={(event) => {
                delay = Number(event.currentTarget.value);
                send();
              }}
            />
          </label>
          {#if !clip.framed}
            <fieldset
              class="col-span-2 m-0 grid grid-cols-4 gap-space-1 border-0 p-0"
            >
              <legend class="mb-space-1 type-meta text-ink-muted"
                >{words.custom}</legend
              >
              {#each bezier as value, at (at)}
                <input
                  aria-label={`${words.custom} ${at + 1}`}
                  class={field}
                  step="0.01"
                  type="number"
                  {value}
                  onchange={(event) =>
                    setBezier(at, Number(event.currentTarget.value))}
                />
              {/each}
            </fieldset>
            {#each [["bounce", words.bounce, 0.05], ["mass", words.mass, 0.1], ["stiffness", words.stiffness, 10], ["damping", words.damping, 1]] as const as [key, label, step] (key)}
              <label class="flex flex-col gap-space-1 type-meta text-ink-muted">
                {label}
                <input
                  class={field}
                  {step}
                  type="number"
                  value={Number((spring ?? HOUSE_SPRING)[key].toFixed(2))}
                  onchange={(event) =>
                    setSpring(key, Number(event.currentTarget.value))}
                />
              </label>
            {/each}
          {/if}
        </div>
      {/if}

      <p class="m-0 type-meta text-ink-muted">{words.tunedGoes}</p>
      {#if clip.was}
        <button
          type="button"
          class="pointer-hit touch-hit self-start rounded-sm type-label text-link-ink"
          onclick={() => {
            spring = null;
            onreset();
          }}
        >
          {words.reset}
        </button>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
