<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  /**
   * An agent's block where its reply stands in a transcript (tsk-330): the
   * named `openui` fence markdown hands over, drawn as InlineBlock in the
   * state its conversation gives it (inline-blocks.svelte.ts).
   *
   * - It draws only near the viewport: until then, and whenever its row is
   *   built again, a box of its measured height stands in its place, so the
   *   list keeps its size and nothing jumps. A block being written, or one
   *   already frozen, draws at once.
   * - A replaced or kept block draws once and is frozen to plain markup,
   *   kept for the conversation outside the row, so it never draws its
   *   program again.
   * - Keep as artifact makes a page of its program on the session's panel
   *   (artifact-api.ts `keepBlock`); the block turns `promoted` once the
   *   session's artifacts list it, and its capsule opens it there.
   */
  import { inlineBlockSlug } from "@cawco/core/inline-blocks";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { keepBlock, showArtifact } from "../artifact-api";
  import { revealPreview } from "../client.svelte";
  import { readArtifacts } from "../files/files.svelte";
  import { frameSize } from "../frame-observer";
  import { failureWords } from "../hub-read";
  import type { MarkdownBlockProps } from "../markdown-blocks";
  import { motionOk } from "../motion/curves.svelte";
  import InlineBlock from "./InlineBlock.svelte";
  import {
    type BlockPlace,
    blockKey,
    type ConversationBlocks,
    inlineBlocksHere,
    keptOf,
  } from "./inline-blocks.svelte";

  let { at, name, source, streaming }: MarkdownBlockProps = $props();

  /** The conversation it is drawn in: Transcript provides it with this component. */
  const blocks: ConversationBlocks =
    inlineBlocksHere() ??
    (() => {
      throw new Error("A transcript block is drawn inside a transcript.");
    })();

  const place: BlockPlace = $derived({
    at,
    name,
    nth: blocks.nthOf(at, name, source),
  });
  const key = $derived(blockKey(blocks.instanceId, place));
  const mode = $derived(blocks.stateOf(place));
  const artifact = $derived(
    mode === "promoted" ? blocks.keptAs(name) : undefined
  );
  const still = $derived(mode !== "latest");

  /** Its frozen drawing, from the conversation's keep when it has one. */
  let frozen = $state<Element | undefined>();
  $effect.pre(() => {
    frozen = still ? keptOf(key).frozen : undefined;
  });
  function freeze(drawn: Element) {
    keptOf(key).frozen = drawn;
    frozen = drawn;
  }

  /** It has come near the viewport once while its row stands: it draws. */
  let near = $state(false);
  const draws = $derived(near || streaming || frozen !== undefined);
  /** The room it stands in until it draws: its measured height, else its fold or an estimate. */
  const room = $derived(keptOf(key).height);

  let box = $state<HTMLElement>();
  $effect(() => {
    const element = box;
    if (!element || draws) {
      return;
    }
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          near = true;
        }
      },
      // A screen above and below: it is drawn before it scrolls into view.
      { rootMargin: "100% 0px" }
    );
    seen.observe(element);
    return () => seen.disconnect();
  });
  /** Keeps its drawn height for its next build, read in the next frame (frame-observer.ts). */
  const measured = (node: HTMLElement) =>
    frameSize(
      () => node.getBoundingClientRect().height,
      (height: number) => {
        if (height > 0) {
          keptOf(key).height = height;
        }
      }
    )(node);

  /** Jumped to: marked, and brought to the middle of the view once drawn. */
  const marked = $derived(
    blocks.marked?.key === key ? blocks.marked.state : undefined
  );
  $effect(() => {
    if (marked !== "on" || !box || !draws) {
      return;
    }
    const element = box;
    requestAnimationFrame(() =>
      bringIntoView(element, {
        at: "third",
        behavior: motionOk.current ? "smooth" : "auto",
      })
    );
  });

  let keeping = $state(false);
  let said = $state("");
  async function keep() {
    if (keeping) {
      return;
    }
    keeping = true;
    said = "";
    try {
      await keepBlock(blocks.instanceId, {
        name: inlineBlockSlug(name),
        title: name,
        ask: transcriptWords.keptBlockAsk(name),
        program: source,
      });
      revealPreview(blocks.instanceId);
      await readArtifacts(blocks.instanceId);
    } catch (error) {
      said = failureWords(error);
    } finally {
      keeping = false;
    }
  }

  async function open() {
    if (!artifact) {
      return;
    }
    said = "";
    try {
      await showArtifact(blocks.instanceId, artifact.id);
      revealPreview(blocks.instanceId);
    } catch (error) {
      said = failureWords(error);
    }
  }
</script>

<div bind:this={box} class="min-w-0" data-block-key={key}>
  {#if draws}
    <div {@attach measured}>
      <InlineBlock
        artifact={artifact ?? null}
        {frozen}
        {keeping}
        {marked}
        {mode}
        {name}
        onfreeze={still ? freeze : undefined}
        onjump={() => blocks.jump(name)}
        onkeep={keep}
        onopen={open}
        {said}
        {source}
        {streaming}
      />
    </div>
  {:else}
    <!-- Its place until it draws: its height as last drawn, else a fold's. -->
    <figure
      aria-label={name}
      class={[
        "my-space-4",
        room === undefined ? "h-c-inline-block-fossil-h" : "h-(--room)",
      ]}
      data-slot="inline-block-room"
      style:--room={room === undefined ? undefined : `${room}px`}
    ></figure>
  {/if}
</div>
