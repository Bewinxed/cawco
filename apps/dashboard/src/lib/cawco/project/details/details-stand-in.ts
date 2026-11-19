/**
 * The hub as the live states file of the project details card meets it
 * (ProjectDetails.stories.ts): what the hub holds of one product-shaped
 * project (records.ts), answered by method and path to the calls the card
 * makes, after a hub's wait, with a yes or with the refusal the `answer`
 * dial names; and the frames it pushes, written through each store's own
 * writer (the board's machines, the fleet's accounts, the projects, the
 * moves). Out of reach, it answers nothing.
 */
import type { Account, AccountSignin } from "@cawco/core/accounts";
import type { ConnectionView } from "@cawco/core/connections";
import { LANDS_MODES } from "@cawco/core/injected";
import { isRecord } from "@cawco/core/is-record";
import type { MoveEstimate, MoveJob } from "@cawco/core/move";
import type { TrackerView } from "@cawco/core/trackers";
import type { HubState } from "#lib/cawco/hub/socket.svelte.js";
import type { HubSeam } from "#lib/cawco/hub-seam.js";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import { hubThrough } from "#lib/platform/hub.js";
import { Timers } from "./card-state";
import {
  BIG_FILE_SIGN_INS,
  BOARDS,
  MACHINES,
  PROJECT,
  STAGES,
  TASK_SIGN_INS,
  TASK_TARGETS,
  TRACKER,
} from "./records";

/** What the hub says of the project as the card opens. */
const LIVE_SITUATIONS = [
  "all-well",
  "signed-out",
  "tasks-refused",
  "only-here",
  "computer-away",
  "no-code",
  "unreachable",
] as const;
export type LiveSituation = (typeof LIVE_SITUATIONS)[number];

/** How the hub answers a change. */
export type Answer = "yes" | "refuse";

/** Where every path the card asks starts. */
const API = /^\/api\//u;

/** The hub's wait before it answers, ms. */
const WAIT = 900;
/** Each step of a copy, ms. */
const STEP = 1400;

const NOW = new Date(2026, 10, 19, 14, 2).getTime();

const accountRow = (
  id: string,
  label: string,
  provider: string,
  order: number
): Account => ({
  atPlanLimit: "price",
  createdAt: NOW,
  email: `${label.toLowerCase()}@acme.dev`,
  hue: "cyan",
  id,
  identity: null,
  kind: "subscription",
  label,
  neverBackup: false,
  order,
  provider,
  reservePct: null,
  sessionReservePct: null,
});

/** The fleet's AI accounts, by the names they carry everywhere. */
const ACCOUNTS: Account[] = [
  accountRow("acc-work", "Work", "anthropic", 0),
  accountRow("acc-personal", "Personal", "anthropic", 1),
  accountRow("acc-studio", "Studio", "openai", 2),
  accountRow("acc-research", "Research", "google", 3),
  accountRow("acc-client", "Client · Brightwater Labs", "anthropic", 4),
];

const signin = (accountId: string, state: "signed-in" | "signed-out") =>
  ({
    accountId,
    checkedAt: NOW,
    machineId: "m-obelisk",
    movedAt: null,
    movedFrom: null,
    reason: null,
    refusalReach: null,
    state,
  }) satisfies AccountSignin;

const connection = (
  name: string,
  account: string,
  service: string,
  auth: ConnectionView["auth"]
): ConnectionView => ({
  account,
  areas: [],
  auth,
  createdAt: NOW,
  hasSecret: true,
  id: `conn-${name}`,
  name,
  projects: [],
  service,
  state: "signed-in",
  transport: "http",
  updatedAt: NOW,
});

/** The fleet's sign-ins: two for GitHub, one for Linear, two keys for big files. */
const CONNECTIONS: ConnectionView[] = [
  ...TASK_SIGN_INS.github.map((s, at) =>
    connection(s.name, s.account, "github", at === 0 ? "app" : "bearer")
  ),
  ...TASK_SIGN_INS.linear.map((s) =>
    connection(s.name, s.account, "linear", "app")
  ),
  ...BIG_FILE_SIGN_INS.map((s) =>
    connection(s.name, s.account, "files", "header")
  ),
];

const refusal = (detail: string): Response =>
  Response.json(
    { type: "about:blank", title: detail, detail, status: 409 },
    { status: 409, headers: { "content-type": "application/problem+json" } }
  );

/** The hub's words for each refusal the `answer` dial names. */
const REFUSED = {
  project: "acme-bot may not open branches on acme/hyucksfield (403).",
  place:
    "render-box isn't answering, so ~/sites/hyucksfield can't be read there yet.",
  tracker: "Bad credentials: acme-bot's key was revoked on Nov 18 (401).",
  copy: "studio-mac has 1.2 GB free; copying needs 2.6 GB.",
};

/** What the hub writes into the stores, as its frames would: each store's own writer. */
export interface HubFrames {
  heardMove: (job: MoveJob) => void;
  holdAccounts: (view: AccountsView) => void;
  holdMachines: (machines: Machine[]) => void;
  holdProject: (row: ProjectRow) => void;
}

export class DetailsStandIn {
  readonly state: HubState;
  project: ProjectRow;
  #tracker: TrackerView;
  readonly #answer: () => Answer;
  readonly #frames: HubFrames;
  readonly #timers = new Timers();
  readonly seam: HubSeam;

  /** The person's presses of Start again: a new count is a new start. */
  readonly again: number;

  constructor(
    situation: LiveSituation,
    answer: () => Answer,
    frames: HubFrames,
    again: number
  ) {
    this.again = again;
    this.#answer = answer;
    this.#frames = frames;
    this.state = situation === "unreachable" ? "unreachable" : "connected";
    this.project =
      situation === "no-code"
        ? {
            ...PROJECT,
            links: [],
            places: PROJECT.places.filter((place) => place.kind === "hub"),
            primaryPlaceId: null,
            account: null,
          }
        : { ...PROJECT, account: "acc-work" };
    this.#tracker =
      situation === "only-here" || situation === "no-code"
        ? { tracker: "cawco", binding: null }
        : TRACKER;
    if (situation === "tasks-refused" && TRACKER.binding) {
      this.#tracker = {
        ...TRACKER,
        binding: {
          ...TRACKER.binding,
          state: "refused",
          reason:
            "Resource not accessible by integration. The acme-bot app lost access to acme/hyucksfield on Nov 18.",
        },
      };
    }
    const SIGNED_OUT: Partial<Record<LiveSituation, string[]>> = {
      "signed-out": ["acc-work", "acc-personal"],
      "no-code": ACCOUNTS.map((one) => one.id),
    };
    const signedOut = SIGNED_OUT[situation] ?? ["acc-personal"];
    frames.holdMachines(
      MACHINES.map((row) =>
        situation === "computer-away" && row.machineId === "m-studio"
          ? { ...row, status: "offline" }
          : row
      )
    );
    frames.holdAccounts({
      access: [],
      accounts: ACCOUNTS,
      bench: [],
      catalogFaults: [],
      catalogs: [],
      codexLeaving: [],
      codexSignins: [],
      credit: [],
      pending: [],
      readings: [],
      rebalances: [],
      routing: [],
      signins: ACCOUNTS.map((one) =>
        signin(one.id, signedOut.includes(one.id) ? "signed-out" : "signed-in")
      ),
    });
    frames.holdProject(this.project);
    const reachable = this.state !== "unreachable";
    this.seam = {
      state: this.state,
      // Eden's client, its fetch answered here by method and path (a proxy
      // of fetch, so it keeps what else fetch carries).
      client: hubThrough(
        new Proxy(fetch, {
          apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) =>
            reachable
              ? this.#answerTo(String(input), init?.method ?? "GET", init?.body)
              : Promise.reject(new TypeError("Failed to fetch")),
        })
      ),
    };
  }

  /** Stops every wait: the story was set again. */
  dispose(): void {
    this.#timers.clear();
  }

  get #refuses(): boolean {
    return this.#answer() === "refuse";
  }

  #keep(row: ProjectRow): Response {
    this.project = row;
    return Response.json(row);
  }

  /** The hub's answer to one call, after its wait. */
  #answerTo(
    url: string,
    method: string,
    body: BodyInit | null | undefined
  ): Promise<Response> {
    const [path = "", query = ""] = url.split("?");
    const parts = path.replace(API, "").split("/");
    const sent = typeof body === "string" ? JSON.parse(body) : {};
    return new Promise((answer) =>
      this.#timers.after(WAIT, () =>
        answer(this.#route(parts, method, sent, new URLSearchParams(query)))
      )
    );
  }

  #route(
    parts: string[],
    method: string,
    sent: Record<string, unknown>,
    query: URLSearchParams
  ): Response {
    const [head, id, what, more] = parts;
    if (head === "connections") {
      return this.#connections(id, what, query);
    }
    if (head === "moves" && id) {
      return this.#settle(id, what === "retry" ? "retry" : "cancel");
    }
    if (head === "projects" && !id) {
      return Response.json([this.project]);
    }
    switch (what) {
      case undefined:
        return this.#refuses
          ? refusal(REFUSED.project)
          : this.#keep({ ...this.project, ...this.#edit(sent) });
      case "places":
        return this.#places(method, more, sent);
      case "tracker":
        return this.#trackerCall(method, more, sent);
      case "stages":
        return Response.json({
          decisionStarters: [],
          moves: [],
          problems: [],
          routineStarters: [],
          stages: STAGES.map((name) => ({
            hooks: {},
            kind: "work",
            name,
          })),
          views: [],
        });
      case "move-estimate":
        return Response.json(this.#estimate(query));
      case "moves":
        return this.#refuses
          ? refusal(REFUSED.copy)
          : this.#copy(String(sent.machineId), String(sent.path ?? ""));
      default:
        return refusal(
          `The stand-in hub has no answer for ${parts.join("/")}.`
        );
    }
  }

  /** A project edit as the hub applies it: `lfs` names the address and its sign-in. */
  #edit(sent: Record<string, unknown>): Partial<ProjectRow> {
    const { lfs, lands, account, accountAtLimit } = sent;
    const change: Partial<ProjectRow> = {};
    const mode = LANDS_MODES.find((each) => each === lands);
    if (mode) {
      change.lands = mode;
    }
    if (account === null || typeof account === "string") {
      change.account = account;
    }
    if (accountAtLimit === "wait" || accountAtLimit === "move") {
      change.accountAtLimit = accountAtLimit;
    }
    if (lfs === null) {
      change.lfsUrl = null;
      change.lfsConnection = null;
    } else if (isRecord(lfs)) {
      change.lfsUrl = String(lfs.url);
      change.lfsConnection = String(lfs.connection);
    }
    return change;
  }

  #places(
    method: string,
    placeId: string | undefined,
    sent: Record<string, unknown>
  ): Response {
    if (this.#refuses) {
      return refusal(REFUSED.place);
    }
    if (method === "DELETE") {
      return this.#keep({
        ...this.project,
        places: this.project.places.filter((place) => place.id !== placeId),
      });
    }
    return this.#keep({
      ...this.project,
      places: [
        ...this.project.places,
        {
          createdAt: new Date(NOW).toISOString(),
          id: `pl-${this.project.places.length + 1}`,
          isPrimary: false,
          kind: "checkout",
          machineId: String(sent.machineId),
          path: String(sent.path),
          found: true,
          made: false,
          missing: false,
          projectId: this.project.id,
          within: [],
        },
      ],
    });
  }

  #trackerCall(
    method: string,
    more: string | undefined,
    sent: Record<string, unknown>
  ): Response {
    if (method === "GET") {
      return Response.json(this.#tracker);
    }
    if (this.#refuses) {
      return refusal(REFUSED.tracker);
    }
    const { binding } = this.#tracker;
    if (more === "sync" && binding) {
      this.#tracker = {
        ...this.#tracker,
        binding: {
          ...binding,
          state: "synced",
          reason: null,
          polledAt: Date.now(),
        },
      };
    } else if (sent.tracker === "cawco") {
      this.#tracker = { tracker: "cawco", binding: null };
    } else if (sent.tracker === "github" || sent.tracker === "linear") {
      const target = String(sent.target);
      const name =
        TASK_TARGETS[sent.tracker].find((t) => t.id === target)?.name ?? target;
      const { githubProject } = sent;
      const board = BOARDS.find(
        (b) => isRecord(githubProject) && b.id === githubProject.id
      );
      this.#tracker = {
        tracker: sent.tracker,
        binding: {
          boundAt: Date.now(),
          connection: String(sent.connection),
          githubProject: board
            ? {
                fieldId: "PVTSSF_status",
                id: board.id,
                map: {},
                number: 4,
                options: board.columns,
                title: board.name,
                url: "https://github.com/orgs/acme/projects/4",
              }
            : null,
          githubProjectReason: null,
          linked: 0,
          polledAt: null,
          provider: sent.tracker,
          reason: null,
          state: "syncing",
          target,
          targetName: name,
          targetUrl:
            sent.tracker === "github"
              ? `https://github.com/${target}`
              : `https://linear.app/acme/team/${target}`,
        },
      };
    }
    return Response.json(this.#tracker);
  }

  #connections(
    name: string | undefined,
    what: string | undefined,
    query: URLSearchParams
  ): Response {
    if (!name) {
      return Response.json({ connections: CONNECTIONS });
    }
    const service = CONNECTIONS.find((each) => each.name === name)?.service;
    const targets =
      service === "linear" ? TASK_TARGETS.linear : TASK_TARGETS.github;
    if (what === "targets") {
      const words = (query.get("search") ?? "").toLowerCase();
      return Response.json({
        targets: targets
          .filter((t) => t.name.toLowerCase().includes(words))
          .map((t) => ({
            id: t.id,
            name: t.name,
            url: `https://github.com/${t.id}`,
          })),
        more: false,
      });
    }
    return name === "Sam's token"
      ? Response.json({
          projects: [],
          refused:
            "Your token has not been granted the required scopes to read projects: read:project.",
        })
      : Response.json({
          projects: BOARDS.map((board, at) => ({
            fieldId: board.columns.length > 0 ? "PVTSSF_status" : null,
            id: board.id,
            linked: at === 0,
            number: at + 4,
            options: board.columns,
            title: board.name,
            url: `https://github.com/orgs/acme/projects/${at + 4}`,
          })),
          refused: null,
        });
  }

  #estimate(query: URLSearchParams): MoveEstimate {
    const machine = query.get("machine");
    const path = query.get("path") || "~/code/hyucksfield";
    const there = this.project.places.find((p) => p.machineId === machine);
    return {
      bytes: 2_412_000_000,
      display: there ? there.path : path,
      lfsBytes: 180_000_000,
      needed: !there,
      needsApproval: false,
      path: there ? there.path : path,
      uncommittedFiles: 3,
      ...(path.includes(".cawco/tmp")
        ? {
            refused: `${path} is a session's scratch folder, removed when that session ends.`,
          }
        : {}),
    };
  }

  /** Copy to computer: the job the hub records, carried step by step on its frames. */
  #copy(machineId: string, path: string): Response {
    const job: MoveJob = {
      bytes: 2_412_000_000,
      createdAt: new Date().toISOString(),
      from: { kind: "outside", host: "github.com" },
      id: `move-${Date.now()}`,
      projectId: this.project.id,
      projectName: this.project.name,
      sourceMachineId: "m-obelisk",
      sourcePath: "/home/sam/code/clients/hyucksfield",
      stage: "snapshot",
      steps: ["snapshot", "clone", "lfs", "start"],
      targetInstanceId: "inst-copy",
      targetMachineId: machineId,
      targetPath: path || "~/code/hyucksfield",
      updatedAt: new Date().toISOString(),
    };
    this.#frames.heardMove(job);
    this.#carry(job, 1);
    return Response.json(job);
  }

  #carry(job: MoveJob, at: number): void {
    this.#timers.after(STEP, () => {
      const step = job.steps[at];
      const next: MoveJob = step
        ? {
            ...job,
            stage: step,
            progress:
              step === "clone"
                ? { bytes: 1_100_000_000, total: job.bytes }
                : undefined,
            updatedAt: new Date().toISOString(),
          }
        : {
            ...job,
            stage: "started",
            moved: "hyucksfield to studio-mac at a41c9e2",
            stayed: "your .env and ignored files stay on obelisk",
            updatedAt: new Date().toISOString(),
          };
      this.#frames.heardMove(next);
      if (step) {
        this.#carry(next, at + 1);
      }
    });
  }

  #settle(id: string, how: "retry" | "cancel"): Response {
    this.dispose();
    const job: MoveJob = {
      bytes: 0,
      createdAt: new Date().toISOString(),
      from: { kind: "hub" },
      id,
      projectId: this.project.id,
      projectName: this.project.name,
      sourceMachineId: "m-obelisk",
      sourcePath: "",
      stage: how === "cancel" ? "cancelled" : "started",
      steps: ["snapshot", "clone", "lfs", "start"],
      targetInstanceId: "inst-copy",
      targetMachineId: "m-studio",
      targetPath: "~/code/hyucksfield",
      updatedAt: new Date().toISOString(),
      ...(how === "cancel"
        ? {
            kept: "A partial copy stays on studio-mac; nothing of yours is in it alone.",
          }
        : {}),
    };
    this.#frames.heardMove(job);
    return Response.json(job);
  }
}
