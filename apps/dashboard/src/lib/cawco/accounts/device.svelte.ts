/**
 * One account signing in on one machine through its provider's own sign-in:
 * the machine starts it and answers what it shows the person first. A
 * question it asks (its sign-in methods, Copilot's GitHub Enterprise domain)
 * is answered here and the machine answers the next step; a device code is
 * entered on any device while the hub waits (a minute at a time) for the
 * machine to say who it signed in as; a link is opened and the code or
 * address it ends on is pasted back. A sign-in is only ever started by a
 * press: nothing starts on open. The setup's machine rows and the account
 * page's popover both draw this (DevicePanel).
 */
import type {
  ProviderSigninChallenge,
  ProviderSigninPrompt,
} from "@cawco/core";
import { failureWords } from "#lib/cawco/hub-read.js";
import {
  answerDeviceSignin,
  awaitDeviceSignin,
  beginDeviceSignin,
} from "../client.svelte";

export type DevicePhase =
  | "idle"
  | "starting"
  | "asking"
  | "answering"
  | "waiting"
  | "linked"
  | "checking"
  | "expired"
  | "signed-in"
  | "mismatch";

/** The phases a sign-in is under way in: Start does nothing then. */
const UNDER_WAY: readonly DevicePhase[] = [
  "starting",
  "asking",
  "answering",
  "waiting",
  "linked",
  "checking",
];

export class DeviceFlow {
  phase = $state<DevicePhase>("idle");
  /** The question the sign-in asks now. */
  prompt = $state<ProviderSigninPrompt | null>(null);
  /** The device code to enter. */
  code = $state<string | null>(null);
  /** Where to enter the code, or the link to sign in at. */
  url = $state<string | null>(null);
  /** When the code lapses, epoch ms; null when the provider gave no expiry. */
  expiresAt = $state<number | null>(null);
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

  /** Starts the sign-in on the machine and shows what it asks first. */
  async start(): Promise<void> {
    if (UNDER_WAY.includes(this.phase)) {
      return;
    }
    this.#round += 1;
    const round = this.#round;
    this.phase = "starting";
    this.problem = null;
    await this.#step(round, async (id) =>
      beginDeviceSignin(id, this.#machineId)
    );
  }

  /** Answers the question it asks: an option's id, or the text typed. */
  async answer(value: string): Promise<void> {
    if (this.phase !== "asking") {
      return;
    }
    const round = this.#round;
    this.phase = "answering";
    this.problem = null;
    await this.#step(round, async (id) =>
      answerDeviceSignin(id, this.#machineId, value)
    );
  }

  /** Sends the code or address the link's page ended on. */
  async paste(pasted: string): Promise<void> {
    const code = pasted.trim();
    if (this.phase !== "linked" || code === "") {
      return;
    }
    const round = this.#round;
    this.phase = "checking";
    this.problem = null;
    try {
      const id = await this.#account();
      await this.#wait(id, round, code);
    } catch (error) {
      this.#failed(round, error);
    }
  }

  /** Asks the machine for the next step and shows it; a device code is then waited on. */
  async #step(
    round: number,
    ask: (id: string) => Promise<ProviderSigninChallenge>
  ): Promise<void> {
    try {
      const id = await this.#account();
      const challenge = await ask(id);
      if (round !== this.#round) {
        return;
      }
      if ("prompt" in challenge) {
        this.prompt = challenge.prompt;
        this.phase = "asking";
        return;
      }
      this.prompt = null;
      if ("url" in challenge) {
        this.code = null;
        this.url = challenge.url;
        this.expiresAt = null;
        this.phase = "linked";
        return;
      }
      this.code = challenge.userCode;
      this.url = challenge.verificationUrl;
      this.expiresAt = challenge.expiresAt;
      this.phase = "waiting";
      this.#clock(challenge.expiresAt !== null);
      await this.#wait(id, round);
    } catch (error) {
      this.#failed(round, error);
    }
  }

  #failed(round: number, error: unknown): void {
    if (round !== this.#round) {
      return;
    }
    this.#clock(false);
    this.prompt = null;
    this.code = null;
    this.phase = "idle";
    this.problem = failureWords(error);
  }

  async #wait(id: string, round: number, pasted?: string): Promise<void> {
    let code = pasted;
    while (round === this.#round) {
      // biome-ignore lint/performance/noAwaitInLoops: one wait at a time, each a minute long on the hub
      const result = await awaitDeviceSignin(id, this.#machineId, code);
      code = undefined;
      if (round !== this.#round) {
        return;
      }
      if (result.state === "pending") {
        if (this.expiresAt !== null && Date.now() >= this.expiresAt) {
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

  #end(phase: "expired" | "signed-in" | "mismatch"): void {
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
        if (
          this.phase === "waiting" &&
          this.expiresAt !== null &&
          this.now >= this.expiresAt
        ) {
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
