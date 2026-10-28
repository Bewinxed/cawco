/**
 * A task's external items under its title (Component Story Format 3, live
 * components): each a row of the source's mark, its ref, its state in a
 * word and its title, the row a link out; the record first. The data is
 * tsk-127's link to GitHub issue #1 as the hub reads it once the file pass
 * cut its `github: issue#1` field over, beside the other states a link
 * reaches.
 */
import type { ExternalRef } from "@cawco/core/external-items";
import TaskExternalLinks from "./TaskExternalLinks.svelte";

const BEWINXED = {
  source: "github",
  login: "Bewinxed",
  name: null,
  avatarUrl: "https://avatars.githubusercontent.com/u/9145989?v=4",
  url: "https://github.com/Bewinxed",
  kind: "person",
  memberId: null,
} as const;

/** tsk-127's link: Bewinxed/cawco issue #1, read from GitHub. */
const issueOne: ExternalRef = {
  source: "github",
  kind: "issue",
  id: "I_kwDOQ1",
  number: 1,
  ref: "#1",
  url: "https://github.com/Bewinxed/cawco/issues/1",
  title:
    "Give Caw read and write over a project's dispatch settings and the gaps found wiring GitHub",
  state: "open",
  stateName: "Open",
  author: BEWINXED,
  labels: ["github"],
  mode: "related",
  updatedAt: Date.UTC(2026, 9, 25, 18, 25),
  syncedAt: Date.UTC(2026, 9, 28, 12),
  problem: null,
};

export default {
  title: "Tasks/Links",
  component: TaskExternalLinks,
  args: { links: [issueOne], onsync: () => Promise.resolve() },
};

/** One GitHub issue, read: tsk-127's. */
export const OneIssue = {};

/** The tracker's record first, then a link written into links: that the hub has not read yet. */
export const RecordAndUnread = {
  args: {
    links: [
      { ...issueOne, mode: "record" },
      {
        ...issueOne,
        id: "",
        number: 418,
        ref: "#418",
        kind: "pr",
        url: "https://github.com/Bewinxed/cawco/pull/418",
        title: "",
        state: null,
        stateName: "",
        author: null,
        syncedAt: null,
      },
    ],
  },
};

/** A closed issue, a Linear issue in progress, and one GitHub would not let the hub read. */
export const ManyStates = {
  args: {
    links: [
      { ...issueOne, state: "closed", stateName: "Closed" },
      {
        ...issueOne,
        source: "linear",
        id: "9c1",
        number: null,
        ref: "ENG-123",
        url: "https://linear.app/acme/issue/ENG-123",
        title: "Read the stage map off the binding",
        state: "open",
        stateName: "In Progress",
        author: null,
      },
      {
        ...issueOne,
        number: 7,
        ref: "#7",
        url: "https://github.com/acme/private/issues/7",
        title: "",
        state: null,
        stateName: "",
        syncedAt: null,
        problem:
          "GitHub answered 404 to read #7 on acme/private. GitHub answers 404 both where nothing is at that name and where the connection may not see it.",
      },
    ],
  },
};

/** The record's last sync stopped short: GitHub's words under it, with Sync now. */
export const RecordRefused = {
  args: {
    links: [
      {
        ...issueOne,
        mode: "record",
        problem:
          "GitHub refused to change issue #1 on Bewinxed/cawco: Resource not accessible by integration.",
      },
    ],
  },
};
