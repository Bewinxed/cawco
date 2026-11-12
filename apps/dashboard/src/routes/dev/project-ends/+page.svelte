<script lang="ts">
  /**
   * ENDING A PROJECT (dev only): the screen with the records the hub held
   * on 2026-11-04, for judging and trying without a hub.
   *
   * Project page: the head of "Private office" with its More menu; Forget
   * project… and Delete project… unfold the tray under it (StopTrayView),
   * and its confirm plays the end as the hub would answer it: the first
   * press arms while a session is mid-turn, the stops land one by one, then
   * the end runs and is held. Forgotten, the page leaves for Forgotten
   * projects and the toast offers Bring back, which lands back on the
   * project's page. Each step can also be opened from Step; Cancel and
   * Close put Step back to none.
   *
   * Forgotten projects: the page with the twenty projects the trash held.
   * Bring back answers after a beat and lands on the project's page;
   * Balcony garden's is refused (Garden holds its checkout, with the way
   * to Garden), and deleting the first unnamed folder with its files is
   * refused (kestrel away).
   */
  import type { ForgottenProject } from "@cawco/core/forgotten-project";
  import { commonWords } from "@cawco/core/words/common";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { projectTrashWords } from "@cawco/core/words/project-trash";
  import { MediaQuery } from "svelte/reactivity";
  import ForgottenPage from "#lib/cawco/forgotten/ForgottenPage.svelte";
  import {
    ALL,
    BALCONY,
    NOW,
  } from "#lib/cawco/forgotten/forgotten-fixtures.js";
  import {
    ACTIVITY,
    MACHINES,
    NAME,
    RUNNING,
    tray as trayOf,
  } from "#lib/cawco/project-end-fixtures.js";
  import StopTrayView from "#lib/cawco/StopTrayView.svelte";
  import type { StopJob, StopRow } from "#lib/cawco/stop-work.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import {
    IconArchive,
    IconDeleteForGood,
    IconInfo,
    IconMore,
    IconSettings,
    IconUsage,
  } from "#lib/icons.js";

  const narrowToasts = new MediaQuery("(max-width: 640px)");

  type View = "project" | "forgotten" | "home";
  let view = $state<View>("project");
  /** The project the page stands on: Private office, or one brought back. */
  let pageName = $state(NAME);

  /* ── The project page ───────────────────────────────────────────── */

  const STEPS = {
    forget: "Forget, nothing running",
    "forget-running": "Forget, 4 running",
    "forget-armed": "Forget, 2 mid-turn (armed)",
    delete: "Delete, files kept",
    "delete-files": "Delete with its files",
    "delete-running": "Delete, 4 running",
    "delete-hub": "Delete, only a hub folder",
    "refused-running": "Refused: a session started",
    "refused-away": "Refused: kestrel away",
    "refused-shared": "Refused: folder shared",
    "refused-agent": "Refused: agent too old",
  } as const;
  type Step = keyof typeof STEPS;

  /** Each refusal, said of the project the page stands on. */
  const refusalsOf = (name: string): Partial<Record<Step, string>> => ({
    "refused-running": projectTrashWords.stillRuns(name, 1),
    "refused-away": projectTrashWords.machinesAway(name, ["kestrel"]),
    "refused-shared": projectTrashWords.placeShared(
      name,
      "/home/bewinxed/office",
      "obelisk",
      "Cawco"
    ),
    "refused-agent": projectTrashWords.agentTooOld(
      name,
      "Workspace 3d062e2d",
      "obelisk"
    ),
  });

  const fresh = (rows: StopRow[]) =>
    rows.map((row) => ({ ...row, s: { ...row.s } }));

  /** The phase a step opens on: armed, the list, or the plain question. */
  const phaseOf = (picked: Step): StopJob["phase"] => {
    if (picked === "forget-armed") {
      return "armed";
    }
    return picked === "forget-running" || picked === "delete-running"
      ? "list"
      : "none";
  };

  function stepTray(picked: Step) {
    const phase = phaseOf(picked);
    return trayOf({
      kind: picked.startsWith("forget") ? "forget" : "delete",
      fromDisk: [
        "delete-files",
        "delete-hub",
        "refused-away",
        "refused-shared",
      ].includes(picked),
      phase,
      projectName: pageName,
      rows: phase === "none" ? [] : fresh(RUNNING),
      ...(picked === "delete-hub" ? { places: [] } : {}),
      refusal: refusalsOf(pageName)[picked] ?? null,
    });
  }

  /** It opens on a delete asked with four running: the tray at its fullest. */
  let step = $state<Step | "">("delete-running");
  let tray = $state<ReturnType<typeof stepTray> | null>(
    stepTray("delete-running")
  );
  let more = $state<HTMLElement | null>(null);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, run: () => void) =>
    timers.push(setTimeout(run, ms));

  function show(next: Step | ""): void {
    for (const timer of timers.splice(0)) {
      clearTimeout(timer);
    }
    step = next;
    tray = next ? stepTray(next) : null;
  }

  /** Cancel, Close or Escape: the tray goes, Step back to none, the focus back to More. */
  function cancel(): void {
    show("");
    more?.focus();
  }

  /** The confirm, as the job would take it (stop-work `press`). */
  function play(): void {
    const job = tray?.job;
    if (!job || ["stopping", "ending", "done"].includes(job.phase)) {
      return;
    }
    const midTurn = job.rows.some(
      (row) =>
        row.state === "running" && (ACTIVITY[row.s.id] ?? "idle") !== "idle"
    );
    if (job.phase === "list" && midTurn) {
      job.phase = "armed";
      return;
    }
    if (job.refusal === projectTrashWords.stillRuns(job.projectName, 1)) {
      // The hub's refusal listed what runs (stop-work listStarted): the
      // tray asks again on it, the refusal kept above the confirm.
      job.rows = fresh(RUNNING.slice(1, 2));
      job.phase = "list";
      return;
    }
    job.refusal = null;
    if (job.rows.length > 0 && job.phase !== "none") {
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
    later(1200, () => {
      job.phase = "done";
      // Held where it was asked, then the page leaves for home, as
      // stop-work's end does; a forgotten project now heads Forgotten
      // projects, and the toast brings it back.
      later(1400, () => {
        const name = job.projectName;
        const forgot = job.kind === "forget";
        show("");
        view = "home";
        if (forgot) {
          const entry = forgottenOf(job);
          list = [entry, ...list];
          toast(projectEndWords.forgot(name), {
            id: `forgot:${name}`,
            action: {
              label: projectEndWords.bringBack,
              onClick: () => {
                list = list.filter((each) => each !== entry);
                pageName = name;
                view = "project";
              },
            },
          });
        }
      });
    });
  }

  /* ── Forgotten projects ─────────────────────────────────────────── */

  /** The project just forgotten, as the hub's trash would list it. */
  function forgottenOf(job: StopJob): ForgottenProject {
    return {
      id: `forgot-${job.projectName}`,
      name: job.projectName,
      by: null,
      forgottenAt: Date.now(),
      hints: null,
      brings: {
        account: null,
        browsers: 1,
        folder: true,
        memoryDocs: 0,
        notes: 0,
        pages: 2,
        places: 1 + job.places.length,
        routines: 0,
        rows: 40,
        rules: 0,
        sessions: 4,
        settings: true,
        tasks: 6,
        tasksIn: null,
      },
      places: job.places.map((place) => ({
        kind: "checkout" as const,
        machineId: place.machineId,
        machineName: MACHINES[place.machineId] ?? place.machineId,
        path: place.path,
        within: place.within,
      })),
    };
  }

  let list = $state<ForgottenProject[]>(ALL.map((one) => ({ ...one })));
  let refused = $state<Record<string, string>>({});
  const beat = () => new Promise((resolve) => setTimeout(resolve, 900));

  async function bringBack(
    one: ForgottenProject,
    name?: string
  ): Promise<boolean> {
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
    // It lands in the project's page.
    pageName = one.name ?? name ?? NAME;
    view = "project";
    show("");
    return true;
  }

  async function remove(
    one: ForgottenProject,
    fromDisk: boolean
  ): Promise<void> {
    await beat();
    // Balcony garden's checkout is on obelisk: deleting it with its files
    // while obelisk is away is refused, as the hub would.
    if (fromDisk && one.id === BALCONY.id) {
      throw new Error(
        projectTrashWords.machinesAway("Balcony garden", ["obelisk"])
      );
    }
    list = list.filter((each) => each.id !== one.id);
  }
</script>

<svelte:head>
  <title>Ending a project &middot; CawCo</title>
</svelte:head>

<!-- Where the app's layout stands its toasts: the top on a phone, the corner on a desk. -->
<Toaster
  data-safe-bottom
  expand
  position={narrowToasts.current ? "top-center" : "bottom-right"}
/>

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
        <TabItem label="Home" value="home" />
      </TabsList>
    </Tabs>
    {#if view === "project"}
      <label class="flex items-center gap-space-2 type-label text-ink-muted">
        Step
        <NativeSelect
          aria-label="Step"
          onchange={(event) => show(event.currentTarget.value as Step | "")}
          value={step}
        >
          <NativeSelectOption value="">None</NativeSelectOption>
          {#each Object.entries(STEPS) as [value, label] (value)}
            <NativeSelectOption {value}>{label}</NativeSelectOption>
          {/each}
        </NativeSelect>
      </label>
    {/if}
  </div>

  {#if view === "project"}
    <!-- The project page's head, as it stands under the bar. -->
    <div
      class="flex min-w-0 items-center gap-space-3 pt-space-5 ps-space-7 pe-space-6 max-desk:px-space-5"
    >
      <h1 class="m-0 me-auto type-title text-balance text-ink-strong">
        {pageName}
      </h1>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              aria-label={commonWords.moreFor(pageName)}
              bind:this={more}
              class="grid size-c-btn-h-sm select-none place-items-center rounded-full touch-hit press-tint"
              type="button"
            >
              <IconMore aria-hidden="true" class="size-icon-md" />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="end"
          onCloseAutoFocus={(event) => {
            if (tray) {
              event.preventDefault();
            }
          }}
        >
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
          <DropdownMenu.Item onSelect={() => show("forget-running")}>
            <IconArchive />
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
      <!-- As the board's wrapper does (stop-tray-here): the focus on Cancel as it opens. -->
      <div
        class="contents"
        style:--ask-end="var(--spacing-space-5)"
        {@attach (node) => {
          const frame = requestAnimationFrame(() =>
            node.querySelector<HTMLElement>("[data-stop-cancel]")?.focus()
          );
          return () => cancelAnimationFrame(frame);
        }}
      >
        <StopTrayView
          activityOf={(id) => ACTIVITY[id] ?? "idle"}
          class="tray-indent-space-7 max-w-128 max-desk:tray-indent-space-5"
          fillOf={(row) => `var(--color-mark-${(row.s.id.length % 8) + 1})`}
          job={tray.job}
          nameOf={(id) => MACHINES[id] ?? id}
          onarrive={(row) => {
            row.arrived = true;
          }}
          oncancel={cancel}
          onconfirm={play}
          onkeep={() => {
            show("");
            more?.focus();
          }}
          ondepart={(row) => {
            row.departed = true;
          }}
          onfromdisk={(on) => {
            if (tray) {
              tray.job.fromDisk = on;
            }
          }}
          ongone={(row) => {
            row.gone = true;
          }}
          onstopone={() => undefined}
          share="stop-tray:preview"
          trailOf={() => ""}
          words={tray.job.kind === "delete"
            ? projectEndWords.delete(
                tray.job.projectName,
                tray.job.fromDisk && tray.job.places.length > 0
              )
            : projectEndWords.forget(tray.job.projectName)}
        />
      </div>
    {/if}
  {:else if view === "home"}
    <!-- Where the app goes once a project's page is gone (stop-work's end,
         route.spoke): the home stands for it here. -->
    <div class="px-space-7 pt-space-5 max-desk:px-space-5">
      <h1 class="m-0 type-title text-ink-strong">Home</h1>
    </div>
  {:else}
    <ForgottenPage
      {bringBack}
      holderOf={(one) =>
        one.id === BALCONY.id ? { href: "#garden", name: "Garden" } : null}
      {list}
      now={NOW}
      refusalOf={(id) =>
        refused[id] ? { reason: refused[id], standing: true } : null}
      reread={() => undefined}
      {remove}
    />
  {/if}
</div>
