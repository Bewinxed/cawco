<script lang="ts">
  /**
   * Today's three surfaces called Caw's panel, fed fixtures with no hub
   * (advisor report §0), on card 1's asks and conversation:
   *
   * - `bar-head`: the bar head's card (NeedsCaw → home/CawPanel), the
   *   fleet's Needs you, hung as the caw-notices bench hangs it.
   * - `thread`: the floating thread (CawFloat → project/CawThread) on card
   *   1's conversation: its head as it ships (TodayHead) over the same room
   *   and message box one panel draws, with none of the asks in it. The
   *   shipped ThreadPane reads its messages from the hub, so it can't draw
   *   a conversation here.
   * - `switch`: the ⋯ card (project/CawPanel): his sentence and the switch.
   *
   * Each stands on the desk's page ground at the width it ships at.
   */
  import type { ProjectRow } from "#lib/cawco/client.svelte.js";
  import CawPanel from "#lib/cawco/home/CawPanel.svelte";
  import type { CawFeed } from "#lib/cawco/home/caw-feed.svelte.js";
  import type {
    AskItem,
    NeedsItem,
  } from "#lib/cawco/home/home-state.svelte.js";
  import SwitchCard from "#lib/cawco/project/CawPanel.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { PROJECT } from "./fixtures";
  import PanelScreen from "./PanelScreen.svelte";

  let { surface }: { surface: "bar-head" | "thread" | "switch" } = $props();

  const PROJECT_ID = "harbour-site";

  /** His project as the hub lists it: Caw on, no session started yet. */
  const ROW: ProjectRow = {
    caw: true,
    cawHarness: "claude",
    cawModel: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    id: PROJECT_ID,
    lands: "branch",
    leadInstanceId: null,
    lfsConnection: null,
    lfsUrl: null,
    name: PROJECT,
    places: [],
    primaryPlaceId: null,
    remote: null,
    review: true,
    upstreamPosts: null,
  };

  /** A lead over the fixture's project: it reads nothing from a hub. */
  class FixtureLead extends CawLead {
    constructor() {
      super({
        id: () => PROJECT_ID,
        machinesOnline: () => true,
        project: () => ROW,
        reading: () => false,
        tasks: () => [],
      });
    }
    override read(): Promise<void> {
      return Promise.resolve();
    }
  }
  const lead = new FixtureLead();

  /** An ask parked in another project, as the bar head's card lists it. */
  const ask = (over: {
    key: string;
    title: string;
    project: string;
    toolName: string;
    input: Record<string, unknown>;
    summary: string;
    minutes: number;
  }): AskItem => {
    const raisedAt = Date.now() - over.minutes * 60_000;
    return {
      kind: "ask",
      key: over.key,
      instanceId: over.key,
      cwd: `/home/omar/${over.project}`,
      origin: null,
      thread: null,
      machineId: "m1",
      machine: { name: "obelisk", os: "linux-x64" },
      title: over.title,
      place: `obelisk · ${over.project}`,
      project: { name: over.project, hue: 3 },
      isQuestion: over.toolName === "AskUserQuestion",
      ask: over.summary,
      raisedAt,
      request: {
        heard: 0,
        input: over.input,
        instanceId: over.key,
        presentation: {
          asker: over.title,
          changes: [],
          fields: [],
          summary: over.summary,
        },
        raisedAt,
        requestId: `r-${over.key}`,
        toolName: over.toolName,
      },
      stale: false,
    } as AskItem;
  };
  const NEEDS: NeedsItem[] = [
    ask({
      key: "n1",
      title: "Change knowledge/wire-check.md",
      project: "cockpit",
      toolName: "Edit",
      input: { file_path: "knowledge/wire-check.md" },
      summary: "Edit knowledge/wire-check.md",
      minutes: 68,
    }),
    ask({
      key: "n2",
      title: "Answer a question in anbar",
      project: "anbar",
      toolName: "AskUserQuestion",
      input: {
        questions: [
          {
            question: "Which channel should the coaching build go to?",
            header: "Channel",
            multiSelect: false,
            options: [
              { label: "TestFlight", description: "Internal testers" },
              { label: "App Store", description: "Everyone" },
            ],
          },
        ],
      },
      summary: "Which channel should the coaching build go to?",
      minutes: 12,
    }),
  ];
  const feed: CawFeed = {
    live: true,
    connected: true,
    needs: NEEDS,
    updated: null,
    moved: [],
    rebalanced: [],
    noticesDamaged: null,
    resetNotices: () => Promise.resolve(),
    acknowledge: () => undefined,
    dismissUpdate: () => undefined,
    actOnUpdate: () => undefined,
  };
</script>

{#if surface === "thread"}
  <!-- The floating thread on card 1's conversation, under its head as it
       ships: the same frame one panel's is drawn in. -->
  <PanelScreen form="desk" scene="waiting" today />
{:else}
  <Tooltip.Provider>
    <div
      class="flex w-full justify-end bg-surface-page px-space-1 py-space-3"
      data-today={surface}
    >
      {#if surface === "bar-head"}
        <div
          class="w-c-panel-w max-w-full rounded-lg border border-border-control bg-surface-raised p-space-2 shadow-overlay"
        >
          <CawPanel {feed} onchoose={() => undefined} quiet="All caught up" />
        </div>
      {:else}
        <div
          class="rounded-lg border border-border-control bg-surface-raised shadow-overlay"
        >
          <SwitchCard {lead} projectId={PROJECT_ID} projectName={PROJECT} />
        </div>
      {/if}
    </div>
  </Tooltip.Provider>
{/if}
