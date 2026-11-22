<script lang="ts">
  /**
   * The Controls card as the design graph opens it, with no store read: a
   * stage with the graph's tools at its foot, the Controls button in their
   * glass, and the card grown out of that button (GraphCard) holding the
   * agent's dials and the props of the state on the stage (props as docgen
   * reads them, the state's args as its file writes them). It answers his
   * hand as the panel does, its args where each story starts: the button
   * opens and closes the card, Escape and a press outside close it, and a
   * turned dial, a picked value and a picked case of the words stand until
   * he takes them back.
   */
  import type { PropMeta } from "@cawco/core/stage";
  import { graphWords } from "@cawco/core/words/graph";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconTuningLinear } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import PreviewTools from "../preview/PreviewTools.svelte";
  import Dials, { DIALS_CARD_W } from "./Dials.svelte";
  import type { DialValues, GraphDial } from "./dials";
  import GraphCard from "./GraphCard.svelte";
  import { contentCases, propDials, savedOf } from "./prop-dials";

  let {
    dials,
    written,
    values,
    component,
    props,
    args,
    edits,
    longest = {},
    content = null,
    open = true,
    lang,
  }: {
    dials: GraphDial[];
    written: DialValues;
    values: DialValues;
    /** The component the state mounts. */
    component: string;
    /** Its props as the stage's docgen reads them. */
    props: PropMeta[];
    /** The state's args as its file writes them. */
    args: Record<string, unknown>;
    /** His prop values not saved yet. */
    edits: DialValues;
    /** The longest value each prop's own data holds, by name, where it has one. */
    longest?: DialValues;
    /** The words' case he picked, by its name: every text prop it reaches holds its words. */
    content?: string | null;
    /** The card stands open as the story starts. */
    open?: boolean;
    lang: string | undefined;
  } = $props();

  const nothing = () => undefined;
  const saved = $derived(savedOf(props, args));
  const shown = $derived(propDials(props, dials, saved));
  const cases = $derived(contentCases(shown, longest));
  /** The card: the story's, then each press on its button, Escape or a press outside. */
  let standing = $derived(open);
  /** His dial values: the story's, then each one he turns. */
  let turned = $derived(values);
  /** His prop edits: the story's with its picked case's words over the props it reaches, then each he makes. */
  let held = $derived({
    ...edits,
    ...(cases.find((one) => one.label === content)?.fill ?? {}),
  });
  let button = $state<HTMLElement | null>(null);
  let stage = $state<HTMLElement | null>(null);
  let size = $state({ width: 0, height: 0 });
  const without = (from: DialValues, names: string[]): DialValues =>
    Object.fromEntries(
      Object.entries(from).filter(([name]) => !names.includes(name))
    );
  /** A case picked: its words over the props it reaches, the saved words back where it reaches none (Saved: all of them). */
  const pick = (fill: Record<string, string> | null) => {
    const reached = [...new Set(cases.flatMap((one) => Object.keys(one.fill)))];
    held = { ...without(held, reached), ...fill };
  };
</script>

<!-- The stage: the drawing's room, the tools at its foot. -->
<div
  bind:this={stage}
  class="relative h-200 max-h-dvh w-screen max-w-full bg-surface-page contain-layout"
  data-slot="graph-stage"
  {@attach frameSize(
    (node: HTMLElement) => ({
      width: node.clientWidth,
      height: node.clientHeight,
    }),
    (value) => {
      size = value;
    }
  )}
>
  <PreviewTools spread>
    <div></div>
    <div></div>
    <BarGlass form="group">
      <BarItem
        aria-controls={standing ? "graph-card-dials" : undefined}
        icon={IconTuningLinear}
        label={graphWords.dialsFace}
        onclick={() => {
          standing = !standing;
        }}
        pressed={standing}
        bind:ref={button}
      />
    </BarGlass>
  </PreviewTools>
  <GraphCard
    align="end"
    anchor={button}
    boundary={stage}
    id="graph-card-dials"
    inPlace
    label={graphWords.dialsFace}
    onclose={() => {
      standing = false;
    }}
    measure={DIALS_CARD_W}
    open={standing}
    stage={size}
  >
    <Dials
      {dials}
      {lang}
      onchange={(name, value) => {
        turned = { ...turned, [name]: value };
      }}
      onreset={(names) => {
        turned = without(turned, names);
      }}
      state={{
        component,
        props: shown,
        content: { cases, onpick: pick },
        saved,
        edits: held,
        onchange: (name, value) => {
          held = { ...held, [name]: value };
        },
        onreset: (names) => {
          held = without(held, names);
        },
        onsave: nothing,
        onsavenew: nothing,
      }}
      values={turned}
      {written}
    />
  </GraphCard>
</div>
