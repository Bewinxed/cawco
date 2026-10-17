/**
 * One session's files, shaped as the hub and the store would hand them to
 * the panel: its artifacts (`listArtifacts`, newest first, a promoted one
 * tagged with its commit), each with the thumbnail the transcript's card
 * already keeps (ToolGroup `preview.thumbnail`) and the words on its page
 * for searching within it, and the attachments read off its messages (the
 * person's, and what the agent sent), newest first. The thumbnails are real
 * captures of the project's own mockup pages (mocks/project-paths), at
 * their page's viewport, with each page's text. Ages are offsets from the
 * moment the page loads.
 */
import type { ArtifactKind } from "@cawco/core";
import boardPage from "./assets/board-page.webp";
import shotDesk from "./assets/session-1440.png";
import shotPhone from "./assets/session-390.png";
import pages from "./assets/thumbs/pages.json";

const thumbs = import.meta.glob<string>("./assets/thumbs/*.webp", {
  eager: true,
  import: "default",
});

/** closed · Files open · a file chosen (Files hung right, the file floating left) */
export type Stage = "closed" | "open" | "picked";
/** The count on the Files item: a mark on its glyph's corner, or none. */
export type Count = "mark" | "none";
export type Pull = "closed" | "open";
export type Fill =
  | "typical"
  | "long"
  | "longname"
  | "noartifacts"
  | "noattachments"
  | "empty"
  | "loading"
  | "failed"
  | "faileddetails";

/** The list read's refusal, as the hub's error comes back to the panel. */
export const READ_ERROR =
  "GET /api/instances/23cb5219/artifacts → 503 Service Unavailable: the hub is restarting (upstream connect error, retry after 4s)";

export interface ArtifactRow {
  age: number;
  id: string;
  kind: ArtifactKind;
  name: string;
  promoted: string | null;
  /** The words on its page. */
  text: string;
  /** Its thumbnail, and the thumbnail's own size. */
  thumb: { src: string; w: number; h: number };
}

export interface AttachmentRow {
  age: number;
  id: string;
  kind: string;
  name: string;
  /** A picture's own address: its row leads with the picture. */
  picture: string | null;
  who: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Page {
  file: string;
  kind: ArtifactKind;
  text: string;
  th: number;
  tw: number;
}
const PAGE = new Map((pages as Page[]).map((page) => [page.file, page]));

/** What each page is called, newest first; the second is the one chosen. */
const MADE: [file: string, name: string, age: number, promoted: string | null][] = [
  ["fleet", "Fleet home", 2 * MIN, null],
  ["board", "Site task board", 1 * HOUR, "7778ccd"],
  ["canvas", "Pricing page variants", 3 * HOUR, null],
  ["stages", "Growth pipeline stages", 4 * HOUR, null],
  ["thread", "Morning routine thread", 5 * HOUR, null],
  ["routines", "Launch routines", 6 * HOUR, "7778ccd"],
  ["inbound", "Inbound webhook log", 8 * HOUR, null],
  ["memory", "Project memory proposals", 9 * HOUR, null],
  ["brandkit", "Brand kit voice", 1 * DAY, "877fd14"],
  ["delegates", "Auth rework delegates", 1 * DAY, null],
  ["plans", "Checkout decisions", 2 * DAY, null],
  ["threads", "Pricing comments", 2 * DAY, null],
  ["bridge", "Hero options", 3 * DAY, null],
  ["attempts", "Dark mode attempts", 3 * DAY, null],
];

const artifactOf = (
  [file, name, age, promoted]: (typeof MADE)[number],
  id: string
): ArtifactRow => {
  const page = PAGE.get(file) as Page;
  return {
    id,
    name,
    age,
    promoted,
    kind: page.kind,
    text: page.text,
    thumb: { src: thumbs[`./assets/thumbs/${file}.webp`], w: page.tw, h: page.th },
  };
};

const ARTIFACTS: ArtifactRow[] = MADE.map((made, i) => artifactOf(made, `a${i}`));

const ATTACHMENTS: AttachmentRow[] = [
  ["session-1440.png", "PNG", "You", 1 * HOUR, shotDesk],
  ["session-390.png", "PNG", "You", 1 * HOUR, shotPhone],
  ["apple-briefs.md", "Markdown", "Claude Code", 3 * HOUR, null],
  ["advisor-report.md", "Markdown", "Claude Code", 3 * HOUR, null],
  ["nightly-findings.json", "JSON", "Claude Code", 5 * HOUR, null],
  ["ui-briefs.md", "Markdown", "You", 6 * HOUR, null],
].map(([name, kind, who, age, picture], i) => ({
  id: `f${i}`,
  name: name as string,
  kind: kind as string,
  who: who as string,
  age: age as number,
  picture: picture as string | null,
}));

/** A name of 60 characters, the longest a row is asked to hold. */
const LONG_NAME = "Session view files sidebar with artifacts and attachments v2";

export function filesOf(fill: Fill): {
  artifacts: ArtifactRow[];
  attachments: AttachmentRow[];
} {
  if (fill === "empty") {
    return { artifacts: [], attachments: [] };
  }
  if (
    fill === "noartifacts" ||
    fill === "failed" ||
    fill === "faileddetails" ||
    fill === "loading"
  ) {
    return { artifacts: [], attachments: ATTACHMENTS };
  }
  if (fill === "noattachments") {
    return { artifacts: ARTIFACTS, attachments: [] };
  }
  if (fill === "longname") {
    return {
      artifacts: ARTIFACTS.map((row) =>
        row.id === CHOSEN ? { ...row, name: LONG_NAME } : row
      ),
      attachments: ATTACHMENTS.map((row, i) =>
        i === 2 ? { ...row, name: `${LONG_NAME}.md` } : row
      ),
    };
  }
  if (fill === "long") {
    const artifacts = Array.from({ length: 40 }, (_, i) => {
      const made = MADE[i % MADE.length];
      const round = Math.floor(i / MADE.length) + 1;
      return {
        ...artifactOf(made, i === 1 ? CHOSEN : `l${i}`),
        name: i === 1 ? LONG_NAME : `${made[1]} ${round}`,
        age: (i + 1) * 47 * MIN,
        promoted: i % 5 === 1 ? "7778ccd" : null,
      };
    });
    const attachments = Array.from({ length: 40 }, (_, i) => {
      const row = ATTACHMENTS[i % ATTACHMENTS.length];
      return {
        ...row,
        id: `lf${i}`,
        name:
          i === 2
            ? `${LONG_NAME}.md`
            : row.name.replace(/(\.\w+)$/, `-${i + 1}$1`),
        age: (i + 1) * 53 * MIN,
      };
    });
    return { artifacts, attachments };
  }
  return { artifacts: ARTIFACTS, attachments: ATTACHMENTS };
}

/** The artifact chosen in the "a file chosen" frames: the site's task board. */
export const CHOSEN = "a1";

export const loadedAt = Date.now();

export { boardPage, shotDesk, shotPhone };
