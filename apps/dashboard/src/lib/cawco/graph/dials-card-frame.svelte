<script lang="ts">
  /**
   * The Dials card where the artifact panel raises it from its tools over
   * the drawing's foot, with no store read: the kit's floating surface at
   * the reading measure, no taller than half the stage, holding the agent's
   * dials and the props of the state on the stage (props as docgen reads
   * them, the state's args as its file writes them). It answers his hand as
   * the panel does, its args where each story starts: a turned dial, a typed
   * prop and a picked case of the words stand until he takes them back.
   */
  import type { PropMeta } from "@cawco/core/stage";
  import { MediaQuery } from "svelte/reactivity";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import Dials from "./Dials.svelte";
  import type { DialValues, GraphDial } from "./dials";
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
    lang: string | undefined;
  } = $props();

  /** The stage's height the card is held to half of: a 1440 desk's panel, a 390 phone's. */
  const phone = new MediaQuery(PHONE_QUERY);
  const stage = $derived(phone.current ? 700 : 820);
  const nothing = () => undefined;
  const saved = $derived(savedOf(props, args));
  const shown = $derived(propDials(props, dials, saved));
  const cases = $derived(contentCases(shown, longest));
  /** His dial values: the story's, then each one he turns. */
  let turned = $derived(values);
  /** His prop edits: the story's with its picked case's words over the text props it reaches, then each he makes. */
  let held = $derived({
    ...edits,
    ...(cases.find((one) => one.label === content)?.fill ?? {}),
  });
  const without = (from: DialValues, names: string[]): DialValues =>
    Object.fromEntries(
      Object.entries(from).filter(([name]) => !names.includes(name))
    );
  /** A case picked: its words over the text props it reaches, the saved words back where it reaches none (Saved: all of them). */
  const pick = (fill: Record<string, string> | null) => {
    const reached = [...new Set(cases.flatMap((one) => Object.keys(one.fill)))];
    held = { ...without(held, reached), ...fill };
  };
  /**
   * The card hugs the controls' grid (Dials' columns, their two gaps, its
   * pad and edge), never past the reading measure, so no strip of the card
   * stands empty beside the undo glyphs.
   */
  const CARD_W =
    "min(var(--spacing-c-measure), calc(var(--spacing-c-graph-move-name-w) + var(--spacing-c-graph-control-w) + var(--spacing-c-btn-h-xs) + 4 * var(--spacing-space-3) + 2px))";
</script>

<div
  class="flex justify-center bg-surface-page px-space-3 pt-space-5 pb-space-6"
>
  <div
    class={floatingSurface({
      class:
        "flex max-h-(--card-max) w-full max-w-(--card-w) flex-col p-space-3",
    })}
    data-slot="dials-card"
    style:--card-max={`${stage / 2}px`}
    style:--card-w={CARD_W}
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
  </div>
</div>
