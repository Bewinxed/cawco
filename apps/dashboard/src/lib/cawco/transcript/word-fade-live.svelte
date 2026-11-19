<script lang="ts" module>
  /** The house curves the word fade can take (theme.css), and Custom. */
  export const CURVES = {
    "Ease out": "--ease-out",
    Crossfade: "--ease-crossfade",
    Drawer: "--ease-drawer",
    "Ease in-out": "--ease-in-out",
    Goo: "--ease-goo",
    "Glide out": "--ease-glide-out",
    Custom: null,
  } as const satisfies Record<string, `--ease-${string}` | null>;

  export type Curve = keyof typeof CURVES;

  type Token = NonNullable<(typeof CURVES)[Curve]>;
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { cubic } from "#lib/cawco/graph/motion.js";
  /**
   * Fixture for the design graph: the streaming reply (streaming-reply-live)
   * with its word fade on the curve and duration the dials set, and under
   * it what iPhone Safari draws of that fade. Today's fade (`tuned` false)
   * provides nothing, so the markdown runs the product's own: --duration-menu
   * on --ease-out.
   *
   * iPhone Safari first shows a fade about 30 ms after it starts, then one
   * frame every 16.7 ms (the owner's recording, 60 fps: 0.71 0.88 0.95 0.98
   * on today's fade), so the line reads the curve at those moments.
   */
  import { provideWordFade } from "#lib/components/ui/markdown/word-fade.js";
  import {
    bezier,
    curveOf,
    dur,
    ease,
  } from "#lib/platform/motion/curves.svelte.js";
  import StreamingReplyLive from "./streaming-reply-live.svelte";

  type Pace = "usual" | "fast" | "slow";

  let {
    tuned = false,
    curve = "Crossfade",
    x1 = 0.42,
    y1 = 0,
    x2 = 0.58,
    y2 = 1,
    duration,
    pace = "usual",
    again = 0,
  }: {
    /** Whether the dials set the fade; otherwise the product's own runs. */
    tuned?: boolean;
    /** The house curve the fade takes, or Custom for the four points. */
    curve?: Curve;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    /** The fade's length, in ms; the menu's when unset. */
    duration?: number;
    /** How fast the hub sends the reply's words. */
    pace?: Pace;
    /** Bumped by the graph's Start again. */
    again?: number;
  } = $props();

  /** The house curves as written and as functions, and the menu's duration, read off the page once it is drawn. */
  let house = $state<{
    menu: number;
    css: Partial<Record<Token, string>>;
    at: Partial<Record<Token, (t: number) => number>>;
  }>();
  onMount(() => {
    const tokens = Object.values(CURVES).filter(
      (token): token is Token => token !== null
    );
    house = {
      menu: dur("--duration-menu"),
      css: Object.fromEntries(tokens.map((token) => [token, ease(token)])),
      at: Object.fromEntries(tokens.map((token) => [token, curveOf(token)])),
    };
  });

  /** The fade: its name, its curve as CSS for the rule and as written for the line, as a function, and its length. */
  const fade = $derived.by(() => {
    const token = tuned ? CURVES[curve] : "--ease-out";
    const ms = (tuned ? duration : undefined) ?? house?.menu;
    if (token === null) {
      const css = cubic([x1, y1, x2, y2]);
      return {
        name: "Custom",
        css,
        written: css,
        at: bezier(x1, y1, x2, y2),
        ms,
      };
    }
    return {
      name: tuned ? curve : "Ease out",
      css: `var(${token})`,
      written: house?.css[token],
      at: house?.at[token],
      ms,
    };
  });

  // A story is today's fade or a tuned one for its whole life.
  if (untrack(() => tuned)) {
    provideWordFade({
      get duration() {
        return fade.ms ?? 0;
      },
      get ease() {
        return fade.css;
      },
    });
  }

  /** The first frame iPhone Safari shows, and the 16.7 ms frames after. */
  const FIRST = 30;
  const FRAME = 1000 / 60;

  /** The ink iPhone Safari shows at each frame, as whole percents, to full. */
  const frames = $derived.by(() => {
    const { at, ms } = fade;
    if (at === undefined || ms === undefined) {
      return [];
    }
    const inks: number[] = [];
    for (let t = FIRST; t < ms && inks.at(-1) !== 100; t += FRAME) {
      inks.push(Math.round(Math.min(1, Math.max(0, at(t / ms))) * 100));
    }
    if (inks.at(-1) !== 100) {
      inks.push(100);
    }
    return inks;
  });
</script>

<div class="grid gap-space-3">
  <StreamingReplyLive {again} {pace} />
  {#if frames.length > 0}
    <p
      class="ps-space-7 pe-space-6 text-ink-muted type-meta tabular-nums text-pretty max-desk:ps-space-5 max-desk:pe-space-5"
    >
      {fade.name}, {fade.written}, {fade.ms} ms. On iPhone each word first shows at
      {frames[0]}% ink, then {frames.slice(1).join(" · ")}.
    </p>
  {/if}
</div>
