<script lang="ts">
  /**
   * PROJECT PAGE BENCH (dev only): the real project page, in its workspace
   * tab inside the real shell (the rail, the tabs, Caw's panel), on
   * Cawco-Dev's and Private office's records as the hub served them on
   * 2026-11-06 (`records.json`: the projects, the machines, the rail's
   * sessions, the fleet's asks, each project's tasks, stages, views,
   * blocks, decisions and Caw, the waiting tasks and pages read one by
   * one, and the newest rows of each project's conversation), no hub. The bench stands its own hub
   * (client.svelte.ts `standHub`, bench-api.ts `standApi`), seeds the
   * store as the socket's first frame does, and goes to the project's own
   * route, its records kept standing there.
   *
   * - `?project=dev` (default) Cawco-Dev; `po` Private office; `new` a
   *   project just made, nothing set up, Caw starting on the person's words;
   * - `?waits=none`: nothing waits (no task on you, every page decided, no
   *   ask);
   * - `?caw=open|closed`: Caw's panel as the person last left it;
   * - `?split`: Cawco-Dev and Private office side by side, two groups;
   * - every other parameter goes to the project's address (`view`, `task`,
   *   `page`, …).
   */
  import type { InstanceRow } from "@cawco/core/protocol";
  import { onMount } from "svelte";
  import { standApi } from "#lib/cawco/bench-api.js";
  import { store } from "#lib/cawco/storage.js";
  import { projectHref, projectTab } from "#lib/cawco/workspace/tabs.js";
  import { workspace } from "#lib/cawco/workspace/workspace.svelte.js";
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import RECORDS from "./records.json";

  type Records = typeof RECORDS;
  type Reads = Record<string, unknown> & {
    "/tasks": { tasks: Record<string, unknown>[] };
    "/decisions": { pages: Record<string, unknown>[] };
    dates: Record<string, unknown>;
  };

  /** A project's own read: `/api/projects/<id><rest>`. */
  const PROJECT_READ = /^\/api\/projects\/([^/]+)(\/.*)?$/u;
  /** A conversation's newest page: `/api/instances/<id>/transcript`. */
  const TRANSCRIPT = /^\/api\/instances\/([^/]+)\/transcript$/u;
  const DEV = "70ac3d41-5a28-4a31-8e9e-3be2b03d1516";
  const PO = "ffb5d15a-a509-43ce-b94e-cd8bf20b48e9";
  const NEW = "bench-new-project";
  const asked = page.url.searchParams;
  /** `?project=`'s project, Cawco-Dev by default. */
  const PROJECTS: Record<string, string> = { po: PO, new: NEW };
  const projectId = PROJECTS[asked.get("project") ?? ""] ?? DEV;
  const clear = asked.get("waits") === "none";

  /** A task with nothing on you. */
  const settled = (task: Record<string, unknown>) => ({
    ...task,
    needsYou: false,
    waits: [],
  });
  /** A project's reads, waits cleared on `waits=none`. */
  const readsOf = (id: string): Reads | null => {
    const own = (RECORDS.reads as Record<string, Reads>)[id];
    if (!own) {
      return null;
    }
    if (!clear) {
      return own;
    }
    return {
      ...own,
      "/tasks": { ...own["/tasks"], tasks: own["/tasks"].tasks.map(settled) },
      "/tasks?needsYou=1": { ...own["/tasks"], tasks: [] },
      "/decisions": {
        ...own["/decisions"],
        pages: own["/decisions"].pages.map((one) => ({
          ...one,
          state: "decided",
        })),
      },
    };
  };

  /** A project just made: the person's words sent, nothing set up yet. */
  const fresh = {
    ...(RECORDS.projects.find(
      (one) => one.id === DEV
    ) as Records["projects"][number]),
    id: NEW,
    name: "Release notes desk",
    conversationInstanceId: null,
    template: null,
    createdAt: new Date().toISOString(),
    links: [],
  };
  const NEW_READS = {
    "/tasks": { tracker: "cawco", tasks: [], problems: [], stagesProblems: [] },
    "/stages": {
      source: "none",
      stages: [],
      views: [],
      problems: [],
      starters: [],
      routineStarters: [],
      decisionStarters: [],
    },
    "/views": [],
    "/blocks": { pages: {} },
    "/tasks?archived=1": { tasks: [] },
    "/decisions": { pages: [], graph: { nodes: [], edges: [] }, problems: [] },
    "/caw": {
      instanceId: null,
      on: true,
      harness: "claude",
      model: null,
      mode: null,
      problem: null,
      running: [],
      spendUsd: 0,
      starting: false,
      startingId: null,
      hearsTasks: true,
      attemptsHearComments: true,
    },
  };

  const projects = [...RECORDS.projects, ...(projectId === NEW ? [fresh] : [])];

  /** The answer to a read the bench holds, by its path and query. */
  function answer(path: string, method: string, query: URLSearchParams) {
    const match = PROJECT_READ.exec(path);
    if (path === "/api/projects") {
      return projects;
    }
    if (path === "/api/agents") {
      return RECORDS.machines;
    }
    if (path === "/api/instances") {
      return RECORDS.instances;
    }
    if (path === "/api/pending") {
      return clear ? [] : RECORDS.pending;
    }
    if (path === "/api/person") {
      return RECORDS.person;
    }
    const transcript = TRANSCRIPT.exec(path);
    if (transcript) {
      return (RECORDS.transcripts as Record<string, unknown>)[
        decodeURIComponent(transcript[1] ?? "")
      ];
    }
    if (path === "/api/actions/waiting") {
      return { actions: [] };
    }
    if (!match) {
      return;
    }
    const [, id, rest = ""] = match;
    const reads = id === NEW ? NEW_READS : readsOf(id ?? "");
    if (!reads) {
      return;
    }
    if (rest === "/view-tools/tasks" && method === "POST") {
      const dates = (reads as Reads).dates ?? {};
      return {
        rows: (reads as Reads)["/tasks"].tasks.map((task) => ({
          ...task,
          dates: dates[task.id as string] ?? {},
        })),
      };
    }
    const key = query.size > 0 ? `${rest}?${query}` : rest;
    return (reads as Record<string, unknown>)[key];
  }

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: { projects: unknown[]; machines: unknown[] };
        standHub: (answer: () => void) => void;
        frame: (frame: unknown) => void;
      };
    }
  ).__cawcoDebug;

  onMount(() => {
    if (!browser) {
      return;
    }
    standApi(answer);
    debug.standHub(() => undefined);
    debug.state.projects.splice(0, Number.POSITIVE_INFINITY, ...projects);
    debug.frame({
      kind: "instances",
      agents: RECORDS.machines,
      instances: RECORDS.instances as unknown as InstanceRow[],
      moves: [],
    });
    if (!clear) {
      for (const one of RECORDS.pending as { payload: unknown }[]) {
        debug.frame(one.payload);
      }
    }
    const caw = asked.get("caw");
    for (const id of [DEV, PO, NEW]) {
      if (caw) {
        store("local", `cawco.caw.open.${id}`, caw === "open" ? "1" : "0");
      }
    }
    // What goes on to the project's own address.
    const on = new URLSearchParams(asked.toString());
    for (const name of ["project", "waits", "caw", "split"]) {
      on.delete(name);
    }
    const search = on.size > 0 ? `?${on}` : "";
    if (asked.has("split")) {
      workspace.openProject(PO);
      workspace.openProject(DEV);
      const group = workspace.leafOf(projectTab(DEV));
      if (group) {
        workspace.split(group.id, "right", projectTab(PO));
      }
    }
    goto(`${projectHref(projectId, "")}${search}`, { replaceState: true });
  });
</script>
