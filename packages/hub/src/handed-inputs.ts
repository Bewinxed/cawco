/**
 * THE ONE RESOLVER of what a session hands another by name (core
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
import {
  INPUTS_LIMIT_BYTES,
  type InstanceRow,
  type SessionAttachment,
} from "@cawco/core";
import { dataUrlBytes } from "@cawco/core/captures";
import { type HeldInput, inputFileName } from "@cawco/core/handed-input";
import {
  ArtifactRefusal,
  type Artifacts,
  type HandedReceiver,
} from "./artifacts/service";
import type { WorkItemRow } from "./db";
import { byHandle } from "./handles";
import { mediaBytes, mediaFilePath, storedFilePath } from "./media";
import { FolderRefusal, readFolderBytes } from "./project-folder";

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
  /** The turns around a `find` hit, as `find` answers them detailed (find-tool.ts): the hub's whole record. */
  find: (actor: InstanceRow, input: { around: string }) => Promise<unknown>;
  /** Every file at any depth under a folder of a project's folder, by path from its root; none when it is not there. */
  folderFiles: (projectId: string, dir: string) => Promise<string[]>;
  instance: (id: string) => InstanceRow | undefined;
  /** The folder an item's outputs landed in (work-items.ts `outputsFolder`). */
  outputsFolder: (item: WorkItemRow) => string;
  /** The work items the caller reads, newest first: those of its delegation tree and of its project. */
  reachable: (caller: InstanceRow) => WorkItemRow[];
  /** The sessions of the caller's delegation tree (delegation-tree.ts `treeSessions`). */
  tree: (caller: InstanceRow) => Set<string>;
  /** A text file of a workspace, by path from its clone's root, read inside its boundary; throws in the machine's words. */
  workspaceText: (workspaceId: string, path: string) => Promise<string>;
}

/** A refusal of one handed input, in words that name it. */
export class HandedInputRefusal extends Error {}

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

const FILES_PREFIX = /^\/api\/files\//;
const MEDIA_PREFIX = /^\/api\/media\//;
const BASE64_PADDING = /[=]+$/;
const SPACE = /\s+/g;

/** A file's bytes, or null when it can't be read. */
const readOrNull = (path: string): Buffer | null => {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
};

export const createHandedInputs = (deps: HandedInputDeps) => {
  /** `read` through the one way a tool reads an id (handles.ts), its refusal in the input's words. */
  const handled = <T>(entry: string, read: () => T): T => {
    try {
      return read();
    } catch (error) {
      throw new HandedInputRefusal(
        `${entry}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  };

  /**
   * The item `asked` names among those the caller reads ({@link
   * HandedInputDeps.reachable}): by its own id or its session's, whole or
   * by handle (handles.ts); refused when none or several are.
   */
  const itemOf = (
    caller: InstanceRow,
    asked: string,
    kind: string
  ): WorkItemRow => {
    // Each item by its id and by its session's; a session's newest item stands for it.
    const named = new Map<string, WorkItemRow>();
    for (const item of deps.reachable(caller)) {
      for (const key of [item.id, item.instanceId]) {
        if (key && !named.has(key)) {
          named.set(key, item);
        }
      }
    }
    return handled(`{ ${kind}: "${asked}" }`, () =>
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
    )[1];
  };

  const report = (caller: InstanceRow, id: string): HandedFile[] => {
    const item = itemOf(caller, id, "report");
    const body =
      item.result ??
      item.summary ??
      (item.error ? `It ${item.state}: ${item.error}` : null);
    if (!body) {
      throw new HandedInputRefusal(
        `{ report: "${id}" }: ${item.title} (${short(item.id)}) is ${item.state} and has no report yet; hand it once it has finished`
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
    return [
      {
        name: `report-${short(item.id)}.md`,
        bytes: Buffer.from(text),
        from: `report of ${item.title} (${short(item.id)})`,
      },
    ];
  };

  /** An artifact refusal in the input's words. */
  const artifactRead = async <T>(
    entry: string,
    read: () => T | Promise<T>
  ): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ArtifactRefusal) {
        throw new HandedInputRefusal(`${entry}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  };

  /**
   * An artifact's files (artifacts/service.ts `handed`); a component
   * canvas's with each of its states files, read from its workspace.
   */
  const artifact = async (
    caller: InstanceRow,
    id: string
  ): Promise<HandedFile[]> => {
    const entry = `{ artifact: "${id}" }`;
    const { files, row, states } = await artifactRead(entry, () =>
      deps.artifacts.handed(caller.id, id)
    );
    const from = `${row.kind} ${row.name}`;
    const sources = await Promise.all(
      (states?.files ?? []).map(async (path): Promise<HandedFile> => {
        try {
          return {
            name: `artifact-${row.name}-${inputFileName(path)}`,
            bytes: Buffer.from(
              await deps.workspaceText(states?.workspace as string, path)
            ),
            from: `${path}, a states file of ${from}`,
          };
        } catch (error) {
          throw new HandedInputRefusal(
            `${entry}: its states file ${path} can't be read from workspace ${states?.workspace}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          );
        }
      })
    );
    return [...files.map((file) => ({ ...file, from })), ...sources];
  };

  const pins = async (
    caller: InstanceRow,
    id: string
  ): Promise<HandedFile[]> => {
    const read = await artifactRead(`{ pins: "${id}" }`, () =>
      deps.artifacts.commentRead(caller.id, {
        artifact: id,
        filter: "all",
        bySession: false,
      })
    );
    const [one] = read.artifacts;
    const name = one?.name ?? short(id);
    return [
      {
        name: `pins-${name}.json`,
        bytes: Buffer.from(
          `${JSON.stringify(one ?? { id, pins: [] }, null, 2)}\n`
        ),
        from: `pins on ${name}, with their threads`,
      },
    ];
  };

  const find = async (
    caller: InstanceRow,
    ref: string
  ): Promise<HandedFile[]> => {
    let turns: unknown;
    try {
      turns = await deps.find(caller, { around: ref });
    } catch (error) {
      throw new HandedInputRefusal(
        `{ find: "${ref}" }: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    return [
      {
        name: `find-${inputFileName(ref)}.json`,
        bytes: Buffer.from(`${JSON.stringify(turns, null, 2)}\n`),
        from: `the turns around find ref ${ref}`,
      },
    ];
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
  ): InstanceRow => {
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
  ): Promise<SessionAttachment> => {
    let all: SessionAttachment[];
    try {
      all = await deps.attachments(holder.id);
    } catch (error) {
      throw new HandedInputRefusal(
        `${entry}: its session's transcript can't be read: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    const wanted = named.trim().toLowerCase();
    const one =
      all.find((each) => each.id === named) ??
      all.find((each) => each.name.toLowerCase() === wanted);
    if (!one) {
      const names = all.slice(0, 12).map((each) => `"${each.name}"`);
      const where = own ? "your session" : `session ${short(holder.id)}`;
      throw new HandedInputRefusal(
        `${entry}: no attachment of that id or name in ${where}; ${names.length > 0 ? `its newest are ${names.join(", ")}` : "it has none"}`
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

  const attachment = async (
    caller: InstanceRow,
    named: string,
    session: string | undefined
  ): Promise<HandedFile[]> => {
    const entry = `{ attachment: "${named}"${session ? `, session: "${session}"` : ""} }`;
    const holder = attachmentHolder(caller, session, entry);
    const one = await attachmentNamed(
      holder,
      holder.id === caller.id,
      named,
      entry
    );
    const bytes = attachmentBytes(one);
    if (typeof bytes === "string") {
      throw new HandedInputRefusal(`${entry}: ${one.name}: ${bytes}`);
    }
    return [
      {
        name: attachmentFileName(one),
        bytes,
        from: `${one.name}, attached by the ${one.who}${one.at ? ` at ${one.at}` : ""}`,
      },
    ];
  };

  const assets = async (
    caller: InstanceRow,
    id: string
  ): Promise<HandedFile[]> => {
    const item = itemOf(caller, id, "assets");
    const folder = deps.outputsFolder(item);
    if (!(item.projectId && item.outputs?.length)) {
      throw new HandedInputRefusal(
        `{ assets: "${id}" }: ${item.title} (${short(item.id)}) handed in no outputs, so ${folder}/ holds nothing of it`
      );
    }
    const { projectId } = item;
    const folderRead = async <T>(read: () => Promise<T>): Promise<T> => {
      try {
        return await read();
      } catch (error) {
        if (error instanceof FolderRefusal) {
          throw new HandedInputRefusal(
            `{ assets: "${id}" }: ${error.message}`,
            { cause: error }
          );
        }
        throw error;
      }
    };
    const paths = await folderRead(() => deps.folderFiles(projectId, folder));
    if (paths.length === 0) {
      throw new HandedInputRefusal(
        `{ assets: "${id}" }: ${folder}/ in its project's folder holds no file at any depth; its outputs land there once it has finished`
      );
    }
    // Each lands at its path in the project's folder, its folders kept:
    // `inputs/assets/<item>/design-briefs/brief.md`.
    return Promise.all(
      paths.map(async (path) => ({
        name: path,
        bytes: Buffer.from(
          (
            await folderRead(() =>
              readFolderBytes(projectId, path, ASSET_LIMIT)
            )
          ).bytes
        ),
        from: `${path} in the project's folder`,
      }))
    );
  };

  /**
   * `input` as the files it lands as, read for `caller`; a {@link
   * HandedInputRefusal} in words naming it when it names nothing the
   * caller may read.
   */
  const resolve = (
    caller: InstanceRow,
    input: HeldInput
  ): Promise<HandedFile[]> | HandedFile[] => {
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
      return assets(caller, input.assets);
    }
    if ("text" in input) {
      return [
        {
          name: input.name,
          bytes: Buffer.from(input.text),
          from: "your parent's words",
        },
      ];
    }
    const bytes = Buffer.from(input.blob, "base64");
    if (
      bytes.toString("base64").replace(BASE64_PADDING, "") !==
      input.blob.replace(SPACE, "").replace(BASE64_PADDING, "")
    ) {
      throw new HandedInputRefusal(
        `{ blob, name: "${input.name}" }: blob is not base64; hand words as { text, name }`
      );
    }
    return [{ name: input.name, bytes, from: "bytes your parent held" }];
  };

  return { resolve };
};

export type HandedInputs = ReturnType<typeof createHandedInputs>;
