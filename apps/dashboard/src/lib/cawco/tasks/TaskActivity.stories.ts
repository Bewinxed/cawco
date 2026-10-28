/**
 * A task's activity, its comments drawn (Component Story Format 3, live
 * components): a comment carried from GitHub is its words alone under its
 * author's login, with GitHub's mark and a link out to it there. The data
 * is tsk-127's comment by Bewinxed on Bewinxed/cawco issue #1, as its entry
 * reads once the file pass recast its heading
 * (`### Bewinxed · github · <url> · <time>`).
 */
import type { ExternalComment } from "@cawco/core/external-items";
import { HOUR_MS } from "@cawco/core/time";
import type { TaskComment } from "../project-tasks";
import TaskActivity from "./TaskActivity.svelte";

const HOOK_TEST_AT = Date.parse("2026-10-25T18:25:48.675Z");

const hookTest: ExternalComment = {
  source: "github",
  externalId: "6401439683",
  url: "https://github.com/Bewinxed/cawco/issues/1#issuecomment-6401439683",
  author: {
    source: "github",
    login: "Bewinxed",
    name: null,
    avatarUrl: null,
    url: null,
    kind: "person",
    memberId: null,
  },
  at: HOOK_TEST_AT,
  editedAt: null,
  direction: "in",
};

/** tsk-127's carried comment, as its heading names it. */
const carried: TaskComment = {
  at: HOOK_TEST_AT,
  author: { name: "Bewinxed", mover: null, id: null },
  text: "Hook test: this comment should reach tsk-127 on the CawCo board by itself.",
  via: hookTest,
};

const seeAlso: TaskComment = {
  at: Date.parse("2026-10-26T09:22:41.913Z"),
  author: { name: "hub", mover: "hub", id: null },
  text: "See also: Model external items as structured links on tasks, with comments and state mirrored as data, for any source.",
  via: null,
};

export default {
  title: "Tasks/Activity",
  component: TaskActivity,
  args: {
    comments: [carried],
    history: [],
    historyProblem: null,
    rereadHistory: () => undefined,
    reaches: null,
    oncomment: () => Promise.resolve(),
  },
};

/** tsk-127's comment from GitHub: Bewinxed's words, GitHub's mark, a link out. */
export const CarriedFromGitHub = {};

/** The same comment after Bewinxed changed its words on GitHub. */
export const EditedOnGitHub = {
  args: {
    comments: [
      {
        ...carried,
        text: "Hook test, again: this comment should reach tsk-127 by itself, and its edit too.",
        via: { ...hookTest, editedAt: HOOK_TEST_AT + HOUR_MS },
      },
    ],
  },
};

/** A comment from GitHub beside one the hub wrote. */
export const BesideTheHubs = { args: { comments: [carried, seeAlso] } };
