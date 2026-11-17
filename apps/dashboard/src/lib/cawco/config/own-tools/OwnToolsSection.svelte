<script lang="ts">
  /**
   * Configure › Helpers & step lists (core own-tools.ts): whether sessions
   * use CawCo's delegates and plan list, or their agent's own subagents,
   * to-do list and plan mode, as two switches (the owner's pick on decision
   * page `harness-tools-shape`). Each pick saves at once and reaches every
   * machine; a session takes it as it starts, so the foot says how many
   * running sessions keep what they started with.
   *
   * Every value comes in as props (the route reads the store), so the bench
   * draws it with no hub.
   */
  import type {
    Helpers,
    OwnToolsChosen,
    StepLists,
  } from "@cawco/core/own-tools";
  import { ownToolsWords as words } from "@cawco/core/words/own-tools";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import type {
    OwnToolPick,
    SavePhase,
  } from "#lib/cawco/stores/own-tools.svelte.js";
  import { IconListCheck, IconSubagent } from "#lib/icons.js";
  import ToolChoice from "./ToolChoice.svelte";

  let {
    chosen,
    phases,
    faults,
    running,
    unread = null,
    onchoose,
  }: {
    /** The sides shown, each null while no person has chosen it; null until read. */
    chosen: OwnToolsChosen | null;
    phases: { helpers: SavePhase; stepLists: SavePhase };
    faults: { helpers: string | null; stepLists: string | null };
    /** Sessions running across the fleet now. */
    running: number;
    /** Why the switches couldn't be read. */
    unread?: string | null;
    onchoose: (pick: OwnToolPick) => void;
  } = $props();

  const section = sectionOf("helpers");
</script>

<SectionFrame
  problem={unread}
  ready={chosen !== null || unread !== null}
  {section}
>
  {#if chosen}
    <div class="flex flex-col gap-space-5" data-slot="own-tools">
      <ToolChoice
        fault={faults.helpers}
        heading={words.helpers.heading}
        hue={section.hue}
        icon={IconSubagent}
        id="helpers"
        lines={words.helpers.lines}
        onchoose={(value: Helpers) => onchoose({ key: "helpers", value })}
        options={words.helpers.options}
        phase={phases.helpers}
        recommended="delegates"
        value={chosen.helpers}
      />
      <ToolChoice
        fault={faults.stepLists}
        heading={words.stepLists.heading}
        hue="var(--color-mark-4)"
        icon={IconListCheck}
        id="step-lists"
        lines={words.stepLists.lines}
        onchoose={(value: StepLists) => onchoose({ key: "stepLists", value })}
        options={words.stepLists.options}
        phase={phases.stepLists}
        recommended="cawco"
        value={chosen.stepLists}
      />
      <!-- True of both switches, so at the foot under both. -->
      <div
        class="flex max-w-c-measure flex-col gap-space-1 border-t border-border-hairline pt-space-4 type-meta text-pretty text-ink-muted"
      >
        <p class="m-0">{words.untouched}</p>
        {#if running > 0}
          <p class="m-0">{words.stillRunning(running)}</p>
        {/if}
      </div>
    </div>
  {/if}
</SectionFrame>
