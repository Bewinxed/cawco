<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { untrack } from "svelte";
  import { CURVE, dur } from "#lib/cawco/motion/curves.svelte.js";
  import { fold } from "#lib/cawco/motion/fold.svelte.js";
  import { rootOpen } from "./opened";

  let {
    ref = $bindable(null),
    reveal = false,
    fade = false,
    entering = false,
    ...restProps
  }: CollapsiblePrimitive.ContentProps & {
    /**
     * Mounted by the opening itself — a disclosure that builds its content
     * only once it is first opened: it grows open from nothing as it
     * mounts, as a mounted one does when it opens.
     */
    entering?: boolean;
    /**
     * Grow open (240ms) and fold shut (160ms, --dur-exit), both on
     * --ease-out, on the Web Animations API,
     * from whatever height is drawn at the moment, so a toggle caught
     * mid-flight turns back from where it is. bits-ui waits on the fold
     * before it unmounts the content. Each fold announces itself with a
     * bubbling `revealstart` / `revealend`, which the transcript uses to keep
     * its bottom pinned while a row grows.
     */
    reveal?: boolean;
    /** Fade the content in and out with the height. */
    fade?: boolean;
  } = $props();

  /**
   * THE BODY IS BUILT THE FIRST TIME IT IS OPENED. bits-ui's Content renders
   * its children while closed (`hidden`) and measures itself after every
   * tick it is mounted or toggled (2.20.2: `CollapsibleContentState`,
   * `afterTick` → `measureWithoutAnimation`), so a closed disclosure built
   * its whole body and laid the page out for nobody: a transcript scrolled
   * through a page of notes and Reasoning rows built and measured every one.
   * Under the kit's Root (`opened.ts`), nothing is mounted until the Root
   * is first open; then it stays, so a fold shut plays and a reopen turns
   * back from where it is. A body built by the opening grows open from
   * nothing (`entering`); one open as it mounts is drawn open. Under any
   * other Root it mounts at once, as bits-ui's does.
   */
  const open = rootOpen();
  const openAtMount = untrack(() => open?.() ?? true);
  let ever = openAtMount;
  const built = $derived.by(() => {
    if (!ever && (open?.() ?? true)) {
      ever = true;
    }
    return ever;
  });
  const grows = $derived(entering || !openAtMount);

  $effect(() => {
    const node = ref;
    if (!(reveal && node)) {
      return;
    }
    const run = (opening: boolean, from?: number) => {
      const animation = fold(
        node,
        opening,
        {
          ms: dur(opening ? "--dur-pop" : "--dur-exit"),
          easing: CURVE.out,
          fade,
        },
        from
      );
      if (!animation) {
        return;
      }
      node.dispatchEvent(new CustomEvent("revealstart", { bubbles: true }));
      const end = () =>
        node.dispatchEvent(new CustomEvent("revealend", { bubbles: true }));
      animation.finished.then(end, end);
    };
    // bits-ui keeps this element mounted and removes `hidden` a flush after
    // `data-state` turns open: open is read off both, so the fold starts from
    // nothing once the body is open and laid out. Content mounted already
    // open (a first render, a row the virtualiser rebuilt) does not animate.
    const openNow = () =>
      node.getAttribute("data-state") === "open" && !node.hidden;
    let shown = untrack(() => !grows) && openNow();
    if (!shown && openNow()) {
      shown = true;
      run(true, 0);
    }
    const watch = new MutationObserver(() => {
      const now = openNow();
      if (now !== shown) {
        shown = now;
        run(now, now ? 0 : undefined);
      }
    });
    watch.observe(node, {
      attributes: true,
      attributeFilter: ["data-state", "hidden"],
    });
    return () => watch.disconnect();
  });
</script>

{#if built}
  <CollapsiblePrimitive.Content
    data-slot="collapsible-content"
    bind:ref
    {...restProps}
  />
{/if}
