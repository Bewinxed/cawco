import { detach } from "@cawco/core/detach";
import { machineLabel } from "@cawco/core/machine-names";
import { CAWCO_HUB_PORT, localDashboardPort } from "@cawco/core/ports";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type { StageWarm } from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { workspaceIdKindOf } from "@cawco/core/workspace-id";
import { ElysiaStatus, problem } from "elysia";
import type { ArtifactRow, ArtifactServed } from "../../db/artifacts";
import { servedOf, servedPin, serverOf, sheetOf } from "../served";
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
  if (input.serve !== undefined && input.port === undefined) {
    return "serve goes with the port it serves on, not a dir.";
  }
  if (input.port !== undefined && input.machine !== undefined) {
    return "machine goes with a dir. A port's server runs where you work: CawCo runs serve's command in your workspace, or in your folder on your machine, so leave machine out.";
  }
  return null;
};

/**
 * Why a preview of a port with nothing named to serve it is refused, in a
 * workspace or out of one: a server the agent starts in its own shell ends
 * with that shell, the command or the session, and the person is left with
 * a dead preview nothing can start again (the owner's word on 2026-11-22:
 * "record the command for every preview").
 */
const NOT_SERVED =
  'A preview of a port names the command that starts its server: serve: { command, cwd }, like { "command": "bun run dev --port 5195", "cwd": "apps/web" }, cwd the app\'s folder, absolute or from your folder (from your workspace\'s root in a workspace). CawCo runs it with PORT set, keeps it up while the preview is used, and starts it again whenever the person opens the preview; a server started in your own shell ends with it.';

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

/** Why a port preview with nothing named to serve it is refused ({@link NOT_SERVED}). */
const unserved = () =>
  problem(400, {
    code: "artifact-preview-unserved",
    detail: NOT_SERVED,
  });

/** A port's source in workspace or place `workspace`, its server run in `cwd` from that tree's root. */
const servedSource = (
  input: ArtifactInput,
  serve: { command: string },
  port: number,
  at: { cwd: string; workspace: string }
): PreviewSource => ({
  port,
  ...(input.path === undefined ? {} : { path: input.path }),
  workspace: at.workspace,
  serve: { command: serve.command.trim(), cwd: at.cwd },
});

/** The stage a sheet is served the person on (its workspace's own, live), by its key, and how a call reaches it. */
const stageOf = (
  sheet: NonNullable<ReturnType<typeof sheetOf>>
): { at: StageAt; key: string } => ({
  key: `${sheet.workspace}:${sheet.dir}`,
  at: { workspace: sheet.workspace },
});

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

/** A preview: a dev server or folder a machine serves, the workspace it is made from, its server kept up while a page shows it, and stopped once no artifact is served from it. */
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
   * ({@link makerAwake}), its workspace or place able to run it
   * ({@link runsIn}) and the stage live now (`stageLive`), by the stage's
   * key, with the use that keeps it up: a served preview's server ({@link serveFirst}), a sheet's stage (a
   * design graph's, or a component a page's Preview shows) with its
   * canvases compiled (agent stage.ts `warmStage`), each a use that restarts
   * the stage's idle time. Read off served previews alone, a design graph
   * waiting on the person slept under him where a preview did not. A stage
   * asleep is never woken here: one its machine put to sleep to stay within
   * its 8 live previews, the one looked at least recently (agent stage.ts
   * `roomFor`), stays asleep until it is opened, and no keep-up holds a
   * stage, and so its workspace, past the owner's rules of 2026-11-22
   * ("What stays running on a machine": a sleeping session's previews sleep
   * after 30 quiet minutes; up to 8 live, the oldest put to sleep).
   */
  const waitingStages = (
    online: ReadonlySet<string>
  ): Map<string, () => Promise<unknown>> => {
    const pages = pagesShowing();
    const stages = new Map<string, () => Promise<unknown>>();
    for (const row of db.asking()) {
      const workspace = sheetOf(row)?.workspace ?? servedOf(row)?.workspace;
      if (
        workspace &&
        row.machineId &&
        online.has(row.machineId) &&
        makerAwake(row) &&
        (waitsOnPerson(row) || (pages.get(row.id) ?? []).some(waitsOnPerson)) &&
        runsIn(workspace)
      ) {
        const kept = keptUp(row);
        if (kept) {
          stages.set(kept.key, kept.use);
        }
      }
    }
    return stages;
  };
  /**
   * Whether tree `workspace` stands to run a stage in: a workspace while it
   * is active; a place always, its folder the person's own (core
   * workspace-id.ts `place`), its stage in its stage clone.
   */
  const runsIn = (workspace: string): boolean => {
    switch (workspaceIdKindOf(workspace)) {
      case "place":
        return true;
      case "clone":
      case "design":
        return deps.workspaces(workspace).some((one) => one.state === "active");
      case undefined:
        return false;
    }
  };
  /**
   * The live stage serving `row` ({@link waitingStages}), by its key, with
   * the use that keeps it up; none for one not live (asleep, starting,
   * failed) or for a row no stage serves.
   */
  const keptUp = (
    row: ArtifactRow
  ): { key: string; use: () => Promise<unknown> } | null => {
    const sheet = sheetOf(row);
    const served = servedOf(row);
    if (sheet && "port" in row.source) {
      const { at, key } = stageOf(sheet);
      return deps.stageLive(sheet.workspace, row.source.port)
        ? {
            key,
            use: () =>
              deps.warmStage(at, {
                by: `${row.name} waiting on the person`,
                canvases: [sheet.files],
              }),
          }
        : null;
    }
    if (served) {
      return deps.stageLive(served.workspace, served.port)
        ? {
            key: `${served.workspace}@${served.port}`,
            use: () => serveFirst(row.source),
          }
        : null;
    }
    return null;
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
   * A preview's server, up before anything shows it (core `ServeSpec`), in
   * its workspace or place on that tree's machine: its state. It is the one
   * server the person is served, live. One that can't start is the refusal,
   * and nothing is kept. None for any other source.
   */
  const serveFirst = (source: PreviewSource) =>
    "port" in source && source.serve && source.workspace
      ? deps.serve(
          { workspace: source.workspace },
          { ...source.serve, port: source.port }
        )
      : Promise.resolve(undefined);
  /**
   * Folder preview pin `pin` on machine `machineId` let go once no artifact
   * is served from it (core `PreviewSource.pin`): its copy goes. Looked at
   * {@link PIN_KEPT_MS} after the last row moved off it, so a create that
   * puts its row back as it was (service.ts `unplace`) finds the person's
   * pin still standing. Its life is its artifacts'.
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
   * The server a served preview's source names on machine `machineId`
   * (served.ts `serverOf`), stopped once no artifact is served from it: no
   * row, a held next version included, names its workspace or place and
   * port, and no create is making a preview from that tree now
   * ({@link makingIn}), whose server may be this one before its row names
   * it. Its tree stays, and retires by the workspace sweep once nothing
   * runs in it (workspaces.ts `servedHold`). `what` says what happened to
   * the artifact; the journal says the stop in one line.
   */
  const letGoServer = (
    machineId: string | null,
    source: PreviewSource,
    what: string
  ): void => {
    const server = serverOf(source);
    if (!(machineId && server) || makingIn.has(server.workspace)) {
      return;
    }
    const others = db
      .previewing({ id: server.workspace, machineId, path: "//" })
      .filter((row) => servedOf(row)?.port === server.port);
    if (others.length > 0) {
      return;
    }
    const tree = `${workspaceIdKindOf(server.workspace) === "place" ? "place" : "workspace"} ${server.workspace.slice(0, 8)}`;
    detach(
      deps.stopServed(machineId, server).then((ran) => {
        console.info(
          ran === undefined
            ? `[artifacts] ${what}: its server on port ${server.port} in ${tree} was not stopped, as its machine did not answer; it sleeps once unused`
            : `[artifacts] ${what}: its server on port ${server.port} in ${tree} ${ran ? "stopped" : "was not running"}, as no artifact is served from it; its copy retires by the workspace sweep once nothing runs in it`
        );
      }),
      "preview server stop"
    );
  };
  /**
   * Artifact `id`'s source moved off `before` (db artifacts.ts `resource`):
   * what `before` was served from let go once nothing else is served from
   * it, unless the row names it again now: a folder's pin ({@link
   * releasePin}), a served preview's server ({@link letGoServer}). Told by
   * the preview service once the new source answers or no screen waits on
   * it (server.ts `onSourceMoved`).
   */
  const letGoMoved = (id: string, before: ArtifactServed): void => {
    const row = db.get(id);
    const was = servedPin(before.source);
    if (was !== undefined && !(row && servedPin(row.source) === was)) {
      releasePin(before.machineId, was);
    }
    letGoServer(
      before.machineId,
      before.source,
      `${row?.name ?? "An artifact"} (${id.slice(0, 8)}) moved to another source`
    );
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
        servers.set(`${served.workspace}@${served.port}`, media);
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
      detach(serveFirst(media.source).then(warmed), "stage warm-up");
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
   * port's server run in a workspace ({@link portSource}); a folder on the
   * machine `machine` names, else the session's.
   */
  const previewSource = async (instance: InstanceRow, input: ArtifactInput) => {
    const misfit = previewProblem(input);
    if (misfit) {
      return problem(400, { code: "artifact-preview-fields", detail: misfit });
    }
    if (input.port !== undefined) {
      return await portSource(instance, input, input.port);
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
    const source: PreviewSource = {
      dir: input.dir ?? "",
      ...(input.path === undefined ? {} : { path: input.path }),
    };
    return { machineId, source };
  };
  /**
   * A port's source, its server's command recorded ({@link servedSource}):
   * in the workspace named, else the session's own, on that workspace's
   * machine and in its network, `serve.cwd` from its root; for a session in
   * no workspace, in the place over the app's folder `serve.cwd` names on
   * its machine (the session's folder when it names none), whose stage
   * clone the command runs in (agent stage-clone.ts), never on the bare
   * host: the place over that folder's repository's top, or over the folder
   * itself in none (deps `placeFor`). A place's port that is CawCo's own
   * is refused: its network may be the host's. Refused without what serves
   * it ({@link NOT_SERVED}).
   */
  const portSource = async (
    instance: InstanceRow,
    input: ArtifactInput,
    port: number
  ) => {
    const { serve } = input;
    if (!serve) {
      return unserved();
    }
    const workspace = workspaceFor(instance, input.workspace);
    if (workspace instanceof ElysiaStatus) {
      return workspace;
    }
    if (workspace) {
      return {
        machineId: workspace.machineId,
        source: servedSource(input, serve, port, {
          workspace: workspace.id,
          cwd: serve.cwd?.trim() || ".",
        }),
      };
    }
    if (ownPort(port, instance.machineId)) {
      return problem(400, {
        code: "artifact-preview-own-port",
        detail: artifactToolWords.previewOfOwnPort,
      });
    }
    const staged = await deps.placeFor(
      instance,
      serve.cwd?.trim() || undefined
    );
    if (staged instanceof ElysiaStatus) {
      return staged;
    }
    return {
      machineId: instance.machineId,
      source: servedSource(input, serve, port, {
        workspace: staged.place.id,
        cwd: staged.cwd,
      }),
    };
  };
  /**
   * The workspace a port preview's server runs in, with its machine: the one
   * named, which must be the session's own or one of its delegates', else the
   * session's own; none for a session outside a workspace that names none,
   * whose server runs in its place ({@link portSource}).
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
    letGoServer,
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
