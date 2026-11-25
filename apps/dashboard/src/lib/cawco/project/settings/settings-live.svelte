<script lang="ts" module>
  import { atProjectPage } from "./shell-seed";
  import { REFUSED_WORDS as REFUSAL } from "./stage-args";

  atProjectPage("lantern-web");

  /** How the mock hub answers a change: it takes it, or refuses it. */
  export type HubAnswer = "takes it" | "refuses it";

  /** How the stages were read: all at once, one still on its way, or one refused. */
  export type Reading =
    | "Every stage read"
    | "Places and account still reading"
    | "Tasks failed to read";

  /** The hub's words for a read it refused. */
  const READ_REFUSAL =
    "The hub could not read the project's task home: its tracker connection answered 502. Nothing was changed. (tracker_read)";

  /** What the mock hub says a place's act would do. */
  const FORECAST_LINE =
    "The folder and its history move; agents working in it pause, follow it and resume.";

  /** How long the mock hub takes to answer, as a hub on a tailnet does. */
  const ANSWER_MS = 900;
</script>

<script lang="ts">
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  /**
   * The Settings view's live frame: the app's shell as it ships (its rail,
   * the project's bar and its views strip) with Settings the open view,
   * fed one project's record. The view's changes are answered by the
   * fixture's mock hub: a wait, then the answer its dial names. What the
   * hub holds once it has answered is the fixture's own state; the record
   * it started from is the story's arg.
   */
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Shell from "#lib/cawco/Shell.svelte";
  import { boardState } from "#lib/cawco/stores/board.svelte.js";
  import {
    applied,
    type Change,
    type ChangeKey,
    type FlowEvent,
    faultCount,
    keyOf,
    type PlaceFlow,
    type StageId,
    withAsked,
  } from "./changes";
  import type { SettingsRecord } from "./records";
  import SettingsView from "./SettingsView.svelte";
  import { SITUATIONS, type Situation } from "./settings.fixtures";
  import { projectRowOf } from "./shell-seed";
  import { LARGE_FILE_KEYS, TIE_SETUP } from "./tie-setup.fixture";

  let {
    situation,
    answer = "takes it",
    reading = "Every stage read",
  }: {
    situation: Situation;
    answer?: HubAnswer;
    reading?: Reading;
  } = $props();

  const record = $derived(SITUATIONS[situation]);
  const loading = $derived<StageId[]>(
    reading === "Places and account still reading" ? ["sessions"] : []
  );
  const readFailed = $derived<Partial<Record<StageId, string>>>(
    reading === "Tasks failed to read" ? { tasks: READ_REFUSAL } : {}
  );

  /** What the mock hub holds after the changes it took, against the record it started from. */
  let held = $state.raw<{ from: SettingsRecord; now: SettingsRecord } | null>(
    null
  );
  /** What the hub holds now, read against the record the story gives. */
  const heldNow = (from: SettingsRecord): SettingsRecord =>
    held && held.from === from ? held.now : from;
  /** Each control's change asked and not yet answered, with the ask's ticket: a newer ask on the same control outlives an older answer. */
  let asked = $state.raw<
    Partial<Record<ChangeKey, { change: Change; ticket: number }>>
  >({});
  let tickets = 0;
  /** The record as the person sees it: the hub's, every ask already in it. */
  const shown = $derived(
    withAsked(
      heldNow(record),
      Object.values(asked).flatMap((one) => (one ? [one.change] : []))
    )
  );
  let refused = $state<Partial<Record<ChangeKey, string>>>({});
  let syncing = $state(false);
  /** The last change asked of each key, so Try again sends the same one. */
  const last = new Map<ChangeKey, Change>();

  function send(change: Change) {
    const key = keyOf(change);
    tickets += 1;
    const ticket = tickets;
    last.set(key, change);
    asked = { ...asked, [key]: { change, ticket } };
    const { [key]: _gone, ...rest } = refused;
    refused = rest;
    const from = record;
    const verdict = answer;
    setTimeout(() => {
      if (asked[key]?.ticket !== ticket) {
        // A newer ask on this control stands; its own answer settles it.
        return;
      }
      const { [key]: _done, ...still } = asked;
      if (verdict === "refuses it") {
        asked = still;
        refused = { ...refused, [key]: REFUSAL };
        return;
      }
      held = { from, now: applied(heldNow(from), change) };
      asked = still;
    }, ANSWER_MS);
  }

  function syncNow() {
    syncing = true;
    const from = record;
    setTimeout(() => {
      syncing = false;
      const base = heldNow(from);
      if (!base.tie || answer === "refuses it") {
        return;
      }
      held = {
        from,
        now: {
          ...base,
          tie: {
            ...base.tie,
            sync: { kind: "inStep", at: new Date().toISOString() },
          },
        },
      };
    }, ANSWER_MS * 2);
  }

  /** A place's step, as the mock hub answers it: what will happen once a machine and a path are named. */
  let flow = $state<PlaceFlow | null>(null);
  function onflow(event: FlowEvent) {
    switch (event.kind) {
      case "open":
        flow = {
          act: event.act,
          placeId: event.placeId,
          machineId:
            event.act === "find"
              ? (shown.places.find((p) => p.id === event.placeId)?.machineId ??
                null)
              : null,
          path: "",
          forecast: { state: "none" },
          agents: [],
          sending: false,
          refused: null,
          run: null,
          after: null,
        };
        return;
      case "draft":
        if (flow) {
          const named = Boolean(event.machineId && event.path.trim());
          flow = {
            ...flow,
            machineId: event.machineId,
            path: event.path,
            forecast: named
              ? { state: "ready", lines: [FORECAST_LINE] }
              : { state: "none" },
          };
        }
        return;
      case "run":
        if (flow && answer === "refuses it") {
          flow = { ...flow, refused: REFUSAL };
        } else {
          flow = null;
        }
        return;
      case "interrupt":
      case "callOff":
      case "tryStage":
      case "close":
        flow = null;
        return;
    }
  }

  const row = $derived(projectRowOf(shown));
  /** Caw's seat on the project's bar, at rest: the project's row, no tasks. */
  const lead = new CawLead({
    id: () => shown.project.id,
    machinesOnline: () => true,
    project: () => row,
    reading: () => false,
    tasks: () => [],
  });
  const machine = $derived(
    boardState.machines.find(
      (m) =>
        m.machineId === shown.places.find((p) => p.kind === "start")?.machineId
    ) ?? null
  );

  let view = $state("settings");
  /** The project's views as its strip lists them; How it runs counts what is in trouble. */
  const views = $derived([
    { value: "board", label: "Board", count: 0, draft: false },
    { value: "table", label: "Table", count: 0, draft: false },
    { value: "routines", label: "Routines", count: 0, draft: false },
    { value: "decisions", label: "Decisions", count: 2, draft: false },
    {
      value: "settings",
      label: words.tab,
      count: faultCount(shown),
      draft: false,
    },
  ]);
</script>

<!-- The frame is the window: the shell fills it, as it fills the page. -->
<div class="flex h-dvh w-dvw min-w-0">
  <Shell>
    <!-- The frame the phone's views bar docks in, over the page's foot (ProjectPage). -->
    <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <!-- The page, as ProjectPage draws it: on a phone the one scroller, its foot clear of the views bar (--bar-reach). -->
      <div
        class="max-phone:@container-size flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--bar-reach)"
        data-project-page
        data-safe-bottom
        data-slot="project-page"
        style:--bar-reach={"calc(var(--composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))"}
      >
        <ProjectHead
          {lead}
          {machine}
          onask={() => undefined}
          onfilter={() => undefined}
          onnewtask={() => undefined}
          onsettings={() => {
            view = "settings";
          }}
          project={row}
          seated
          setup={null}
        />
        <div
          class="flex w-full min-w-0 ps-space-6 pe-space-6 max-desk:ps-space-4 max-desk:pe-space-4 max-phone:hidden"
        >
          <ViewTabs
            current={view}
            hrefOf={(next) => `/project/${shown.project.id}?view=${next}`}
            onchoose={(next) => {
              view = next;
            }}
            {views}
          />
        </div>
        <!-- The pane (ProjectPage `viewPane`): the view in the page's inset, scrolling on its own from 640px. -->
        <div
          class={[
            "flex min-h-0 max-w-full flex-auto flex-col overflow-y-auto max-phone:shrink-0 max-phone:overflow-visible",
            PANE_INSET,
          ]}
          data-slot="pane"
        >
          <SettingsView
            {flow}
            hrefOf={(page) => `/config/${page}`}
            keys={LARGE_FILE_KEYS}
            {loading}
            movingPlaceId={null}
            onaddkey={() => Promise.resolve({ name: "Lantern LFS key" })}
            onaddplace={() => undefined}
            onchange={send}
            {onflow}
            onplace={() => undefined}
            onreread={() => undefined}
            onretry={(key) => {
              const again = last.get(key);
              if (again) {
                send(again);
              }
            }}
            onsync={syncNow}
            pending={[]}
            {readFailed}
            record={shown}
            {refused}
            setup={TIE_SETUP}
            {syncing}
          />
        </div>
      </div>
      <ViewBar
        current={view}
        needs={0}
        needsOn={false}
        onchoose={(next) => {
          view = next;
        }}
        onnewsession={() => undefined}
        ontoggleneeds={() => undefined}
        {views}
      />
    </div>
  </Shell>
</div>
