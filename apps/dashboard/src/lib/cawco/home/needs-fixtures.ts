/**
 * What Needs you holds while a task's build waits on the owner, shaped as
 * the hub lists it (hub needs-rows.ts, home-state's items): a task in
 * Working with a session's question and a decision page of two open cards
 * about it, a question standing on a pin of another page, a permission, and
 * a task in review. The shaping frames of tsk-521 (NeedsAnswerInRow,
 * NeedsAnswerBeside) draw Caw's panel on it.
 */

import type { ParkedCard, ParkedItem } from "@cawco/core/parked";
import { presentPermission } from "@cawco/core/permission-presentation";
import { markHue } from "../mark";
import { TWO_DIRECTIONS } from "../transcript/parked-fixtures";
import type {
  ArtifactItem,
  AskItem,
  NeedsEntry,
  ProjectMarking,
  WorkItem,
} from "./home-state.svelte";

const CWD = "/home/omar/cockpit";
const PROJECT: ProjectMarking = { name: "Cawco-Dev", hue: markHue(CWD) };
const OBELISK = { name: "obelisk", os: "linux-x64" };
const MACBOOK = { name: "Omars-MacBook-Pro", os: "darwin-arm64" };

const ago = (minutes: number) => Date.now() - minutes * 60_000;

/** Where an ask is asked from, as the hub presents it. */
const context = (asker: string) => ({
  asker,
  project: PROJECT.name,
  current: () => undefined,
  memory: () => undefined,
  projectName: () => undefined,
});

const question = (over: {
  key: string;
  title: string;
  machine: { name: string; os: string };
  minutes: number;
  input: Record<string, unknown>;
}): AskItem => {
  const raisedAt = ago(over.minutes);
  const presentation = presentPermission(
    "AskUserQuestion",
    over.input,
    context(over.title)
  );
  return {
    kind: "ask",
    key: over.key,
    instanceId: `s-${over.key}`,
    cwd: CWD,
    origin: null,
    machineId: over.machine.name,
    machine: over.machine,
    title: over.title,
    place: `${over.machine.name} · ${PROJECT.name}`,
    project: PROJECT,
    isQuestion: true,
    ask: presentation.summary,
    raisedAt,
    request: {
      heard: 0,
      input: over.input,
      instanceId: `s-${over.key}`,
      presentation,
      raisedAt,
      requestId: `r-${over.key}`,
      toolName: "AskUserQuestion",
    },
    stale: false,
  };
};

/** The harness's sign-in, asked by the session building it. */
const ACCOUNT_QUESTION = question({
  key: "ask-account",
  title: "Antigravity harness: sign-in route",
  machine: OBELISK,
  minutes: 4,
  input: {
    blocks: true,
    waiting: "the sign-in step of the build",
    task: "tsk-340",
    questions: [
      {
        question:
          "Which Google account should the Antigravity harness sign in with on obelisk?",
        header: "Account",
        multiSelect: false,
        options: [
          {
            label: "builds@harbourline.studio",
            description: "Its use counts against your own quota.",
          },
          {
            label: "A new workspace account",
            description:
              "Keeps the harness off your quota. An admin has to create it before the build goes on.",
          },
          {
            label: "Hold until the account risk is clear",
            description: "",
          },
        ],
      },
    ],
  },
});

/** The page of the same build: how its sessions are billed. */
const BILLING_PAGE: ArtifactItem = {
  kind: "artifact",
  key: "artifact:antigravity-billing",
  artifactId: "antigravity-billing",
  artifactKind: "page",
  artifactTitle: "Antigravity billing",
  cwd: CWD,
  href: "/s/s-ask-account?artifact=antigravity-billing",
  instanceId: "s-ask-account",
  machine: OBELISK,
  machineId: OBELISK.name,
  ownSend: true,
  pending: [{ kind: "answers", asked: 3, answered: 1 }],
  place: `${OBELISK.name} · ${PROJECT.name}`,
  project: PROJECT,
  raisedAt: ago(18),
  stale: false,
  stop: { card: "quota" },
  title: "Pick how Antigravity sessions are billed",
  unsent: 0,
};

const card = (
  id: string,
  over: Omit<ParkedCard["card"], "id" | "after" | "mockup" | "section">
): ParkedCard => ({
  kind: "card",
  key: `card:${id}`,
  artifact: {
    id: BILLING_PAGE.artifactId,
    name: "antigravity-billing",
    title: BILLING_PAGE.artifactTitle,
  },
  askedAt: new Date(ago(18)).toISOString(),
  state: "open",
  dismissed: null,
  words: null,
  answer: null,
  card: { id, after: [], mockup: null, section: null, ...over },
});

/** The page's two cards still open; its third is picked. */
const BILLING_CARDS: ParkedCard[] = [
  card("quota", {
    question: "Which quota do Antigravity sessions draw from?",
    why: "Each machine already carries its own sign-in, so nothing new is asked of you.",
    kind: "behaviour",
    multiple: false,
    options: [
      {
        id: "machine",
        keycap: 1,
        label: "The machine's own sign-in",
        line: "Each machine pays for the sessions it runs.",
        cost: "A machine with no sign-in can't run one.",
        recommended: true,
      },
      {
        id: "project",
        keycap: 2,
        label: "One account per project",
        line: "A project's sessions draw from one account wherever they run.",
        cost: "You pick an account for each project once.",
        recommended: false,
      },
    ],
  }),
  card("out-of-quota", {
    question: "When the quota runs out mid-turn, what happens?",
    why: "A turn that moves accounts on its own spends where you didn't choose.",
    kind: "behaviour",
    multiple: false,
    options: [
      {
        id: "pause",
        keycap: 1,
        label: "Pause and ask you",
        line: "The turn stops where it is and waits here.",
        cost: "Work stands still until you answer.",
        recommended: true,
      },
      {
        id: "next",
        keycap: 2,
        label: "Move to the next account",
        line: "The turn goes on with your next signed-in account.",
        cost: "Spend lands on an account you didn't pick for it.",
        recommended: false,
      },
    ],
  }),
];

/** A question standing on pin 3 of the routines page. */
export const PIN_QUESTION = question({
  key: "ask-routine-failures",
  title: "Routines shape",
  machine: MACBOOK,
  minutes: 26,
  input: {
    blocks: true,
    waiting: "the routine form's failure rule",
    pin: { artifact: "routines-shape", id: "p-3", number: 3 },
    questions: [
      {
        question:
          "A routine that failed twice in a row: does it keep running on its schedule?",
        header: "Failures",
        multiSelect: false,
        options: [
          {
            label: "Stop it until you look",
            description: "It waits here with both runs' logs.",
          },
          {
            label: "Keep running on schedule",
            description: "Each failure lands in Notices; nothing waits on you.",
          },
        ],
      },
    ],
  },
});

const permitInput = {
  command: "bun run check",
  description: "Run the repo's checks before finishing",
};
const permitAt = ago(41);

/** A permission, answered on its row as today. */
const CHECK_PERMISSION: AskItem = {
  kind: "ask",
  key: "ask-check",
  instanceId: "s-ask-check",
  cwd: CWD,
  origin: null,
  machineId: OBELISK.name,
  machine: OBELISK,
  title: "Fix the tray chip overflow",
  place: `${OBELISK.name} · ${PROJECT.name}`,
  project: PROJECT,
  isQuestion: false,
  ask: "Run bun run check",
  raisedAt: permitAt,
  request: {
    heard: 0,
    input: permitInput,
    instanceId: "s-ask-check",
    presentation: presentPermission(
      "Bash",
      permitInput,
      context("Fix the tray chip overflow")
    ),
    raisedAt: permitAt,
    requestId: "r-ask-check",
    toolName: "Bash",
  },
  stale: false,
};

/** The build's task and what waits on him about it. */
const ANTIGRAVITY_WORK: WorkItem = {
  kind: "work",
  key: "work:tsk-340",
  raisedAt: ago(4),
  task: {
    kind: "task",
    key: "task:tsk-340",
    href: "/p/cawco-dev/tasks/tsk-340",
    place: PROJECT.name,
    project: PROJECT,
    raisedAt: ago(52),
    reason: null,
    stage: "Working",
    taskId: "tsk-340",
    title: "Route Antigravity sign-ins through the hub",
  },
  items: [ACCOUNT_QUESTION, BILLING_PAGE],
};

/** A design graph of the dark pass: which grey hovered rows take at night. */
const HOVER_GRAPH: ArtifactItem = {
  kind: "artifact",
  key: `artifact:${TWO_DIRECTIONS.artifact.id}`,
  artifactId: TWO_DIRECTIONS.artifact.id,
  artifactKind: "component",
  artifactTitle: TWO_DIRECTIONS.artifact.title,
  cwd: CWD,
  href: `/s/s-dark-pass?artifact=${TWO_DIRECTIONS.artifact.id}`,
  instanceId: "s-dark-pass",
  machine: OBELISK,
  machineId: OBELISK.name,
  ownSend: false,
  pending: [{ kind: "answers", asked: 1, answered: 0 }],
  place: `${OBELISK.name} · ${PROJECT.name}`,
  project: PROJECT,
  raisedAt: ago(33),
  stale: false,
  stop: { top: true },
  title: "Pick the grey hovered rows take at night",
  unsent: 0,
};

/** The session each artifact waits on him for, by its title: who asks, on its card in his conversation. */
export const ASKERS: Record<string, string> = {
  [BILLING_PAGE.artifactId]: "Antigravity harness: sign-in route",
  [HOVER_GRAPH.artifactId]: "Dark pass",
};

/** Each artifact's open picks, by its id, as its row answers them. */
export const PICKS: Record<string, ParkedItem[]> = {
  [BILLING_PAGE.artifactId]: BILLING_CARDS,
  [HOVER_GRAPH.artifactId]: [TWO_DIRECTIONS],
};

/** Needs you, newest first. */
export const NEEDS: NeedsEntry[] = [
  ANTIGRAVITY_WORK,
  PIN_QUESTION,
  HOVER_GRAPH,
  CHECK_PERMISSION,
  {
    kind: "task",
    key: "task:tsk-519",
    href: "/p/cawco-dev/tasks/tsk-519",
    place: PROJECT.name,
    project: PROJECT,
    raisedAt: ago(130),
    reason: "review",
    stage: "Review",
    taskId: "tsk-519",
    title: "Group Needs you by stopped work",
  },
];
