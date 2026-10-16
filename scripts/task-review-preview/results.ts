/**
 * What each seeded task's session hands in (`task_result`), by the task's
 * title: seed.ts writes it on the session's work item, and mock.ts sends it
 * through the real tool when a session is offered it. `again` is the
 * second session's, after your comment. The announcement's page artifact is
 * made by seed.ts on its session and put first, as the brief asks an agent
 * to (dispatch.ts RESULT_LINE); here are the rest of its artifacts.
 */
import type { ResultArtifact } from "../../packages/core/src/deliverables";

export interface Handed {
  artifacts: ResultArtifact[];
  check?: string[];
  summary: string;
}

export const ANNOUNCEMENT = "Launch announcement post";

export const RESULTS: Record<string, { again?: Handed; first: Handed }> = {
  "Build in Public post: one board for every agent": {
    first: {
      summary:
        "Drafted the Build in Public post from the plan: the problem in the first paragraph, the board in the second, 220 of X's 280 characters. Two shorter openings are in the file as alternates, and the plan has the 20–30 s capture.",
      check: [
        'The "found out late" line reads true to how it was',
        "The capture plan is doable in a day",
      ],
      artifacts: [
        { kind: "post", path: "tsk-1.post.json", primary: true },
        { kind: "file", path: "tsk-1.plan.md" },
      ],
    },
  },
  [ANNOUNCEMENT]: {
    first: {
      summary:
        "Wrote the launch announcement for @CawCoDev: one post, 168 characters, naming the board and answering from a phone. The page shows it as it will read on X, with the card image under it.",
      check: [
        "It says what Caw&Co is in its first sentence",
        "The card image reads at phone size",
      ],
      artifacts: [
        { kind: "file", path: "kit/press-notes.md" },
        {
          kind: "link",
          url: "https://www.figma.com/design/cawco-launch-card",
          name: "Launch card",
        },
      ],
    },
  },
  "Launch week assets": {
    first: {
      summary:
        "Made the launch week: two day posts, the schedule, the FAQ, the changelog and the card image, all in the folder.",
      check: ["Day 2's Telegram line matches what the bridge does"],
      artifacts: [
        { kind: "post", path: "week/day-1.post.json" },
        { kind: "post", path: "week/day-2.post.json" },
        { kind: "file", path: "week/schedule.md" },
        { kind: "file", path: "week/faq.md" },
        { kind: "file", path: "changelog.md" },
        { kind: "file", path: "launch-card.png" },
      ],
    },
  },
  "Check the launch links": {
    first: {
      summary:
        "Checked all 14 links in the launch posts and the FAQ. 13 answer 200; the docs link in the FAQ answers 404, because the page moved to /docs/start.",
      check: [
        "Point the FAQ's docs link at /docs/start",
        "The two shortened links resolve to the board page",
      ],
      artifacts: [],
    },
  },
  "Write the changelog entry": {
    first: {
      summary:
        "Wrote the launch entry in changelog.md: five lines, one per thing that shipped.",
      artifacts: [{ kind: "file", path: "changelog.md" }],
    },
    again: {
      summary:
        "Split the changelog entry into bullets, newest first, as you asked.",
      check: ["Newest first reads right for a launch entry"],
      artifacts: [{ kind: "file", path: "changelog.md" }],
    },
  },
  "Launch card image": {
    first: {
      summary: "Drew the launch card at 1200×675 for X's large card.",
      artifacts: [{ kind: "file", path: "launch-card.png", primary: true }],
    },
  },
};
