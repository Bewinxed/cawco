<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { CURVE } from "$lib/whiffle/motion/curves.svelte";
  import { fold } from "$lib/whiffle/motion/fold.svelte";

  let {
    ref = $bindable(null),
    reveal = false,
    fade = false,
    ...restProps
  }: CollapsiblePrimitive.ContentProps & {
    /**
     * Grow open and fold shut (240ms, --ease-out) on the Web Animations API,
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

  const MS = 240;

  $effect(() => {
    const node = ref;
    if (!(reveal && node)) {
      return;
    }
    const run = (open: boolean, from?: number) => {
      const animation = fold(
        node,
        open,
        { ms: MS, easing: CURVE.out, fade },
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
    // bits-ui marks content it has just opened with data-starting-style for
    // one frame; content mounted already open (a first render, a row the
    // virtualiser rebuilt) carries no mark and does not animate.
    if (node.hasAttribute("data-starting-style")) {
      run(true, 0);
    }
    const watch = new MutationObserver(() => {
      run(node.getAttribute("data-state") === "open");
    });
    watch.observe(node, { attributes: true, attributeFilter: ["data-state"] });
    return () => watch.disconnect();
  });
</script>

<CollapsiblePrimitive.Content
  data-slot="collapsible-content"
  bind:ref
  {...restProps}
/>
