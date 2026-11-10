<!--
  A project's setup (the decision library's `Setup`; the project-setup
  skill): Caw drafts it as data and the person shapes it in place. The
  page's title is the project's name, renamed where it stands (SetupTitle,
  in the page's head), and its Send names it ("Set up <name>", Decisions).

  Under the title the draft is drawn by the board's own editor
  (DraftStages: what the project is for, then each stage as the column it
  becomes, DraftColumn), the one editor of a setup draft (decision page
  `onboarding-first-minutes`, card `draft-where`): the project's board
  draws the same parts over the same picks, so the page and the board never
  differ. The delegate types Caw proposed are who may do a stage's work,
  picked in a stage's menu, as on the board.

  Every change is kept through the page's bridge (`cawco.set`, hub
  setup.ts): `aim`, `stages` and, as drafted, `shape`; the name is
  SetupTitle's. A reload or a revision draws what the hub kept.
-->
<script lang="ts">
  import DraftStages from "../../project/DraftStages.svelte";
  import {
    draftedOf,
    type Stage,
    stageOf,
    storedStages,
  } from "../../project/setup-stage";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{
    name: unknown;
    aim: unknown;
    stages: unknown[];
    delegates?: unknown[];
    shape?: unknown;
  }> = $props();

  const drafted = $derived(draftedOf(props));

  /** What the hub kept under a key, or undefined. */
  const kept = (key: string): unknown => picks.now[key]?.value ?? undefined;

  // The person's edits: what the hub kept wins over the draft, so a reload
  // or a revision draws them as they stood; once they edit, their own.
  let aim = $state("");
  let stages = $state<Stage[]>([]);
  let editing = false;
  $effect(() => {
    const keptAim = kept("aim");
    const keptStages = kept("stages");
    if (editing) {
      return;
    }
    aim = typeof keptAim === "string" ? keptAim : drafted.aim;
    stages = Array.isArray(keptStages)
      ? keptStages.map((one) => stageOf(one))
      : drafted.stages;
  });
  // What it starts from, as drafted, kept once.
  $effect(() => {
    const shape = props.shape ? String(props.shape) : "";
    if (shape && kept("shape") === undefined) {
      bridge()?.set("shape", shape);
    }
  });
  /** The delegate types it proposes, less those the hub kept as removed (setup-draft.svelte.ts `delegates`). */
  const delegates = $derived.by(() => {
    const keptIds = kept("delegates");
    return Array.isArray(keptIds)
      ? drafted.delegates.filter((one) => keptIds.includes(one.id))
      : drafted.delegates;
  });

  /** Kept at once, as the board keeps each change (setup-draft.svelte.ts `keep`). */
  function keep(key: "aim" | "stages", value: unknown): void {
    editing = true;
    bridge()?.set(key, value);
  }
</script>

<section class="flex min-w-0 flex-col gap-space-4" data-slot="setup">
  <DraftStages
    {aim}
    {delegates}
    onaim={(next) => {
      aim = next;
      keep("aim", next);
    }}
    onstages={(next) => {
      stages = next;
      keep("stages", storedStages(next));
    }}
    {stages}
  />
</section>
