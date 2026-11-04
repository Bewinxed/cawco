<script lang="ts">
  /**
   * ENDING A PROJECT (dev only): the screen with the records the hub held
   * on 2026-11-04, for judging and trying without a hub. Project page: the
   * head of "Private office" with its More menu; Forget project… and Delete
   * project… unfold the tray under it, and its confirm plays the end (the
   * stops landing one by one, then the end) as the hub would answer it.
   * Each step can also be picked from Step. Forgotten projects: the page
   * with the twenty projects the trash held; Bring back and Delete… answer
   * after a beat as the hub would, Balcony garden's Bring back refused (a
   * live project holds its place) and a delete with files of the first
   * unnamed folder refused (kestrel away).
   */
  import type { ForgottenProject } from "@cawco/core/forgotten-project";
  import { commonWords } from "@cawco/core/words/common";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { projectTrashWords } from "@cawco/core/words/project-trash";
  import ForgottenPage from "#lib/cawco/forgotten/ForgottenPage.svelte";
  import {
    ALL,
    BALCONY,
    NOW,
  } from "#lib/cawco/forgotten/forgotten-fixtures.js";
  import {
    ACTIVITY,
    job as jobOf,
    MACHINES,
    NAME,
    RUNNING,
  } from "#lib/cawco/project-end-fixtures.js";
  import StopTray from "#lib/cawco/StopTray.svelte";
  import type { StopJob, StopRow } from "#lib/cawco/stop-work.svelte.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import {
    IconDeleteForGood,
    IconInfo,
    IconMore,
    IconSettings,
    IconTrash,
    IconUsage,
  } from "#lib/icons.js";

  type View = "project" | "forgotten";
  let view = $state<View>("project");

  /* ── The project page ───────────────────────────────────────────── */

  const STEPS = {
    forget: "Forget, nothing running",
    "forget-running": "Forget, 4 running",
    "forget-armed": "Forget, 2 mid-turn (armed)",
    delete: "Delete, files kept",
    "delete-files": "Delete with its files",
    "delete-running": "Delete, 4 running",
    "delete-hub": "Delete, only a hub folder",
    "refused-running": "Refused: a session runs",
    "refused-away": "Refused: kestrel away",
    "refused-shared": "Refused: folder shared",
    "refused-agent": "Refused: agent too old",
  } as const;
  type Step = keyof typeof STEPS;

  const REFUSALS: Partial<Record<Step, string>> = {
    "refused-running": projectTrashWords.stillRuns(NAME, 1),
    "refused-away": projectTrashWords.machinesAway(NAME, ["kestrel"]),
    "refused-shared": projectTrashWords.placeShared(
      NAME,
      "/home/bewinxed/office",
      "obelisk",
      "Cawco"
    ),
    "refused-agent": projectTrashWords.notRemoved(
      NAME,
      "Workspace 3d062e2d",
      "obelisk",
      "its machine kept the clone: its agent predates deleting a project for good"
    ),
  };

  const fresh = (rows: StopRow[]) =>
    rows.map((row) => ({ ...row, s: { ...row.s } }));

  /** The phase a step opens on: armed, the list, or the plain question. */
  const phaseOf = (picked: Step): StopJob["phase"] => {
    if (picked === "forget-armed") {
      return "armed";
    }
    return picked.endsWith("-running") && !picked.startsWith("refused")
      ? "list"
      : "none";
  };

  function stepJob(picked: Step): StopJob {
    const phase = phaseOf(picked);
    return jobOf({
      kind: picked.startsWith("forget") ? "forget" : "delete",
      fromDisk: [
        "delete-files",
        "delete-hub",
        "refused-away",
        "refused-shared",
      ].includes(picked),
      phase,
      rows: phase === "none" ? [] : fresh(RUNNING),
      ...(picked === "delete-hub" ? { places: [] } : {}),
      refusal: REFUSALS[picked] ?? null,
    });
  }

  /** It opens on a delete asked with four running: the tray at its fullest. */
  let step = $state<Step | null>("delete-running");
  let tray = $state<StopJob | null>(stepJob("delete-running"));
  const timers: ReturnType<typeof setTimeout>[] = [];

  function show(next: Step | null): void {
    for (const timer of timers.splice(0)) {
      clearTimeout(timer);
    }
    step = next;
    tray = next ? stepJob(next) : null;
  }

  /** Each stop lands a beat after the last, then the end runs and is held. */
  function play(job: StopJob): void {
    const midTurn = job.rows.some(
      (row) =>
        row.state === "running" && (ACTIVITY[row.s.id] ?? "idle") !== "idle"
    );
    if (job.phase === "list" && midTurn) {
      job.phase = "armed";
      return;
    }
    if (job.refusal) {
      job.refusal = null;
    }
    const later = (ms: number, run: () => void) =>
      timers.push(setTimeout(run, ms));
    if (
      job.rows.length > 0 &&
      (job.phase === "list" || job.phase === "armed")
    ) {
      job.total = job.rows.length;
      job.pressedAt = Date.now();
      job.phase = "stopping";
      for (const row of job.rows) {
        row.state = "stopping";
      }
      // Delegates land before the session that started them.
      [...job.rows].reverse().forEach((row, index) => {
        later(700 * (index + 1), () => {
          row.state = "stopped";
          row.departed = true;
          row.arrived = true;
          row.gone = true;
        });
      });
      later(700 * (job.rows.length + 1), () => end(job));
      return;
    }
    end(job);
  }

  function end(job: StopJob): void {
    job.phase = "ending";
    timers.push(
      setTimeout(() => {
        job.phase = "done";
      }, 1200)
    );
  }

  /* ── Forgotten projects ─────────────────────────────────────────── */

  let list = $state<ForgottenProject[]>(ALL.map((one) => ({ ...one })));
  let refused = $state<Record<string, string>>({});
  const beat = () => new Promise((resolve) => setTimeout(resolve, 900));

  async function bringBack(one: ForgottenProject): Promise<boolean> {
    await beat();
    if (one.id === BALCONY.id) {
      refused[one.id] = projectTrashWords.placeTaken(
        "Balcony garden",
        "Garden",
        "/home/bewinxed/garden"
      );
      return false;
    }
    delete refused[one.id];
    list = list.filter((each) => each.id !== one.id);
    return true;
  }

  async function remove(
    one: ForgottenProject,
    fromDisk: boolean
  ): Promise<void> {
    await beat();
    if (fromDisk && one.id === ALL[2]?.id) {
      throw new Error(
        projectTrashWords.machinesAway(projectEndWords.unnamed, ["kestrel"])
      );
    }
    list = list.filter((each) => each.id !== one.id);
  }
</script>

<svelte:head>
  <title>Ending a project &middot; CawCo</title>
</svelte:head>

<div class="flex min-h-dvh flex-col bg-surface-recess">
  <div
    class="flex flex-wrap items-center gap-space-3 px-space-7 pt-space-4 max-desk:px-space-5"
  >
    <Tabs
      onValueChange={(next) => {
        view = next as View;
      }}
      value={view}
    >
      <TabsList aria-label="Where">
        <TabItem label="Project page" value="project" />
        <TabItem label={projectEndWords.forgottenTitle} value="forgotten" />
      </TabsList>
    </Tabs>
    {#if view === "project"}
      <Select.Root
        onValueChange={(value) => show(value ? (value as Step) : null)}
        type="single"
        value={step ?? ""}
      >
        <Select.Trigger aria-label="Step">
          {step ? STEPS[step] : "Step"}
        </Select.Trigger>
        <Select.Content>
          {#each Object.entries(STEPS) as [value, label] (value)}
            <Select.Item {label} {value} />
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
  </div>

  {#if view === "project"}
    <!-- The project page's head, as it stands under the bar. -->
    <div
      class="flex min-w-0 items-center gap-space-3 pt-space-5 ps-space-7 pe-space-6 max-desk:px-space-5"
    >
      <h1 class="m-0 me-auto type-title text-balance text-ink-strong">
        {NAME}
      </h1>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              aria-label={commonWords.moreFor(NAME)}
              class="grid size-c-btn-h-sm select-none place-items-center rounded-full touch-hit press-tint"
              type="button"
            >
              <IconMore aria-hidden="true" class="size-icon-md" />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item>
            <IconInfo />
            <span>Project details…</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <IconSettings />
            <span>Caw settings…</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <IconUsage />
            <span>Spend</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={() => show("forget-running")}
            variant="destructive"
          >
            <IconTrash />
            <span>{projectEndWords.forgetProject}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => show("delete-running")}
            variant="destructive"
          >
            <IconDeleteForGood />
            <span>{projectEndWords.deleteProject}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    {#if tray}
      <div class="contents" style:--ask-end="var(--space-5)">
        <StopTray
          activityOf={(id) => ACTIVITY[id] ?? "idle"}
          class="tray-indent-space-7 max-w-128 max-desk:tray-indent-space-5"
          job={tray}
          nameOf={(id) => MACHINES[id] ?? id}
          onconfirm={play}
        />
      </div>
    {/if}
  {:else}
    <ForgottenPage
      {bringBack}
      {list}
      now={NOW}
      refusalOf={(id) => refused[id] ?? null}
      reread={() => undefined}
      {remove}
    />
  {/if}
</div>
