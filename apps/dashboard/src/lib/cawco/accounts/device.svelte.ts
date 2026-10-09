/**
 * One account signing in on one machine with its provider's device code:
 * the machine starts the provider's own sign-in and answers a code, the
 * person enters it on any device, and the hub waits (a minute at a time)
 * for the machine to say who it signed in as. A code is only ever minted by
 * a press: nothing starts on open. The setup's machine rows and the account
 * page's popover both draw this (DevicePanel).
 */
import type { ProviderSigninChallenge } from "@cawco/core";
import { awaitDeviceSignin, beginDeviceSignin } from "../client.svelte";

export type DevicePhase =
  | "idle"
  | "starting"
  | "waiting"
  | "expired"
  | "signed-in"
  | "mismatch";

const deviceCode = (
  challenge: ProviderSigninChallenge
): challenge is Extract<ProviderSigninChallenge, { userCode: string }> =>
  "userCode" in challenge;

export class DeviceFlow {
  phase = $state<DevicePhase>("idle");
  code = $state<string | null>(null);
  url = $state<string | null>(null);
  /** When the code lapses, epoch ms. */
  expiresAt = $state(0);
  /** Who the machine signed in as, once it has. */
  email = $state<string | null>(null);
  /** The hub's refusal, in its own words. */
  problem = $state<string | null>(null);
  /** The clock the countdown reads, ticking each second while a code waits. */
  now = $state(Date.now());

  readonly #account: () => Promise<string>;
  readonly #machineId: string;
  /** Bumped by every start and by dispose: an older wait stops asking. */
  #round = 0;
  #tick: ReturnType<typeof setInterval> | undefined;

  constructor(account: () => Promise<string>, machineId: string) {
    this.#account = account;
    this.#machineId = machineId;
  }

  /** Mints a code on the machine and waits for it to be entered. */
  async start(): Promise<void> {
    if (this.phase === "starting" || this.phase === "waiting") {
      return;
    }
    this.#round += 1;
    const round = this.#round;
    this.phase = "starting";
    this.problem = null;
    try {
      const id = await this.#account();
      const challenge = await beginDeviceSignin(id, this.#machineId);
      if (round !== this.#round) {
        return;
      }
      if (!deviceCode(challenge)) {
        this.phase = "idle";
        this.problem =
          "The machine answered a sign-in link, not a code. Update CawCo on it, then start again.";
        return;
      }
      this.code = challenge.userCode;
      this.url = challenge.verificationUrl;
      this.expiresAt = challenge.expiresAt;
      this.phase = "waiting";
      this.#clock(true);
      await this.#wait(id, round);
    } catch (error) {
      if (round === this.#round) {
        this.#clock(false);
        this.code = null;
        this.phase = "idle";
        this.problem = error instanceof Error ? error.message : String(error);
      }
    }
  }

  async #wait(id: string, round: number): Promise<void> {
    while (round === this.#round) {
      // biome-ignore lint/performance/noAwaitInLoops: one wait at a time, each a minute long on the hub
      const result = await awaitDeviceSignin(id, this.#machineId);
      if (round !== this.#round) {
        return;
      }
      if (result.state === "pending") {
        if (Date.now() >= this.expiresAt) {
          this.#end("expired");
          return;
        }
        continue;
      }
      if (result.state === "signed-in" || result.state === "mismatch") {
        this.email = result.email;
      }
      this.#end(result.state);
      return;
    }
  }

  #end(phase: Exclude<DevicePhase, "idle" | "starting" | "waiting">): void {
    this.#clock(false);
    this.phase = phase;
  }

  #clock(on: boolean): void {
    clearInterval(this.#tick);
    this.#tick = undefined;
    if (on) {
      this.now = Date.now();
      this.#tick = setInterval(() => {
        this.now = Date.now();
        if (this.phase === "waiting" && this.now >= this.expiresAt) {
          this.#round += 1;
          this.#end("expired");
        }
      }, 1000);
    }
  }

  /** Stops waiting (the row or popover went away); the code lapses on its own. */
  dispose(): void {
    this.#round += 1;
    this.#clock(false);
  }
}
