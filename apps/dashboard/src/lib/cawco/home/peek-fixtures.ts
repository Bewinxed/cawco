/**
 * The peek's fixtures (dev only): one session moving the hub's sign-in to
 * passkeys, stood in the client's own store through `__cawcoDebug` with no
 * hub, in each situation the peek meets it, beside a fleet of seven and a
 * conversation open on the desk. The /motion/peek bench and the peek's
 * states file (PeekFixture) stand the same scenes.
 */
import type { PulseFrame } from "@cawco/core/frames";
import type { PlanStep } from "@cawco/core/plan";
import type { InstanceRow, SessionPulse } from "@cawco/core/protocol";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { blankSession, cawco, type PendingPermission } from "../client.svelte";
import type { PeekTarget } from "../PeekPane.svelte";
import type { HeldPlan } from "../plan";
import type { Message } from "../types";

/** Each situation the peek meets the session in. */
export type PeekScene =
  | "working"
  | "asking"
  | "question"
  | "signin"
  | "plan"
  | "noplan"
  | "ended"
  | "failed"
  | "unreachable"
  | "reading"
  | "empty"
  | "unread";

export const PEEK_SCENES: readonly PeekScene[] = [
  "working",
  "asking",
  "question",
  "signin",
  "plan",
  "noplan",
  "ended",
  "failed",
  "unreachable",
  "reading",
  "empty",
  "unread",
];

/** The peeked session. */
const PEEK_ID = "5e551011-0000-4000-8000-00000000peek";
/** The conversation the desk has open beside the peek. */
export const OPEN_ID = "f1";

const CWD = "/home/rand/cockpit";
const TITLE = "Move the hub's sign-in to passkeys";

/** The scene's own words for the session's last turn. */
const LAST: Partial<Record<PeekScene, string>> = {
  failed:
    "The sign-in ceremony needs the hub's deploy key to sign the relying party's origin on obelisk, and the key on disk is not the one the tailnet's certificate names.",
  ended:
    "Done. The hub signs in with a passkey on any device with a platform authenticator, the pairing code stays the way in for one without, and the iOS app's device-key sign-in is untouched: its contract tests pass against the new endpoint. The branch is committed; the merge checks are next.",
};
const LAST_AT_WORK =
  "Sign-in verifies against the stored credential and mints the same session cookie the pairing code does, so nothing downstream of the cookie changes. To sign the relying party's origin on obelisk the hub needs a fresh deploy key, which means writing to ~/.ssh on that machine.";

const FAILURE =
  "Process exited with code 1: the deploy key at ~/.ssh/deploy_obelisk does not match the certificate's public key.";

/** One turn: its kind, its words, and a tool's name and input. */
type Turn = [
  Message["type"],
  string,
  { toolName: string; toolInput: Record<string, unknown> }?,
];

function said(scene: PeekScene): Turn[] {
  const turns: Turn[] = [
    [
      "user",
      "Move the hub's sign-in to passkeys. Keep the pairing code as the way in for a device with no platform authenticator, and don't break the iOS app's sign-in on TestFlight 20261104.",
    ],
    [
      "assistant",
      "I'll start from how the hub signs in today. The pairing code is checked in hub-auth.ts and the session cookie is minted in session.ts; the iOS app signs in through the same endpoint with its device key, so I'll keep that endpoint's contract as it is and add the passkey ceremony beside it.",
    ],
    [
      "tool.use",
      "",
      {
        toolName: "Read",
        toolInput: { file_path: "packages/hub/src/auth/hub-auth.ts" },
      },
    ],
    [
      "tool.use",
      "",
      { toolName: "Grep", toolInput: { pattern: "mintSession\\(" } },
    ],
    [
      "assistant",
      "Registration and sign-in are two ceremonies, each a challenge the hub issues and a response it verifies. I'm using @simplewebauthn/server for both, which keeps the CBOR and attestation parsing out of our code. Challenges live for five minutes in the hub's store, keyed by the device that asked.",
    ],
    [
      "tool.use",
      "",
      {
        toolName: "Edit",
        toolInput: { file_path: "packages/hub/src/auth/passkey.ts" },
      },
    ],
    [
      "tool.use",
      "",
      {
        toolName: "Bash",
        toolInput: { command: "bun test packages/hub/src/auth" },
      },
    ],
    [
      "assistant",
      "The registration ceremony passes its tests: 14 of 14, including a replayed challenge being refused and a challenge older than five minutes being refused. Next is the sign-in ceremony and the cookie it mints, then the dashboard's button.",
    ],
    [
      "tool.use",
      "",
      {
        toolName: "Edit",
        toolInput: { file_path: "packages/hub/src/auth/session.ts" },
      },
    ],
    ["assistant", LAST[scene] ?? LAST_AT_WORK],
  ];
  if (scene === "failed") {
    turns.push(["result.error", FAILURE]);
  }
  return turns;
}

/** The plan: twelve steps, or twenty-six for the long one. */
const STEPS = [
  "Read how the hub signs in today",
  "Add @simplewebauthn/server to the hub",
  "Issue and store registration challenges",
  "Verify a registration and store the credential",
  "Issue sign-in challenges",
  "Verify a sign-in and mint the session cookie",
  "Rotate the deploy key that signs the origin on obelisk",
  "Add the passkey button to the dashboard's sign-in",
  "Keep the pairing code for devices without an authenticator",
  "Run the iOS app's sign-in contract tests",
  "Write the migration note for the fleet",
  "Commit on the branch and run the merge checks",
];
const LONG = [
  ...STEPS.slice(0, 7),
  "Name the credential by the device that registered it",
  "List a person's passkeys in Settings",
  "Remove a passkey from Settings",
  "Refuse a sign-in from a removed credential",
  "Rate-limit failed sign-ins per device",
  "Log each ceremony to the hub's audit trail",
  ...STEPS.slice(7, 9),
  "Say on the sign-in page why a device has no passkey button",
  "Handle a passkey synced from another device",
  "Handle the browser's cancel without an error toast",
  "Test on Safari 26, Chrome 142 and Firefox 145",
  "Test the iPad's sheet at both orientations",
  ...STEPS.slice(9, 11),
  "Update the hub's OpenAPI document",
  "Bump the wire check for the TestFlight builds",
  "Record the rendered checks for the sign-in page",
  STEPS[11] ?? "",
];

function stepStatus(
  i: number,
  doneUpTo: number,
  scene: PeekScene
): PlanStep["status"] {
  if (i < doneUpTo) {
    return "completed";
  }
  // A failed session left its next step where it was.
  return i === doneUpTo && scene !== "failed" ? "in_progress" : "pending";
}

function planOf(scene: PeekScene): HeldPlan {
  const steps = scene === "plan" ? LONG : STEPS;
  const doneUpTo = (() => {
    if (scene === "ended") {
      return steps.length;
    }
    if (scene === "plan") {
      return 9;
    }
    return scene === "working" || scene === "unreachable" ? 7 : 6;
  })();
  return {
    rev: 1,
    plan: {
      source: "cawco",
      steps: steps.map((content, i): PlanStep => ({
        id: `${i}`,
        content,
        depth: 0,
        status: stepStatus(i, doneUpTo, scene),
      })),
    },
  };
}

function asksOf(scene: PeekScene, now: number): PendingPermission[] {
  const permission = {
    heard: now,
    input: { command: "ssh-keygen -t ed25519 -f ~/.ssh/deploy_obelisk -N ''" },
    instanceId: PEEK_ID,
    presentation: {
      asker: TITLE,
      changes: [],
      command: "ssh-keygen -t ed25519 -f ~/.ssh/deploy_obelisk -N ''",
      fields: [],
      summary: "Make a new deploy key for obelisk",
    },
    raisedAt: now - 3 * MINUTE_MS,
    requestId: "req-peek-1",
    toolName: "Bash",
  } as unknown as PendingPermission;
  if (scene === "asking") {
    return [permission];
  }
  if (scene === "question") {
    return [
      {
        ...permission,
        input: {
          questions: [
            {
              question:
                "Which origin should the passkey sign for: the tailnet name, or the LAN address the iPad uses at home?",
              header: "Origin",
              multiSelect: false,
              options: [
                {
                  label: "The tailnet name",
                  description: "obelisk-of-light.tailf7f9d3.ts.net",
                },
                { label: "The LAN address", description: "obelisk.local" },
              ],
            },
          ],
        },
        presentation: {
          ...permission.presentation,
          command: undefined,
          summary: "Ask user question",
        },
        requestId: "req-peek-q",
        toolName: "AskUserQuestion",
      } as unknown as PendingPermission,
    ];
  }
  if (scene === "signin") {
    return [
      {
        ...permission,
        connectAsk: {
          access: null,
          again: false,
          reason:
            "To open the pull request for the passkey branch and read its checks.",
          server: "GitHub",
          url: "https://github.com/login/oauth/authorize",
        },
        input: {},
        presentation: {
          ...permission.presentation,
          command: undefined,
          summary: "Connect GitHub",
        },
        requestId: "req-peek-c",
        toolName: "mcp__github__create_pull_request",
      } as unknown as PendingPermission,
    ];
  }
  return [];
}

/** The rest of the fleet the home lists, the peeked session first. */
const FLEET: { id: string; title: string; status: string; cwd: string }[] = [
  { id: OPEN_ID, title: "Fix tray chip overflow", status: "running", cwd: CWD },
  {
    id: "f2",
    title: "Rebuild the token sheet from the resolver",
    status: "running",
    cwd: CWD,
  },
  {
    id: "f3",
    title: "Audit the push probe on TestFlight 20261104",
    status: "running",
    cwd: "/home/rand/cawco-ios",
  },
  {
    id: "f4",
    title: "Draft the November changelog",
    status: "running",
    cwd: "/home/rand/site",
  },
  {
    id: "f5",
    title: "Port the plan ring to iOS",
    status: "stopped",
    cwd: "/home/rand/cawco-ios",
  },
  {
    id: "f6",
    title: "Sweep stale workspaces on obelisk",
    status: "stopped",
    cwd: CWD,
  },
];

/** The conversation the desk has open beside the peek: the tray chip, nearly done. */
const OPEN: [Message["type"], string][] = [
  [
    "user",
    "The tray chip overflows on narrow panes. Can you find where its width comes from?",
  ],
  [
    "assistant",
    "The chip takes its width from its label alone, and nothing caps it: a long project name pushes it past the pane's edge. The fix is a max width tied to the pane's container, with the label ending in an ellipsis.",
  ],
  ["user", "Cap it at the pane, not the window."],
  [
    "assistant",
    "Done. The chip now reads the leaf's container width, so a split pane 370px wide caps it at that pane, whatever the window is. The label truncates from its end and the count stays whole.",
  ],
  ["user", "Does the count still line up with the other chips?"],
  [
    "assistant",
    "It does: the count keeps its tabular figures, so a row of chips with counts of different widths still lines its numbers up. The check passes with no new warnings.",
  ],
  ["user", "What happens when the label is a single long word?"],
  [
    "assistant",
    "A single long word had nowhere to break, so the ellipsis never came. The label now sets overflow-wrap to anywhere under the cap, and the ellipsis lands on the last character that fits.",
  ],
];

interface Debug {
  adoptInstances: (rows: InstanceRow[]) => void;
  frame: (frame: PulseFrame) => void;
  leaveHub: () => void;
  standHub: (
    answer: (instanceId: string, kind: string, intent: unknown) => void
  ) => void;
  state: {
    plans: Record<string, HeldPlan>;
    sessions: Record<string, ReturnType<typeof blankSession>>;
  };
}

const debug = (): Debug => globalThis.__cawcoDebug as unknown as Debug;

function pulse(id: string, activity: SessionPulse["activity"]): void {
  debug().frame({
    kind: "pulse",
    instanceId: id,
    pulse: {
      activity,
      at: Date.now(),
      busy: activity === "working",
      currentTool:
        activity === "working" && id === PEEK_ID
          ? {
              name: "Edit",
              glance: "apps/dashboard/src/routes/sign-in/+page.svelte",
              toolId: "t-1",
            }
          : null,
      instanceId: id,
      runningSubagents: 0,
    },
  });
}

function activityOf(
  scene: PeekScene,
  asking: boolean
): SessionPulse["activity"] {
  if (asking) {
    return "blocked";
  }
  return scene === "ended" || scene === "failed" ? "idle" : "working";
}

function statusOf(scene: PeekScene): string {
  if (scene === "failed") {
    return "error";
  }
  if (scene === "ended") {
    return "stopped";
  }
  return scene === "unreachable" ? "unknown" : "running";
}

/**
 * Stands the scene in the store and the bench's hub, which takes an
 * answer to the permission as the hub would. Returns the peek's target
 * and the way to take it all down.
 */
export function standPeek(scene: PeekScene): {
  target: PeekTarget;
  leave: () => void;
} {
  const now = Date.now();
  const store = debug();
  const rows = [
    { id: PEEK_ID, title: TITLE, status: statusOf(scene), cwd: CWD },
    ...FLEET,
  ];
  store.adoptInstances(
    rows.map(
      (one, i) =>
        ({
          id: one.id,
          cwd: one.cwd,
          harness: "claude",
          kind: "mainline",
          launchDir: "known",
          machineId: "obelisk",
          sessionId: `sdk-${i}`,
          status: one.status,
          title: one.title,
          lastError: one.status === "error" ? FAILURE : null,
          createdAt: now - (i + 1) * HOUR_MS,
        }) as unknown as InstanceRow
    )
  );
  if (!cawco.machines.some((one) => one.machineId === "obelisk")) {
    cawco.machines.push({
      auth: "unknown",
      harnesses: [],
      hostname: "obelisk",
      lastSeenAt: null,
      machineId: "obelisk",
      os: "linux",
      pausedUntil: null,
      pauseStopped: null,
      // Not online: an online machine holds the home's first read until its
      // catalogues are asked for, which no bench does.
      status: "offline",
    } as unknown as (typeof cawco.machines)[number]);
  }

  const held = blankSession(PEEK_ID);
  held.machineId = "obelisk";
  held.cwd = CWD;
  held.harness = "claude";
  held.initialized = true;
  const tailless =
    scene === "reading" || scene === "empty" || scene === "unread";
  // A tail-less scene holds a line the peek does not speak, so it reads
  // nothing back from a hub the bench does not have.
  const turns: Turn[] = tailless
    ? [["system.init", "Session started"]]
    : said(scene);
  held.messages = turns.map(([type, content, metadata], n) => ({
    id: `${PEEK_ID}-${n}`,
    instanceId: PEEK_ID,
    type,
    content: content || metadata?.toolName || "",
    timestamp: new Date(now - HOUR_MS + n * 2 * MINUTE_MS).toISOString(),
    ...(metadata ? { metadata } : {}),
  })) as Message[];
  held.loading = scene === "reading";
  if (scene === "unread") {
    held.readFault = {
      machineId: "obelisk",
      message: "obelisk didn't answer in 15 seconds.",
      reason: "offline",
    } as ReturnType<typeof blankSession>["readFault"];
  }
  held.pending = asksOf(scene, now);
  if (scene === "working" || scene === "plan" || scene === "noplan") {
    held.streaming =
      "Adding the passkey button to the sign-in page: it shows only where the browser says a platform authenticator is there, and";
  }
  store.state.sessions[PEEK_ID] = held;

  const open = blankSession(OPEN_ID);
  open.machineId = "obelisk";
  open.cwd = CWD;
  open.messages = OPEN.map(([type, content], n) => ({
    id: `${OPEN_ID}-${n}`,
    instanceId: OPEN_ID,
    type,
    content,
    timestamp: new Date(now - 2 * HOUR_MS + n * 3 * MINUTE_MS).toISOString(),
  })) as Message[];
  open.initialized = true;
  store.state.sessions[OPEN_ID] = open;
  if (!(scene === "noplan" || tailless)) {
    store.state.plans[PEEK_ID] = planOf(scene);
  }

  pulse(PEEK_ID, activityOf(scene, held.pending.length > 0));
  for (const one of FLEET.slice(0, 4)) {
    pulse(one.id, one.id === "f2" ? "blocked" : "working");
  }

  let online: ReturnType<typeof setTimeout> | undefined;
  // After the layout has asked for the hub (its onMount runs after the
  // page's): the bench's hub stands in for it, and takes an answer.
  const standing = setTimeout(() => {
    store.standHub((_id, kind, intent) => {
      if (kind === "permission.answer") {
        const peeked = store.state.sessions[PEEK_ID];
        const { requestId } = intent as { requestId: string };
        if (peeked) {
          peeked.pending = peeked.pending.filter(
            (one) => one.requestId !== requestId
          );
        }
        pulse(PEEK_ID, "working");
      }
    });
    // The home has had its first read (no online machine waits on its
    // catalogues): the machine is online from here, unless out of reach.
    if (scene !== "unreachable") {
      online = setTimeout(() => {
        const machine = cawco.machines.find(
          (one) => one.machineId === "obelisk"
        );
        if (machine) {
          machine.status = "online";
        }
      }, 300);
    }
  }, 0);

  return {
    target: { href: `/session/${PEEK_ID}`, title: TITLE, viewId: PEEK_ID },
    leave: () => {
      clearTimeout(standing);
      clearTimeout(online);
      store.leaveHub();
      delete store.state.sessions[PEEK_ID];
      delete store.state.sessions[OPEN_ID];
      delete store.state.plans[PEEK_ID];
      store.adoptInstances([]);
    },
  };
}
