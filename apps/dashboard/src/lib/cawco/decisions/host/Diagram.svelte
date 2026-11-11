<!--
  A Mermaid diagram drawn by Pele (pele.run, MIT, pinned in package.json:
  "Pin an exact version in production") in its well, drawn as written:
  `render()` with `autoDirection: false` ("Set `autoDirection: false` to
  preserve the source direction", pele.run/api; `mount()` passes the
  container's width as `maxWidth`, and below 640px "a wide `flowchart LR` may
  render as `flowchart TB`"), at its natural size with `responsive: false`,
  and shown at that size, 1 CSS px per px: its well hugs it and scrolls it
  sideways where it is wider (Well.svelte). Its colours and roles are the
  house's (host.css, `[data-slot=diagram]`), so a theme change needs no
  redraw. Links and images in the Mermaid are off, so a page reaches no
  network. "Open as canvas" makes it a canvas in the panel, offered only on
  a decision page (its overlay names the artifact) and only for the types
  @excalidraw/mermaid-to-excalidraw 2.2.2 draws as elements (flowchart,
  sequence, class, state, ER); it draws any other as a picture. The view
  library's Diagram is this one (a view, an agent's block in its reply).

  A Diagram given a size (views-library `DIAGRAM_SIZES`: its agent's pick,
  or `medium` in a block where its program names none, BlockDiagram.svelte)
  draws no
  wider than that size's room: `small` and `medium` their token
  (`c-diagram-small`, `c-diagram-medium`) under its size container's width,
  `full` that whole width (`100cqi`: in a reply, MessageBody's, which takes
  the turn's width once it holds a `full` one, `data-block-wide`), and on a
  phone every size that whole width, the screen's less its padding. An
  unseen ruler of that width tells it the room in px. Pele lays a drawing
  wider than the room out again at it (`maxWidth`: an xychart, a pie and a
  timeline re-lay their axes and words to it, pele.run/api); in a block a
  left-to-right flowchart wider than its room is drawn top to bottom
  (`autoDirection`, at any width: the owner's pin on a sideways-scrolling
  flow), and one that still stands wider is scaled down to
  it, its height following its viewBox, but never below the scale that
  keeps its words at the meta size (`--text-meta` over the label size Pele
  measured them in): past that floor it stands wider than its room and its
  well scrolls it sideways (tsk-330: "nothing scrolls sideways but a
  diagram in its well"), as a decision page's does. A drawing narrower than
  the room stands at its natural size, never scaled up. Its well hugs the
  drawing.
-->
<script lang="ts">
  import { CANVAS_DIAGRAMS } from "@cawco/core/decisions";
  import { DIAGRAM_SIZES, type DiagramSize } from "@cawco/core/views-library";
  import { decisionsWords } from "@cawco/core/words/decisions";
  import { Button } from "#lib/components/ui/button/index.js";
  import { frameSize } from "../../frame-observer.js";
  import { hubRefusal } from "../../hub-read.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { overlayTag } from "./page.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
    statementId,
    block = false,
  }: OpenUIRenderProps<{
    mermaid: unknown;
    caption?: unknown;
    size?: unknown;
  }> & {
    /** It stands in an agent's block (BlockDiagram): with no size it fits the reply (`medium`), and a left-to-right drawing wider than its room is drawn top to bottom. On a decision page or a view an unsized one stands at its natural size, drawn as written. */
    block?: boolean;
  } = $props();

  /** The room each size draws in: its token under the size container's width, or that whole width; on a phone every size takes the whole width. */
  const ROOM: Record<DiagramSize, string> = {
    small: "w-c-diagram-small max-w-[100cqi] max-phone:w-[100cqi]",
    medium: "w-c-diagram-medium max-w-[100cqi]",
    full: "w-[100cqi]",
  };
  const size = $derived(
    DIAGRAM_SIZES.find((one) => one === props.size) ??
      (block ? "medium" : undefined)
  );
  /** Its size's room, px, as its ruler measures it; null until measured. */
  let room = $state<number | null>(null);
  /** The meta text size, px, as the ruler's meta line resolves it: a scaled drawing's words stay at least this size. */
  let meta = $state(0);
  const measureRoom = frameSize(
    (ruler: HTMLElement) => ({
      width: Math.floor(ruler.getBoundingClientRect().width),
      meta: Number.parseFloat(
        getComputedStyle(ruler.firstElementChild ?? ruler).fontSize
      ),
    }),
    ({ width, meta: least }: { width: number; meta: number }) => {
      meta = least;
      if (width > 0 && width !== room) {
        room = width;
      }
    }
  );

  /**
   * The width a drawing `width` px wide stands at: its natural size with no
   * room, else scaled down to its room no further than `least`, the scale
   * at which its words stand at the meta size; never scaled up.
   */
  const shownWidth = (
    width: number,
    cap: number | undefined,
    least: number
  ): number =>
    cap === undefined
      ? width
      : Math.min(width, Math.max(cap, width * Math.min(1, least || 0)));

  /** Whether it can open as a canvas: on a decision page, of a type the converter draws as elements (core `CANVAS_DIAGRAMS`). */
  const drawsAsCanvas = (named: string | null): boolean =>
    CANVAS_DIAGRAMS.some((one) => one === named) &&
    overlayTag().artifact !== null;
  const text = $derived(String(props.mermaid ?? ""));
  let box = $state<HTMLDivElement>();
  let type = $state<string | null>(null);
  let failed = $state("");
  /** Its natural width, px: it is shown at it. */
  let drawn = $state<number | null>(null);
  let opening = $state(false);
  let said = $state("");

  $effect(() => {
    const source = text;
    const element = box;
    // A sized one draws once its room is known, and again as it changes.
    const cap = size ? room : undefined;
    const least = meta;
    if (!element || cap === null) {
      return;
    }
    let gone = false;
    (async () => {
      const pele = await import("pele/lazy");
      // Pele measures labels in the font it is given: the house face, loaded.
      await document.fonts.ready;
      if (gone) {
        return;
      }
      type = pele.detectType(source);
      try {
        const labels = Number.parseFloat(getComputedStyle(element).fontSize);
        const options = {
          links: false,
          images: false,
          autoDirection: false,
          responsive: false,
          fontFamily: getComputedStyle(element).fontFamily,
          fontSize: labels,
        };
        let drawing = await pele.renderAsync(source, options);
        if (cap !== undefined && drawing.width > cap) {
          // Wider than its room: laid out again at it, and in a block turned top to bottom at any width (Pele turns one only under its breakpoint).
          drawing = await pele.renderAsync(source, {
            ...options,
            maxWidth: cap,
            ...(block && {
              autoDirection: true,
              directionBreakpoint: Number.POSITIVE_INFINITY,
            }),
          });
        }
        if (gone) {
          return;
        }
        element.innerHTML = drawing.svg;
        failed = "";
        const svg = element.querySelector("svg");
        const { width, height } = drawing;
        if (svg && width > 0 && height > 0) {
          // Its height follows its viewBox.
          const shown = shownWidth(width, cap, least / labels);
          svg.style.inlineSize = `${shown}px`;
          svg.style.blockSize = "auto";
          drawn = shown;
        } else {
          drawn = null;
        }
      } catch (error) {
        if (!(error instanceof pele.PeleError)) {
          throw error;
        }
        element.textContent = "";
        drawn = null;
        failed = error.message;
      }
    })();
    return () => {
      gone = true;
    };
  });

  async function openAsCanvas() {
    const { artifact } = overlayTag();
    if (!artifact) {
      return;
    }
    opening = true;
    said = "";
    try {
      const response = await fetch(`/__cawco/artifact/${artifact}/canvas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mermaid: text, from: statementId ?? null }),
      });
      if (!response.ok) {
        said = (await hubRefusal(response, decisionsWords.canvasNotOpenedThen))
          .message;
      }
    } catch {
      said = "The canvas didn't open: the hub didn't answer.";
    } finally {
      opening = false;
    }
  }
</script>

{#snippet open()}
  {#if drawsAsCanvas(type)}
    <Button
      data-open-canvas
      disabled={opening}
      onclick={openAsCanvas}
      size="sm"
      variant="ghost">Open as canvas</Button
    >
  {/if}
{/snippet}

{#snippet well()}
  <Well
    action={drawsAsCanvas(type) ? open : undefined}
    caption={props.caption ? String(props.caption) : undefined}
    picture={drawn ?? undefined}
    {said}
  >
    <div bind:this={box} class="type-label flex-none" data-slot="diagram"></div>
    {#if failed}
      <p class="type-meta text-center text-ink-muted wrap-anywhere">{failed}</p>
    {/if}
  </Well>
{/snippet}

{#if size}
  <!-- Its ruler stands out of the flow, so the box hugs the drawing; a `full` one asks its reply for the turn's width. -->
  <div
    class="relative min-w-0"
    data-block-wide={size === "full" || undefined}
    data-diagram-size={size}
  >
    <div
      aria-hidden="true"
      class={[
        "pointer-events-none invisible absolute start-0 top-0 h-0",
        ROOM[size],
      ]}
      data-slot="diagram-room"
      {@attach measureRoom}
    >
      <span class="type-meta"></span>
    </div>
    {@render well()}
  </div>
{:else}
  {@render well()}
{/if}
