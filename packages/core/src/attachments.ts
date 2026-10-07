/**
 * What a turn carries beside its typed words, other than pictures: a text
 * the reader attached or pasted at length, folded into the prompt as quoted
 * material; or any other file, which the hub stores (`POST /api/files`) and
 * the session's machine fetches and puts on its own disk before the harness
 * sees the turn, naming its path in one line of the message.
 */
export interface TextAttachment {
  content: string;
  kind: "text";
  name: string;
}

export interface FileAttachment {
  kind: "file";
  mediaType: string;
  name: string;
  /** The hub's reference to its bytes: `/api/files/<sha256>`. */
  ref: string;
  /** Its length in bytes. */
  size: number;
}

export type SendAttachment = TextAttachment | FileAttachment;

const KB = 1024;

/** "14 B", "2.3 KB", "1.2 MB", "1.0 GB": how a file's size is said everywhere. */
export function humanSize(bytes: number): string {
  if (bytes >= KB * KB * KB) {
    return `${(bytes / KB / KB / KB).toFixed(1)} GB`;
  }
  if (bytes >= KB * KB) {
    return `${(bytes / KB / KB).toFixed(1)} MB`;
  }
  if (bytes >= KB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

const UNITS: Record<string, number> = { B: 1, KB, MB: KB * KB, GB: KB ** 3 };
const SIZE = /^(\d+(?:\.\d+)?) (B|KB|MB|GB)$/;

/** A {@link humanSize} back to bytes, as near as it says. */
function sizeOf(said: string): number {
  const match = SIZE.exec(said);
  return match ? Math.round(Number(match[1]) * UNITS[match[2]]) : 0;
}

const HASH_PREFIX = /^([a-f0-9]{8}|[a-f0-9]{64})-(.+)$/;

/** The hash of a file's bytes from a {@link FileAttachment.ref}. */
export const fileHash = (ref: string): string =>
  ref.slice(ref.lastIndexOf("/") + 1);

const FOLDERS = /[\\/]/;

/**
 * Where a session's machine keeps an attached file, under the attachments
 * folder: the session's own folder, the first eight characters of the
 * file's hash (all of it in the hub's own record, `whole`), then its name
 * with any folders taken off.
 */
export function attachedFileName(
  sessionId: string,
  { name, ref }: Pick<FileAttachment, "name" | "ref">,
  whole = false
): string {
  const base = name.split(FOLDERS).pop()?.trim() || "file";
  const safe = base === "." || base === ".." ? "file" : base;
  const hash = fileHash(ref);
  return `${sessionId}/${whole ? hash : hash.slice(0, 8)}-${safe}`;
}

/** The attachments folder, as the hub's record writes it (it knows no machine's home). */
export const ATTACHMENTS_HOME = "~/.cawco/attachments";

/** The line a turn carries for one attached file. */
export const attachedFileLine = (
  path: string,
  { size, mediaType }: Pick<FileAttachment, "size" | "mediaType">
): string => `Attached file: ${path} (${humanSize(size)}, ${mediaType})`;

const ATTACHED_FILE =
  /\n*^Attached file: (\S.*?) \(([^,()\n]+), ([^()\n]+)\)$/gm;

/** A file a sent turn names, as its transcript row shows it. */
export interface ShownFile {
  kind: "file";
  mediaType: string;
  name: string;
  /** Present when the line named the whole hash (the hub's own record). */
  ref?: string;
  size: number;
}

/**
 * A user turn split into its words and the files its {@link attachedFileLine}s
 * name. The hub's record of a send names each file by its whole hash, so its
 * row can open it; a harness's stored copy names the first eight characters
 * only, and shows the file without a way to open it.
 */
export function attachedFiles(text: string): {
  typed: string;
  files?: ShownFile[];
} {
  const files: ShownFile[] = [];
  const typed = text.replace(
    ATTACHED_FILE,
    (line, path: string, size: string, mediaType: string) => {
      const base = path.slice(path.lastIndexOf("/") + 1);
      const named = HASH_PREFIX.exec(base);
      if (!named) {
        return line;
      }
      const [, hash, name] = named;
      files.push({
        kind: "file",
        name,
        mediaType,
        size: sizeOf(size),
        ...(hash.length === 64 ? { ref: `/api/files/${hash}` } : {}),
      });
      return "";
    }
  );
  return files.length ? { typed: typed.trimEnd(), files } : { typed: text };
}
