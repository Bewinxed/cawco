import { detach } from "@cawco/core/detach";
import { machineLabel } from "@cawco/core/machine-names";
import { CAWCO_HUB_PORT, localDashboardPort } from "@cawco/core/ports";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type { StageWarm } from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { ElysiaStatus, problem } from "elysia";
import type { ArtifactRow, ArtifactServed } from "../../db/artifacts";
import { servedOf, servedPin, sheetOf } from "../served";
import type { ArtifactInput, Making, StageAt, WarmPreviews } from "../shapes";
import type { KindContext } from "./context";

/** Why a preview's fields do not go together, or nothing. */
const previewProblem = (input: ArtifactInput): string | null => {
  if ((input.port === undefined) === (input.dir === undefined)) {
    return "A preview takes exactly one of port or dir.";
  }
  if (input.port === undefined && input.workspace !== undefined) {
    return "workspace goes with a port, not a dir.";
  }
  if (input.machine !== undefined && input.workspace !== undefined) {
    return "A workspace's port is on the workspace's machine: pass workspace for a workspace's server, or machine for a port on that machine's host.";
  }
  if (input.serve !== undefined && input.port === undefined) {
    return "serve goes with the port it serves on, not a dir.";
  }
  if (input.serve !== undefined && input.machine !== undefined) {
    return "serve runs in a workspace, and machine names a port on a machine's host outside one: pass serve with your workspace's port.";
  }
  return null;
};

/**
 * Why a preview of a workspace's port with nothing named to serve it is
 * refused: a server the agent starts in its own shell ends with that shell,
 * the command or the session, and the person is left with a dead preview.
 */
const NOT_SERVED =
  'A preview of a port in a workspace names what serves it: serve: { command, cwd }, like { "command": "bun run dev --port 5195", "cwd": "apps/web" }. CawCo runs it in the workspace and keeps it up for as long as the preview and the workspace last; a server started in your own shell ends with it.';

/** The machine a hostname, its label or its id names. */
const machineNamed = (
  machines: Pick<AgentRow, "machineId" | "hostname">[],
  nameOrId: string
): string | undefined =>
  machines.find(
    (machine) =>
      machine.machineId === nameOrId ||
      machine.hostname === nameOrId ||
      machineLabel(machine.hostname) === nameOrId
  )?.machineId;

/** A workspace port's source: refused without what serves it ({@link NOT_SERVED}). */
const servedSource = (input: ArtifactInput, workspace: string) => {
  if (!input.serve || input.port === undefined) {
    return problem(400, {
      code: "artifact-preview-unserved",
      detail: NOT_SERVED,
    });
  }
  const source: PreviewSource = {
    port: input.port,
    ...(input.path === undefined ? {} : { path: input.path }),
    workspace,
    serve: {
      command: input.serve.command.trim(),
      cwd: input.serve.cwd?.trim() || ".",
    },
  };
  return source;
};

/** The stage a sheet is served the person on (its pin's, core `PreviewSource.pin`), by its key, and how a call reaches it. */
const stageOf = (
  sheet: NonNullable<ReturnType<typeof sheetOf>>
): { at: StageAt; key: string } =>
  sheet.pin === undefined
    ? {
        key: `${sheet.workspace}:${sheet.dir}`,
        at: { workspace: sheet.workspace },
      }
    : {
        key: `${sheet.pin}:${sheet.dir}`,
        at: { workspace: sheet.workspace, pin: sheet.pin },
      };

/** How long a pin no row names stands before it is let go ({@link createPreviewKind} `releasePin`). Ours: past a create's own checks, which may put its row back on it. */
const PIN_KEPT_MS = 2 * 60_000;

/** What PreviewKind reads of the artifact service ({@link KindContext}). */
export type PreviewKindContext = Pick<
  KindContext,
  | "above"
  | "actsNoMore"
  | "db"
  | "deps"
  | "holder"
  | "mediaSeen"
  | "ofTree"
  | "ownerFor"
  | "pagesShowing"
  | "waitsOnPerson"
>;

/** A preview: a dev server or folder a machine serves live, the workspace it is made from, its server kept up while a page shows it, and let go when nothing does. */
export const createPreviewKind = (ctx: PreviewKindContext) => {
  const { above, db, deps, holder, ofTree, pagesShowing, waitsOnPerson } = ctx;

  /**
   * Whether the session that made `row` is awake: its process starting or
   * running, as the hub holds it. A sleeping one's waiting servers sleep
   * with it (the owner's pick on "What stays running on a machine",
   * 2026-11-19: "Let it sleep"); the stage starts again on the first open
   * (agent stage.ts `wakeSource`).
   */
  const makerAwake = (row: ArtifactRow): boolean => {
    const maker = row.madeBy ?? row.instanceId;
    const status = maker ? deps.instance(maker)?.status : undefined;
    return status === "starting" || status === "running";
  };

  /**
   * THE ONE READ OF WHAT THE HUB KEEPS UP FOR THE PERSON: each stage on a
   * machine in `online` that serves him an artifact waiting on him (itself,
   * or a decision page showing it, {@link waitsOnPerson}), its maker awake
   * ({@link makerAwake}) and its workspace active to run it in, by the
   * stage's key, with the use that keeps it up: a served preview's server
   * started or woken ({@link serveFirst}), a sheet's stage (a design graph's,
   * or a component a page's Preview shows) started or woken with its
   * canvases compiled (agent stage.ts `warmStage`), each a use that restarts
   * the stage's idle time. Read off served previews alone, a design graph
   * waiting on the person slept under him where a preview did not.
   */
  const waitingStages = (
    online: ReadonlySet<string>
  ): Map<string, () => Promise<unknown>> => {
    const pages = pagesShowing();
    const stages = new Map<string, () => Promise<unknown>>();
    for (const row of db.asking()) {
      const sheet = sheetOf(row);
      const served = servedOf(row);
      const workspace = sheet?.workspace ?? served?.workspace;
      if (!(
        workspace &&
        row.machineId &&
        online.has(row.machineId) &&
        makerAwake(row) &&
        (waitsOnPerson(row) || (pages.get(row.id) ?? []).some(waitsOnPerson)) &&
        deps.workspaces(workspace).some((one) => one.state === "active")
      )) {
        continue;
      }
      if (sheet) {
        const { at, key } = stageOf(sheet);
        stages.set(key, () =>
          deps.warmStage(at, {
            by: `${row.name} waiting on the person`,
            canvases: [sheet.files],
          })
        );
      } else if (served) {
        stages.set(`${served.pin ?? served.workspace}@${served.port}`, () =>
          serveFirst(row.source, row.machineId)
        );
      }
    }
    return stages;
  };
  /** When each waiting stage was last asked to stay up, by its key ({@link waitingStages}, ../service.ts `keepWaitingUp`). */
  const keptUpAt = new Map<string, number>();
  /**
   * Who makes a create and whose panel it lands in: the caller's own, or
   * the session it reports to ({@link ownerFor}). A preview its own
   * panel has no artifact of that name for lands on its delegation tree's
   * of that name in its project ({@link ofTree}), when several the one
   * nearest up its line ({@link above}), else the newest, so its id stays,
   * its server moves to the caller's ({@link letGoMoved}) and every page
   * embedding it follows. A live holder's is made again where it stands,
   * as a create into the panel of the session it reports to lands: held as its next
   * version once it opened it, and it is told. One whose holder acts no
   * more ({@link actsNoMore}) is taken into the caller's panel at once
   * (`lands`): no version waits on a session that never opens it, its old
   * server stops now, and nothing wakes it. Keyed by the caller's panel
   * alone, a delegate in another workspace made a second artifact of the
   * same name (2026-10-31).
   */
  const makingFor = (maker: InstanceRow, input: ArtifactInput): Making => {
    const owner = ctx.ownerFor(maker, input);
    // A reading is its maker's own: it lands on no tree's preview.
    if (input.reading) {
      return { maker, owner, reading: true };
    }
    const alone: Making = { maker, owner };
    if (
      input.kind !== "preview" ||
      owner.id !== maker.id ||
      db.byName(maker.id, "preview", input.name)
    ) {
      return alone;
    }
    const up = [...above(maker)];
    const rank = (row: ArtifactRow): number => {
      const at = up.indexOf(row.instanceId ?? "");
      return at === -1 ? up.length : at;
    };
    const nearest = ofTree(maker)
      .filter((row) => row.kind === "preview" && row.name === input.name)
      .reduce<ArtifactRow | undefined>(
        (best, row) =>
          best &&
          (rank(best) < rank(row) ||
            (rank(best) === rank(row) && best.updatedAt >= row.updatedAt))
            ? best
            : row,
        undefined
      );
    const held = nearest && holder(nearest);
    if (!(nearest && held)) {
      return alone;
    }
    const lands: Making = ctx.actsNoMore(held)
      ? { maker, owner, lands: nearest }
      : { maker, owner: held };
    return lands;
  };
  /**
   * The workspaces a create is making a preview from, by how many creates:
   * from its server's start ({@link serveFirst}) until its row names the
   * workspace ({@link placed}), when the row holds it instead. Its
   * retirement waits while any does (workspaces.ts `servedHold`).
   */
  const makingIn = new Map<string, number>();
  /** `source`'s workspace held while a create makes a preview from it ({@link makingIn}); what lets it go. */
  const makingFrom = (source: PreviewSource): (() => void) => {
    const workspace = "port" in source ? source.workspace : undefined;
    if (workspace === undefined) {
      return () => undefined;
    }
    makingIn.set(workspace, (makingIn.get(workspace) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) {
        return;
      }
      done = true;
      const left = (makingIn.get(workspace) ?? 1) - 1;
      if (left > 0) {
        makingIn.set(workspace, left);
      } else {
        makingIn.delete(workspace);
      }
    };
  };
  /**
   * A workspace preview's server, up before anything shows it (core
   * `ServeSpec`): its state. One that can't start is the refusal, and nothing
   * is kept. None for any other source.
   */
  const serveFirst = (source: PreviewSource, machineId: string | null) =>
    "port" in source && source.serve && source.workspace && machineId
      ? deps.serve(
          machineId,
          source.workspace,
          { ...source.serve, port: source.port },
          source.pin
        )
      : Promise.resolve(undefined);
  /**
   * Pin `pin` on machine `machineId` let go once no artifact is served from
   * it (core `PreviewSource.pin`): its stages and server stop with it, and
   * its copy goes. Looked at {@link PIN_KEPT_MS} after the last row moved
   * off it, so a create that puts its row back as it was (service.ts
   * `unplace`) finds the person's pin still standing. Its life is its
   * artifacts'.
   */
  const releasePin = (machineId: string | null, pin: string | null): void => {
    if (!(machineId && pin)) {
      return;
    }
    deps.lifetime.after("preview pin let go", PIN_KEPT_MS, () => {
      if (db.pinnedBy(pin).length === 0) {
        deps.unpin(machineId, pin);
      }
    });
  };
  /**
   * Artifact `id`'s source moved off `before` (db artifacts.ts `resource`):
   * the pin `before` was served from let go once nothing else is served from
   * it, unless the row names it again now. Told by the preview service once
   * the new source answers or no screen waits on it (server.ts
   * `onSourceMoved`).
   */
  const letGoMoved = (id: string, before: ArtifactServed): void => {
    const was = servedPin(before.source);
    const row = db.get(id);
    if (was === undefined || (row && servedPin(row.source) === was)) {
      return;
    }
    releasePin(before.machineId, was);
  };
  /**
   * The stages decision page `page`'s Previews run on, warmed as the page
   * goes out, so the person's first open finds them warm: a sheet's stage
   * started or woken and every canvas shown on it compiled (agent stage.ts
   * `warmStage`), one warm-up per stage (workspace and toolchain root); a
   * served preview's server started or woken (`serveFirst`), once per
   * server. Each is sent and not waited on, and one that fails is logged
   * and changes nothing the page's write answers. A Canvas shows a drawing,
   * which no stage serves.
   */
  const warmPreviews: WarmPreviews = (page, program) => {
    const shown = new Set(
      program.artifacts
        .filter((one) => one.component === "Preview")
        .flatMap((one) => ctx.mediaSeen(page, one.id) ?? [])
    );
    const sheets = new Map<string, { at: StageAt; warm: StageWarm }>();
    const servers = new Map<string, ArtifactRow>();
    for (const media of shown) {
      const sheet = sheetOf(media);
      const served = servedOf(media);
      if (sheet) {
        const { key, at } = stageOf(sheet);
        const one = sheets.get(key) ?? {
          at,
          warm: { by: `decision page ${page.name}`, canvases: [] },
        };
        one.warm.canvases.push(sheet.files);
        sheets.set(key, one);
      } else if (served) {
        servers.set(`${served.pin ?? served.workspace}@${served.port}`, media);
      }
    }
    // A refused one is said as a failed one is.
    const warmed = (refused: unknown) => {
      if (refused instanceof ElysiaStatus) {
        console.warn(`[stage warm-up] failed: ${refused.response.detail}`);
      }
    };
    for (const { at, warm } of sheets.values()) {
      detach(deps.warmStage(at, warm).then(warmed), "stage warm-up");
    }
    for (const media of servers.values()) {
      detach(
        serveFirst(media.source, media.machineId).then(warmed),
        "stage warm-up"
      );
    }
  };
  /**
   * Whether `port` on `machineId` is one CawCo serves: the dashboard's on
   * every machine (the agent's loopback carries it), the hub's API on the
   * hub's machine.
   */
  const ownPort = (port: number, machineId: string): boolean =>
    port === localDashboardPort() ||
    (port === CAWCO_HUB_PORT && machineId === deps.hubMachine());

  /**
   * The source a preview input names, on the machine that serves it: a
   * workspace's port on the workspace's machine, in its network; a port or a
   * folder on the machine `machine` names, else the session's.
   */
  const previewSource = (instance: InstanceRow, input: ArtifactInput) => {
    const misfit = previewProblem(input);
    if (misfit) {
      return problem(400, { code: "artifact-preview-fields", detail: misfit });
    }
    const at = input.path === undefined ? {} : { path: input.path };
    const inWorkspace = workspaceSource(instance, input);
    if (inWorkspace) {
      return inWorkspace;
    }
    if (input.serve) {
      return problem(400, {
        code: "artifact-preview-serve-outside",
        detail:
          "serve runs in a workspace, and this session runs in none: show a server on this machine's host by its port alone, which you keep running.",
      });
    }
    const machineId =
      input.machine === undefined
        ? instance.machineId
        : machineNamed(deps.machines(), input.machine);
    if (!machineId) {
      return problem(404, {
        code: "artifact-preview-machine-unknown",
        detail: `No machine named ${input.machine} is known to this hub.`,
      });
    }
    if (input.port !== undefined && ownPort(input.port, machineId)) {
      return problem(400, {
        code: "artifact-preview-own-port",
        detail: artifactToolWords.previewOfOwnPort,
      });
    }
    const source: PreviewSource =
      input.port === undefined
        ? { dir: input.dir ?? "", ...at }
        : { port: input.port, ...at };
    return { machineId, source };
  };
  /**
   * A workspace port's source, on the workspace's machine, in its network;
   * none for a machine named (its host's port) or a session in no
   * workspace that names none.
   */
  const workspaceSource = (instance: InstanceRow, input: ArtifactInput) => {
    const workspace =
      input.port === undefined || input.machine !== undefined
        ? undefined
        : workspaceFor(instance, input.workspace);
    if (!workspace || workspace instanceof ElysiaStatus) {
      return workspace;
    }
    const served = servedSource(input, workspace.id);
    return served instanceof ElysiaStatus
      ? served
      : { machineId: workspace.machineId, source: served };
  };
  /**
   * The workspace a port preview's server runs in, with its machine: the one
   * named, which must be the session's own or one of its delegates', else the
   * session's own; none for a session outside a workspace that names none.
   */
  const workspaceFor = (instance: InstanceRow, needle: string | undefined) => {
    const mine = deps.ownWorkspace(instance);
    const asked = needle ?? mine;
    if (asked === undefined) {
      return;
    }
    const found = deps.workspaces(asked);
    const [workspace] = found;
    if (found.length !== 1 || !workspace) {
      return found.length === 0
        ? problem(404, {
            code: "artifact-workspace-unknown",
            detail: `No workspace ${asked} on this hub.`,
          })
        : problem(404, {
            code: "artifact-workspace-ambiguous",
            detail: `${asked} names ${found.length} workspaces; pass the full workspace id.`,
          });
    }
    if (workspace.id !== mine && !deps.delegatesIn(instance, workspace.id)) {
      return problem(403, {
        code: "artifact-workspace-not-delegates",
        detail: artifactToolWords.notYourDelegate(String(needle)),
      });
    }
    const own: { id: string; machineId: string } = workspace;
    return own;
  };

  return {
    keptUpAt,
    letGoMoved,
    makingFor,
    makingFrom,
    makingIn,
    previewSource,
    releasePin,
    serveFirst,
    waitingStages,
    warmPreviews,
  };
};
