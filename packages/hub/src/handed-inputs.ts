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
import { mediaFilePath, storedFilePath } from "./media";
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
  name: string;
}

/** What the resolver reads through, each the hub's own. */
export interface HandedInputDeps {
  artifacts: Pick<Artifacts, "commentRead" | "handed">;
  /** A session's attachments, newest first (server.ts `sessionAttachments`); throws in words when its transcript can't be read. */
  attachments: (instanceId: string) => Promise<SessionAttachment[]>;
  /** The turns around a `find` hit, as `find` answers them detailed (find-tool.ts): the hub's whole record. */
  find: (actor: InstanceRow, input: { around: string }) => Promise<unknown>;
  /** Every file under a folder of a project's folder, by path from its root. */
  folderFiles: (projectId: string, dir: string) => Promise<string[]>;
  instance: (id: string) => InstanceRow | undefined;
  /** The folder an item's outputs landed in (work-items.ts `outputsFolder`). */
  outputsFolder: (item: WorkItemRow) => string;
  /** The sessions of the caller's delegation tree (delegation-tree.ts `treeSessions`). */
  tree: (caller: InstanceRow) => Set<string>;
  workItem: (id: string) => WorkItemRow | undefined;
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
  /** Whether `caller` reads what `item` did: one of its tree's, or of its project. */
  const reaches = (caller: InstanceRow, item: WorkItemRow): boolean => {
    if (item.projectId && item.projectId === caller.projectId) {
      return true;
    }
    const tree = deps.tree(caller);
    return tree.has(item.parentInstanceId) || tree.has(item.instanceId);
  };

  /** The item `id` names, by its own id or its session's; refused when none, or not the caller's to read. */
  const itemOf = (
    caller: InstanceRow,
    id: string,
    kind: string
  ): WorkItemRow => {
    const session = deps.instance(id);
    const item =
      deps.workItem(id) ??
      (session?.workItemId ? deps.workItem(session.workItemId) : undefined);
    if (!(item && reaches(caller, item))) {
      throw new HandedInputRefusal(
        `{ ${kind}: "${id}" } names no work item of your delegation tree or project; name one by its full work item id or its session's, as delegate_list shows them`
      );
    }
    return item;
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
    const path = mediaFilePath(src.replace(MEDIA_PREFIX, ""));
    return path
      ? (readOrNull(path) ?? "its picture is gone from the hub's media store")
      : `its picture is at ${src.slice(0, 80)}, which the hub does not hold`;
  };

  /** The session whose attachments `entry` reads: the caller's own, or `session` of its tree. */
  const attachmentHolder = (
    caller: InstanceRow,
    session: string | undefined,
    entry: string
  ): InstanceRow => {
    const holder = session ? deps.instance(session) : caller;
    if (!(
      holder &&
      (holder.id === caller.id || deps.tree(caller).has(holder.id))
    )) {
      throw new HandedInputRefusal(
        `${entry}: session ${session} is not of your delegation tree; name your own (leave session out) or one of your delegates'`
      );
    }
    return holder;
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
    const paths = await deps.folderFiles(projectId, folder);
    if (paths.length === 0) {
      throw new HandedInputRefusal(
        `{ assets: "${id}" }: ${folder}/ in its project's folder is empty; its outputs land there once it has finished`
      );
    }
    return Promise.all(
      paths.map(async (path) => {
        try {
          const { bytes } = await readFolderBytes(projectId, path, ASSET_LIMIT);
          return {
            name: `assets-${inputFileName(path.slice(folder.length + 1))}`,
            bytes: Buffer.from(bytes),
            from: `${path} in the project's folder`,
          };
        } catch (error) {
          if (error instanceof FolderRefusal) {
            throw new HandedInputRefusal(
              `{ assets: "${id}" }: ${error.message}`,
              {
                cause: error,
              }
            );
          }
          throw error;
        }
      })
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
