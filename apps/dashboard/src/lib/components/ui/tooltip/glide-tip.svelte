<script lang="ts">
  /**
   * The glass's one tooltip (glide.ts): the Root its items' tips are
   * tethered to, saying the words of the item it stands at. It fades in as
   * every tooltip does (tooltip-content). While it stays open and the
   * pointer moves to another item, it is one shape travelling (DESIGN.md,
   * Tooltip: "within one glass slides between items over --duration-control"):
   * its place, its width and its height move together on one clock, and its
   * words morph as the house swaps words (MorphText).
   *
   * Why the shape moves on the tooltip itself, not its floating wrapper:
   * bits-ui places the wrapper with floating-ui, centred on the item, from
   * the wrapper's size, and re-places it whenever that size changes (its
   * `autoUpdate` observes it). Gliding the wrapper's transform while the
   * words changed its size snapped the width to the new words on the first
   * frame (76 px to 43 px, "Next state" to "Map") and only then slid; and a
   * width tweened under a gliding wrapper re-placed it every frame, each
   * placing restarting the glide. Here the wrapper is placed at once,
   * centred on the new item, every frame at the width drawn then; the
   * tooltip stands off it by how far its centre was from the new item's and
   * closes that distance (its `transform`; its fade in owns its `translate`,
   * kit-tip-in, whose fill would hold it), while its width and height go
   * from the size drawn to the new words' size, both on one clock over
   * `--duration-control` on the drawer's curve (Web Animations, so each starts
   * from the values given, not from a style the page must lay out first).
   * So its centre and its width each go straight from the last item's to
   * this one's, together; caught mid-way, it starts again from where it is
   * drawn. The words' size is `sizer`'s, the same words laid out unseen,
   * read by an observer after the frame's layout: a glide reads the page
   * once, before it writes anything.
   *
   * With reduced motion it moves to the new item at once and only its
   * words cross (MorphText's fade).
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";
  import MorphText from "../morph-text/morph-text.svelte";
  import type { Glide, GlideWords as Words } from "./glide";
  import Root from "./tooltip.svelte";
  import Content from "./tooltip-content.svelte";

  let { tether }: { tether: Glide } = $props();

  /** How far it stands clear of the viewport's edges, px: it never touches one. */
  const CLEAR = 8;

  let open = $state(false);
  /** It has stood a frame: a move from here glides, its first placing never does. */
  let gliding = $state(false);
  let tip = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open) {
      gliding = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      gliding = true;
    });
    return () => cancelAnimationFrame(frame);
  });

  /** The item it stands at, and its words: bits-ui's registry of the tethered triggers. */
  const item = $derived(tether.state.registry.activeTriggerNode);
  const words = $derived(tether.state.registry.activePayload as Words | null);
  /** The item and words it was drawn for: a change of either glides. */
  let drawnFor: { at: Element; said: string } | null = null;
  const sayingOf = (said: Words) =>
    [said.side, said.title ?? "", said.label, said.keys ?? ""].join("\n");

  /** The glide in flight: its travel, and its size on the travel's clock. */
  let travel: Animation | null = null;
  let resize: Animation | null = null;
  /** Where the size in flight started: the box drawn when the glide began. */
  let sizedFrom: { h: number; w: number } | null = null;
  /** The words' own size, as `sizer` was last laid out: what the box goes to. */
  let fits: { h: number; w: number } | null = null;

  const timing = (): KeyframeAnimationOptions => ({
    duration: dur("--duration-control"),
    easing: ease("--ease-drawer"),
  });

  /** Its size and offset left to the tooltip's own fit: it is drawn as laid out. */
  const settle = (node: HTMLElement) => {
    travel?.cancel();
    resize?.cancel();
    travel = null;
    resize = null;
    sizedFrom = null;
    node.style.removeProperty("width");
    node.style.removeProperty("height");
  };

  /**
   * The box goes from the size drawn when the glide began to `to`, on the
   * travel's clock: begun again whenever the words' size is known anew, from
   * the same start, so its first frame is never drawn twice.
   */
  const sizeTo = (node: HTMLElement, to: { h: number; w: number }) => {
    if (!sizedFrom) {
      return;
    }
    resize?.cancel();
    node.style.width = `${to.w}px`;
    node.style.height = `${to.h}px`;
    resize = node.animate(
      [
        { width: `${sizedFrom.w}px`, height: `${sizedFrom.h}px` },
        { width: `${to.w}px`, height: `${to.h}px` },
      ],
      timing()
    );
    const started = travel?.startTime ?? null;
    if (started !== null) {
      resize.startTime = started;
    }
    const ran = resize;
    ran.finished.then(
      () => {
        if (resize === ran) {
          sizedFrom = null;
        }
      },
      () => undefined
    );
  };

  /**
   * Stands the tooltip where and as it is drawn, off the item it moves to,
   * and lets its place go to the item's and its size to the new words'
   * (`sizeTo`) on one clock. Both are read before anything is written, so
   * the move costs one layout, and the new words' size is read where the
   * page has been laid out anyway (`sizer`'s observer), never forced.
   */
  const glideTo = (node: HTMLElement, toward: Element, side: string) => {
    const from = node.getBoundingClientRect();
    const to = toward.getBoundingClientRect();
    const across = side === "top" || side === "bottom";
    const room = across
      ? document.documentElement.clientWidth
      : document.documentElement.clientHeight;
    const size = across ? from.width : from.height;
    // Where its wrapper is placed this frame: centred on the item at the
    // size held, kept CLEAR of the viewport's edges as floating-ui keeps it.
    const lands = Math.min(
      Math.max(
        across ? to.left + to.width / 2 : to.top + to.height / 2,
        CLEAR + size / 2
      ),
      room - CLEAR - size / 2
    );
    const off =
      (across ? from.left + from.width / 2 : from.top + from.height / 2) -
      lands;
    travel?.cancel();
    travel = node.animate(
      [
        { transform: across ? `translateX(${off}px)` : `translateY(${off}px)` },
        { transform: "none" },
      ],
      timing()
    );
    sizedFrom = { w: from.width, h: from.height };
    sizeTo(node, fits ?? sizedFrom);
  };

  /** The words' own size, read after each layout that changed it. */
  const measure: Attachment<HTMLElement> = (node) => {
    // biome-ignore lint/style/noRestrictedGlobals: reads only, after the frame's layout: the size the tooltip's box goes to; what it writes is an animation of the tooltip, never of what it observes.
    const watch = new ResizeObserver(([entry]) => {
      const [box] = entry.borderBoxSize;
      fits = { w: box.inlineSize, h: box.blockSize };
      if (tip && sizedFrom) {
        sizeTo(tip, fits);
      } else if (tip?.style.width) {
        // Its words changed size after the glide landed: it takes their size.
        tip.style.width = `${fits.w}px`;
        tip.style.height = `${fits.h}px`;
      }
    });
    watch.observe(node, { box: "border-box" });
    return () => {
      watch.disconnect();
      fits = null;
    };
  };

  // Before the new words are written: what is drawn is the old item's.
  $effect.pre(() => {
    const at = item;
    const now = words;
    const node = tip;
    if (!(open && node && at && now)) {
      drawnFor = null;
      if (node) {
        settle(node);
      }
      return;
    }
    untrack(() => {
      const was = drawnFor;
      drawnFor = { at, said: sayingOf(now) };
      if (was === null || (was.at === at && was.said === drawnFor.said)) {
        return;
      }
      if (!(gliding && motionOk.current)) {
        settle(node);
        return;
      }
      glideTo(node, at, now.side);
    });
  });
</script>

<Root {tether} bind:open>
  {#snippet children({ payload })}
    {#if payload}
      <!-- 8px clear of the viewport's edges: it never touches one. Its words
           stand in its centre, so a box narrower or wider than them for a
           frame of the glide clips them evenly. -->
      <Content collisionPadding={CLEAR} side={payload.side} bind:ref={tip}>
        <!-- The words, clipped to the box (never its arrow, which stands
             outside it) and centred in it, so a box narrower or wider than
             them for a frame of the glide cuts them evenly; MorphText's
             letters stand centred too. -->
        <span
          class="flex min-w-0 flex-auto items-center justify-center gap-1.5 overflow-clip [&_[data-slot=letters]]:text-center"
          >{@render said(payload)}</span
        >
        <!-- The same words laid out unseen at their own size: the size the
             tooltip goes to. -->
        <span
          aria-hidden="true"
          class="pointer-events-none invisible absolute start-0 top-0 inline-flex w-max max-w-80 items-center gap-1.5 px-2.5 py-1.5"
          {@attach measure}
        >
          {@render said(payload, true)}
        </span>
      </Content>
    {/if}
  {/snippet}
</Root>

{#snippet said(payload: Words, plain = false)}
  <span class="whitespace-pre-line"
    >{#if payload.title}
      <strong data-slot="block" class="block font-medium"
        >{#if plain}{payload.title}{:else}<MorphText
            text={payload.title}
          />{/if}</strong
      >
    {/if}{#if plain}{payload.label}{:else}<MorphText
        text={payload.label}
      />{/if}</span
  >
  {#if payload.keys}
    <kbd class="font-sans opacity-70">{payload.keys}</kbd>
  {/if}
{/snippet}
