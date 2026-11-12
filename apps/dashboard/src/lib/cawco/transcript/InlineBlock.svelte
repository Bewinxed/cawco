<script lang="ts">
  import { transcriptWords } from "@cawco/core/words/transcript";
  /**
   * A block an agent drew inside its reply: an OpenUI Lang program over the
   * block library, drawn in the transcript (tsk-330). It shows what the
   * agent saw when it wrote it; nothing in it updates in place.
   *
   * It has no head: a title is the program's own, where the agent wants one.
   * Its act, Keep as artifact, is a bare symbol in one capsule of glass
   * standing over its top trailing corner, in the room the block keeps
   * above itself (`c-block-act-room`), never over its content: a short
   * block (a sound's row, a failure's line) keeps its own controls and
   * words clear of it. The room is kept from its first word, while it is
   * still written, so nothing moves when the capsule comes. Its body is the
   * program's own surfaces (a ledger, stat tiles) standing in the reply: the
   * block draws no card of its own round them (The Frame Recesses Rule).
   *
   * - `latest`: the newest version under its name, with Keep as artifact.
   * - `fossil`: a newer version under the same name came later in the
   *   conversation. It folds to its first rows under the scrim (the scrim's
   *   fill: the page's background at --scrim-mix, no blur, so a long
   *   transcript of replaced blocks scrolls with no filter to redraw), and
   *   one capsule of glass on the veil says so and jumps to the newest.
   * - `promoted`: the block was kept as an artifact. It stays whole and live
   *   as the newest draws (the owner's pin on MovedToArtifact: "moving a
   *   panel to an artifact doesn't justify that it gets removed from the
   *   block"); only its act changes, Keep as artifact giving way to Open
   *   and the artifact's title, which opens the kept page in the panel. A
   *   kept block a later version replaces folds as any replaced one does.
   *
   * It is as wide as what it shows, never wider (a Diagram hugs its
   * drawing), save a Table, which stands its room (its ledger asks no width
   * of its own).
   *
   * A folded block draws its program once, then stands as that drawing in
   * plain markup (`frozen`, handed back by `onfreeze` once it has settled):
   * a transcript of replaced blocks holds no live renderer.
   *
   * Its pictures, clips, sounds and pages read through what the transcript
   * gives (block-media.ts). Folded, they stand as stills: no player and no
   * frame, so its clip playing stops as it is replaced, and its frozen
   * drawing holds none.
   */
  import type { OpenUIError, ParseResult } from "@openuidev/lang-core";
  import OutputBlock from "#lib/components/features/tool-cards/OutputBlock.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconArtifactPageLinear } from "#lib/icons.js";
  import { animatedCaw } from "../home/FaultCaw.svelte";
  import {
    blockSourcesHere,
    provideBlockMedia,
  } from "../views/openui/block-media";
  import { BLOCK_LIBRARY } from "../views/openui/library";
  import OpenUiRenderer from "../views/openui/OpenUiRenderer.svelte";

  let {
    name,
    source,
    mode = "latest",
    streaming = false,
    artifact = null,
    frozen,
    marked,
    keeping = false,
    said = "",
    onjump,
    onkeep,
    onopen,
    onfreeze,
  }: {
    /** The block's name: a later block under it is its newer version, and its accessible name. */
    name: string;
    /** The program as the agent wrote it. */
    source: string;
    /** What it is now: the newest under its name, replaced, or kept. */
    mode?: "latest" | "fossil" | "promoted";
    /** The agent is still writing it. */
    streaming?: boolean;
    /** The artifact it moved into, once promoted. */
    artifact?: { title: string } | null;
    /** Its folded drawing as plain markup, cloned in instead of drawing the program again. */
    frozen?: Element;
    /** Jumped to: the selection tint over it, fading in, then out (`off`). */
    marked?: "on" | "off";
    /** Keep as artifact is on its way. */
    keeping?: boolean;
    /** Why Keep as artifact didn't keep it, in the hub's words. */
    said?: string;
    onjump?: () => void;
    onkeep?: () => void;
    onopen?: () => void;
    /** Its folded drawing, once it has settled: the host keeps it and hands it back as `frozen`. */
    onfreeze?: (drawn: Element) => void;
  } = $props();

  const still = $derived(mode === "fossil");

  const sources = blockSourcesHere();
  provideBlockMedia({
    src: (file) => sources?.src(file) ?? null,
    open: (shots, index) => sources?.open(shots, index),
    ...(sources?.pages ? { pages: sources.pages } : {}),
    get still() {
      return still;
    },
  });

  /** It doesn't parse into anything it can draw: it stands as the code it is. */
  let unparsed = $state(false);
  /** Its act stands (Keep as artifact, or Open once kept): a block not replaced, written whole and read. */
  const actShown = $derived(!(still || streaming || unparsed));
  function parsed(result: ParseResult | null) {
    unparsed = !result?.root;
  }

  /** Parts of the program the library lacks, named under it as a view's are. */
  let dropped = $state<string[]>([]);
  function reported(errors: OpenUIError[]) {
    dropped = [
      ...new Set(
        errors
          .filter((error) => error.code === "unknown-component")
          .map((error) => ("component" in error ? String(error.component) : ""))
          .filter(Boolean)
      ),
    ];
  }

  /** How long a drawing stands with nothing changing before it counts as settled, and the most a settle waits. */
  const QUIET_MS = 250;
  const SETTLE_MAX_MS = 3000;

  /**
   * Hands its folded drawing to `onfreeze` once it has settled: the house
   * faces loaded and nothing in it changing for {@link QUIET_MS} (a Diagram
   * draws a moment after the rest), at most {@link SETTLE_MAX_MS}. The
   * markup handed on carries no mark of a live renderer.
   */
  function freezeWhenSettled(body: HTMLElement) {
    if (!onfreeze) {
      return;
    }
    let gone = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const give = () => {
      if (gone) {
        return;
      }
      gone = true;
      watch.disconnect();
      clearTimeout(cap);
      const drawn = body.cloneNode(true) as Element;
      for (const live of drawn.querySelectorAll(
        "[data-open-ui-renderer-class]"
      )) {
        live.removeAttribute("data-open-ui-renderer-class");
      }
      onfreeze?.(drawn);
    };
    const again = () => {
      clearTimeout(quiet);
      quiet = setTimeout(give, QUIET_MS);
    };
    const watch = new MutationObserver(again);
    const cap = setTimeout(give, SETTLE_MAX_MS);
    document.fonts.ready.then(() => {
      watch.observe(body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      again();
    });
    return () => {
      gone = true;
      watch.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
    };
  }

  /** Stands its frozen drawing in, a copy each time it is drawn. */
  const standFrozen = (drawn: Element) => (box: HTMLElement) => {
    box.replaceChildren(drawn.cloneNode(true));
  };
</script>

<!-- No title of its own: what the block is called is the program's to say
     (a Text in it), as any heading in the reply is the agent's. Its name is
     the key a later version replaces it by, and its accessible name. A block
     jumped to wears the row's mark (Row.svelte): the selection tint over it,
     a well's step past its edges, fading in and out. -->
<figure
  aria-label={name}
  data-slot="inline-block"
  data-state={mode}
  data-marked={marked}
  data-acts={still ? undefined : ""}
  style:--mark-in={marked
    ? "kit-fade-in var(--duration-panel) var(--ease-out)"
    : undefined}
  class="group/block relative my-space-4 data-acts:mt-10.75 w-fit max-w-full min-w-0 has-data-[slot=ledger]:w-auto data-marked:before:pointer-events-none data-marked:before:absolute data-marked:before:-inset-space-2 data-marked:before:rounded-well data-marked:before:bg-selection motion-safe:data-marked:before:animate-(--mark-in) marked-off:before:opacity-0 motion-safe:data-marked:before:transition-opacity motion-safe:data-marked:before:duration-(--duration-panel) motion-safe:data-marked:before:ease-out"
>
  {#if still}
    <!-- Replaced: its first rows as they were drawn, under the scrim, inert; the one act is the capsule standing on the veil. -->
    <div
      data-slot="block-body"
      class="relative max-h-c-inline-block-fossil-h min-w-0 overflow-hidden"
    >
      {#if frozen}
        <div data-frozen inert {@attach standFrozen(frozen)}></div>
      {:else}
        <div inert {@attach freezeWhenSettled}>
          <OpenUiRenderer
            caw={animatedCaw}
            class="min-w-0"
            label={`block "${name}"`}
            library={BLOCK_LIBRARY}
            onError={reported}
            response={source}
          />
        </div>
      {/if}
      <div
        aria-hidden="true"
        data-slot="fossil-veil"
        class="pointer-events-none absolute inset-0 bg-scrim"
      ></div>
      <div class="absolute inset-0 grid place-items-center">
        <BarGlass form="group">
          <BarItem
            form="words"
            label={transcriptWords.jumpToLatestVersion}
            onclick={onjump}
            tip={false}
          >
            {transcriptWords.jumpToLatestVersion}
          </BarItem>
        </BarGlass>
      </div>
    </div>
  {:else}
    <div data-block-gallery data-slot="block-body" class="min-w-0">
      <OpenUiRenderer
        caw={animatedCaw}
        class="min-w-0"
        isStreaming={streaming}
        label={`block "${name}"`}
        library={BLOCK_LIBRARY}
        onError={reported}
        onParseResult={parsed}
        response={source}
      />
      {#if unparsed && !streaming}
        <div class="not-prose" data-block-unparsed>
          <OutputBlock language="openui" text={source} />
        </div>
      {/if}
    </div>
    <!-- Its act floats at its top trailing corner (The Title Bars Follow
         Liquid Glass Rule: "A panel opened by its name carries none, its
         actions floating over its content"), lifted into the room the block
         keeps above itself, so it never stands on what the block holds;
         its pad bridges the step to the block, so the hover holds on the
         way up to it. There under a hover or focus on a desk, always under
         a finger. -->
    {#if actShown}
      <div
        class="absolute end-0 bottom-full pb-space-2 opacity-0 transition-opacity duration-(--duration-fade) group-hover/block:opacity-100 focus-within:opacity-100 coarse:opacity-100"
      >
        <BarGlass form="group">
          {#if mode === "promoted"}
            <BarItem
              form="words"
              label={transcriptWords.openArtifact(artifact?.title ?? name)}
              onclick={onopen}
              tip={false}
            >
              {transcriptWords.openArtifact(artifact?.title ?? name)}
            </BarItem>
          {:else}
            <BarItem
              aria-busy={keeping || undefined}
              icon={IconArtifactPageLinear}
              label={transcriptWords.keepAsArtifact}
              onclick={onkeep}
            />
          {/if}
        </BarGlass>
      </div>
    {/if}
  {/if}
  {#if !streaming && dropped.length > 0}
    <figcaption
      class="mt-space-2 type-meta text-ink-muted wrap-anywhere"
      data-block-dropped={dropped.join(", ")}
    >
      {transcriptWords.blockDropped(dropped)}
    </figcaption>
  {/if}
  {#if said}
    <p
      class="mt-space-2 type-meta text-status-fail-ink wrap-anywhere"
      role="status"
    >
      {said}
    </p>
  {/if}
</figure>
