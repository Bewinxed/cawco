<script lang="ts">
  import type {
    IssueTracker,
    TrackerView,
  } from "@cawco/core/trackers";
  /**
   * Project details, live (ProjectDetails.stories.ts): HyucksField's tray as
   * it unfolds under its head, its reads and changes answered here as the
   * hub would, each change after a short wait. What a press changed is held
   * here as the hub would hold it, laid over the project the args draw; Start
   * again (`again`) clears it.
   */
  import type { 
    AccountsView,
    Machine,ProjectPlace, ProjectRow, } from "#lib/cawco/client.svelte.js";
  import { provideHub } from "#lib/cawco/hub-seam.js";
  import ProjectDetails, { type ProjectEdits } from "./ProjectDetails.svelte";

  type Tracked = "cawco" | "github";
  type AccountSet = "routing" | "work" | "signed-out";
  type Decides = "fleet" | "own";

  let {
    machinesJoined = 2,
    tracked = "github",
    account = "routing",
    decides = "fleet",
    again = 0,
  }: {
    /** Machines in the fleet: one, or two. */
    machinesJoined?: 1 | 2;
    /** Where its tasks live as the tray opens. */
    tracked?: Tracked;
    /** The account its sessions start on as the tray opens. */
    account?: AccountSet;
    /** Who decides, as decides.md reads. */
    decides?: Decides;
    /** Start again: counts his presses. */
    again?: number;
  } = $props();

  const ID = "d3b6b1f4-04d1-4ab4-ab80-ba08a60943d7";
  const NOW = Date.parse("2026-11-18T09:00:00Z");

  const machine = (
    machineId: string,
    hostname: string,
    os: string
  ): Machine => ({
    auth: "authenticated",
    hostname,
    lastSeenAt: NOW,
    machineId,
    os,
    pausedUntil: null,
    pauseStopped: null,
    status: "online",
  });

  const machines = $derived(
    [
      machine("m-obelisk", "obelisk-of-light", "linux"),
      machine("m-macbook", "omars-macbook-pro", "darwin"),
    ].slice(0, machinesJoined)
  );

  const place = (
    id: string,
    machineId: string,
    path: string,
    kind: ProjectPlace["kind"],
    isPrimary: boolean
  ): ProjectPlace => ({
    createdAt: "2026-10-02T08:14:00Z",
    id,
    isPrimary,
    kind,
    machineId,
    path,
    projectId: ID,
    within: [],
  });

  const placesDrawn = $derived([
    place(
      "p-primary",
      "m-obelisk",
      "/home/bewinxed/projects/hyucksfield-game-client",
      "checkout",
      true
    ),
    ...(machinesJoined === 2
      ? [
          place(
            "p-mac",
            "m-macbook",
            "/Users/omar/Developer/clients/hyucksfield/game-client-ios-port",
            "checkout",
            false
          ),
        ]
      : []),
    place("p-hub", "hub", `projects/${ID}`, "hub", false),
  ]);

  const ACCOUNTS = [
    { id: "a-work", label: "Work · Max 20x", hue: "blue" },
    { id: "a-personal", label: "Personal · Pro", hue: "amber" },
    { id: "a-console", label: "Petra Lab Console", hue: "green" },
  ] as const;

  const accounts = $derived<AccountsView>({
    accounts: ACCOUNTS.map((one, order) => ({
      atPlanLimit: "move",
      createdAt: NOW,
      email: `${one.id.slice(2)}@example.com`,
      hue: one.hue,
      id: one.id,
      identity: null,
      kind: "subscription",
      label: one.label,
      neverBackup: false,
      order,
      provider: "anthropic",
      reservePct: null,
    })),
    bench: [],
    catalogFaults: [],
    catalogs: [],
    pending: [],
    readings: [],
    rebalances: [],
    routing: [],
    signins: ACCOUNTS.filter(
      (one) => !(account === "signed-out" && one.id === "a-work")
    ).map((one) => ({
      accountId: one.id,
      checkedAt: NOW,
      machineId: "m-obelisk",
      movedAt: null,
      movedFrom: null,
      reason: null,
      refusalReach: null,
      state: "signed-in",
    })),
  });

  /* What his presses changed, as the hub would hold it. */
  let changed = $state<Partial<ProjectRow>>({});
  let places = $state<ProjectPlace[] | null>(null);
  let bound = $state<TrackerView | null>(null);
  let seen = -1;
  $effect.pre(() => {
    if (again !== seen) {
      seen = again;
      changed = {};
      places = null;
      bound = null;
    }
  });

  const project = $derived<ProjectRow>({
    account: account === "routing" ? null : "a-work",
    accountAtLimit: "wait",
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: "2026-10-02T08:14:00Z",
    eventsOn: true,
    id: ID,
    lands: "pr",
    lfsConnection: null,
    lfsUrl: null,
    links: ["github.com/bewinxed/hyucksfield-game-client"],
    name: "HyucksField",
    places: places ?? placesDrawn,
    primaryPlaceId: "p-primary",
    review: false,
    ...changed,
  });

  const viewOf = (provider: IssueTracker, target: string): TrackerView => ({
    tracker: provider,
    binding: {
      boundAt: NOW,
      connection: provider === "github" ? "github-bewinxed" : "linear-petra",
      githubProject: null,
      githubProjectReason: null,
      linked: 38,
      polledAt: NOW - 4 * 60_000,
      provider,
      reason: null,
      state: "synced",
      target,
      targetName: target,
      targetUrl: `https://github.com/${target}`,
    },
  });

  const trackerNow = $derived<TrackerView>(
    bound ??
      (tracked === "github"
        ? viewOf("github", "bewinxed/hyucksfield-game-client")
        : { tracker: "cawco", binding: null })
  );

  const REPOS = [
    "bewinxed/hyucksfield-game-client",
    "bewinxed/hyucksfield-server",
    "bewinxed/hyucksfield-art-pipeline",
    "petralab/marketing-site",
  ];

  /** The hub's answers, by what was asked. */
  function answer(path: string): unknown {
    if (path.endsWith("/tracker")) {
      return trackerNow;
    }
    if (path.endsWith("/decides")) {
      return {
        file: "decides.md",
        decides: {
          from:
            decides === "fleet"
              ? { look: "fleet", behaviour: "fleet", scope: "fleet" }
              : { look: "project", behaviour: "project", scope: "fleet" },
          problems: [],
        },
      };
    }
    if (path.startsWith("/api/connections/") && path.includes("/targets")) {
      const linear = path.includes("linear");
      return {
        targets: linear
          ? [{ id: "team-hyf", name: "HyucksField", url: "https://linear.app" }]
          : REPOS.map((id) => ({
              id,
              name: id,
              url: `https://github.com/${id}`,
            })),
      };
    }
    if (path.includes("/github-projects")) {
      return {
        refused: null,
        projects: [
          {
            id: "PVT_hyf",
            title: "HyucksField launch",
            linked: true,
            url: "https://github.com/users/bewinxed/projects/4",
            options: ["Backlog", "In progress", "In review", "Done"].map(
              (name) => ({ id: `o-${name}`, name })
            ),
          },
        ],
      };
    }
    if (path.endsWith("/stages")) {
      return {
        stages: ["Backlog", "In progress", "Review", "Done"].map((name) => ({
          name,
        })),
      };
    }
    if (path === "/api/connections") {
      return {
        connections: [
          {
            name: "github-bewinxed",
            service: "GitHub",
            auth: "app",
            account: "bewinxed",
            hasSecret: true,
          },
          {
            name: "linear-petra",
            service: "Linear",
            auth: "app",
            account: "Petra Lab",
            hasSecret: true,
          },
          {
            name: "r2-lfs",
            service: "Cloudflare",
            auth: "bearer",
            account: "r2",
            hasSecret: true,
          },
        ],
      };
    }
    throw new Error(`The stand-in hub has no answer for ${path}.`);
  }

  /** The hub's wait before an answer. */
  const waits = () => new Promise((done) => setTimeout(done, 600));

  provideHub({
    state: "connected",
    read: async <T,>({ path }: { path: string }) => {
      await waits();
      return answer(path) as T;
    },
  });

  const edits: ProjectEdits = {
    async edit(_id, change) {
      await waits();
      const { lfs, ...rest } = change;
      changed = {
        ...changed,
        ...rest,
        ...(lfs === undefined
          ? {}
          : { lfsUrl: lfs?.url ?? null, lfsConnection: lfs?.connection ?? null }),
      };
      return project;
    },
    async addPlace(_id, machineId, path) {
      await waits();
      places = [
        ...project.places.filter((each) => each.kind !== "hub"),
        place(`p-${Date.now()}`, machineId, path, "checkout", false),
        ...project.places.filter((each) => each.kind === "hub"),
      ];
      return project;
    },
    async removePlace(_id, placeId) {
      await waits();
      places = project.places.filter((each) => each.id !== placeId);
    },
    async movePlace(_id, placeId, path) {
      await waits();
      places = project.places.map((each) =>
        each.id === placeId ? { ...each, path } : each
      );
      return project;
    },
    async setTracker(_id, asked) {
      await waits();
      bound =
        asked.tracker === "cawco"
          ? { tracker: "cawco", binding: null }
          : viewOf(asked.tracker, asked.target);
      return bound;
    },
    async syncTracker() {
      await waits();
      return trackerNow;
    },
  };
</script>

<!-- The tray stands on the page's ground, under where the head would be. -->
<div class="bg-background py-space-4">
  {#key again}
    <ProjectDetails
      {accounts}
      {edits}
      {machines}
      onclose={() => undefined}
      {project}
    />
  {/key}
</div>
