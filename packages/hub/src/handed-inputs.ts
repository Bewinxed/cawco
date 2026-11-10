/**
 * THE ONE RESOLVER of what a session hands another by name (hub
 * handed-input.ts `HeldInput`): a work item's report, an artifact, its pins,
 * a `find` hit's turns, a session's attachment, an item's assets, inline
 * text or a blob, each turned into named files by the hub, which holds them,
 * so the caller writes no scratch file of its own. Work-items writes them
 * into the receiving workspace's `$TMPDIR/inputs/` beside the path inputs
 * its machine copies (work-items.ts `readInputs`, `handIn`); `delegate` and
 * `handoff` hand through it.
 *
 * Each kind is read under the rule its own tool reads it by: an artifact and
 * its pins as `artifact_read` and `comment_read` let the caller, a `find`
 * ref as `find` does, a report, assets or another session's attachments
 * when the item or session is of the caller's delegation tree or project.
 * One that names nothing, or nothing the caller may read, is refused in
 * words that name it.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { pictureName, pictureNamed } from "@cawco/core/attachments";
import { dataUrlBytes } from "@cawco/core/captures";
import type { InstanceRow, SessionAttachment } from "@cawco/core/protocol";
import { INPUTS_LIMIT_BYTES } from "@cawco/core/workspace/controls";
import { ElysiaStatus } from "elysia";
import type { Artifacts } from "./artifacts/service";
import type { HandedReceiver } from "./artifacts/shapes";
import type { WorkItemRow } from "./db/project-work";
import { type HeldInput, inputFileName } from "./handed-input";
import { byHandle } from "./handles";
import { mediaBytes, mediaFilePath, storedFilePath } from "./media";
import { listFolder, readFolderBytes } from "./project-folder";
import { type Refused, refusal } from "./refusal";

/**
 * One file the hub writes into `inputs/`: its name there, what it was handed
 * as, and its bytes, or, for what is made for its reader alone (a preview's
 * pass), the bytes made for the session it is handed to as it is written.
 */
export interface HandedFile {
  bytes: Buffer | ((receiver: HandedReceiver) => Promise<Buffer>);
  /** What it is, for the receiver's opening line: "report of Fix the tray (1a2b3c4d)". */
  from: string;
  /** Where it lands under `inputs/`: a file name, or an item's asset's path in its project's folder. */
  name: string;
}

/** What the resolver reads through, each the hub's own. */
export interface HandedInputDeps {
  artifacts: Pick<Artifacts, "commentRead" | "handed">;
  /** A session's attachments, newest first (server.ts `sessionAttachments`); throws in words when its transcript can't be read. */
  attachments: (instanceId: string) => Promise<SessionAttachment[]>;
  /** The turns around a `find` hit, as `find` answers them detailed (find-tool.ts): the hub's whole record; or why it gave none, in its words. */
  find: (
    actor: InstanceRow,
    input: { around: string }
  ) => Promise<{ turns: unknown } | { why: string }>;
  instance: (id: string) => InstanceRow | undefined;
  /** The folder an item's outputs landed in (workspaces.ts `outputsFolder`). */
  outputsFolder: (item: WorkItemRow) => string;
  /** The work items the caller reads, newest first: those of its delegation tree and of its project. */
  reachable: (caller: InstanceRow) => WorkItemRow[];
  /**
   * The pictures the hub handed a session, by their media store names
   * (media.ts `<sha256>.<ext>`): its send records', which keep the bytes
   * as sent, whatever copy its harness stored.
   */
  sentPictures: (instanceId: string) => string[];
  /** The sessions of the caller's delegation tree (delegation-tree.ts `treeSessions`). */
  tree: (caller: InstanceRow) => Set<string>;
  /** A text file of a workspace, by path from its clone's root, read inside its boundary; throws in the machine's words. */
  workspaceText: (workspaceId: string, path: string) => Promise<string>;
}

const short = (id: string) => id.slice(0, 8);

/** Media types an attachment's picture lands with, by extension. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** The largest one asset file handed (the inputs' own limit holds the whole). */
const ASSET_LIMIT = INPUTS_LIMIT_BYTES;

const FILES_PREFIX = /^\/api\/files\//u;
const MEDIA_PREFIX = /^\/api\/media\//u;
const BASE64_PADDING = /[=]+$/u;
const SPACE = /\s+/gu;

/** A file's bytes, or null when it can't be read. */
const readOrNull = (path: string): Buffer | null => {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
};

/** Why one handed input reads nothing, under its cause's code, in words that name it (`entry`, as it was handed). */
const unhanded = <const Status extends number, const Code extends string>(
  status: Status,
  code: Code,
  entry: string,
  words: string
) => refusal(status, code, `${entry}: ${words}`);

/** A thrown failure's words. */
const failure = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Every file at any depth under `dir` of a project's folder, by path from
 * its root; none when it is not there; the folder's refusal, or one when it
 * holds more than one listing reads. (Names read of a file are none, not a
 * refusal: a walk that took a refusal for a file took every file for an
 * empty folder.)
 */
const folderFiles = async (projectId: string, dir: string) => {
  const listed = await listFolder(projectId, dir, true);
  if (listed instanceof ElysiaStatus) {
    return listed.status === 404 ? [] : listed;
  }
  if (listed.truncated) {
    return refusal(
      413,
      "handed-folder-too-large",
      `${dir}/ holds more entries than one listing reads; hand its files by path`
    );
  }
  return listed.entries.flatMap((entry) =>
    entry.kind === "file" ? [entry.path] : []
  );
};

export const createHandedInputs = (deps: HandedInputDeps) => {
  /** `read` through the one way a tool reads an id (handles.ts), which throws its refusal: in the input's words. */
  const handled = <T>(entry: string, read: () => T) => {
    try {
      return read();
    } catch (error) {
      return unhanded(404, "handed-name-unmatched", entry, failure(error));
    }
  };

  /**
   * The item `asked` names among those the caller reads ({@link
   * HandedInputDeps.reachable}): by its own id or its session's, whole or
   * by handle (handles.ts); refused when none or several are.
   */
  const itemOf = (caller: InstanceRow, asked: string, kind: string) => {
    // Each item by its id and by its session's; a session's newest item stands for it.
    const named = new Map<string, WorkItemRow>();
    for (const item of deps.reachable(caller)) {
      for (const key of [item.id, item.instanceId]) {
        if (key && !named.has(key)) {
          named.set(key, item);
        }
      }
    }
    const found = handled(`{ ${kind}: "${asked}" }`, () =>
      byHandle(
        asked,
        [...named],
        {
          id: ([key]) => key,
          said: ([key, item]) =>
            `${item.title} (${key === item.id ? "item" : "session"} ${short(key)})`,
        },
        "work item"
      )
    );
    return found instanceof ElysiaStatus ? found : found[1];
  };

  const report = (caller: InstanceRow, id: string) => {
    const item = itemOf(caller, id, "report");
    if (item instanceof ElysiaStatus) {
      return item;
    }
    const body =
      item.result ??
      item.summary ??
      (item.error ? `It ${item.state}: ${item.error}` : null);
    if (!body) {
      return unhanded(
        409,
        "handed-report-none",
        `{ report: "${id}" }`,
        `${item.title} (${short(item.id)}) is ${item.state} and has no report yet; hand it once it has finished`
      );
    }
    const text = [
      `# ${item.title}`,
      "",
      `Work item ${item.id}, ${item.state}.`,
      ...(item.headline ? ["", item.headline] : []),
      "",
      body,
      "",
    ].join("\n");
    const files: HandedFile[] = [
      {
        name: `report-${short(item.id)}.md`,
        bytes: Buffer.from(text),
        from: `report of ${item.title} (${short(item.id)})`,
      },
    ];
    return files;
  };

  /** The artifacts' refusal of what the input names, in the input's words. */
  const artifactRefused = (entry: string, { status, response }: Refused) =>
    unhanded(status, "handed-artifact-refused", entry, response.detail);

  /**
   * An artifact's files (artifacts/service.ts `handed`); a component
   * canvas's with each of its states files, read from its workspace.
   */
  const artifact = async (caller: InstanceRow, id: string) => {
    const entry = `{ artifact: "${id}" }`;
    const handed = await deps.artifacts.handed(caller.id, id);
    if (handed instanceof ElysiaStatus) {
      return artifactRefused(entry, handed);
    }
    const { files, row, states } = handed;
    const from = `${row.kind} ${row.name}`;
    const reads = await Promise.all(
      (states?.files ?? []).map(async (path) => {
        try {
          const source: HandedFile = {
            name: `artifact-${row.name}-${inputFileName(path)}`,
            bytes: Buffer.from(
              await deps.workspaceText(states?.workspace as string, path)
            ),
            from: `${path}, a states file of ${from}`,
          };
          return source;
        } catch (error) {
          return unhanded(
            502,
            "handed-states-unread",
            entry,
            `its states file ${path} can't be read from workspace ${states?.workspace}: ${failure(error)}`
          );
        }
      })
    );
    const sources: HandedFile[] = [];
    for (const read of reads) {
      if (read instanceof ElysiaStatus) {
        return read;
      }
      sources.push(read);
    }
    const all: HandedFile[] = [
      ...files.map((file) => ({ ...file, from })),
      ...sources,
    ];
    return all;
  };

  const pins = (caller: InstanceRow, id: string) => {
    const read = deps.artifacts.commentRead(caller.id, {
      artifact: id,
      filter: "all",
      bySession: false,
    });
    if (read instanceof ElysiaStatus) {
      return artifactRefused(`{ pins: "${id}" }`, read);
    }
    const [one] = read.artifacts;
    const name = one?.name ?? short(id);
    const files: HandedFile[] = [
      {
        name: `pins-${name}.json`,
        bytes: Buffer.from(
          `${JSON.stringify(one ?? { id, pins: [] }, null, 2)}\n`
        ),
        from: `pins on ${name}, with their threads`,
      },
    ];
    return files;
  };

  const find = async (caller: InstanceRow, ref: string) => {
    const entry = `{ find: "${ref}" }`;
    const found = await deps
      .find(caller, { around: ref })
      .catch((error: unknown) => ({ why: failure(error) }));
    if ("why" in found) {
      return unhanded(404, "handed-find-none", entry, found.why);
    }
    const files: HandedFile[] = [
      {
        name: `find-${inputFileName(ref)}.json`,
        bytes: Buffer.from(`${JSON.stringify(found.turns, null, 2)}\n`),
        from: `the turns around find ref ${ref}`,
      },
    ];
    return files;
  };

  /** One attachment's bytes, or why the hub holds none. */
  const attachmentBytes = (one: SessionAttachment): Buffer | string => {
    if (one.kind === "text") {
      return Buffer.from(one.content ?? "");
    }
    if (one.kind === "file") {
      const path = one.ref
        ? storedFilePath(one.ref.replace(FILES_PREFIX, ""))
        : undefined;
      return (
        (path && readOrNull(path)) ??
        "the hub holds no copy of its bytes (its harness named only part of its hash)"
      );
    }
    const src = one.src ?? "";
    const inline = dataUrlBytes(src);
    if (inline) {
      return Buffer.from(inline);
    }
    const name = src.replace(MEDIA_PREFIX, "");
    if (!mediaFilePath(name)) {
      return `its picture is at ${src.slice(0, 80)}, which the hub does not hold`;
    }
    const bytes = mediaBytes(name);
    return bytes
      ? Buffer.from(bytes)
      : "its picture is gone from the hub's media store";
  };

  /** The session whose attachments `entry` reads: the caller's own, or `session` of its tree, whole or by handle (handles.ts). */
  const attachmentHolder = (
    caller: InstanceRow,
    session: string | undefined,
    entry: string
  ) => {
    if (!session) {
      return caller;
    }
    const tree = [caller.id, ...deps.tree(caller)].flatMap(
      (id) => deps.instance(id) ?? []
    );
    return handled(entry, () =>
      byHandle(
        session,
        [...new Map(tree.map((row) => [row.id, row])).values()],
        {
          id: (row) => row.id,
          said: (row) =>
            `${row.title ?? row.derivedTitle ?? "untitled"} (${short(row.id)})`,
        },
        "session of your delegation tree"
      )
    );
  };

  /** `holder`'s attachment `named` names, by its id or its name as Files lists it, newest first. */
  const attachmentNamed = async (
    holder: InstanceRow,
    own: boolean,
    named: string,
    entry: string
  ) => {
    let all: SessionAttachment[];
    try {
      all = await deps.attachments(holder.id);
    } catch (error) {
      return unhanded(
        502,
        "handed-transcript-unread",
        entry,
        `its session's transcript can't be read: ${failure(error)}`
      );
    }
    const wanted = named.trim().toLowerCase();
    const one =
      all.find((each) => each.id === named) ??
      all.find((each) => each.name.toLowerCase() === wanted);
    if (!one) {
      const names = all.slice(0, 12).map((each) => `"${each.name}"`);
      const where = own ? "your session" : `session ${short(holder.id)}`;
      return unhanded(
        404,
        "handed-attachment-unknown",
        entry,
        `no attachment of that id or name in ${where}; ${names.length > 0 ? `its newest are ${names.join(", ")}` : "it has none"}`
      );
    }
    return one;
  };

  /** What an attachment lands as: its name, with the extension its kind gives one that has none. */
  const attachmentFileName = (one: SessionAttachment): string => {
    let extension = "";
    if (!extname(one.name)) {
      if (one.kind === "image") {
        extension = IMAGE_EXTENSIONS[one.mediaType] ?? "";
      } else if (one.kind === "text") {
        extension = ".txt";
      }
    }
    return `attachment-${inputFileName(one.name)}${extension}`;
  };

  /**
   * A picture by the name its turn's line gave it (core `pictureName`):
   * one the hub handed `holder`, read out of the media store.
   */
  const namedPicture = (
    holder: InstanceRow,
    own: boolean,
    picture: { hash: string; extension: string },
    entry: string
  ) => {
    const name = deps
      .sentPictures(holder.id)
      .find(
        (one) =>
          one.startsWith(picture.hash) && one.endsWith(`.${picture.extension}`)
      );
    const where = own ? "your session" : `session ${short(holder.id)}`;
    if (!name) {
      return unhanded(
        404,
        "handed-picture-unknown",
        entry,
        `no picture by that name was sent to ${where}; use a name an "Attached picture:" line gave`
      );
    }
    const bytes = mediaBytes(name);
    if (!bytes) {
      return unhanded(
        404,
        "handed-picture-gone",
        entry,
        `the picture was sent to ${where}, but the hub's media store no longer holds its bytes`
      );
    }
    const files: HandedFile[] = [
      {
        name: `attachment-${pictureName(name)}`,
        bytes: Buffer.from(bytes),
        // Read by the receiver: the caller is its parent.
        from: `a picture sent to ${own ? "your parent" : `session ${short(holder.id)}`}`,
      },
    ];
    return files;
  };

  const attachment = async (
    caller: InstanceRow,
    named: string,
    session: string | undefined
  ) => {
    const entry = `{ attachment: "${named}"${session ? `, session: "${session}"` : ""} }`;
    const holder = attachmentHolder(caller, session, entry);
    if (holder instanceof ElysiaStatus) {
      return holder;
    }
    const picture = pictureNamed(named);
    if (picture) {
      return namedPicture(holder, holder.id === caller.id, picture, entry);
    }
    const one = await attachmentNamed(
      holder,
      holder.id === caller.id,
      named,
      entry
    );
    if (one instanceof ElysiaStatus) {
      return one;
    }
    const bytes = attachmentBytes(one);
    if (typeof bytes === "string") {
      return unhanded(
        404,
        "handed-attachment-bytes-gone",
        entry,
        `${one.name}: ${bytes}`
      );
    }
    const files: HandedFile[] = [
      {
        name: attachmentFileName(one),
        bytes,
        from: `${one.name}, attached by the ${one.who}${one.at ? ` at ${one.at}` : ""}`,
      },
    ];
    return files;
  };

  /** The files an item's assets hand, by path in its project's folder, and the folder they are in; refused in the input's words. */
  const assetPaths = async (caller: InstanceRow, id: string) => {
    const entry = `{ assets: "${id}" }`;
    const item = itemOf(caller, id, "assets");
    if (item instanceof ElysiaStatus) {
      return item;
    }
    const folder = deps.outputsFolder(item);
    if (!item.projectId) {
      return unhanded(
        409,
        "handed-assets-no-project",
        entry,
        `${item.title} (${short(item.id)}) is in no project, so there is no ${folder}/ to copy from`
      );
    }
    const paths = await folderFiles(item.projectId, folder);
    if (paths instanceof ElysiaStatus) {
      return unhanded(
        paths.status,
        "handed-assets-unread",
        entry,
        paths.response.detail
      );
    }
    if (paths.length === 0) {
      return unhanded(
        404,
        "handed-assets-none",
        entry,
        `${folder}/ in its project's folder holds no file at any depth; its outputs land there once it has finished`
      );
    }
    return { projectId: item.projectId, paths };
  };

  /**
   * An item's assets, each read only when its reader asks for the next: a
   * reader past its budget reads no more. A file the folder refuses is
   * yielded as its refusal, in the input's words, and ends them.
   */
  async function* assets(projectId: string, id: string, paths: string[]) {
    // Each lands at its path in the project's folder, its folders kept:
    // `inputs/assets/<item>/design-briefs/brief.md`.
    for (const path of paths) {
      const read = await readFolderBytes(projectId, path, ASSET_LIMIT);
      if (read instanceof ElysiaStatus) {
        yield unhanded(
          read.status,
          "handed-assets-unread",
          `{ assets: "${id}" }`,
          read.response.detail
        );
        return;
      }
      const file: HandedFile = {
        name: path,
        bytes: Buffer.from(read.bytes),
        from: `${path} in the project's folder`,
      };
      yield file;
    }
  }

  /** An item's assets: their files one by one ({@link assets}), or why there are none to hand. */
  const assetsOf = async (caller: InstanceRow, id: string) => {
    const found = await assetPaths(caller, id);
    return found instanceof ElysiaStatus
      ? found
      : assets(found.projectId, id, found.paths);
  };

  /**
   * `input` as the files it lands as, read for `caller`; refused in words
   * naming it when it names nothing the caller may read.
   */
  const resolve = (caller: InstanceRow, input: HeldInput) => {
    if ("report" in input) {
      return report(caller, input.report);
    }
    if ("artifact" in input) {
      return artifact(caller, input.artifact);
    }
    if ("pins" in input) {
      return pins(caller, input.pins);
    }
    if ("find" in input) {
      return find(caller, input.find);
    }
    if ("attachment" in input) {
      return attachment(caller, input.attachment, input.session);
    }
    if ("assets" in input) {
      return assetsOf(caller, input.assets);
    }
    if ("text" in input) {
      const words: HandedFile[] = [
        {
          name: input.name,
          bytes: Buffer.from(input.text),
          from: "your parent's words",
        },
      ];
      return words;
    }
    const bytes = Buffer.from(input.blob, "base64");
    if (
      bytes.toString("base64").replace(BASE64_PADDING, "") !==
      input.blob.replace(SPACE, "").replace(BASE64_PADDING, "")
    ) {
      return unhanded(
        400,
        "handed-blob-not-base64",
        `{ blob, name: "${input.name}" }`,
        "blob is not base64; hand words as { text, name }"
      );
    }
    const held: HandedFile[] = [
      { name: input.name, bytes, from: "bytes your parent held" },
    ];
    return held;
  };

  return { resolve };
};

export type HandedInputs = ReturnType<typeof createHandedInputs>;
