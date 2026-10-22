/**
 * Who this browser is to the hub (hub hub-auth.ts), and what waits on the
 * person: the pairings other devices asked for, the machines waiting to be
 * admitted. Read from `GET /api/auth` as the app opens and whenever its
 * socket closes (a hub that turned pairing on closes every socket of a
 * browser it no longer knows), and kept current by the hub's `hub_auth`
 * frames.
 *
 * A browser that must pair shows the pairing screen instead of the app: it
 * asks the hub for a code (RFC 8628 §3.1), shows it, and polls (§3.4). The
 * person approves it on a paired device; the answer sets this
 * browser's cookie (HttpOnly, so no script here ever holds the token), and
 * the app opens.
 */
import type {
  CallerKind,
  HubAuthFrame,
  HubAuthMode,
  HubAuthState,
  PairingPoll,
  PairingRequest,
  PairingStart,
  WaitingMachine,
} from "@cawco/core";
import { heardFrame, heardSince, readLeaves } from "./heard";
import { failureWords, hubRefusal } from "./hub-read";
import { leaveThePage } from "./leaving";
import { readJson, unstore, writeJson } from "./storage";

/** Where pairing stands for this browser. */
export type PairingStage =
  | { kind: "idle" }
  | { kind: "asking" }
  | {
      kind: "waiting";
      expiresAt: number;
      userCode: string;
      /** What a QR beside the code carries (core `PairingStart`). */
      verificationUriComplete: string;
    }
  | { kind: "denied" | "expired" }
  | { kind: "failed"; message: string };

export const hubAuth = $state<{
  caller: CallerKind;
  device: { id: string; name: string } | null;
  /** Whether `/api/auth` has answered this page once. */
  known: boolean;
  mode: HubAuthMode;
  pairing: PairingStage;
  requests: PairingRequest[];
  waiting: WaitingMachine[];
}>({
  caller: "owner",
  device: null,
  known: false,
  mode: "trusted",
  pairing: { kind: "idle" },
  requests: [],
  waiting: [],
});

/** This browser must pair before the app opens. */
export const mustPair = (): boolean =>
  hubAuth.known && hubAuth.mode === "pairing" && hubAuth.caller !== "owner";

/**
 * What the hub said this request is, read when `mark` was heard: the mode
 * only while no `hub_auth` frame came since ({@link heardSince}).
 */
function takeAuth(state: HubAuthState, mark: number): void {
  if (!heardSince("hub_auth", mark)) {
    hubAuth.mode = state.mode;
  }
  hubAuth.caller = state.caller;
  hubAuth.device = state.device;
  hubAuth.known = true;
}

/** The hub's frame: the mode, the pairings and machines waiting on the person. */
export function takeAuthFrame(frame: HubAuthFrame): void {
  heardFrame("hub_auth");
  hubAuth.mode = frame.mode;
  hubAuth.requests = frame.requests;
  hubAuth.waiting = frame.waiting;
}

let reading: Promise<void> | null = null;

/** Reads `/api/auth` again; one read at a time. */
export function readAuth(): Promise<void> {
  reading ??= (async () => {
    try {
      const mark = readLeaves();
      const response = await fetch("/api/auth");
      if (response.ok) {
        takeAuth((await response.json()) as HubAuthState, mark);
      }
    } catch {
      // The hub out of reach: the connection band says so, and the next close reads again.
    } finally {
      reading = null;
    }
  })();
  return reading;
}

let polling: ReturnType<typeof setTimeout> | undefined;

/**
 * The pairing this tab asked for, kept in the tab's own storage (DESIGN.md,
 * The Work Outlives Its Surface Rule): a reload shows the same code while it
 * is still valid and goes on polling for it, never minting another, and a
 * denial or an expiry is said again until the person starts over. The device
 * code is this browser's own handle on its ask (RFC 8628 §3.2), the one
 * thing it polls with; the token the approval sets is an HttpOnly cookie,
 * never kept here.
 */
const KEPT = "cawco:pairing";

interface KeptPairing {
  deviceCode?: string;
  /** Seconds between polls, as the hub last asked. */
  interval?: number;
  stage: PairingStage;
}

const keep = (kept: KeptPairing | null) =>
  kept ? writeJson(KEPT, kept, "session") : unstore("session", KEPT);

/** Sets the stage, and keeps it with what polls it. */
function stageTo(
  stage: PairingStage,
  poll?: { deviceCode: string; interval: number }
): void {
  hubAuth.pairing = stage;
  keep(stage.kind === "asking" ? null : { stage, ...poll });
}

/**
 * Where this tab's pairing stood before a reload, brought back: a code
 * still valid is shown and polled again; a denial or an expiry is said
 * again. False when there is nothing to bring back, so a code is asked for.
 */
export function resumePairing(): boolean {
  const kept = readJson<KeptPairing | null>(KEPT, null, "session");
  if (!kept || kept.stage.kind === "idle" || kept.stage.kind === "asking") {
    return false;
  }
  const { stage } = kept;
  if (stage.kind !== "waiting") {
    hubAuth.pairing = stage;
    return true;
  }
  if (!kept.deviceCode || stage.expiresAt <= Date.now()) {
    stageTo({ kind: "expired" });
    return true;
  }
  hubAuth.pairing = stage;
  pollFor(kept.deviceCode, (kept.interval ?? 5) * 1000);
  return true;
}

/** Asks the hub for a code and waits for the person's answer. */
export async function startPairing(): Promise<void> {
  clearTimeout(polling);
  stageTo({ kind: "asking" });
  let started: PairingStart;
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "browser" }),
    });
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    started = (await response.json()) as PairingStart;
  } catch (error) {
    stageTo({ kind: "failed", message: failureWords(error) });
    return;
  }
  stageTo(
    {
      kind: "waiting",
      userCode: started.userCode,
      expiresAt: Date.now() + started.expiresIn * 1000,
      verificationUriComplete: started.verificationUriComplete,
    },
    { deviceCode: started.deviceCode, interval: started.interval }
  );
  pollFor(started.deviceCode, started.interval * 1000);
}

/** Polls the hub for the answer to `deviceCode` every `interval` ms (RFC 8628 §3.4). */
function pollFor(deviceCode: string, every: number): void {
  clearTimeout(polling);
  let interval = every;
  const poll = async () => {
    let answer: PairingPoll;
    try {
      const response = await fetch("/api/pair/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });
      answer = (await response.json()) as PairingPoll;
    } catch {
      // A poll that did not reach the hub: the next one asks again.
      polling = setTimeout(poll, interval);
      return;
    }
    switch (answer.status) {
      case "approved":
        // The cookie came with this answer: the app opens as this device.
        keep(null);
        leaveThePage(() => location.reload());
        return;
      case "access_denied":
        stageTo({ kind: "denied" });
        return;
      case "expired_token":
        stageTo({ kind: "expired" });
        return;
      case "slow_down":
        interval += 5000;
        if (hubAuth.pairing.kind === "waiting") {
          stageTo(hubAuth.pairing, { deviceCode, interval: interval / 1000 });
        }
        break;
      case "authorization_pending":
        break;
    }
    polling = setTimeout(poll, interval);
  };
  polling = setTimeout(poll, interval);
}

/** The hub's answer to a call, or its words when it refused. */
async function said(response: Promise<Response>): Promise<void> {
  const answer = await response;
  if (!answer.ok) {
    throw await hubRefusal(answer);
  }
}

const post = (path: string) => said(fetch(path, { method: "POST" }));

/** The person's answer to another device's pairing, by the code it shows. */
export const answerPairing = (userCode: string, approve: boolean) =>
  post(
    `/api/pair/requests/${encodeURIComponent(userCode)}/${approve ? "approve" : "deny"}`
  );

/** The person's answer to a machine waiting to be admitted. */
export const answerMachine = (machineId: string, admit: boolean) =>
  post(
    `/api/machines/waiting/${encodeURIComponent(machineId)}/${admit ? "admit" : "refuse"}`
  );

/**
 * Turns the setting on or off. On, this browser is the first paired device:
 * the answer sets its cookie, and the hub closes every socket it no longer
 * trusts, this tab's among them, which opens again as this device.
 */
export async function setPairingRequired(required: boolean): Promise<void> {
  await said(
    fetch("/api/auth/pairing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ required, kind: "browser" }),
    })
  );
  await readAuth();
}
