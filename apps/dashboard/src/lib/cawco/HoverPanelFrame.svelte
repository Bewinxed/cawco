<script lang="ts">
  /**
   * The house hover panel's surface (HoverPanel draws it): one panel for
   * whichever thing the pointer rests on. When it moves to the next one the
   * panel glides there (translate on --dur-morph, --ease-drawer) and takes
   * the new content's size (morph) while the content cross-fades, rather
   * than closing and opening again. It comes in with a 4px rise from .98 and
   * leaves as a fade.
   *
   * It reads no fleet: `pending` says the content's live tail is still being
   * read (HoverPanel works it out from the session it watches). Moving to
   * content that is pending keeps the panel's size until it lands.
   *
   * Where it stands is the caller's: `above` a row of chips (`--x` along
   * the row, clamped to `--span`, growing from `--origin`), or to the
   * `right` of a list at `--x`/`--y` in the viewport. Either way a 4px
   * bridge on the side facing the trigger keeps the pointer over the panel
   * as it crosses the gap.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import type { TransitionConfig } from "svelte/transition";
  import { dur, easeOut, lifting, motionOk } from "./motion/curves.svelte";
  import { morph } from "./motion/morph.svelte";

  let {
    key,
    pending = false,
    gliding = false,
    side,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    /** What the panel shows; null closes it. A new key cross-fades. */
    key: string | null;
    /** The content's live tail is still being read. */
    pending?: boolean;
    /** Moving from one trigger to the next: the panel travels. */
    gliding?: boolean;
    side: "above" | "right";
    children: Snippet<[string]>;
  } = $props();

  // Landed: the hold is spent, and a later re-read never brings it back.
  $effect(() => {
    if (!pending) {
      held = null;
    }
  });
  /**
   * The size the content had before the panel moved to the next trigger.
   * While the next one's tail is still on its way the new content holds it
   * (its head at once, skeleton lines under), so the panel resizes once,
   * when the tail lands, and not at all when it lands the same size.
   */
  let held = $state<{ w: number; h: number } | null>(null);
  /** The shown content's size, kept as it changes; a leaving one never counts. */
  let size: { w: number; h: number } | null = null;
  const measure: Attachment<HTMLElement> = (node) => {
    // biome-ignore lint/style/noRestrictedGlobals: reads only: the content's size, kept in a plain variable for the next trigger's hold
    const watcher = new ResizeObserver(() => {
      if (node.style.position !== "absolute") {
        size = { w: node.offsetWidth, h: node.offsetHeight };
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  };
  $effect.pre(() => {
    const next = key;
    untrack(() => {
      held = next && size ? { ...size } : null;
      if (!next) {
        size = null;
      }
    });
  });
  // A tail that does not land within the wait's grace (a machine that is
  // away, a read that fails) releases the hold: the card takes its own
  // content's size rather than standing at the last one's, empty.
  $effect(() => {
    if (!held) {
      return;
    }
    const release = setTimeout(() => {
      held = null;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(release);
  });

  function panelIn(_node: Element): TransitionConfig {
    if (!motionOk.current) {
      return { duration: dur("--dur-menu"), css: (t) => `opacity: ${t}` };
    }
    const lift = side === "above" ? "translateY" : "translateX";
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t, u) =>
        `opacity: ${t}; transform: ${lift}(${(u * (side === "above" ? 4 : -4)).toFixed(2)}px) scale(${(0.98 + 0.02 * t).toFixed(4)})`,
    };
  }
  function panelOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /** The content, when the panel moves to another trigger: the new one fades in. */
  function swapIn(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /**
   * The old content fades out of the flow, so the panel's size tweens once,
   * straight to the new content's (morph), under both.
   */
  function swapOut(node: HTMLElement): TransitionConfig {
    return lifting(
      node,
      () => ({
        position: "absolute",
        inset: "var(--space-3) var(--space-3) auto",
      }),
      {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t) => `opacity: ${t}`,
      }
    );
  }
</script>

{#if key}
  <!-- Over a row of chips (`above`, the base): at its chip, pulled back inside
       the row's end, and raised by --rise over whatever stands on the row
       between them. Beside a list (`right`): level with its row, pulled back
       inside the viewport by its own height (the 100%), --hover-panel-inset
       clear of either edge; it grows from its row's centre, which is --origin
       under the row's top (--y) wherever the panel's own top (--top) ends up.
       The 4px bridge between the panel and its trigger is its `after:`. -->
  <div
    {...rest}
    class="pointer-events-auto absolute start-0 bottom-(--panel-bottom) z-2 w-max origin-(--panel-origin-above) translate-x-(--panel-x) rounded-lg border border-border-control bg-surface-raised shadow-overlay side-right:fixed side-right:start-(--x) side-right:top-0 side-right:bottom-auto side-right:z-(--layer-float) side-right:origin-(--panel-origin-right) side-right:translate-x-0 side-right:translate-y-(--top) motion-safe:data-gliding:transition-[translate] motion-safe:data-gliding:duration-(--dur-morph) motion-safe:data-gliding:ease-drawer side-above:after:absolute side-above:after:inset-x-0 side-above:after:top-full side-above:after:h-space-1 side-right:after:absolute side-right:after:inset-y-0 side-right:after:end-full side-right:after:w-space-1"
    data-gliding={gliding || undefined}
    data-side={side}
    style:--panel-bottom="calc(100% + var(--space-1) + var(--rise, 0px))"
    style:--panel-origin-above="var(--origin) 100%"
    style:--panel-origin-right="0 calc(var(--y) + var(--origin) - var(--top))"
    style:--panel-x="max(0px, min(var(--x), calc(var(--span) - 100%)))"
    style:--top={"clamp(var(--hover-panel-inset), var(--y), calc(100dvh - 100% - var(--hover-panel-inset)))"}
    in:panelIn
    out:panelOut
    {@attach morph({ width: true })}
  >
    <!-- The content's own width, capped at 440px or the room (less the
         border): never the panel's, so the panel's size tween (morph, which
         watches this box) does not resize what it is watching. -->
    <div
      class="relative grid w-max max-w-(--cell-max) max-h-(--cell-room) overflow-y-auto overscroll-contain p-space-3"
      style:--cell-max={"calc(min(var(--hover-panel-max), var(--span, var(--hover-panel-max))) - 2px)"}
      style:--cell-room="var(--room, var(--c-hover-panel-room))"
    >
      {#key key}
        <div
          class="col-start-1 row-start-1 min-w-0 h-(--held-h) w-(--held-w)"
          style:--held-h={pending && held ? `${held.h}px` : undefined}
          style:--held-w={pending && held ? `${held.w}px` : undefined}
          in:swapIn
          out:swapOut
          {@attach measure}
        >
          {@render children(key)}
        </div>
      {/key}
    </div>
  </div>
{/if}
