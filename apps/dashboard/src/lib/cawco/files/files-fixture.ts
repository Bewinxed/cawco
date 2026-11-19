/**
 * Sessions' Files as the hub answers them, for the states file of
 * FilesList (FilesList.stories.ts): each session's artifacts and its
 * attachments, keyed by the path each read asks. Files reads them through
 * the page's own hub client (files.svelte.ts `listFiles`), not a context's,
 * so the page's fetch answers them (`answerFiles`), one session per story.
 */
import type { ArtifactSummary, SessionAttachments } from "@cawco/core/protocol";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { hubPath } from "@cawco/hub/client";
import { hub } from "#lib/platform/hub.js";

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

const artifact = (
  id: string,
  kind: ArtifactSummary["kind"],
  title: string,
  age: number,
  more: Partial<ArtifactSummary> = {}
): ArtifactSummary => ({
  ask: "",
  createdAt: ago(age),
  does: kind === "page" ? "pick" : "try",
  id,
  kind,
  name: id,
  pending: null,
  promoted: null,
  sent: false,
  shownAt: null,
  thumbnail: null,
  title,
  updatedAt: ago(age),
  waiting: false,
  ...more,
});

const ONE = [
  artifact(
    "a1f3",
    "browser",
    "The Files panel at desk popover width, after the masonry's column count was fixed",
    2 * HOUR_MS
  ),
];

const MIXED = [
  artifact(
    "b2c4",
    "page",
    "Pick the head for the phone project page",
    3 * HOUR_MS,
    {
      pending: {
        pending: [{ kind: "answers", answered: 1, asked: 3 }],
        raisedAt: now,
      },
      waiting: true,
    }
  ),
  ...ONE,
  artifact("c3d5", "preview", "Settings, Machines tab", 5 * HOUR_MS, {
    promoted: { at: ago(4 * HOUR_MS), commit: "df2ad38fc5a1" },
  }),
  artifact(
    "d4e6",
    "canvas",
    "How a handoff reaches a cold session",
    26 * HOUR_MS
  ),
  artifact("e5f7", "component", "Tray chip, every state", 40 * MINUTE_MS),
];

const NO_ATTACHMENTS: SessionAttachments = {
  attachments: [],
  harness: "claude",
};

/** A story's session: what it made. */
export const SESSIONS = {
  one: "737fdc24-one-preview",
  mixed: "737fdc24-several",
} as const;
const MADE: Record<string, ArtifactSummary[]> = {
  [SESSIONS.one]: ONE,
  [SESSIONS.mixed]: MIXED,
};

const ANSWERS = new Map<string, unknown>(
  Object.entries(MADE).flatMap(([id, made]) => {
    const route = hub.api.instances({ id });
    return [
      [hubPath(route.artifacts.files), made],
      [hubPath(route.attachments), NO_ATTACHMENTS],
    ];
  })
);

let answering = false;
/** The page's fetch answers each session's Files reads; every other ask goes on as it was. */
export function answerFiles(): void {
  if (answering) {
    return;
  }
  answering = true;
  window.fetch = new Proxy(window.fetch, {
    apply: (fetch, self, [input, init]: Parameters<typeof window.fetch>) => {
      const [path = ""] = String(input).split("?", 1);
      return ANSWERS.has(path)
        ? Promise.resolve(Response.json(ANSWERS.get(path)))
        : Reflect.apply(fetch, self, [input, init]);
    },
  });
}
