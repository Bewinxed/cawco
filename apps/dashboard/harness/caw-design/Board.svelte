<script lang="ts">
  /**
   * The empty board as main draws it (routes/(app)/project/[id]/+page.svelte,
   * an empty task list while Caw can start): the project's head with Caw
   * out of its seat, then the pane holding the empty state Caw stands on,
   * `data-slot="caw-empty"`, with the line on what he does and his starters
   * under him; on a phone the views bar docked at the foot. The same
   * components, on the Harbour site fixtures.
   *
   * The page loads this alone in a frame of a device's size (`?board=desk`
   * at 1280 × 800, `?board=phone` at 390 × 844), so every component in it
   * reads the frame's width as the window's: the head, the bar and the
   * page's own styles below each pick their form as they do in the app.
   * The app's rail and top bar (Shell) are not drawn; on a desk the views
   * strip stands in that bar, so it is not drawn either.
   */
  import type { CawView } from "@cawco/core";
  import type { ComponentProps } from "svelte";
  import type { Machine } from "#lib/cawco/client.svelte.js";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    CWD,
    LEAD_ID,
    MACHINE,
    PROJECT_ID,
    PROJECT_NAME,
    project,
    stages,
  } from "./states/fixtures";

  /** Harbour site with its one checkout, on obelisk. */
  const PROJECT = {
    ...project(null),
    places: [
      {
        createdAt: new Date().toISOString(),
        id: "place-obelisk",
        isPrimary: true,
        kind: "checkout" as const,
        machineId: MACHINE,
        path: CWD,
        projectId: PROJECT_ID,
      },
    ],
    primaryPlaceId: "place-obelisk",
  };
  const MACHINE_ROW = {
    hostname: MACHINE,
    machineId: MACHINE,
    os: "linux",
  } as Machine;

  /** Caw at rest, able to start, his panel shut: he stands on the board. */
  const view: CawView = {
    answering: null,
    harness: "claude",
    leadInstanceId: LEAD_ID,
    model: null,
    on: true,
    problem: null,
    running: [],
    spendUsd: 3.42,
  };
  const caw = $state({
    anchor: null as HTMLElement | null,
    ask: () => undefined,
    holds: false,
    open: false,
    sentence: "Ready.",
    shown: true,
    status: "ready",
    view,
    words: null,
  });
  const lead = caw as unknown as CawLead;

  /** The page's `cawLine`: what Caw does, in the project's own stages. */
  const named = stages.stages
    .filter((stage) => stage.kind !== "dropped")
    .map((stage) => stageLabel(stage.name));
  const you = stages.stages.find((stage) => stage.kind === "you");
  const flow =
    named.length > 1
      ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
      : (named[0] ?? "");
  const cawLine = `Tell Caw what to do: the tasks Caw files move through ${flow}.${
    you ? ` One waiting on you shows in ${stageLabel(you.name)}.` : ""
  }`;

  /** The page's tabs with no task yet, as a phone's bar lists them. */
  const VIEWS: ComponentProps<typeof ViewBar>["views"] = [
    { value: "board", label: "Board" },
    { value: "table", label: "Table" },
    { value: "pipeline", label: "Pipeline" },
    { value: "routines", label: "Routines" },
    { value: "decisions", label: "Decisions" },
  ].map((one) => ({ ...one, count: 0, draft: false }));
  const none = () => undefined;
</script>

<Tooltip.Provider>
  <div class="ground" data-design-board>
    <div class="project-frame">
      <div class="project-page" data-slot="project-page">
        <ProjectHead
          {lead}
          machine={MACHINE_ROW}
          onask={none}
          onfilter={none}
          onnewtask={none}
          onstages={none}
          project={PROJECT}
          seated={false}
        />
        <div class="pane" data-slot="pane" data-view="board">
          <div class="state caw-empty" data-slot="caw-empty">
            <EmptyState line={cawLine} title="Nothing on the board yet">
              {#snippet mark()}
                <div class="caw-80" data-slot="caw-80">
                  <CawSeat
                    {lead}
                    projectId={PROJECT_ID}
                    projectName={PROJECT_NAME}
                    size={80}
                  />
                </div>
              {/snippet}
              {#snippet action()}
                <div class="contents" data-caw-asks>
                  <StarterCards onpick={none} starters={stages.starters} />
                </div>
              {/snippet}
            </EmptyState>
          </div>
        </div>
      </div>
      <ViewBar
        current="board"
        needs={0}
        needsOn={false}
        onchoose={none}
        onnewsession={none}
        ontoggleneeds={none}
        views={VIEWS}
      />
    </div>
  </div>
</Tooltip.Provider>

<style>
  /* The shell's ground (Shell `.shell`), the whole frame. */
  .ground {
    display: flex;
    flex-direction: column;
    block-size: 100dvh;
    background: var(--surface-recess);
    overflow: hidden;
  }
  /* The page's own styles for these boxes, as +page.svelte sets them. */
  .project-frame {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
  }
  .project-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }
  .pane {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    padding: 0 var(--space-6) 0 var(--space-7);
    overflow: hidden;
  }
  .state {
    max-inline-size: 72ch;
  }
  .caw-empty {
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
  }
  .caw-empty :global(.kit-empty-action) {
    align-self: stretch;
  }
  .caw-80 {
    display: grid;
    justify-items: start;
    margin-block-end: var(--space-3);
  }
  @media (max-width: 899px) {
    .pane {
      padding-inline: var(--space-5);
    }
  }
  @media (max-width: 639px) {
    .project-page {
      --bar-reach: calc(
        var(--c-composer-panel) + var(--space-4) + var(--safe-bottom) +
          var(--space-3)
      );
      container-type: size;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      padding-block-end: var(--bar-reach);
    }
    .project-page > :global(*) {
      flex-shrink: 0;
    }
    .pane {
      flex: 1 0 auto;
      overflow: visible;
    }
  }
</style>
