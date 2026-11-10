<script lang="ts">
  /**
   * The selected row's settings, opened in place under its row (his pick:
   * a clip is adjusted in place), as one line of three setting chips
   * (DESIGN.md, Setting chip; ui/chip `setting`): Delay, Length, Curve. Each
   * chip says its value and opens its choices, as Jitter's Easing value
   * opens its curve (mobbin.com/screens/807d0e3b-dec5-4e50-bfbe-431b86815e31):
   * the strip reads as the clip's settings, where a column of labelled
   * fields read as a form to fill (his complaint, 4 November).
   *
   * - **Delay**: its own delay, a figure typed or stepped 10 ms. A bar's
   *   body drag is the same value by hand.
   * - **Length**: the design system's durations by name, the one it runs
   *   on ticked, then a length of his own typed (T9: a free value when he
   *   asks for one). A bar's end drag settles on the same durations.
   * - **Curve**: the design system's curves with their glyphs, then a
   *   spring with its Bounce, then the agent's own curve as written, while
   *   it is none of these (T9: "the project's easings first and still … a
   *   spring or any curve the agent wrote").
   *
   * - **Values**: what the clip runs between, per property, its first
   *   frame's value and its last's, each typed.
   * - **Repeats**: once, round again, or back and forth to the move's end.
   *
   * Legs dragged on the bar (ClipBar) carry their restore glyph here too.
   *
   * A value he changed carries the restore glyph after its chip, a press
   * that puts that one value back (motion `restore`), named for what it
   * goes back to (his pin 26: an edited value marked on itself, pressed to
   * restore it). Coral is the selected row's alone. A pick or a typed value
   * plays the move from the row once (DesignGraph `retime`).
   */
  import { HOUR_MS } from "@cawco/core/time";
  import { graphWords as words } from "@cawco/core/words/graph";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconMinus,
    IconPlus,
    IconReset,
  } from "#lib/icons.js";
  import { ease } from "#lib/platform/motion/curves.svelte.js";
  import ChoiceList, { toChosen } from "./ChoiceList.svelte";
  import CurveChoices from "./CurveChoices.svelte";
  import { figureOf } from "./figures";
  import {
    bezierOf,
    type Clip,
    cubic,
    curveGlyph,
    curveTokenOf,
    delayOf,
    durationTokens,
    editsOf,
    framesGlyph,
    ownLengths,
    redelay,
    relength,
    rerepeat,
    reshape,
    restore,
    revalue,
    type Spring,
    springEasing,
    springOf,
    springSettling,
    type Timing,
    type Track,
    untune,
  } from "./motion";

  let {
    track,
    name,
    onretime,
    lang,
  }: {
    track: Track;
    /** The row as a person says it. */
    name: string;
    onretime: (clips: Clip[]) => void;
    /** The page's language, for the figures. */
    lang: string | undefined;
  } = $props();

  const first = $derived(track.clips[0]);
  const figure = (n: number) => figureOf(Math.round(n), lang);
  const edits = $derived(editsOf(track));
  /** The row's first clip as the engine ran it. */
  const was = $derived(untune(first));

  /** The steps of Delay's − and +, ms. */
  const STEP = 10;
  /** The longest a length or a delay is set to: an hour, past the 30-minute fill a states file may play. */
  const LONGEST = HOUR_MS;
  /** A spring's bounce when he first picks it, and how high it goes. */
  const SPRING_START = 0.2;
  const BOUNCE_MOST = 0.9;

  // --- Delay ---------------------------------------------------------------
  const delay = $derived(Math.round(delayOf(track)));
  const setDelay = (ms: number) => {
    onretime(redelay(track, Math.min(LONGEST, Math.max(0, Math.round(ms)))));
  };

  // --- Length --------------------------------------------------------------
  const [shortest, longest] = $derived(ownLengths(track.clips));
  const lengthShown = $derived.by(() => {
    if (shortest !== longest) {
      return words.lengthRange(figure(shortest), figure(longest));
    }
    return track.sprung
      ? words.springFigure(figure(shortest))
      : words.ms(figure(shortest));
  });
  const DURATIONS = durationTokens();
  const setLength = (ms: number) => {
    const next = Math.min(LONGEST, Math.max(STEP, Math.round(ms)));
    if (first.spring) {
      sendSpring(springSettling(next, first.spring.bounce, first.spring.mass));
      return;
    }
    onretime(relength(track, next));
  };

  // --- Curve ---------------------------------------------------------------
  /** The design system's curves, offered first, by token. */
  const HOUSE = [
    "--ease-out",
    "--ease-in-out",
    "--ease-drawer",
    "--ease-crossfade",
    "--ease-goo",
    "linear",
  ] as const;
  const houseEasing = (token: (typeof HOUSE)[number]) =>
    token === "linear" ? "linear" : ease(token);
  /** A curve's choice: a token's, the spring, the agent's own as written, or one he drew. */
  const curveOf = (clip: Clip): string => {
    if (clip.spring) {
      return "spring";
    }
    const token = clip.framed ? null : curveTokenOf(clip.easing);
    if (token) {
      return token;
    }
    const ran = untune(clip);
    return clip.was &&
      (clip.easing !== ran.easing || clip.framed !== ran.framed)
      ? "own"
      : "written";
  };
  const curve = $derived(curveOf(first));
  /**
   * The chosen curve's four numbers, drawn over the list with its two
   * control points to drag (his pick, animation-face-questions#curve-draw:
   * "The list with a curve to drag"); a spring or a curve kept in a
   * transition's frames has none to bend. A bent curve is his own, sent to
   * the agent off the design system's tokens.
   */
  const bent = $derived(
    first.spring || first.framed ? null : bezierOf(first.easing)
  );
  /** The agent's own curve stands in the list while it is none of the design system's. */
  const written = $derived(curveOf(was) === "written");
  const curveName = (choice: string) => {
    if (choice === "spring") {
      return words.spring;
    }
    if (choice === "own") {
      return words.yourCurve;
    }
    return choice === "written"
      ? words.agentsCurve
      : (words.curves[choice] ?? choice);
  };
  const glyphOf = (choice: string, clip: Clip): string | null => {
    if (choice === "spring") {
      return curveGlyph(springEasing(springOf(0.5, 0.45)).easing);
    }
    if (choice === "written") {
      return clip.framed
        ? framesGlyph(clip.frameCurve)
        : curveGlyph(clip.easing);
    }
    if (choice === "own") {
      return curveGlyph(clip.easing);
    }
    const house = HOUSE.find((token) => token === choice);
    return house ? curveGlyph(houseEasing(house)) : null;
  };
  /** A spring drawn on every clip of the row, the clips as long as it takes to come to rest. */
  const sendSpring = (spring: Spring) => {
    const drawn = springEasing(spring);
    onretime(reshape(track, drawn.easing, spring, drawn.duration));
  };
  const pickCurve = (choice: string) => {
    if (choice === curve || choice === "own") {
      return;
    }
    if (choice === "written") {
      onretime(restore(track, "curve"));
    } else if (choice === "spring") {
      sendSpring(springSettling(shortest, SPRING_START));
    } else {
      const house = HOUSE.find((token) => token === choice);
      if (house) {
        onretime(reshape(track, houseEasing(house), null));
      }
    }
  };
  /** The spring's own length: how long it takes to swing to its end, s (its response). */
  const responseOf = (spring: Spring) =>
    (2 * Math.PI) / Math.sqrt(spring.stiffness / spring.mass);

  // --- Reset ---------------------------------------------------------------
  /** Each changed value's press, named for what it goes back to. */
  const resets = $derived<Partial<Record<Timing, string>>>({
    ...(edits.has("start") && {
      start: words.resetDelay(
        figure(
          Math.min(
            ...track.clips.map(
              (clip) => untune(clip).start + untune(clip).delay
            )
          ) - track.setOff
        )
      ),
    }),
    ...(edits.has("length") && {
      length: words.resetLength(figure(was.duration)),
    }),
    ...(edits.has("curve") && {
      curve: words.resetCurve(curveName(curveOf(was))),
    }),
    ...(edits.has("values") && { values: words.resetValues }),
    ...(edits.has("repeat") && {
      repeat: words.resetRepeat(words.clipRepeats[was.repeat] ?? was.repeat),
    }),
    ...(edits.has("legs") && { legs: words.resetLegs }),
  });

  // --- Values and repeats ----------------------------------------------------
  const LEADING_DASHES = /^-+/u;
  const JOINERS = /[-_]+/gu;
  /**
   * What the row's clips run between, per property: its first clip's; none
   * for a clip whose curve lives in its frames (a Svelte transition's, a
   * frame every 16 ms), whose ends typed anew would leave the frames
   * between them where they were.
   */
  const values = $derived(first.framed ? [] : first.values);
  /** The Values chip's value: its first property's ends, and how many more stand in its card. */
  const valuesShown = $derived.by(() => {
    const [one, ...more] = values;
    if (!one) {
      return "";
    }
    const ends = words.valueEnds(one.from, one.to);
    return more.length > 0 ? words.andMore(ends, more.length) : ends;
  });
  /** A property's name in words: its own where the words have one, else said plainly. */
  const propertyName = (property: string) =>
    words.properties[property] ??
    property.replace(LEADING_DASHES, "").replace(JOINERS, " ");
  const REPEATS = ["once", "repeat", "mirror"] as const;
  let repeatList = $state<HTMLElement>();

  let lengthList = $state<HTMLElement>();
  let curveList = $state<HTMLElement>();

  let open = $state<Timing | null>(null);
  const opener = (key: Timing) => ({
    get open() {
      return open === key;
    },
    set open(next: boolean) {
      if (next) {
        open = key;
      } else if (open === key) {
        open = null;
      }
    },
  });
  const delayOpen = opener("start");
  const lengthOpen = opener("length");
  const curveOpen = opener("curve");
  const valuesOpen = opener("values");
  const repeatOpen = opener("repeat");
</script>

{#snippet glyph(path: string | null)}
  {#if path}
    <svg
      aria-hidden="true"
      class="size-icon-md flex-none"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.5"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  {/if}
{/snippet}

{#snippet restoreOf(key: Timing)}
  <!-- The undo glyph's slot after its chip, held whether or not the value
       changed (as the Controls face holds its column), so no chip moves or
       wraps to another line as the glyph comes and goes. -->
  <span class="flex w-c-btn-h-xs flex-none items-center justify-center">
    {#if resets[key]}
      {@const said = resets[key]}
      <Tip label={said}>
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-label={said}
            data-edited={key}
            icon={IconReset}
            onclick={() => onretime(restore(track, key))}
            press="pressable"
            size="icon-xs"
            tone="edited"
            variant="ghost"
          />
        {/snippet}
      </Tip>
    {/if}
  </span>
{/snippet}

{#snippet chip(label: string, value: string, key: Timing, path: string | null)}
  <!-- Never wider than the settings' line: a long value is cut inside its chip, its whole in the chip's name. -->
  <Popover.Trigger
    aria-label="{label}: {value}"
    class="max-w-full min-w-0"
    data-changed={edits.has(key) || undefined}
    look="chip"
  >
    {#if path}
      {@render glyph(path)}
    {:else}
      <span class="flex-none text-ink-muted">{label}</span>
    {/if}
    <span
      class={[
        "num min-w-0 overflow-clip text-ellipsis whitespace-nowrap",
        edits.has(key) ? "text-ink-strong" : "text-ink-row",
      ]}
      data-slot="chip-label">{value}</span
    >
    <IconChevronDown data-slot="chevron" />
  </Popover.Trigger>
{/snippet}

<section
  aria-label={name}
  class="flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-2 hit-gap-x-space-3 coarse:gap-y-space-4 coarse:hit-gap-y-space-4"
  data-slot="clip-settings"
>
  <!-- Delay -->
  <span class="inline-flex max-w-full min-w-0 items-center gap-space-1">
    <Popover.Root bind:open={delayOpen.open}>
      {@render chip(words.delay, words.ms(figure(delay)), "start", null)}
      <Popover.Content align="start" pad="inset">
        <InputGroup.Root class="w-c-graph-figure-w">
          <InputGroup.Addon>
            <InputGroup.Button
              aria-label={words.earlier}
              disabled={delay <= 0}
              onclick={() => setDelay(delay - STEP)}
              size="icon-xs"
            >
              <IconMinus aria-hidden="true" />
            </InputGroup.Button>
          </InputGroup.Addon>
          <InputGroup.Input
            aria-label={words.delay}
            field="number"
            max={LONGEST}
            min={0}
            onchange={(event) => setDelay(Number(event.currentTarget.value))}
            step={STEP}
            text="label"
            type="number"
            value={delay}
          />
          <InputGroup.Addon align="inline-end">
            <span class="type-meta text-ink-muted">{words.msUnit}</span>
            <InputGroup.Button
              aria-label={words.later}
              onclick={() => setDelay(delay + STEP)}
              size="icon-xs"
            >
              <IconPlus aria-hidden="true" />
            </InputGroup.Button>
          </InputGroup.Addon>
        </InputGroup.Root>
      </Popover.Content>
    </Popover.Root>
    {@render restoreOf("start")}
  </span>

  <!-- Length -->
  <span class="inline-flex max-w-full min-w-0 items-center gap-space-1">
    <Popover.Root bind:open={lengthOpen.open}>
      {@render chip(words.length, lengthShown, "length", null)}
      <Popover.Content
        align="start"
        gap="none"
        height="capped"
        onOpenAutoFocus={toChosen(() => lengthList)}
        overflow="scroll"
        width="narrow"
      >
        <ChoiceList
          bind:ref={lengthList}
          label={words.length}
          onpick={(next) => {
            setLength(Number(next));
            open = null;
          }}
          options={DURATIONS.map((one) => ({
            value: String(one.ms),
            name: one.tokens
              .map((token) => words.durations[token] ?? token)
              .join(", "),
            meta: words.ms(figure(one.ms)),
          }))}
          value={shortest === longest ? String(shortest) : null}
        />
        <!-- A length of his own: off the design system's durations, which
             the agent reads as his own number to name. -->
        <label
          class="flex min-w-0 items-center gap-space-2 border-t border-border-hairline px-space-3 pt-space-2 pb-space-1"
        >
          <span class="min-w-0 flex-1 type-label text-ink-muted"
            >{words.ownLength}</span
          >
          <InputGroup.Root class="w-c-graph-figure-w">
            <InputGroup.Input
              field="number"
              max={LONGEST}
              min={STEP}
              onchange={(event) => setLength(Number(event.currentTarget.value))}
              step={STEP}
              text="label"
              type="number"
              value={Math.round(longest)}
            />
            <InputGroup.Addon align="inline-end">
              <span class="type-meta text-ink-muted">{words.msUnit}</span>
            </InputGroup.Addon>
          </InputGroup.Root>
        </label>
      </Popover.Content>
    </Popover.Root>
    {@render restoreOf("length")}
  </span>

  <!-- Curve -->
  <span class="inline-flex max-w-full min-w-0 items-center gap-space-1">
    <Popover.Root bind:open={curveOpen.open}>
      {@render chip(
        words.curve,
        curveName(curve),
        "curve",
        glyphOf(curve, first)
      )}
      <Popover.Content
        align="start"
        gap="none"
        height="available"
        onOpenAutoFocus={toChosen(() => curveList)}
        overflow="scroll"
        width="narrow"
      >
        <CurveChoices
          bind:ref={curveList}
          onpick={(choice) => {
            pickCurve(choice);
            if (choice !== "spring") {
              open = null;
            }
          }}
          options={[
            ...HOUSE,
            "spring",
            ...(written ? ["written"] : []),
            ...(curve === "own" ? ["own"] : []),
          ].map((choice) => ({
            value: choice,
            name: curveName(choice),
            glyph: glyphOf(choice, was),
          }))}
          spring={first.spring
            ? {
                bounce: first.spring.bounce,
                most: BOUNCE_MOST,
                onbounce: (next) => {
                  const { spring } = first;
                  if (spring) {
                    sendSpring({
                      ...springOf(responseOf(spring), next),
                      mass: spring.mass,
                    });
                  }
                },
              }
            : null}
          bend={bent
            ? {
                at: bent,
                onbend: (at) => onretime(reshape(track, cubic(at), null)),
              }
            : null}
          springDrawn={first.spring ? first.easing : null}
          value={curve}
        />
      </Popover.Content>
    </Popover.Root>
    {@render restoreOf("curve")}
  </span>

  {#if values.length > 0}
    <!-- Values: what it runs between, each end typed. -->
    <span class="inline-flex max-w-full min-w-0 items-center gap-space-1">
      <Popover.Root bind:open={valuesOpen.open}>
        {@render chip(words.values, valuesShown, "values", null)}
        <Popover.Content align="start" pad="inset" width="wide">
          <div
            class="grid min-w-0 grid-cols-(--cols) items-center gap-x-space-2 gap-y-space-2"
            style:--cols="minmax(0, auto) minmax(0, 1fr) auto minmax(0, 1fr)"
          >
            {#each values as one (one.property)}
              {@const said = propertyName(one.property)}
              <span class="min-w-0 truncate type-label text-ink-row"
                >{said}</span
              >
              <Input
                aria-label={words.valueFrom(said)}
                onchange={(event) =>
                  onretime(
                    revalue(
                      track,
                      one.property,
                      event.currentTarget.value,
                      one.to
                    )
                  )}
                value={one.from}
              />
              <span aria-hidden="true" class="type-meta text-ink-muted">→</span>
              <Input
                aria-label={words.valueTo(said)}
                onchange={(event) =>
                  onretime(
                    revalue(
                      track,
                      one.property,
                      one.from,
                      event.currentTarget.value
                    )
                  )}
                value={one.to}
              />
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
      {@render restoreOf("values")}
    </span>
  {/if}

  <!-- Repeats: once, round again, or back and forth. -->
  <span class="inline-flex max-w-full min-w-0 items-center gap-space-1">
    <Popover.Root bind:open={repeatOpen.open}>
      {@render chip(
        words.clipRepeat,
        words.clipRepeats[first.repeat] ?? first.repeat,
        "repeat",
        null
      )}
      <Popover.Content
        align="start"
        gap="none"
        onOpenAutoFocus={toChosen(() => repeatList)}
        width="narrow"
      >
        <ChoiceList
          bind:ref={repeatList}
          label={words.clipRepeat}
          onpick={(next) => {
            const repeat = REPEATS.find((one) => one === next);
            if (repeat) {
              onretime(rerepeat(track, repeat));
            }
            open = null;
          }}
          options={REPEATS.map((one) => ({
            value: one,
            name: words.clipRepeats[one] ?? one,
          }))}
          value={first.repeat}
        />
      </Popover.Content>
    </Popover.Root>
    {@render restoreOf("repeat")}
  </span>
  {#if resets.legs}
    {@render restoreOf("legs")}
  {/if}
</section>
