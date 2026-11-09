import type { ProgramRead } from "@cawco/core/decisions";
import { detach } from "@cawco/core/detach";
import { machineLabel } from "@cawco/core/machine-names";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type { StageState, StageWarm } from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import type { ArtifactRow, ArtifactServed } from "../../db/artifacts";
import { ArtifactRefusal } from "../refusals";
import type { ArtifactInput, Making, Placed } from "../shapes";
import { sheetOf } from "./component";
import type { KindContext } from "./context";

/** A workspace preview's server (core `ServeSpec`): its workspace and port; null for any other artifact. */
export const servedOf = (
  row: Pick<ArtifactRow, "kind" | "source">
): { port: number; workspace: string } | null =>
  row.kind === "preview" &&
  "port" in row.source &&
  row.source.serve &&
  row.source.workspace
    ? { port: row.source.port, workspace: row.source.workspace }
    : null;

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
const servedSource = (
  input: ArtifactInput,
  workspace: string
): PreviewSource => {
  if (!input.serve) {
    throw new ArtifactRefusal(400, NOT_SERVED);
  }
  return {
    port: input.port as number,
    ...(input.path === undefined ? {} : { path: input.path }),
    workspace,
    serve: {
      command: input.serve.command.trim(),
      cwd: input.serve.cwd?.trim() || ".",
    },
  };
};

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
  | "pendingFor"
  | "waitsOnPerson"
>;

/** A preview: a dev server or folder a machine serves live, the workspace it is made from, its server kept up while a page shows it, and let go when nothing does. */
export const createPreviewKind = (ctx: PreviewKindContext) => {
  const { above, db, deps, holder, ofTree, pagesShowing, waitsOnPerson } = ctx;

  /** The served preview waiting on the person for each server on a machine in `online`, by its workspace and port: waiting itself, or on a decision page that does, its workspace active to run it in. */
  const waitingServers = (
    online: ReadonlySet<string>
  ): Map<string, ArtifactRow> => {
    const pages = pagesShowing();
    const servers = new Map<string, ArtifactRow>();
    for (const row of db.asking()) {
      const served = servedOf(row);
      if (!(served && row.machineId && online.has(row.machineId))) {
        continue;
      }
      const waits =
        ctx.pendingFor(row) !== null ||
        (pages.get(row.id) ?? []).some(waitsOnPerson);
      if (
        waits &&
        deps.workspaces(served.workspace).some((one) => one.state === "active")
      ) {
        servers.set(`${served.workspace}@${served.port}`, row);
      }
    }
    return servers;
  };
  /** When each waiting server was last asked to stay up, by its workspace and port (../service.ts `keepWaitingUp`). */
  const keptUpAt = new Map<string, number>();
  /**
   * Who makes a create and whose panel it lands in: the caller's own, or
   * its parent's with `to: "parent"` ({@link ownerFor}). A preview its own
   * panel has no artifact of that name for lands on its delegation tree's
   * of that name in its project ({@link ofTree}), when several the one
   * nearest up its line ({@link above}), else the newest, so its id stays,
   * its server moves to the caller's ({@link letGoMoved}) and every page
   * embedding it follows. A live holder's is made again where it stands,
   * as a `to: "parent"` create lands on the parent's: held as its next
   * version once it opened it, and it is told. One whose holder acts no
   * more ({@link actsNoMore}) is taken into the caller's panel at once
   * (`lands`): no version waits on a session that never opens it, its old
   * server stops now, and nothing wakes it. Keyed by the caller's panel
   * alone, a delegate in another workspace made a second artifact of the
   * same name (2026-10-31).
   */
  const makingFor = (maker: InstanceRow, input: ArtifactInput): Making => {
    const owner = ctx.ownerFor(maker, input);
    if (
      input.kind !== "preview" ||
      owner.id !== maker.id ||
      db.byName(maker.id, "preview", input.name)
    ) {
      return { maker, owner };
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
      return { maker, owner };
    }
    return ctx.actsNoMore(held)
      ? { maker, owner, lands: nearest }
      : { maker, owner: held };
  };
  /**
   * The workspaces a create is making a preview from, by how many creates:
   * from its server's start ({@link serveFirst}) until its row names the
   * workspace ({@link placed}), when the row holds it instead. Its
   * retirement waits while any does (work-items.ts `previewedBy`).
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
  const serveFirst = (
    source: PreviewSource,
    machineId: string | null
  ): Promise<StageState | undefined> =>
    "port" in source && source.serve && source.workspace && machineId
      ? deps.serve(machineId, source.workspace, {
          ...source.serve,
          port: source.port,
        })
      : Promise.resolve(undefined);
  /**
   * Artifact `id`'s source moved off `before` (db artifacts.ts `resource`):
   * the server `before` named let go once nothing else shows it, unless the
   * row names that same server again now (on another start page, or put
   * back). Told by the preview service once the new source answers or no
   * screen waits on it (server.ts `onSourceMoved`).
   */
  const letGoMoved = (id: string, before: ArtifactServed): void => {
    const row = db.get(id);
    const was = row && servedOf({ kind: row.kind, source: before.source });
    if (!(row && was && before.machineId)) {
      return;
    }
    const now = servedOf(row);
    if (
      now?.port === was.port &&
      now.workspace === was.workspace &&
      row.machineId === before.machineId
    ) {
      return;
    }
    releaseServed({ id, kind: row.kind, name: row.name, ...before });
  };
  /**
   * The server `row` previewed (core `ServeSpec`) is stopped once no other
   * artifact previews that port of its workspace: its life is its artifacts'.
   */
  const releaseServed = (row: Placed & { id?: string }) => {
    const served = servedOf(row);
    if (!(served && row.machineId)) {
      return;
    }
    const still = db
      .previewing({
        id: served.workspace,
        machineId: row.machineId,
        path: "//",
      })
      .some(
        (other) => other.id !== row.id && servedOf(other)?.port === served.port
      );
    if (!still) {
      deps.unserve(row.machineId, served.workspace, served.port);
    }
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
  const warmPreviews = (page: ArtifactRow, program: ProgramRead): void => {
    const shown = new Set(
      program.artifacts
        .filter((one) => one.component === "Preview")
        .flatMap((one) => ctx.mediaSeen(page, one.id) ?? [])
    );
    const sheets = new Map<string, StageWarm & { workspace: string }>();
    const servers = new Map<string, ArtifactRow>();
    for (const media of shown) {
      const sheet = sheetOf(media);
      const served = servedOf(media);
      if (sheet) {
        const key = `${sheet.workspace}:${sheet.dir}`;
        const warm = sheets.get(key) ?? {
          workspace: sheet.workspace,
          by: `decision page ${page.name}`,
          canvases: [],
        };
        warm.canvases.push(sheet.files);
        sheets.set(key, warm);
      } else if (served) {
        servers.set(`${served.workspace}@${served.port}`, media);
      }
    }
    for (const { workspace, ...warm } of sheets.values()) {
      detach(deps.warmStage({ workspace }, warm), "stage warm-up");
    }
    for (const media of servers.values()) {
      detach(serveFirst(media.source, media.machineId), "stage warm-up");
    }
  };
  /**
   * The source a preview input names, on the machine that serves it: a
   * workspace's port on the workspace's machine, in its network; a port or a
   * folder on the machine `machine` names, else the session's.
   */
  const previewSource = (
    instance: InstanceRow,
    input: ArtifactInput
  ): { machineId: string; source: PreviewSource } => {
    const problem = previewProblem(input);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
    const at = input.path === undefined ? {} : { path: input.path };
    // A machine named is its host's port; else the port is in the workspace
    // named, or the session's own.
    const workspace =
      input.port === undefined || input.machine !== undefined
        ? undefined
        : workspaceFor(instance, input.workspace);
    if (workspace) {
      return {
        machineId: workspace.machineId,
        source: servedSource(input, workspace.id),
      };
    }
    if (input.serve) {
      throw new ArtifactRefusal(
        400,
        "serve runs in a workspace, and this session runs in none: show a server on this machine's host by its port alone, which you keep running."
      );
    }
    const machineId =
      input.machine === undefined
        ? instance.machineId
        : machineNamed(deps.machines(), input.machine);
    if (!machineId) {
      throw new ArtifactRefusal(
        404,
        `No machine named ${input.machine} is known to this hub.`
      );
    }
    return {
      machineId,
      source:
        input.port === undefined
          ? { dir: input.dir as string, ...at }
          : { port: input.port, ...at },
    };
  };
  /**
   * The workspace a port preview's server runs in, with its machine: the one
   * named, which must be the session's own or one of its delegates', else the
   * session's own; none for a session outside a workspace that names none.
   */
  const workspaceFor = (
    instance: InstanceRow,
    needle: string | undefined
  ): { id: string; machineId: string } | undefined => {
    const mine = deps.ownWorkspace(instance);
    const asked = needle ?? mine;
    if (asked === undefined) {
      return;
    }
    const found = deps.workspaces(asked);
    if (found.length !== 1) {
      throw new ArtifactRefusal(
        404,
        found.length === 0
          ? `No workspace ${asked} on this hub.`
          : `${asked} names ${found.length} workspaces; pass the full workspace id.`
      );
    }
    const [workspace] = found;
    if (workspace.id !== mine && !deps.delegatesIn(instance, workspace.id)) {
      throw new ArtifactRefusal(
        403,
        artifactToolWords.notYourDelegate(String(needle))
      );
    }
    return workspace;
  };

  return {
    keptUpAt,
    letGoMoved,
    makingFor,
    makingFrom,
    makingIn,
    previewSource,
    releaseServed,
    serveFirst,
    waitingServers,
    warmPreviews,
  };
};
