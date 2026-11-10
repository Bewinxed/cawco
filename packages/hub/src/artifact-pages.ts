import { posix } from "node:path";
import type { BrowserKey } from "@cawco/core/browser";
import { isBrowserKey } from "@cawco/core/browser";
import { detach } from "@cawco/core/detach";
import type { PreviewDown, PreviewSource } from "@cawco/core/preview/protocol";
import { PREVIEW_FOLDERS } from "@cawco/core/preview/protocol";
import type { InstanceRow } from "@cawco/core/protocol";
import { ElysiaStatus } from "elysia";
import { timedShowStep } from "./artifacts/service";
import type { PageFrom } from "./artifacts/shapes";
import type { ArtifactRow } from "./db/artifacts";
import { projectOrigin } from "./db/previews";
import type { PageSources } from "./decision-page";
import { buildDecisionPage } from "./decision-page";
import type {
  ArtifactNamed,
  BuiltProgram,
  ImageRead,
} from "./decision-program";
import { buildProgram, PROGRAM_FILE } from "./decision-program";
import type { HubContext } from "./hub-context";
import { sessionLabel } from "./labels";
import { BUSY_TIMEOUT_MS } from "./machine-read-timeouts";
import type { PreviewTarget } from "./preview";
import {
  previewFrame,
  previewTargets,
  servedByMachine,
  shownArtifact,
} from "./preview";
import { embedKey } from "./preview-origin";
import { changeFolderFiles, readFolderFile } from "./project-folder";
import { ProjectRefusal, projectRefusalOf } from "./project-refusal";
import { type Refused, refusal } from "./refusal";
import { unreachable } from "./unreachable";

/**
 * A decision page to show (Projects spec §5.8): `decisions/<page>/` in the
 * session's project folder. The hub builds it (decision-page.ts) from a
 * `page.html`: with `dir`, the one in the session's work folder on its
 * machine; else the one in `decisions/<page>/` (Caw's, written with folder_write),
 * else the page already published there is shown as it is. The built
 * `index.html` is committed by the session; a revision is another commit at
 * the same place, so the canvas and its picks stay.
 */
interface PageRefusal {
  code: 400 | 404 | 409 | 413 | 422 | 503 | 504;
  refused: string;
}

/** Where page.html and what it names are read: the session's machine, or the project folder. */
type PageOrigin =
  { dir: string; machineId: string } | { projectId: string; folder: string };

/**
 * A page artifact's HTML (artifacts/service.ts `page`), built as the
 * decision-page skill builds one: from inline `html`, from page.html in
 * `dir` on the session's machine, or from `decisions/<name>/page.html` in
 * the session's project folder (Caw's, written with folder_write), else the page
 * already published there as it is. In a project, what was built is
 * committed to `decisions/<name>/index.html` by the session, as before.
 */
type BuiltArtifactPage =
  | { html: string; program?: BuiltProgram }
  | { refused: string; status: PageRefusal["code"] };

/** Where a program's Images are read from: its work folder, the project's folder, and on a revision the pictures its page shows and the machine each is read on. */
interface ImageAt {
  dir?: string | undefined;
  inFolder?: true;
  readOn?: ((file: string) => string | undefined) | undefined;
  shown?: ReadonlyMap<string, Uint8Array> | undefined;
}

export type ArtifactPagesContext = Pick<
  HubContext,
  | "artifactSessions"
  | "artifacts"
  | "callFs"
  | "db"
  | "decisionsChanged"
  | "machineName"
  | "previewListeners"
  | "previewService"
  | "publishInstances"
  | "readAgent"
  | "readMachineMedia"
  | "registry"
  | "streams"
>;

export const createArtifactPages = (ctx: ArtifactPagesContext) => {
  /**
   * The project whose origin serves artifact `id` (preview.ts `originOf`):
   * a project's page, served there whichever session holds it or none;
   * undefined for anything else, served on its session's origin.
   */
  const pageProject = (id: string): string | undefined => {
    const row = ctx.db.artifacts.get(id);
    return row?.kind === "page" &&
      row.projectId !== null &&
      row.heldFor === null
      ? row.projectId
      : undefined;
  };

  /** The key of the origin that serves artifact `id` (preview.ts `originOf`). */
  const originKeyOf = (id: string): string | undefined => {
    const project = pageProject(id);
    return project
      ? projectOrigin(project)
      : (ctx.db.artifacts.get(id)?.instanceId ?? undefined);
  };

  /** A session's artifacts by id, newest first: what a preview frame lists (its panel's menu). */
  const artifactIds = (instanceId: string): string[] =>
    ctx.db.artifacts.ofInstance(instanceId).map((row) => row.id);

  /**
   * What serves the artifact `target` shows, as its row names it now (a
   * frame never keeps its own copy); none once the row is gone.
   */
  const sourceOf = (target: PreviewTarget): PreviewSource | undefined =>
    ctx.db.artifacts.get(target.artifact.id)?.source;

  /** A browser artifact's key, its page (core `ArtifactKind`) on its session's machine; null for any other. */
  const browserKeyOf = (target: PreviewTarget): BrowserKey | null => {
    const source = sourceOf(target);
    return source && "page" in source && isBrowserKey(source.page)
      ? source.page
      : null;
  };

  /** Whether the hub serves what `target` shows itself (a page, a canvas, a browser's), as its row names it now; false once the row is gone. */
  const hubShows = (target: PreviewTarget): boolean => {
    const source = sourceOf(target);
    return source !== undefined && "page" in source;
  };

  /**
   * The origin a frame of `target` loads, its listener started when it has
   * none: a machine's preview (a dev server, a folder, a sheet) on its
   * artifact's own origin ({@link embedKeyOf}), whichever panel, tab or
   * decision card shows it, so no two artifacts ever share one; a project's
   * page on its project's; anything else the hub serves on session
   * `instanceId`'s, by its id. Null only when every port of the range is
   * taken, which the open that showed it already said.
   */
  const frameAddress = (instanceId: string, target: PreviewTarget) => {
    const address = frameOrigin(instanceId, target);
    return address instanceof ElysiaStatus ? null : address;
  };
  /** {@link frameAddress}, or the listeners' refusal. */
  const frameOrigin = (instanceId: string, target: PreviewTarget) => {
    if (hubShows(target)) {
      const project = pageProject(target.artifact.id);
      return ctx.previewListeners.address(
        project ? projectOrigin(project) : instanceId
      );
    }
    const key = embedKeyOf(target.artifact.id);
    if (key === undefined) {
      return refusal(
        409,
        "preview-artifact-gone",
        `${target.artifact.name} is gone, so no origin serves it.`
      );
    }
    return ctx.previewListeners.embed(
      key,
      originKeyOf(target.artifact.id) ?? instanceId
    );
  };

  /**
   * The key of artifact `id`'s own preview origin: the one its row points
   * at now (schema.ts `artifacts.origin`); undefined once the hub doesn't
   * hold it.
   */
  const embedKeyOf = (id: string): string | undefined => {
    const origin = ctx.db.artifacts.get(id)?.origin;
    return origin === undefined ? undefined : embedKey(origin);
  };

  /** The key of the origin a frame of `target` in session `instanceId`'s panel loads ({@link frameOrigin}'s); undefined for an artifact the hub no longer holds. */
  const frameKey = (
    instanceId: string,
    target: PreviewTarget
  ): string | undefined => {
    if (!hubShows(target)) {
      return embedKeyOf(target.artifact.id);
    }
    const project = pageProject(target.artifact.id);
    return project ? projectOrigin(project) : instanceId;
  };

  /**
   * The address a frame told to every screen carries (the board, a panel's
   * stream): its origin's, its listener started, while that origin holds a
   * port (preview.ts `holds`: a screen follows its session, a frame of it
   * is open, its project is kept); else the one its listener
   * still stands on, or none. A screen that follows the session, or opens
   * the artifact, takes one then ({@link frameAddress}).
   */
  const toldAddress = (instanceId: string, target: PreviewTarget) => {
    const key = frameKey(instanceId, target);
    if (key === undefined) {
      return null;
    }
    return ctx.previewListeners.holds(key)
      ? frameAddress(instanceId, target)
      : ctx.previewListeners.bound(key);
  };

  /**
   * Session `instanceId`'s frame of `target` (its open panel's, or an
   * artifact's own tab's): what it shows, on the origin that serves it,
   * opened for the tab that asks (`open`), else as told to every screen
   * ({@link toldAddress}).
   */
  const shownFrame = (
    instanceId: string,
    target: PreviewTarget,
    open: boolean
  ) =>
    previewFrame(
      instanceId,
      "open",
      target,
      sourceOf(target),
      open ? frameAddress(instanceId, target) : toldAddress(instanceId, target),
      artifactIds(instanceId),
      ctx.artifacts.stageFor(target.artifact.id),
      pageProject(target.artifact.id)
    );

  const publishPreview = (
    instanceId: string,
    state: "open" | "closed",
    target: PreviewTarget
  ) => {
    const source = sourceOf(target);
    const frame = previewFrame(
      instanceId,
      state,
      target,
      source,
      state === "open" ? toldAddress(instanceId, target) : null,
      artifactIds(instanceId),
      ctx.artifacts.stageFor(target.artifact.id),
      pageProject(target.artifact.id)
    );
    ctx.streams.sequence(instanceId, frame);
    ctx.artifactSessions.refresh(instanceId);
    // A project's decision page is read by the project's sessions, some of
    // which follow no session's stream: the board carries every open
    // preview, so every dashboard hears it there too.
    if (source && "page" in source) {
      ctx.publishInstances("");
    }
    return frame;
  };

  /**
   * Session `instanceId`'s panel shows nothing now. What it showed goes on
   * being served on its own origin, for its own tab and the decision cards
   * that show it, for as long as that artifact lasts (preview-service.ts `end`).
   */
  const closePreview = (
    instanceId: string
  ): { instanceId: string; state: "closed" } => {
    const target = previewTargets.get(instanceId);
    if (target) {
      previewTargets.delete(instanceId);
      ctx.db.artifacts.unshow(instanceId);
      publishPreview(instanceId, "closed", target);
    }
    return { instanceId, state: "closed" };
  };

  /**
   * A session ended: its preview closes, its preview origin's port is free
   * again, and every pass its browser was given (`artifact_browse`) is gone.
   * Each artifact it made or showed keeps its own origin
   * (preview-service.ts `end`): a preview handed up outlives its maker.
   */
  const endPreviews = (instanceId: string): void => {
    closePreview(instanceId);
    ctx.db.previewPasses.revoke({ instanceId });
    ctx.previewListeners.release(instanceId);
  };

  /**
   * As machine `machineId` registers: the folders of its folder previews
   * that ask the person something, read by its agent with a `stat` each
   * (agent preview.ts `foldersThere`), so one whose folder went while the
   * hub was away leaves Needs you now, not at its next start. A read only:
   * no listener, no process, nothing woken. An agent that doesn't answer it
   * leaves every record as it stands.
   */
  const foldersSeen = (machineId: string): void => {
    const asking = ctx.artifacts.foldersAsking(machineId);
    if (asking.length === 0) {
      return;
    }
    detach(
      (async () => {
        const read = await ctx.readAgent(
          machineId,
          PREVIEW_FOLDERS,
          [asking.map((one) => one.dir)],
          BUSY_TIMEOUT_MS
        );
        if (read.kind !== "answered" || !read.value.ok) {
          return;
        }
        const said = read.value.result as (string | null)[];
        for (const [n, one] of asking.entries()) {
          ctx.artifacts.sourceSeen(one.id, said[n] ?? null);
        }
        console.info(
          `[hub] ${ctx.machineName(machineId)}'s folder previews read: ${asking.length}, ${said.filter(Boolean).length} gone`
        );
      })(),
      "folder previews read"
    );
  };

  /** An open's status for each way its machine's listener didn't start (its start's own codes). */
  const OPEN_REFUSAL: Record<PreviewDown, 409 | 500 | 503 | 504> = {
    closed: 409,
    machine: 503,
    workspace: 500,
    reach: 500,
    server: 500,
    gone: 409,
    // A start never names these: a page's own load does.
    error: 500,
    crashed: 500,
  };

  /**
   * Makes artifact `row` what session `instanceId`'s panel shows: a
   * machine's preview reached on its own origin first, its listener
   * started for what the row names (preview-service.ts `reach`), so a
   * refusal is the open's; the intent kept in the database so a hub restart
   * serves it still, and the "open" published at a new revision.
   */
  const openPreview = async (
    instanceId: string,
    asked: ArtifactRow
  ): Promise<
    | { ok: true; frame: ReturnType<typeof previewFrame> }
    | { ok: false; code: 409 | 500 | 503 | 504; error: string }
  > => {
    // As its row stands now: an opening of its held version moved its origin
    // (`handOrigin`) after the caller read it.
    const row = ctx.db.artifacts.get(asked.id);
    if (!row) {
      return {
        ok: false,
        code: 409,
        error: `${asked.name} is gone, so no origin serves it.`,
      };
    }
    const artifact = shownArtifact(row);
    const target: PreviewTarget = {
      artifact,
      revision: crypto.randomUUID(),
    };
    // Its origin first (a machine's preview its artifact's own, a project's
    // page its project's): with every port of the range taken it is not
    // shown.
    const origin = frameOrigin(instanceId, target);
    if (origin instanceof ElysiaStatus) {
      return { ok: false, code: 503, error: origin.response.detail };
    }
    if (servedByMachine(row)) {
      const reached = await timedShowStep("reach", artifact, instanceId, () =>
        ctx.previewService.reach(row)
      );
      if (!reached.ok) {
        return {
          ok: false,
          code: OPEN_REFUSAL[reached.down],
          error: reached.error,
        };
      }
    }
    previewTargets.set(instanceId, target);
    ctx.db.artifacts.show(instanceId, artifact.id, target.revision);
    const frame = await timedShowStep("publish", artifact, instanceId, () =>
      publishPreview(instanceId, "open", target)
    );
    return { ok: true, frame };
  };

  /** A file of the project folder's, or undefined when it is not there. */
  const folderText = async (
    projectId: string,
    path: string
  ): Promise<string | undefined> => {
    const file = await readFolderFile(projectId, path);
    if (file instanceof ElysiaStatus) {
      if (file.status === 404) {
        return undefined;
      }
      throw projectRefusalOf(file);
    }
    return file.content;
  };

  /** page.html in the project folder's `decisions/<page>/`, and what it names there; undefined when it has none. */
  const folderPageSources = async (origin: {
    projectId: string;
    folder: string;
  }): Promise<{ source: string; sources: PageSources } | undefined> => {
    const source = await folderText(
      origin.projectId,
      `${origin.folder}/page.html`
    );
    return source === undefined
      ? undefined
      : {
          source,
          sources: {
            mockup: (id) =>
              folderText(
                origin.projectId,
                `${origin.folder}/mockups/${id}.html`
              ),
            // The folder takes text only: its pages show the kit's stills.
            image: () => Promise.resolve(undefined),
          },
        };
  };

  /** Reads page.html and what it names from `origin`; a refusal when page.html is not there. */
  const pageSources = async (
    origin: PageOrigin
  ): Promise<
    { source: string; sources: PageSources } | PageRefusal | undefined
  > => {
    if ("projectId" in origin) {
      return await folderPageSources(origin);
    }
    const agent = ctx.registry.agent(origin.machineId);
    if (!agent) {
      return { code: 503, refused: "Machine is not connected" };
    }
    const readText = async (path: string) => {
      const read = await ctx.callFs(origin.machineId, agent, {
        op: "read",
        path,
      });
      switch (read.kind) {
        case "unanswered":
          throw new Error("Machine did not answer");
        case "answered":
          return read.value.ok ? (read.value.result as string) : undefined;
        default:
          throw unreachable(read);
      }
    };
    const file = posix.join(origin.dir, "page.html");
    const source = await readText(file).catch(() => null);
    if (source === null) {
      return { code: 504, refused: "Machine did not answer" };
    }
    if (source === undefined) {
      return {
        code: 404,
        refused: `${file} is not there; write the page as page.html in that folder, from the skill's kit/page.html.`,
      };
    }
    return {
      source,
      sources: {
        mockup: (id) =>
          readText(posix.join(origin.dir, "mockups", `${id}.html`)),
        image: async (path) => {
          const read = await ctx.readMachineMedia(
            origin.machineId,
            posix.join(origin.dir, path)
          );
          // Not there is the machine's refusal; no answer is not "not there".
          if (typeof read === "string") {
            throw new Error("Machine did not answer");
          }
          return "refused" in read ? undefined : read;
        },
      },
    };
  };

  /** Inline HTML names nothing beside it: no mockups, no images but the kit's. */
  const inlineSources: PageSources = {
    mockup: () => Promise.resolve(undefined),
    image: () => Promise.resolve(undefined),
  };

  /** page.html and what it names, for `from`; or the page already published, or why neither. */
  const artifactPageSources = async (
    row: InstanceRow,
    folder: string,
    from: { html: string } | { dir: string } | { folder: true }
  ): Promise<{ source: string; sources: PageSources } | BuiltArtifactPage> => {
    if ("html" in from) {
      return { source: from.html, sources: inlineSources };
    }
    const read =
      "dir" in from
        ? await pageSources({ dir: from.dir, machineId: row.machineId })
        : row.projectId &&
          (await folderPageSources({ projectId: row.projectId, folder }));
    if (read && "refused" in read) {
      return { status: read.code, refused: read.refused };
    }
    if (read) {
      return read;
    }
    const published =
      row.projectId && "folder" in from
        ? await folderText(row.projectId, `${folder}/index.html`)
        : undefined;
    if (published !== undefined) {
      return { html: published };
    }
    return row.projectId && "folder" in from
      ? {
          status: 404,
          refused: `${folder}/ has no page.html or published page yet; pass dir with your work folder, or write ${folder}/page.html into the project's folder.`,
        }
      : {
          status: 400,
          refused:
            "A page takes html, or dir with your work folder that holds page.html.",
        };
  };

  /** The most one Image's file may hold. Our bound: a page's pictures load with it. */
  const IMAGE_LIMIT = 2 * 1024 * 1024;

  /** Why an Image's file wasn't read: its machine (`machine`, null for the session's own) not connected or not answering. */
  const machineAway = (
    away: "offline" | "timeout",
    machine: string | null
  ): string => {
    const subject = machine
      ? `${ctx.machineName(machine)}, where its file is,`
      : "your machine";
    return away === "offline"
      ? `${subject} is not connected.`
      : `${subject} didn't answer.`;
  };

  /** Where Image `file` stands: its path, or why it names none, in a sentence (`problem`). */
  const imagePath = (
    file: string,
    at: ImageAt
  ): { path: string } | { problem: string } => {
    if (file.startsWith("/")) {
      return { path: file };
    }
    if (at.dir) {
      return { path: posix.join(at.dir, file) };
    }
    return {
      problem: at.inFolder
        ? "the project's folder keeps text only: name the picture by its absolute path on your machine."
        : "a file beside the program needs your work folder: publish with dir, or name the picture by its absolute path.",
    };
  };

  /** An Image's file as it stands where its name points, or why it can't be read there, in a sentence. */
  const imageFile = async (
    row: InstanceRow,
    file: string,
    at: ImageAt
  ): Promise<{ bytes: Uint8Array } | string> => {
    const where = imagePath(file, at);
    if ("problem" in where) {
      return where.problem;
    }
    // A path names a file on one machine: a revision's on the machine its picture or folder is on (artifacts/service.ts `revisionReadsOn`).
    const machine = at.readOn ? at.readOn(file) : row.machineId;
    if (!machine) {
      return "the page doesn't know which machine its file is on: name the picture by its absolute path on your machine.";
    }
    const read = await ctx.readMachineMedia(machine, where.path);
    if (read === "offline" || read === "timeout") {
      return machineAway(read, machine === row.machineId ? null : machine);
    }
    return "refused" in read ? read.refused : read;
  };

  /**
   * A decision page's program, for `from`: given inline, a work folder's
   * page.oui on the session's machine, or the project folder's
   * `decisions/<name>/page.oui` (Caw's); undefined when `from` holds none,
   * and the page is HTML.
   */
  const programFrom = async (
    row: InstanceRow,
    folder: string,
    from: PageFrom
  ): Promise<(ImageAt & { text: string }) | PageRefusal | undefined> => {
    if ("program" in from) {
      return {
        text: from.program,
        dir: from.dir,
        shown: from.shown,
        readOn: from.readOn,
      };
    }
    if ("dir" in from) {
      const agent = ctx.registry.agent(row.machineId);
      if (!agent) {
        return { code: 503, refused: "Machine is not connected" };
      }
      const read = await ctx.callFs(row.machineId, agent, {
        op: "read",
        path: posix.join(from.dir, PROGRAM_FILE),
      });
      if (read.kind === "unanswered") {
        return { code: 504, refused: "Machine did not answer" };
      }
      return read.value.ok
        ? { text: read.value.result as string, dir: from.dir }
        : undefined;
    }
    if ("folder" in from && row.projectId) {
      const text = await folderText(row.projectId, `${folder}/${PROGRAM_FILE}`);
      return text === undefined ? undefined : { text, inFolder: true };
    }
  };

  /**
   * An Image's file: an absolute path on the session's machine, or one in
   * the work folder the program came from; on a revision, read on the
   * machine its picture or folder is on, and a picture the page shows whose
   * file no longer stands there (or whose machine is away) is the one the
   * page keeps (artifacts/service.ts `PageFrom`).
   */
  const programImage = async (
    row: InstanceRow,
    file: string,
    at: ImageAt
  ): Promise<ImageRead> => {
    const read = await imageFile(row, file, at);
    const kept = at.shown?.get(file);
    if (typeof read === "string" && kept) {
      return { bytes: kept };
    }
    if (typeof read === "string") {
      return { problem: read };
    }
    return read.bytes.byteLength > IMAGE_LIMIT
      ? {
          problem: `it is ${Math.round(read.bytes.byteLength / 1024)} KiB; a picture on a page is ${IMAGE_LIMIT / 1024 / 1024} MiB at most.`,
        }
      : { bytes: read.bytes };
  };

  /** A folder's refusal of a page's commit, as the page's refusal. */
  const pageRefusalOf = (refused: Refused): PageRefusal => ({
    code: refused.status === 413 ? 413 : 400,
    refused: refused.response.detail,
  });

  /** A folder's refusal thrown on by {@link folderText}, as the page's refusal; anything else throws. */
  const folderPageRefusal = (error: unknown): PageRefusal => {
    if (!(error instanceof ProjectRefusal)) {
      throw error;
    }
    return { code: error.status === 413 ? 413 : 400, refused: error.message };
  };

  /**
   * A project's decision page kept in its folder as its source: a
   * program's page.oui, or an HTML page's built index.html, the other taken
   * out so the folder holds one; one commit by the session, none when the
   * folder holds it already.
   */
  const keepInFolder = async (
    row: InstanceRow,
    name: string,
    keep: { content: string; path: string },
    drop: string
  ): Promise<PageRefusal | undefined> => {
    const { projectId } = row;
    if (!projectId) {
      return;
    }
    try {
      const [kept, dropped] = await Promise.all([
        folderText(projectId, keep.path),
        folderText(projectId, drop),
      ]);
      if (kept === keep.content && dropped === undefined) {
        return;
      }
      const changed = await changeFolderFiles(
        projectId,
        {
          writes: kept === keep.content ? [] : [keep],
          deletes: dropped === undefined ? [] : [drop],
        },
        {
          author: { name: sessionLabel(row).name },
          message: `decisions: ${name}`,
        }
      );
      if (changed instanceof ElysiaStatus) {
        return pageRefusalOf(changed);
      }
    } catch (error) {
      return folderPageRefusal(error);
    }
    ctx.decisionsChanged(projectId);
  };

  /** Page `name`'s source kept in its project's folder ({@link keepInFolder}): a program's, else its HTML. */
  const keepPage = (
    row: InstanceRow,
    name: string,
    page: { html: string; program?: string }
  ): Promise<PageRefusal | undefined> => {
    const folder = `decisions/${name}`;
    return page.program === undefined
      ? keepInFolder(
          row,
          name,
          { path: `${folder}/index.html`, content: page.html },
          `${folder}/${PROGRAM_FILE}`
        )
      : keepInFolder(
          row,
          name,
          { path: `${folder}/${PROGRAM_FILE}`, content: page.program },
          `${folder}/index.html`
        );
  };

  /** Page `name`'s source files in a project's folder: a program's, or an HTML page's built page. */
  const pageSourcesOf = (name: string): string[] => [
    `decisions/${name}/${PROGRAM_FILE}`,
    `decisions/${name}/index.html`,
  ];

  /**
   * Page `name`'s source taken out of project `projectId`'s folder in one
   * commit by the session (artifacts/service.ts `dropPage`): whichever of
   * its program and built page the folder holds; none when it holds
   * neither.
   */
  const dropPage = async (
    row: InstanceRow,
    projectId: string,
    name: string
  ): Promise<PageRefusal | undefined> => {
    try {
      const held = await Promise.all(
        pageSourcesOf(name).map(async (path) =>
          (await folderText(projectId, path)) === undefined ? [] : [path]
        )
      );
      const deletes = held.flat();
      if (deletes.length === 0) {
        return;
      }
      const changed = await changeFolderFiles(
        projectId,
        { writes: [], deletes },
        {
          author: { name: sessionLabel(row).name },
          message: `decisions: ${name} deleted`,
        }
      );
      if (changed instanceof ElysiaStatus) {
        return pageRefusalOf(changed);
      }
    } catch (error) {
      return folderPageRefusal(error);
    }
    ctx.decisionsChanged(projectId);
  };

  /** A page built from `from`, its project's folder untouched ({@link keptArtifactPage} keeps it there). */
  const buildArtifactPage = async (
    row: InstanceRow,
    name: string,
    from: PageFrom,
    artifact: ArtifactNamed
  ): Promise<BuiltArtifactPage> => {
    const folder = `decisions/${name}`;
    const program = await programFrom(row, folder, from);
    if (program && "refused" in program) {
      return { status: program.code, refused: program.refused };
    }
    if (program) {
      const built = await buildProgram(
        program.text,
        (file) => programImage(row, file, program),
        artifact,
        ctx.db.decides.kinds()
      );
      return built instanceof ElysiaStatus
        ? { status: built.status, refused: built.response.detail }
        : { html: built.html, program: built };
    }
    if ("program" in from) {
      return { status: 400, refused: "A program is required." };
    }
    const read = await artifactPageSources(row, folder, from);
    if (!("source" in read)) {
      return read;
    }
    const built = await buildDecisionPage(read.source, read.sources);
    if ("problem" in built) {
      return { status: 422, refused: built.problem };
    }
    return { html: built.html };
  };

  /**
   * A page built (artifacts/service.ts `ArtifactServiceDeps.page`), kept in
   * its project's folder when `keep`: a maker's next version held for its
   * parent is kept there when the parent opens it.
   */
  const keptArtifactPage = async (
    row: InstanceRow,
    name: string,
    from: PageFrom,
    keep: boolean,
    artifact: ArtifactNamed
  ): Promise<BuiltArtifactPage> => {
    const built = await buildArtifactPage(row, name, from, artifact);
    if ("refused" in built || !keep) {
      return built;
    }
    const refused = await keepPage(row, name, {
      html: built.html,
      ...(built.program ? { program: built.program.program } : {}),
    });
    return refused ? { status: refused.code, refused: refused.refused } : built;
  };

  return {
    pageProject,
    originKeyOf,
    browserKeyOf,
    frameOrigin,
    embedKeyOf,
    frameKey,
    shownFrame,
    publishPreview,
    closePreview,
    endPreviews,
    foldersSeen,
    openPreview,
    folderText,
    keepPage,
    pageSourcesOf,
    dropPage,
    keptArtifactPage,
  };
};
