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
 * person approves it on a paired device or in Telegram; the answer sets this
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
import { failureWords } from "./hub-read";

/** Where pairing stands for this browser. */
export type PairingStage =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "waiting"; expiresAt: number; userCode: string }
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

/** What the hub said this request is, taken whole. */
export function takeAuth(state: HubAuthState): void {
  hubAuth.mode = state.mode;
  hubAuth.caller = state.caller;
  hubAuth.device = state.device;
  hubAuth.known = true;
}

/** The hub's frame: the mode, the pairings and machines waiting on the person. */
export function takeAuthFrame(frame: HubAuthFrame): void {
  hubAuth.mode = frame.mode;
  hubAuth.requests = frame.requests;
  hubAuth.waiting = frame.waiting;
}

let reading: Promise<void> | null = null;

/** Reads `/api/auth` again; one read at a time. */
export function readAuth(): Promise<void> {
  reading ??= (async () => {
    try {
      const response = await fetch("/api/auth");
      if (response.ok) {
        takeAuth((await response.json()) as HubAuthState);
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

/** Asks the hub for a code and waits for the person's answer. */
export async function startPairing(): Promise<void> {
  clearTimeout(polling);
  hubAuth.pairing = { kind: "asking" };
  let started: PairingStart;
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "browser" }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    started = (await response.json()) as PairingStart;
  } catch (error) {
    hubAuth.pairing = { kind: "failed", message: failureWords(error) };
    return;
  }
  hubAuth.pairing = {
    kind: "waiting",
    userCode: started.userCode,
    expiresAt: Date.now() + started.expiresIn * 1000,
  };
  let interval = started.interval * 1000;
  const poll = async () => {
    let answer: PairingPoll;
    try {
      const response = await fetch("/api/pair/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode: started.deviceCode }),
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
        location.reload();
        return;
      case "access_denied":
        hubAuth.pairing = { kind: "denied" };
        return;
      case "expired_token":
        hubAuth.pairing = { kind: "expired" };
        return;
      case "slow_down":
        interval += 5000;
        break;
      default:
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
    throw new Error(
      (await answer.text()) || `The hub answered ${answer.status}.`
    );
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
