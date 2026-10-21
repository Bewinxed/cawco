<!--
  Every drawn state, one per `?scene=` (scripts/render.ts captures each).
  ctx-*: the settled parts shown as context (Pick 1); p1-* to p4-*, p6-*
  and p7-*: the page's picks 2 to 7 (pick 5 on the page is p4 here, kept
  by the pictures' names), each option in the states that decide it.
  The page in every panel is the dashboard's own routine form
  (RoutinePage), in the dashboard's own artifact panel frame (Panel).
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { PendingFile, PendingImage } from "$kit/cawco/transcript/composer-draft.svelte";
  import { ComposerDraft } from "$kit/cawco/transcript/composer-draft.svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import { IconSend } from "$kit/icons.js";
  import { AGENT, COMMENTS, type Comment, ELEMENTS, type PinState, screenshotData, UNSENT, WITH_ATTACHMENTS } from "./data";
  import Docked from "./parts/Docked.svelte";
  import Float from "./parts/Float.svelte";
  import Marker from "./parts/Marker.svelte";
  import MarkerBoard from "./parts/MarkerBoard.svelte";
  import Panel from "./parts/Panel.svelte";
  import Pin from "./parts/Pin.svelte";
  import RailList from "./parts/RailList.svelte";
  import RoutinePage from "./parts/RoutinePage.svelte";
  import ThreadView from "./parts/ThreadView.svelte";

  const scene = new URLSearchParams(location.search).get("scene") ?? "ctx-rail";

  /** The review's pins on the page, by the element each stands on. */
  interface Placed {
    dot?: "live" | "unread" | null;
    focused?: boolean;
    n: number | null;
    /** Where the marker stands from the point, where the usual up-right has no room. */
    place?: "up-right" | "up-left" | "below";
    state: PinState;
    /** The pressed point across its element, where a scene moves it off the usual spot. */
    x?: string;
    /** The pressed point down its element, likewise. */
    y?: string;
  }
  const statesOf = (rows: Comment[]): Record<string, Placed> => {
    const by = (n: number) => rows.find((row) => row.n === n);
    return {
      create: { n: 14, state: by(14)?.state ?? "sent", dot: by(14)?.live ? "live" : null },
      page: { n: 13, state: by(13)?.state ?? "sent", dot: by(13)?.live ? "live" : null },
      when: { n: 12, state: by(12)?.state ?? "sent", dot: by(12)?.live ? "live" : null },
    };
  };

  const QUIET_UNSENT: Comment[] = [{ ...UNSENT[0], state: "unsent" }, { ...COMMENTS[1], live: false }, COMMENTS[2]];
  const QUIET_SENT: Comment[] = [
    { ...UNSENT[0], state: "sent", age: "now", live: true },
    { ...COMMENTS[1], live: false },
    COMMENTS[2],
  ];
  const ALL_SENT: Comment[] = [
    { ...UNSENT[0], state: "sent", age: "now", live: true },
    { ...UNSENT[1], state: "sent" },
    { ...UNSENT[2], state: "sent" },
  ];

  /** Pick 6's rows: the newest comment is a picture with no words, its row saying the picture's name. */
  const PICTURE_ONLY: Comment[] = [
    { n: 15, on: "What each run does", age: "now", words: "", attachments: [{ kind: "image", name: "ref.png" }], state: "sent" },
    ...COMMENTS,
  ];

  /** A draft holding these words and attachments, as the composer draws it. */
  const draftOf = (images: PendingImage[], files: PendingFile[], text = "", Draft = ComposerDraft) => {
    const draft = new Draft();
    draft.images = images;
    draft.files = files;
    draft.text = text;
    return draft;
  };
  /**
   * Pick 6's "Words required": a draft that has something to send only once
   * it has words. The product has no such rule (the chat composer's
   * `hasContent` counts attachments alone); this draws the option, and the
   * build adds the rule only if it's picked.
   */
  class WordsFirstDraft extends ComposerDraft {
    override hasContent = $derived(this.text.trim().length > 0);
  }
  /** What a comment on the prompt field is about: the field, then its parents. */
  const PROMPT = { target: ELEMENTS.prompt.words, chain: ["Routine form", "Whole page"] };
  const REF: PendingImage = { name: "ref.png", mediaType: "image/png", data: screenshotData() };
  const SPEC_DONE: PendingFile = { id: "spec", name: "spec.csv", mediaType: "text/csv", progress: 1, ref: "/api/files/spec", size: 12_288 };
  const BRIEF_UPLOADING: PendingFile = { id: "brief", name: "brief.pdf", mediaType: "application/pdf", progress: 0.4, size: 2_400_000 };
  const SPEC_FAILED: PendingFile = { id: "spec", name: "spec.csv", mediaType: "text/csv", progress: 0, error: "The hub could not be reached.", size: 12_288 };
  const WORDS = "Move it up, like this.";
</script>

<!-- The review's pins: 14 on Create routine, 12 on When, 13 on the whole page at the well's top-right corner. -->
{#snippet reviewPins(name: string, placed: Record<string, Placed>, shape: "tail" | "stem" = "tail", provisionalOn: string | null = null)}
  {#if name === provisionalOn}
    <!-- Pressed in the field's empty last row: the hollow pin, and the composer it opens, stand clear of its words. -->
    <Pin n={null} {shape} state="provisional" x="46%" y="calc(100% - 4px)" />
  {:else if name === "page" && placed.page}
    <span class="absolute end-space-2 top-space-2 z-10" data-pin="13">
      <Marker dot={placed.page.dot} n={13} state={placed.page.state} tail="none" />
    </span>
  {:else if placed[name]}
    <Pin
      dot={placed[name].dot}
      focused={placed[name].focused}
      n={placed[name].n}
      place={placed[name].place}
      {shape}
      state={placed[name].state}
      x={placed[name].x ?? (name === "when" ? "calc(100% - 24px)" : "calc(100% - 14px)")}
      y={placed[name].y ?? (name === "when" ? "30px" : "6px")}
    />
  {/if}
{/snippet}

{#snippet sendFoot(count: number)}
  <div class="flex flex-col gap-space-2 border-t border-border-hairline p-space-3">
    <Textarea placeholder="Add a note for the agent" rows={1} />
    <div class="flex justify-end">
      <Button size="sm"><IconSend /><span>Send</span><span class="num">{count}</span></Button>
    </div>
  </div>
{/snippet}

<!-- A composer standing on its own, as it stands beside a pin: the chat composer's pill, the pin card's width, no card round it. -->
{#snippet card(caption: string, body: Snippet)}
  <figure class="flex flex-col gap-space-2">
    <div class="relative w-(--c-pin-card-w)" data-float>
      {@render body()}
    </div>
    <figcaption class="type-meta text-ink-muted">{caption}</figcaption>
  </figure>
{/snippet}

<main class="p-5" data-scene={scene}>
  {#if scene === "ctx-rail"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={COMMENTS} />{/snippet}
    </Panel>
  {:else if scene === "ctx-whole"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments height="auto">
      {#snippet page()}<RoutinePage outlined="page">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={COMMENTS} />{/snippet}
    </Panel>
  {:else if scene === "ctx-empty"}
    <!--
      The empty-comment rule, in two frames of the page: pressed with nothing typed, then after Esc or a press
      outside. The composer stands under the field from its start, so what it covers it covers whole.
    -->
    <div class="flex w-fit items-start gap-space-4" data-board>
      {#each ["Pressed, nothing typed", "After Esc or a click outside"] as frame, at (frame)}
        <figure class="flex flex-col gap-space-2">
          <div class="relative w-[370px] overflow-hidden rounded-lg bg-surface-page shadow-tile" data-frame>
            <RoutinePage outlined={at === 0 ? "prompt" : null}>
              {#snippet pin(name)}
                {#if at === 0 && name === "prompt"}
                  <!-- Pressed on the label row's free middle: the narrow field wraps its words to its last row. -->
                  <Pin n={null} state="provisional" x="45%" y="8px" />
                  <div
                    class="absolute start-0 top-[calc(100%+var(--space-2))] z-20 w-(--c-pin-card-w)"
                    data-float
                  >
                    <Docked action="Comment" placeholder="What should change?" {...PROMPT} />
                  </div>
                {/if}
              {/snippet}
            </RoutinePage>
            <span aria-hidden="true" class="pointer-events-none absolute inset-0 z-30 rounded-lg border border-seam"></span>
          </div>
          <figcaption class="type-meta text-ink-muted">{frame}</figcaption>
        </figure>
      {/each}
    </div>
  {:else if scene === "ctx-attach"}
    <!-- What a comment carries (attachments-design §2, §3): attached and done, one still uploading, one that couldn't. -->
    <div class="flex w-fit items-start gap-space-4" data-board>
      {#snippet attached()}<Docked action="Comment" draft={draftOf([REF], [SPEC_DONE], WORDS)} focus={false} placeholder="What should change?" target="Create routine" chain={["Routine form", "Whole page"]} />{/snippet}
      {#snippet uploading()}<Docked action="Comment" draft={draftOf([REF], [BRIEF_UPLOADING], WORDS)} focus={false} placeholder="What should change?" target="Create routine" chain={["Routine form", "Whole page"]} />{/snippet}
      {#snippet failed()}<Docked
          action="Comment"
          chain={["Routine form", "Whole page"]}
          draft={draftOf([], [SPEC_FAILED], WORDS)}
          focus={false}
          placeholder="What should change?"
          sendError="spec.csv didn’t upload. The hub could not be reached. Tap it to try again."
          target="Create routine"
        />{/snippet}
      {@render card("A picture and a file, attached", attached)}
      {@render card("A file still uploading", uploading)}
      {@render card("A file that couldn’t upload", failed)}
    </div>
  {:else if scene === "p1-rail"}
    {@const placed = { ...statesOf(COMMENTS), create: { n: 14, state: "sent" as const, focused: true } }}
    <Panel comments>
      {#snippet page()}<RoutinePage outlined="create">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<ThreadView as="rail" />{/snippet}
    </Panel>
  {:else if scene === "p1-card"}
    <!--
      Pin 14 is pressed at Create routine's bottom-end corner, its marker below the point: the card it opens
      starts under the button and flips left over the page's empty foot, so it covers no button, no pin and no
      line in part (any card crossing the form's full-width test-run sentence would cut it). The panel is tall
      enough for the card to stand there whole.
    -->
    {@const placed = { ...statesOf(COMMENTS), create: { n: 14, state: "sent" as const, focused: true, y: "100%", place: "below" as const } }}
    <Panel height="1040px">
      {#snippet page()}<RoutinePage outlined="create">{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
    </Panel>
    <Float anchor="[data-pin='14'] [data-pin-front]"><ThreadView as="card" /></Float>
  {:else if scene === "p2-tail" || scene === "p2-stem"}
    {@const shape = scene === "p2-tail" ? "tail" : "stem"}
    <Panel mode="interact" open={9}>
      {#snippet page()}
        <RoutinePage>
          {#snippet pin(name)}
            {#if name === "time"}<Pin n={7} {shape} x="calc(100% - 24px)" y="30px" />{/if}
            {#if name === "name"}<Pin n={103} place={shape === "tail" ? "up-left" : "up-right"} shift={shape === "stem" ? "-12px" : "0px"} {shape} x="calc(100% - 6px)" y="40px" />{/if}
            {#if name === "when"}<Pin deck={[111, 110]} n={112} {shape} x="calc(100% - 24px)" y="40px" />{/if}
            {#if name === "prompt"}<Pin n={98} {shape} x="40%" y="calc(100% - 4px)" />{/if}
            {#if name === "create"}<Pin n={108} {shape} x="calc(100% - 14px)" y="6px" />{/if}
          {/snippet}
        </RoutinePage>
      {/snippet}
    </Panel>
  {:else if scene === "p2-tail-board"}
    <MarkerBoard shape="tail" />
  {:else if scene === "p2-stem-board"}
    <MarkerBoard shape="stem" />
  {:else if scene === "p3-send-unsent"}
    {@const placed = statesOf(UNSENT)}
    <Panel comments send={3}>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={UNSENT}>{#snippet foot()}{@render sendFoot(3)}{/snippet}</RailList>{/snippet}
    </Panel>
  {:else if scene === "p3-send-sent"}
    {@const placed = statesOf(ALL_SENT)}
    <Panel ask={`Sent to ${AGENT}`} comments>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={ALL_SENT} />{/snippet}
    </Panel>
  {:else if scene === "p3-quiet-unsent"}
    {@const placed = statesOf(QUIET_UNSENT)}
    <Panel comments>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={QUIET_UNSENT} />{/snippet}
    </Panel>
  {:else if scene === "p3-quiet-sent"}
    {@const placed = statesOf(QUIET_SENT)}
    <Panel comments>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList rows={QUIET_SENT} />{/snippet}
    </Panel>
  {:else if scene === "p4-el-empty" || scene === "p4-el-typed"}
    {@const placed = statesOf(COMMENTS)}
    <Panel>
      {#snippet page()}<RoutinePage outlined="prompt">{#snippet pin(name)}{@render reviewPins(name, placed, "tail", "prompt")}{/snippet}</RoutinePage>{/snippet}
    </Panel>
    <Float anchor="[data-pin='new'] [data-pin-front]" bare>
      <Docked
        action="Comment"
        draft={draftOf([], [], scene === "p4-el-typed" ? "Three rows is too short; show the whole prompt." : "")}
        placeholder="What should change?"
        {...PROMPT}
      />
    </Float>
  {:else if scene === "p4-rail-empty" || scene === "p4-rail-typed"}
    {@const placed = statesOf(COMMENTS)}
    <Panel comments>
      {#snippet page()}<RoutinePage outlined="prompt">{#snippet pin(name)}{@render reviewPins(name, placed, "tail", "prompt")}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}
        <RailList rows={COMMENTS}>
          {#snippet foot()}<div class="px-space-3"><Docked
              action="Comment"
              draft={draftOf([], [], scene === "p4-rail-typed" ? "Three rows is too short; show the whole prompt." : "")}
              placeholder="What should change?"
              {...PROMPT}
            /></div>{/snippet}
        </RailList>
      {/snippet}
    </Panel>
  {:else if scene === "p6-words" || scene === "p6-alone"}
    <!-- Pick 6: a picture with no words. Words required, Comment stays off; attachments alone, it sends, and its row says the picture's name. -->
    {@const alone = scene === "p6-alone"}
    <div class="flex w-fit items-start gap-space-4" data-board>
      {#snippet pictureOnly()}<Docked
          action="Comment"
          draft={draftOf([REF], [], "", alone ? ComposerDraft : WordsFirstDraft)}
          placeholder="What should change?"
          {...PROMPT}
        />{/snippet}
      {@render card(alone ? "A picture, no words: Comment sends it" : "A picture, no words: Comment stays off", pictureOnly)}
      {#if alone}
        <figure class="flex flex-col gap-space-2">
          <div class="flex h-[300px] w-(--c-comments-w) flex-col rounded-lg bg-surface-raised shadow-tile" data-frame data-rail>
            <RailList rows={PICTURE_ONLY} />
          </div>
          <figcaption class="type-meta text-ink-muted">Its row says the picture’s name</figcaption>
        </figure>
      {:else}
        {#snippet withWords()}<Docked
            action="Comment"
            draft={draftOf([REF], [], "Show it all, like this.", WordsFirstDraft)}
            focus={false}
            placeholder="What should change?"
            {...PROMPT}
          />{/snippet}
        {@render card("With a sentence, Comment sends", withWords)}
      {/if}
    </div>
  {:else if scene === "p7-count" || scene === "p7-strip"}
    <!-- Pick 7: how a row shows what its comment carries. -->
    {@const placed = statesOf(COMMENTS)}
    <Panel comments>
      {#snippet page()}<RoutinePage>{#snippet pin(name)}{@render reviewPins(name, placed)}{/snippet}</RoutinePage>{/snippet}
      {#snippet rail()}<RailList mark={scene === "p7-count" ? "count" : "strip"} rows={WITH_ATTACHMENTS} />{/snippet}
    </Panel>
  {/if}
</main>
