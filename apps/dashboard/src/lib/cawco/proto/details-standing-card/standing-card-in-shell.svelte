<script lang="ts">
  /**
   * The Standing card where it stands: over the project's page as the app
   * draws it (the rail on a desk, the project's own head, its board under
   * the head), hung from the head's place mark, or as the bottom sheet on a
   * phone. The head's own details tray stays shut: a press on the place mark
   * is taken here and opens the card instead.
   *
   * What the hub would hold is held here, starting from the story's args:
   * the project's row, which face the card shows and what stands open in
   * it. Each press is answered as the hub would answer it, after a short
   * wait: a pick is asked, then in force; a move steps on to its end; a
   * place found, added or dropped shows on its row.
   */
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import { LANDS_MODES } from "@cawco/core/injected";
  import type { StagesView, TaskSummary } from "@cawco/core/task-views";
  import type { TrackerView } from "@cawco/core/trackers";
  import { MediaQuery } from "svelte/reactivity";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { firstTodoStage } from "#lib/cawco/project-tasks.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import Sidebar from "#lib/cawco/Sidebar.svelte";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import DetailsSurface from "./DetailsSurface.svelte";
  import type {
    AccountChoice,
    CantStart,
    Change,
    ConnectionChoice,
    DetailsAct,
    FindPlan,
    MovePlan,
    MoveResult,
    MoveRun,
    Opened,
    PlaceFolder,
    PlaceLearned,
    PlaceMoving,
    TiePlan,
  } from "./details";
  import FindFolder from "./FindFolder.svelte";
  import MoveAfter from "./MoveAfter.svelte";
  import MoveBefore from "./MoveBefore.svelte";
  import MoveRunning from "./MoveRunning.svelte";
  import StandingCard from "./StandingCard.svelte";
  import TieTracker from "./TieTracker.svelte";
  import { standingWords } from "./words";

  type Face =
    "details" | "move-before" | "move-running" | "move-after" | "find" | "tie";

  let {
    frame = "desk",
    project,
    machines,
    folders,
    tracker,
    accounts,
    connections,
    stages,
    tasks,
    open = true,
    face = "details",
    reading = false,
    change = null,
    cantStart = null,
    opened = null,
    learned = null,
    moving = null,
    placeId = "place-obelisk",
    to,
    plan,
    run,
    result,
    typed = "",
    find,
    tie,
  }: {
    /** The frame's room: a desk 900 tall, a smaller desk 768, a phone 844. */
    frame?: "desk" | "short" | "phone";
    project: ProjectRow;
    machines: Machine[];
    folders: Record<string, PlaceFolder>;
    tracker: TrackerView | { unread: string };
    accounts: AccountChoice[];
    connections: ConnectionChoice[];
    stages: StagesView;
    tasks: TaskSummary[];
    /** The card stands open over the page as the frame opens. */
    open?: boolean;
    /** The face the card shows. */
    face?: Face;
    reading?: boolean;
    change?: Change | null;
    cantStart?: CantStart | null;
    opened?: Opened;
    learned?: PlaceLearned | null;
    moving?: PlaceMoving | null;
    /** The place a move or Find folder is about. */
    placeId?: string;
    /** Where a move goes. */
    to: { machineId: string; folder: string };
    plan: MovePlan;
    run: MoveRun;
    result: MoveResult;
    /** The folder typed into Find folder. */
    typed?: string;
    find: FindPlan;
    tie: TiePlan;
  } = $props();

  /** How long the stand-in hub takes to answer. */
  const ANSWER_MS = 700;
  /** How long each of a running move's steps takes here. */
  const STEP_MS = 900;

  // What the stand-in hub holds: the story's, until a press changes it.
  let row = $derived(project);
  let shown = $derived(open);
  let atFace = $derived<Face>(face);
  let nowChange = $derived(change);
  let nowOpened = $derived(opened);
  let nowLearned = $derived(learned);
  let nowMoving = $derived(moving);
  let nowFolders = $derived(folders);
  let nowTracker = $derived(tracker);
  let nowCant = $derived(cantStart);
  let nowPlace = $derived(placeId);
  let nowTo = $derived(to);
  let nowPlan = $derived(plan);
  let nowRun = $derived(run);
  let nowTyped = $derived(typed);
  let nowFind = $derived(find);
  let nowTie = $derived(tie);

  const later = (answer: () => void, ms = ANSWER_MS) => setTimeout(answer, ms);

  /** A phone or a touch screen: the details rise as the bottom sheet. */
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
  const form = $derived<"card" | "sheet">(touch.current ? "sheet" : "card");

  const lead = new CawLead({
    id: () => row.id,
    machinesOnline: () => true,
    project: () => row,
    reading: () => false,
    tasks: () => tasks,
  });

  const machineOf = (machineId: string): Machine | null =>
    machines.find((one) => one.machineId === machineId) ?? null;
  const primary = $derived(row.places.find((one) => one.isPrimary) ?? null);
  const machine = $derived(primary ? machineOf(primary.machineId) : null);
  const newIn = $derived(firstTodoStage(stages.stages)?.name);
  const place = $derived(
    row.places.find((one) => one.id === nowPlace) ?? row.places[0]
  );

  let pageBox = $state<HTMLElement | null>(null);
  /** The head's place mark, which the card hangs from. */
  let mark = $state<HTMLElement | null>(null);
  $effect(() => {
    mark = pageBox?.querySelector<HTMLElement>("[data-place-line]") ?? null;
  });
  // A press on the place mark (a click, or Enter or Space on it) opens or
  // puts away the card, never the head's own tray: taken on its way down.
  $effect(() => {
    const box = pageBox;
    const take = (event: MouseEvent) => {
      if (mark && event.target instanceof Node && mark.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        shown = !shown;
      }
    };
    box?.addEventListener("click", take, true);
    return () => box?.removeEventListener("click", take, true);
  });

  /** The hub's answer to a pick: asked, then in force. */
  function setting(asked: Extract<DetailsAct, { kind: "set" }>): void {
    nowChange = { setting: asked.setting, state: "asked", value: asked.value };
    later(() => {
      if (asked.setting === "lands") {
        const lands = LANDS_MODES.find((one) => one === asked.value);
        row = { ...row, lands: lands ?? row.lands };
      } else if (asked.setting === "account") {
        row = { ...row, account: asked.value === "fleet" ? null : asked.value };
      } else if (asked.setting === "atLimit") {
        row = {
          ...row,
          accountAtLimit: asked.value === "move" ? "move" : "wait",
        };
      } else {
        row = { ...row, lfsUrl: null, lfsConnection: null };
        nowOpened = null;
      }
      nowChange = null;
    });
  }

  function act(done: DetailsAct): void {
    switch (done.kind) {
      case "move":
        nowPlace = done.placeId;
        atFace = "move-before";
        break;
      case "find":
        nowPlace = done.placeId;
        atFace = "find";
        break;
      case "reopen":
        atFace = "move-running";
        break;
      case "drop":
        nowOpened = { kind: "drop", placeId: done.placeId };
        break;
      case "dropped":
        nowOpened = null;
        later(() => {
          row = {
            ...row,
            places: row.places.filter((one) => one.id !== done.placeId),
          };
        });
        break;
      case "close":
        nowOpened = null;
        break;
      case "add-place":
        nowOpened = {
          kind: "add-place",
          draft: { machineId: null, folder: "", copy: false },
        };
        break;
      case "draft":
        nowOpened = { kind: "add-place", draft: done.draft };
        break;
      case "added": {
        const draft = nowOpened?.kind === "add-place" ? nowOpened.draft : null;
        nowOpened = null;
        if (draft?.machineId) {
          const id = `place-${draft.machineId}-added`;
          const { machineId, folder } = draft;
          later(() => {
            row = {
              ...row,
              places: [
                ...row.places,
                {
                  createdAt: new Date().toISOString(),
                  id,
                  isPrimary: false,
                  kind: "checkout",
                  machineId,
                  path: folder,
                  projectId: row.id,
                  within: [],
                },
              ],
            };
            nowLearned = {
              placeId: id,
              repository:
                machineOf(machineId)?.status === "online"
                  ? (row.links[0] ?? null)
                  : null,
            };
          });
        }
        break;
      }
      case "tracker":
        if (done.tracker === "cawco") {
          nowOpened = { kind: "back-to-cawco" };
        } else {
          nowTie = { ...nowTie, provider: done.tracker };
          atFace = "tie";
        }
        break;
      case "back-to-cawco":
        nowOpened = null;
        later(() => {
          nowTracker = { tracker: "cawco", binding: null };
        });
        break;
      case "read-tracker":
        later(() => {
          nowTracker = { tracker: "cawco", binding: null };
        });
        break;
      case "set":
        setting(done);
        break;
      case "retry":
        if (nowChange) {
          setting({
            kind: "set",
            setting: nowChange.setting,
            value: nowChange.value,
          });
        }
        break;
      case "lfs-draft":
        nowOpened = {
          kind: "lfs-address",
          url: done.url,
          connection: done.connection,
        };
        break;
      case "lfs-save":
        if (nowOpened?.kind === "lfs-address") {
          const { url, connection } = nowOpened;
          later(() => {
            row = { ...row, lfsUrl: url, lfsConnection: connection };
            nowOpened = null;
          });
        }
        break;
      case "sync":
      case "stages":
      case "sign-in":
      case "add-account":
      case "add-connection":
        break;
      default:
        break;
    }
  }

  /** The move's steps, answered one after another to its end. */
  function startMove(): void {
    atFace = "move-running";
    nowRun = { ...run, at: 0, failed: null, holding: null, waiting: [] };
    const step = () => {
      if (atFace !== "move-running" && nowMoving === null) {
        return;
      }
      const at = nowRun.at + 1;
      if (at >= nowRun.steps.length) {
        nowMoving = null;
        atFace = "move-after";
        return;
      }
      nowRun = { ...nowRun, at };
      if (atFace !== "move-running") {
        nowMoving = {
          placeId: nowPlace,
          step: nowRun.steps[at] ?? "",
          progress: "",
        };
      }
      later(step, STEP_MS);
    };
    later(step, STEP_MS);
  }

  /** Back from a face: a running move goes on, shown on its place's row. */
  function back(): void {
    if (atFace === "move-running") {
      nowMoving = {
        placeId: nowPlace,
        step: nowRun.steps[nowRun.at] ?? "",
        progress: "",
      };
    }
    atFace = "details";
  }

  /** Done after a move: the place shows its new folder. */
  function moved(): void {
    const { folder, machineId } = nowTo;
    row = {
      ...row,
      places: row.places.map((one) =>
        one.id === nowPlace ? { ...one, path: folder, machineId } : one
      ),
    };
    atFace = "details";
  }

  /** Point here: the place shows the found folder, no longer missing. */
  function pointed(): void {
    const folder = nowTyped;
    later(() => {
      row = {
        ...row,
        places: row.places.map((one) =>
          one.id === nowPlace ? { ...one, path: folder } : one
        ),
      };
      nowFolders = {
        ...nowFolders,
        [nowPlace]: { missing: false, made: false },
      };
      nowCant = null;
      atFace = "details";
    });
  }

  /** Tie: the tied line shows the first sync under way. */
  function tied(): void {
    const { connection, target, provider } = nowTie;
    later(() => {
      nowTracker = {
        tracker: provider,
        binding: {
          boundAt: Date.now(),
          connection: connection ?? "",
          githubProject: null,
          githubProjectReason: null,
          linked: 0,
          polledAt: null,
          provider,
          reason: null,
          state: "syncing",
          target: target ?? "",
          targetName: target ?? "",
          targetUrl: `https://github.com/${target ?? ""}`,
        },
      };
      atFace = "details";
    });
  }

  function carry(id: string, way: "as-is" | "summary"): void {
    nowPlan = {
      ...nowPlan,
      running: nowPlan.running.map((one) =>
        one.id === id ? { ...one, carry: way } : one
      ),
    };
  }

  function onHarness(id: string, harness: HarnessKind): void {
    nowPlan = {
      ...nowPlan,
      running: nowPlan.running.map((one) =>
        one.id === id ? { ...one, continuesOn: harness } : one
      ),
    };
  }

  const titles = $derived<Record<Face, string>>({
    details: standingWords.card,
    "move-before": standingWords.move.title,
    "move-running": standingWords.running.title,
    "move-after": standingWords.after.title,
    find: standingWords.find.title,
    tie: standingWords.tie.title(
      nowTie.provider === "github" ? "GitHub Issues" : "Linear"
    ),
  });

  const none = () => undefined;
</script>

<div
  class={[
    "@container/shell relative flex w-full overflow-hidden bg-surface-recess",
    frame === "desk" && "h-225",
    frame === "short" && "h-192",
    frame === "phone" && "h-211",
  ]}
>
  <aside
    class="hidden w-c-sidebar-w min-w-0 shrink-0 border-e border-e-border-hairline bg-(--sidebar) desk:flex"
  >
    <Sidebar narrow={false} toggleRoom />
  </aside>
  <div bind:this={pageBox} class="flex min-w-0 flex-auto flex-col">
    <ProjectDock docked={false} preview={false}>
      {#snippet page()}
        <ProjectHead
          {lead}
          {machine}
          onask={null}
          onfilter={none}
          onnewtask={none}
          project={row}
          seated
          setup={null}
        />
        <div
          class="flex min-h-0 flex-auto flex-col ps-space-7 pe-space-6 max-desk:px-space-5"
        >
          <TaskBoard
            allowedFrom={() => new Set<string>()}
            hrefOf={() => "#"}
            {newIn}
            oncreate={async () => ""}
            onmove={none}
            onopen={none}
            stages={stages.stages}
            {tasks}
          />
        </div>
      {/snippet}
      {#snippet dock()}{/snippet}
    </ProjectDock>
  </div>
</div>

<DetailsSurface
  anchor={mark}
  face={atFace}
  {form}
  onclose={() => {
    shown = false;
  }}
  open={shown}
  title={titles[atFace]}
>
  {#if atFace === "details"}
    <StandingCard
      {accounts}
      cantStart={nowCant}
      change={nowChange}
      {connections}
      folders={nowFolders}
      {form}
      learned={nowLearned}
      {machines}
      moving={nowMoving}
      onact={act}
      opened={nowOpened}
      project={row}
      {reading}
      tracker={nowTracker}
    />
  {:else if atFace === "move-before" && place}
    <MoveBefore
      {form}
      {machines}
      onback={back}
      oncarry={carry}
      onfolder={(folder) => {
        nowTo = { ...nowTo, folder };
      }}
      onharness={onHarness}
      onmove={startMove}
      onto={(machineId) => {
        nowTo = { ...nowTo, machineId };
      }}
      {place}
      plan={nowPlan}
      to={nowTo}
    />
  {:else if atFace === "move-running"}
    <MoveRunning
      {form}
      onagain={() => {
        nowRun = { ...nowRun, failed: null };
      }}
      onback={back}
      oncalloff={() => {
        atFace = "move-after";
      }}
      oninterrupt={(id) => {
        nowRun = {
          ...nowRun,
          waiting: nowRun.waiting.filter((one) => one.id !== id),
        };
      }}
      run={nowRun}
    />
  {:else if atFace === "move-after"}
    <MoveAfter
      {form}
      ondone={moved}
      onremove={none}
      {result}
      to={nowTo.folder}
    />
  {:else if atFace === "find" && place}
    <FindFolder
      {form}
      machine={machineOf(place.machineId)}
      onback={back}
      onkeep={(name) => {
        nowFind = nowFind.merge
          ? { ...nowFind, merge: { ...nowFind.merge, keep: name } }
          : nowFind;
      }}
      onpoint={pointed}
      ontype={(folder) => {
        nowTyped = folder;
        nowFind = { ...nowFind, tell: folder.trim() ? "reading" : null };
        later(() => {
          nowFind = { ...nowFind, tell: folder.trim() ? find.tell : null };
        });
      }}
      {place}
      plan={nowFind}
      projectName={row.name}
      typed={nowTyped}
    />
  {:else if atFace === "tie"}
    <TieTracker
      {form}
      onaddconnection={none}
      onback={back}
      onconnection={(connection) => {
        nowTie = { ...nowTie, connection };
      }}
      onproject={(id) => {
        nowTie = { ...nowTie, project: id };
      }}
      onstage={(stage, option) => {
        nowTie = {
          ...nowTie,
          stages: nowTie.stages.map((one) =>
            one.stage === stage ? { ...one, pick: option } : one
          ),
        };
      }}
      ontarget={(target) => {
        nowTie = { ...nowTie, target };
      }}
      ontie={tied}
      plan={nowTie}
    />
  {/if}
</DetailsSurface>
