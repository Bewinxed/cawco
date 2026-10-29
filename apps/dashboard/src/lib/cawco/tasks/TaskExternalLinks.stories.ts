/**
 * A task's links in its pane (Component Story Format 3, live components):
 * each item two lines, its title then its state's own word, the source's
 * mark, its ref and where it lives; the record first, then Closes, Refers
 * to and Related; the comments carried from each source under their item,
 * newest two, the rest behind "N more". The data is sveltejs/kit's pull
 * requests and discussion and Bewinxed/cawco's issue #1 as GitHub answers
 * them, and a Linear issue as the tracker sync reads it.
 */
import type {
  ExternalActor,
  ExternalComment,
  ExternalRef,
} from "@cawco/core/external-items";
import type { TaskComment } from "../project-tasks";
import TaskExternalLinks from "./TaskExternalLinks.svelte";

const actor = (
  login: string,
  avatar: number | null,
  name: string | null = null
): ExternalActor => ({
  source: "github",
  login,
  name,
  avatarUrl:
    avatar === null
      ? null
      : `https://avatars.githubusercontent.com/u/${avatar}?v=4`,
  url: `https://github.com/${login}`,
  kind: "person",
  memberId: null,
});

const BEWINXED = actor("Bewinxed", 9_145_989);
const RICH = actor("Rich-Harris", 1_162_160, "Rich Harris");
const OTTO = actor("ottomated", 31_470_743);
const ELLIOTT = actor("eltigerchino", 43_825_290, "Tee Ming");
const LINEAR_PRIYA: ExternalActor = {
  source: "linear",
  login: "Priya Raman",
  name: "Priya Raman",
  avatarUrl: null,
  url: null,
  kind: "person",
  memberId: null,
};

/** Bewinxed/cawco issue #1, read: the task's record. */
const record: ExternalRef = {
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
  mode: "record",
  updatedAt: Date.UTC(2026, 9, 29, 14, 10),
  syncedAt: Date.UTC(2026, 9, 29, 14, 12),
  problem: null,
};

/** sveltejs/kit's pull request #17559, open. */
const closesOpen: ExternalRef = {
  source: "github",
  kind: "pr",
  id: "PR_kwDOEiPr8c8AAAABLM10WA",
  number: 17_559,
  ref: "#17559",
  url: "https://github.com/sveltejs/kit/pull/17559",
  title:
    "fix: copy Wrangler vars and .dev.vars into process.env during dev and build",
  state: "open",
  stateName: "Open",
  author: OTTO,
  labels: [],
  mode: "closes",
  updatedAt: Date.UTC(2026, 9, 29, 15, 42),
  syncedAt: Date.UTC(2026, 9, 29, 15, 45),
  problem: null,
};

const closesDraft: ExternalRef = {
  ...closesOpen,
  id: "PR_kwDOEiPr8c8AAAABLDM-eQ",
  number: 17_553,
  ref: "#17553",
  url: "https://github.com/sveltejs/kit/pull/17553",
  title: "fix: allow passing match results to resolve",
  state: "draft",
  stateName: "Draft",
  updatedAt: Date.UTC(2026, 9, 29, 9, 5),
};

const refsMerged: ExternalRef = {
  ...closesOpen,
  id: "PR_kwDOEiPr8c8AAAABLKURDQ",
  number: 17_555,
  ref: "#17555",
  url: "https://github.com/sveltejs/kit/pull/17555",
  title: "chore: remove leftover prepare script",
  state: "merged",
  stateName: "Merged",
  mode: "refs",
  updatedAt: Date.UTC(2026, 9, 22, 2, 47),
};

/** A Linear issue the tracker sync reads, in the source's own word for its state. */
const refsLinear: ExternalRef = {
  source: "linear",
  kind: "issue",
  id: "9c1d2e7a",
  number: null,
  ref: "ENG-1204",
  url: "https://linear.app/acme/issue/ENG-1204",
  title: "Read the stage map off the binding",
  state: "open",
  stateName: "In Progress",
  author: LINEAR_PRIYA,
  labels: [],
  mode: "refs",
  updatedAt: Date.UTC(2026, 9, 29, 9, 0),
  syncedAt: Date.UTC(2026, 9, 29, 9, 2),
  problem: null,
};

const relatedClosed: ExternalRef = {
  ...closesOpen,
  id: "PR_kwDOEiPr8c8AAAABKQ4N7Q",
  number: 17_533,
  ref: "#17533",
  url: "https://github.com/sveltejs/kit/pull/17533",
  title: "fix: find the Wrangler config relative to Vite's root",
  state: "closed",
  stateName: "Closed",
  mode: "related",
  updatedAt: Date.UTC(2026, 9, 8, 11, 0),
};

const relatedDiscussion: ExternalRef = {
  ...closesOpen,
  kind: "discussion",
  id: "D_kwDOEiPr8c4AgSh9",
  number: 13_897,
  ref: "#13897",
  url: "https://github.com/sveltejs/kit/discussions/13897",
  title: "Remote Functions",
  state: "canceled",
  stateName: "Outdated",
  author: RICH,
  mode: "related",
  updatedAt: Date.UTC(2026, 9, 15, 18, 0),
};

/** A comment carried onto the task from where it was written. */
const carried = (
  on: ExternalRef,
  id: string,
  author: ExternalActor,
  at: number,
  text: string,
  editedAt: number | null = null
): TaskComment => {
  const anchor =
    on.source === "linear" ? `#comment-${id}` : `#issuecomment-${id}`;
  const via: ExternalComment = {
    source: on.source,
    externalId: id,
    url: `${on.url}${anchor}`,
    author,
    at,
    editedAt,
    direction: "in",
  };
  return {
    at,
    author: { name: author.login, mover: null, id: null },
    text,
    via,
  };
};

const recordComments: TaskComment[] = [
  carried(
    record,
    "6401439683",
    BEWINXED,
    Date.UTC(2026, 9, 25, 18, 25),
    "Hook test: this comment should reach tsk-127 on the CawCo board by itself."
  ),
  carried(
    record,
    "6402210001",
    ELLIOTT,
    Date.UTC(2026, 9, 28, 17, 40),
    "The dispatch settings live in the project folder, so Caw can read them with `folder_read` already. Writing them is the gap."
  ),
  carried(
    record,
    "6402871190",
    BEWINXED,
    Date.UTC(2026, 9, 29, 11, 5),
    "Agreed. Caw writes them through the same door the dashboard does, so a refusal reads the same in both places.",
    Date.UTC(2026, 9, 29, 11, 20)
  ),
  carried(
    record,
    "6403012244",
    RICH,
    Date.UTC(2026, 9, 29, 13, 50),
    "One question before this lands: does a write from Caw wait on the owner's approval, or does it go straight in?"
  ),
];

const draftComment = carried(
  closesDraft,
  "6402551876",
  OTTO,
  Date.UTC(2026, 9, 29, 15, 30),
  "Cap the retries at ten minutes. A receiver that comes back after an hour shouldn't get 200 at once."
);

const linearComment = carried(
  refsLinear,
  "2b7f6c10-9a51-4f3e-8c21-6d0a3f5e9b44",
  LINEAR_PRIYA,
  Date.UTC(2026, 9, 29, 9, 0),
  "Two more enterprise accounts hit this overnight. If the fix lands this week we can skip the manual replay."
);

const noop = () => Promise.resolve();

export default {
  title: "Tasks/Links",
  component: TaskExternalLinks,
  // The split pane's width; the canvas's presets draw 390 and 1440 too.
  parameters: { viewport: 680 },
  args: {
    links: [record],
    comments: recordComments.slice(0, 2),
    onretry: noop,
  },
};

/** One link, the record alone: no group head, its two comments under it. */
export const OneItem = {};

/** Seven links in every relation and state, from both sources; the record's four comments show the newest two and "2 more". */
export const SevenItems = {
  args: {
    links: [
      record,
      closesOpen,
      closesDraft,
      refsMerged,
      refsLinear,
      relatedClosed,
      relatedDiscussion,
    ],
    comments: [...recordComments, draftComment, linearComment],
  },
};

/** GitHub would not let the hub read two links: one it had read before keeps its title; one it never read is its ref and GitHub's words. */
export const FailedRead = {
  args: {
    links: [
      {
        ...record,
        problem:
          "GitHub refused to read issue #1 on Bewinxed/cawco: Resource not accessible by integration.",
      },
      {
        ...closesOpen,
        id: "",
        number: 7,
        ref: "#7",
        url: "https://github.com/acme/private/issues/7",
        kind: "issue",
        title: "",
        state: null,
        stateName: "",
        author: null,
        updatedAt: null,
        syncedAt: null,
        problem:
          "GitHub answered 404 to read #7 on acme/private. GitHub answers 404 both where nothing is at that name and where the connection may not see it.",
      },
    ],
    comments: [],
  },
};

/** The record read, and a pull request written into links: that the hub has not read yet. */
export const NotReadYet = {
  args: {
    links: [
      record,
      {
        ...closesOpen,
        id: "",
        number: 418,
        ref: "#418",
        url: "https://github.com/Bewinxed/cawco/pull/418",
        mode: "related",
        title: "",
        state: null,
        stateName: "",
        author: null,
        updatedAt: null,
        syncedAt: null,
      },
    ],
    comments: [],
  },
};

/** A Linear record with a long ref, a long workspace and a title past two lines. */
const longRecord: ExternalRef = {
  ...refsLinear,
  mode: "record",
  ref: "PLATFORM-10482",
  url: "https://linear.app/acme-industries-customer-onboarding-service/issue/PLATFORM-10482",
  title:
    "Webhook deliveries drop silently after a 502 from the receiver, because the retry path only handles timeouts and never the 5xx answers, so nineteen of twenty events never reach the delivery log",
};

/** A title past two lines, a long Linear ref and a long workspace: the title clamps, the place gives way, the ref and the trailing columns hold. */
export const LongTitle = {
  args: {
    links: [longRecord, closesOpen],
    comments: [
      carried(
        longRecord,
        "5e0c1d22-7b9a-4c3f-9e81-2a6b4d7f0c13",
        LINEAR_PRIYA,
        Date.UTC(2026, 9, 29, 9, 0),
        "Reproduced against https://hooks.acme-industries.example/customer-onboarding-service/v2/deliveries/replay-after-receiver-recovers: only the first of twenty lands."
      ),
    ],
  },
};
