<script lang="ts">
  /**
   * The body of every disclosure in the transcript — a tool call's input and
   * result, a harness note's report, a subagent's or delegate's run, a block
   * of reasoning. It stands where `Collapsible.Content` stands, inside a
   * `Collapsible.Root`.
   *
   * It opens by growing from nothing to its height and folds back to nothing
   * before it is taken down (--dur-panel, --ease-out, fading as it goes); a
   * fold caught mid-way turns back from where it is. The body exists exactly
   * while it is open or folding shut: bits keeps the content element mounted
   * (`forceMount`) and never hides it, so a body that has just opened is
   * already laid out and can be measured the moment it mounts. A disclosure
   * that is simply open when it mounts — the row scrolled back, the pane come
   * back — is open, and nothing moves.
   *
   * It says so as it moves (`revealstart` / `revealend`, bubbling, from the
   * body, which carries `data-state`): the transcript pins its bottom to a
   * reasoning block folding shut, and lets go of the tail for anything the
   * reader opens, so the header they clicked stays where it was.
   */
  import { Collapsible } from "bits-ui";
  import type { Snippet } from "svelte";
  import { motionOk } from "$lib/whiffle/motion/curves.svelte";

  let {
    children,
    ...rest
  }: { children: Snippet } & Omit<
    Collapsible.ContentProps,
    "children" | "child" | "forceMount"
  > = $props();

  /** Whether the body is in the document: open, or still folding shut. */
  let shown = $state(false);
  let body = $state<HTMLElement>();
  /** What `open` was last time: null until the first reading, which lands as it is. */
  let was: boolean | null = null;
  /** Opened by the reader since it last mounted: it grows when it does. */
  let grow = false;
  let fold: Animation | null = null;

  function tween(node: HTMLElement, from: number, to: number): Animation {
    const style = getComputedStyle(node);
    node.style.overflow = "hidden";
    node.dispatchEvent(new CustomEvent("revealstart", { bubbles: true }));
    const animation = node.animate(
      [
        { blockSize: `${from}px`, opacity: from === 0 ? 0 : 1 },
        { blockSize: `${to}px`, opacity: to === 0 ? 0 : 1 },
      ],
      {
        duration: Number.parseFloat(style.getPropertyValue("--dur-panel")),
        easing: style.getPropertyValue("--ease-out"),
        fill: "forwards",
      }
    );
    const end = (): void => {
      node.dispatchEvent(new CustomEvent("revealend", { bubbles: true }));
    };
    animation.finished.then(end, end);
    return animation;
  }

  /** An opening tween that has run is dropped: the body keeps its own height. */
  function release(node: HTMLElement, animation: Animation): void {
    animation.finished.then(
      () => {
        animation.cancel();
        node.style.overflow = "";
      },
      () => {
        /* superseded by the next tween, which owns the body now */
      }
    );
  }

  function toggled(open: boolean): void {
    if (was === null || !motionOk.current) {
      was = open;
      shown = open;
      return;
    }
    if (open === was) {
      return;
    }
    was = open;
    if (open && fold && body) {
      // Folding shut and opened again: it turns back from where it is.
      const drawn = body.getBoundingClientRect().height;
      fold.cancel();
      fold = null;
      body.setAttribute("data-state", "open");
      release(body, tween(body, drawn, body.getBoundingClientRect().height));
      return;
    }
    if (open) {
      grow = true;
      shown = true;
      return;
    }
    if (!body) {
      shown = false;
      return;
    }
    const node = body;
    node.setAttribute("data-state", "closed");
    const animation = tween(node, node.getBoundingClientRect().height, 0);
    fold = animation;
    animation.finished.then(
      () => {
        fold = null;
        shown = false;
      },
      () => {
        /* opened again mid-fold */
      }
    );
  }

  /** Follows the disclosure's own open state, off the content element. */
  const follows = (open: boolean) => () => toggled(open);

  function grows(node: HTMLElement): void {
    body = node;
    if (grow) {
      grow = false;
      release(node, tween(node, 0, node.getBoundingClientRect().height));
    }
  }
</script>

<Collapsible.Content forceMount {...rest}>
  {#snippet child({ open, props })}
    <div {...props} {@attach follows(open)}>
      {#if shown}
        <div class="unfold" data-state="open" {@attach grows}>
          {@render children()}
        </div>
      {/if}
    </div>
  {/snippet}
</Collapsible.Content>

<style>
  /* Its own block formatting context, so the height it opens to — margins
     and all — is the height it keeps once the tween is gone. */
  .unfold {
    display: flow-root;
  }
</style>
