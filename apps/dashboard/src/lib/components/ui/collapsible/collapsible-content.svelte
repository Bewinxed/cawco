<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { untrack } from "svelte";
  import { CURVE } from "$lib/cawco/motion/curves.svelte";
  import { fold } from "$lib/cawco/motion/fold.svelte";

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

  /** Opening, and folding shut: an exit is quicker than an entrance. */
  const OPEN_MS = 240;
  const SHUT_MS = 160;

  $effect(() => {
    const node = ref;
    if (!(reveal && node)) {
      return;
    }
    const run = (open: boolean, from?: number) => {
      const animation = fold(
        node,
        open,
        { ms: open ? OPEN_MS : SHUT_MS, easing: CURVE.out, fade },
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
    let shown = untrack(() => !entering) && openNow();
    if (!shown && openNow()) {
      shown = true;
      run(true, 0);
    }
    const watch = new MutationObserver(() => {
      const open = openNow();
      if (open !== shown) {
        shown = open;
        run(open, open ? 0 : undefined);
      }
    });
    watch.observe(node, {
      attributes: true,
      attributeFilter: ["data-state", "hidden"],
    });
    return () => watch.disconnect();
  });
</script>

<CollapsiblePrimitive.Content
  data-slot="collapsible-content"
  bind:ref
  {...restProps}
/>
