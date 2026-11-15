import { posix } from "node:path";
import type { BrowserKey } from "@cawco/core/browser";
import { isBrowserKey } from "@cawco/core/browser";
import { deliverableKind } from "@cawco/core/deliverables";
import { detach } from "@cawco/core/detach";
import { blockFile } from "@cawco/core/inline-blocks";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import { PREVIEW_FOLDERS } from "@cawco/core/preview/protocol";
import type { InstanceRow } from "@cawco/core/protocol";
import { MEDIA_LIMIT_BYTES } from "@cawco/core/protocol";
import { transcriptWords } from "@cawco/core/words/transcript";
import { ElysiaStatus, problem } from "elysia";
import { timedShowStep } from "./artifacts/service";
import type { PageFrom } from "./artifacts/shapes";
import type { ClosureContext } from "./closure-context";
import type { ArtifactRow } from "./db/artifacts";
import { artifactOrigin, projectOrigin } from "./db/previews";
import type { PageSources } from "./decision-page";
import { buildDecisionPage } from "./decision-page";
import type {
  ArtifactNamed,
  BuiltProgram,
  ImageRead,
} from "./decision-program";
import { buildProgram, PROGRAM_FILE } from "./decision-program";
import {
  blockFolder,
  isBlockProgram,
  pageSourceKept,
  pageSourcePaths,
} from "./kept-blocks";
import { sessionLabel } from "./labels";
import {
  awayProblem,
  MachineProblem,
  silentProblem,
  unansweredIn,
} from "./machine-answers";
import { BUSY_TIMEOUT_MS } from "./machine-read-timeouts";
import type { PageBuilt, PageFolderProblem } from "./page-problems";
import type { PreviewTarget } from "./preview";
import {
  previewFrame,
  previewTargets,
  servedByMachine,
  shownArtifact,
} from "./preview";
import type { OpenStop } from "./preview-stops";
import {
  changeFolderFiles,
  readFolderBytes,
  readFolderFile,
} from "./project-folder";
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
/** Where page.html and what it names are read: the session's machine, or the project folder. */
type PageOrigin =
  { dir: string; machineId: string } | { projectId: string; folder: string };

/**
 * Where a program's Images are read from: its work folder, the project's
 * folder, and on a revision the pictures its page shows and the machine
 * each is read on. A kept block's files (`block`, tsk-330) are pictures,
 * clips and sounds, a relative one in its session's project's folder
 * (core inline-blocks.ts `blockFile`).
 */
interface ImageAt {
  block?: { projectId: string | null };
  dir?: string | undefined;
  inFolder?: true;
  readOn?: ((file: string) => string | undefined) | undefined;
  shown?: ReadonlyMap<string, Uint8Array> | undefined;
}

/** A page's machine that did not answer its read, in words: not connected, or silent. */
const MACHINE_UNANSWERED = {
  away: "Machine is not connected",
  silent: "Machine did not answer",
};

export type ArtifactPagesContext = Pick<
  ClosureContext,
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
      return problem(409, {
        code: "preview-artifact-gone",
        detail: `${target.artifact.name} is gone, so no origin serves it.`,
      });
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
    return origin === undefined ? undefined : artifactOrigin(origin);
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

  /**
   * Makes artifact `row` what session `instanceId`'s panel shows: a
   * machine's preview reached on its own origin first, its listener
   * started for what the row names (preview-service.ts `reach`), so a
   * refusal is the open's; the intent kept in the database so a hub restart
   * serves it still, and the "open" published at a new revision. A show
   * (`again` false) is a new show, which opens the panel again in a tab
   * that closed it (dashboard preview/closed-here.ts); `again`, an update's
   * re-show of what the panel shows already keeps its show, and a tab that
   * closed it stays closed.
   */
  const openPreview = async (
    instanceId: string,
    asked: ArtifactRow,
    again = false
  ): Promise<
    | { ok: true; frame: ReturnType<typeof previewFrame> }
    | { ok: false; error: string; stop: OpenStop }
  > => {
    // As its row stands now: an opening of its held version moved its origin
    // (`handOrigin`) after the caller read it.
    const row = ctx.db.artifacts.get(asked.id);
    if (!row) {
      return {
        ok: false,
        error: `${asked.name} is gone, so no origin serves it.`,
        stop: { kind: "closed" },
      };
    }
    const artifact = shownArtifact(row);
    const before = previewTargets.get(instanceId);
    const target: PreviewTarget = {
      artifact,
      revision: crypto.randomUUID(),
      show:
        again && before?.artifact.id === artifact.id
          ? before.show
          : crypto.randomUUID(),
    };
    // Its origin first (a machine's preview its artifact's own, a project's
    // page its project's): with every port of the range taken it is not
    // shown.
    const origin = frameOrigin(instanceId, target);
    if (origin instanceof ElysiaStatus) {
      return {
        ok: false,
        error: origin.response.detail,
        stop: { kind: "origin", problem: origin },
      };
    }
    if (servedByMachine(row)) {
      const reached = await timedShowStep("reach", artifact, instanceId, () =>
        ctx.previewService.reach(row)
      );
      if (!reached.ok) {
        return { ok: false, error: reached.error, stop: reached.stop };
      }
    }
    previewTargets.set(instanceId, target);
    ctx.db.artifacts.show(
      instanceId,
      artifact.id,
      target.revision,
      target.show
    );
    const frame = await timedShowStep("publish", artifact, instanceId, () =>
      publishPreview(instanceId, "open", target)
    );
    return { ok: true, frame };
  };

  /** A file of the project folder's, or undefined when it is not there. */
  const folderText = async (projectId: string, path: string) => {
    const file = await readFolderFile(projectId, path);
    if (file instanceof ElysiaStatus) {
      return file.status === 404 ? undefined : file;
    }
    return file.content;
  };

  /** page.html in the project folder's `decisions/<page>/`, and what it names there; undefined when it has none. */
  const folderPageSources = async (origin: {
    projectId: string;
    folder: string;
  }) => {
    const source = await folderText(
      origin.projectId,
      `${origin.folder}/page.html`
    );
    if (source === undefined || source instanceof ElysiaStatus) {
      return source;
    }
    const read: { source: string; sources: PageSources } = {
      source,
      sources: {
        mockup: (id) =>
          folderText(origin.projectId, `${origin.folder}/mockups/${id}.html`),
        // The folder takes text only: its pages show the kit's stills.
        image: () => Promise.resolve(undefined),
      },
    };
    return read;
  };

  /** Reads page.html and what it names from `origin`; a refusal when page.html is not there. */
  const pageSources = async (origin: PageOrigin) => {
    if ("projectId" in origin) {
      return await folderPageSources(origin);
    }
    const agent = ctx.registry.agent(origin.machineId);
    if (!agent) {
      return awayProblem(origin.machineId, MACHINE_UNANSWERED.away);
    }
    const readText = async (path: string) => {
      const read = await ctx.callFs(origin.machineId, agent, {
        op: "read",
        path,
      });
      switch (read.kind) {
        case "unanswered":
          throw new MachineProblem(
            unansweredIn(origin.machineId, read, MACHINE_UNANSWERED)
          );
        case "answered":
          return read.value.ok ? (read.value.result as string) : undefined;
        default:
          throw unreachable(read);
      }
    };
    const file = posix.join(origin.dir, "page.html");
    const page = await ctx.callFs(origin.machineId, agent, {
      op: "read",
      path: file,
    });
    if (page.kind === "unanswered") {
      return unansweredIn(origin.machineId, page, MACHINE_UNANSWERED);
    }
    const source = page.value.ok ? (page.value.result as string) : undefined;
    if (source === undefined) {
      return problem(404, {
        code: "page-source-missing",
        detail: `${file} is not there; write the page as page.html in that folder, from the skill's kit/page.html.`,
      });
    }
    const found: { source: string; sources: PageSources } = {
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
          if (read === "offline") {
            throw new MachineProblem(
              awayProblem(origin.machineId, MACHINE_UNANSWERED.away)
            );
          }
          if (read === "timeout") {
            throw new MachineProblem(silentProblem(MACHINE_UNANSWERED.silent));
          }
          return "refused" in read ? undefined : read;
        },
      },
    };
    return found;
  };

  /** page.html and what it names in session `row`'s project's folder at `folder`; undefined outside a project. */
  const inFolder = (row: InstanceRow, folder: string) =>
    row.projectId
      ? folderPageSources({ projectId: row.projectId, folder })
      : undefined;

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
  ) => {
    if ("html" in from) {
      const inline: { source: string; sources: PageSources } = {
        source: from.html,
        sources: inlineSources,
      };
      return inline;
    }
    const read =
      "dir" in from
        ? await pageSources({ dir: from.dir, machineId: row.machineId })
        : await inFolder(row, folder);
    if (read) {
      return read;
    }
    const published =
      row.projectId && "folder" in from
        ? await folderText(row.projectId, `${folder}/index.html`)
        : undefined;
    if (published instanceof ElysiaStatus) {
      return published;
    }
    if (published !== undefined) {
      const kept: { html: string; program?: BuiltProgram } = {
        html: published,
      };
      return kept;
    }
    return row.projectId && "folder" in from
      ? problem(404, {
          code: "page-unpublished",
          detail: `${folder}/ has no page.html or published page yet; pass dir with your work folder, or write ${folder}/page.html into the project's folder.`,
        })
      : problem(400, {
          code: "page-source-unnamed",
          detail:
            "A page takes html, or dir with your work folder that holds page.html.",
        });
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

  /** A kept block's file named by its path `path` in its session's project's folder, or why it can't be read there, in a sentence. */
  const blockFolderFile = async (
    file: string,
    path: string,
    projectId: string | null
  ): Promise<{ bytes: Uint8Array } | string> => {
    if (!projectId) {
      return transcriptWords.blockFileNoProject(file);
    }
    const read = await readFolderBytes(projectId, path, MEDIA_LIMIT_BYTES);
    return read instanceof ElysiaStatus ? read.response.detail : read;
  };

  /** An Image's file as it stands where its name points, or why it can't be read there, in a sentence. */
  const imageFile = async (
    row: InstanceRow,
    file: string,
    at: ImageAt
  ): Promise<{ bytes: Uint8Array } | string> => {
    const named = at.block ? blockFile(file) : null;
    if (named?.on === "folder") {
      return blockFolderFile(file, named.path, at.block?.projectId ?? null);
    }
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
  /** A decision page's program in `folder`, else a kept block's of its name (kept-blocks.ts); undefined for neither. */
  const folderProgram = async (projectId: string, folder: string) =>
    (await folderText(projectId, `${folder}/${PROGRAM_FILE}`)) ??
    (await folderText(
      projectId,
      `${blockFolder(posix.basename(folder))}/${PROGRAM_FILE}`
    ));

  const programFrom = async (
    row: InstanceRow,
    folder: string,
    from: PageFrom
  ) => {
    if ("program" in from) {
      const given: ImageAt & { text: string } = {
        text: from.program,
        dir: from.dir,
        shown: from.shown,
        readOn: from.readOn,
      };
      return given;
    }
    if ("dir" in from) {
      const agent = ctx.registry.agent(row.machineId);
      if (!agent) {
        return awayProblem(row.machineId, MACHINE_UNANSWERED.away);
      }
      const read = await ctx.callFs(row.machineId, agent, {
        op: "read",
        path: posix.join(from.dir, PROGRAM_FILE),
      });
      if (read.kind === "unanswered") {
        return unansweredIn(row.machineId, read, MACHINE_UNANSWERED);
      }
      const inDir: (ImageAt & { text: string }) | undefined = read.value.ok
        ? { text: read.value.result as string, dir: from.dir }
        : undefined;
      return inDir;
    }
    if ("folder" in from && row.projectId) {
      const text = await folderProgram(row.projectId, folder);
      if (text === undefined || text instanceof ElysiaStatus) {
        return text;
      }
      const kept: ImageAt & { text: string } = { text, inFolder: true };
      return kept;
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
    // A kept block's clip or sound is held to what a machine serves of one
    // (agent fs.ts), its pictures to a page's.
    const kind = deliverableKind(file);
    if (at.block && (kind === "video" || kind === "audio")) {
      return { bytes: read.bytes };
    }
    return read.bytes.byteLength > IMAGE_LIMIT
      ? {
          problem: `it is ${Math.round(read.bytes.byteLength / 1024)} KiB; a picture on a page is ${IMAGE_LIMIT / 1024 / 1024} MiB at most.`,
        }
      : { bytes: read.bytes };
  };

  /**
   * Page `name`'s source kept in its project's folder (kept-blocks.ts
   * `pageSourceKept`): a decision page's program or built page under
   * `decisions/<name>/`, a block's program under `artifacts/<name>/`, its
   * other forms taken out so the folder holds one; one commit by the
   * session, none when the folder holds it already.
   */
  const keepPage = async (
    row: InstanceRow,
    name: string,
    page: { html: string; program?: string }
  ): Promise<PageFolderProblem | undefined> => {
    const { projectId } = row;
    if (!projectId) {
      return;
    }
    const { keep, drop } = pageSourceKept(name, page);
    const block = isBlockProgram(page.program);
    const [kept, ...held] = await Promise.all([
      folderText(projectId, keep.path),
      ...drop.map((path) => folderText(projectId, path)),
    ]);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const refused = held.find((one) => one instanceof ElysiaStatus);
    if (refused instanceof ElysiaStatus) {
      return refused;
    }
    const deletes = drop.filter((_, at) => held[at] !== undefined);
    if (kept === keep.content && deletes.length === 0) {
      return;
    }
    const changed = await changeFolderFiles(
      projectId,
      { writes: kept === keep.content ? [] : [keep], deletes },
      {
        author: { name: sessionLabel(row).name },
        message: `${block ? "artifacts" : "decisions"}: ${name}`,
      }
    );
    if (changed instanceof ElysiaStatus) {
      return changed;
    }
    ctx.decisionsChanged(projectId);
  };

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
  ): Promise<PageFolderProblem | undefined> => {
    const paths = pageSourcePaths(name);
    const held = await Promise.all(
      paths.map((path) => folderText(projectId, path))
    );
    const refused = held.find((one) => one instanceof ElysiaStatus);
    if (refused instanceof ElysiaStatus) {
      return refused;
    }
    const deletes = paths.filter((_, at) => held[at] !== undefined);
    if (deletes.length === 0) {
      return;
    }
    const changed = await changeFolderFiles(
      projectId,
      { writes: [], deletes },
      {
        author: { name: sessionLabel(row).name },
        message: `pages: ${name} deleted`,
      }
    );
    if (changed instanceof ElysiaStatus) {
      return changed;
    }
    ctx.decisionsChanged(projectId);
  };

  /** A page built from `from`, its project's folder untouched ({@link keptArtifactPage} keeps it there). */
  const buildArtifactPage = async (
    row: InstanceRow,
    name: string,
    from: PageFrom,
    artifact: ArtifactNamed
  ) => {
    const folder = `decisions/${name}`;
    const program = await programFrom(row, folder, from);
    if (program instanceof ElysiaStatus) {
      return program;
    }
    if (program) {
      const at: ImageAt = isBlockProgram(program.text)
        ? { ...program, block: { projectId: row.projectId ?? null } }
        : program;
      const built = await buildProgram(
        program.text,
        (file) => programImage(row, file, at),
        artifact,
        ctx.db.decides.kinds()
      );
      if (built instanceof ElysiaStatus) {
        return built;
      }
      const page: { html: string; program?: BuiltProgram } = {
        html: built.html,
        program: built,
      };
      return page;
    }
    if ("program" in from) {
      return problem(400, {
        code: "page-program-missing",
        detail: "A program is required.",
      });
    }
    const read = await artifactPageSources(row, folder, from);
    if (read instanceof ElysiaStatus || !("source" in read)) {
      return read;
    }
    const built = await buildDecisionPage(read.source, read.sources);
    if (built instanceof ElysiaStatus) {
      return built;
    }
    if ("problem" in built) {
      return problem(422, { code: "page-unbuilt", detail: built.problem });
    }
    const page: { html: string; program?: BuiltProgram } = {
      html: built.html,
    };
    return page;
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
  ): Promise<PageBuilt> => {
    const built = await buildArtifactPage(row, name, from, artifact);
    if (built instanceof ElysiaStatus || !keep) {
      return built;
    }
    const refused = await keepPage(row, name, {
      html: built.html,
      ...(built.program ? { program: built.program.program } : {}),
    });
    return refused ?? built;
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
    dropPage,
    keptArtifactPage,
  };
};
