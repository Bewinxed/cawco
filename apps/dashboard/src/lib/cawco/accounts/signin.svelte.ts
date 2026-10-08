/**
 * One account signing in on one machine, with Claude Code's own login there:
 * the hub asks the machine for the link, the link opens in a new tab, the
 * code it shows is pasted back, and the machine says who it signed in as.
 * The sign-in popover and the setup's machine rows both draw this.
 *
 * The tab is opened in the press itself, blank, and sent to the link once
 * the machine answers: a tab opened after an `await` is a popup the
 * browser blocks.
 */
import { beginSignin, completeSignin } from "../client.svelte";

export type SigninPhase =
  | "idle"
  | "opening"
  | "ready"
  | "checking"
  | "signed-in"
  | "mismatch";

export class SigninFlow {
  phase = $state<SigninPhase>("idle");
  /** The link Claude Code's login answered, once it has. */
  url = $state<string | null>(null);
  code = $state("");
  /** The hub's refusal, in its own words, for the field to show. */
  problem = $state<string | null>(null);
  /** Who the machine signed in as, once it has. */
  email = $state<string | null>(null);

  readonly #account: () => Promise<string>;
  readonly #machineId: string;

  /**
   * `account` answers the account's id, creating the account first where
   * the setup has not yet (it is made when its first link is asked for).
   */
  constructor(account: () => Promise<string>, machineId: string) {
    this.#account = account;
    this.#machineId = machineId;
  }

  get busy(): boolean {
    return this.phase === "opening" || this.phase === "checking";
  }

  /** Asks the machine for the link and opens it in a new tab. */
  async open(): Promise<void> {
    if (this.busy) {
      return;
    }
    const tab = window.open("about:blank", "_blank");
    this.phase = "opening";
    this.problem = null;
    try {
      const id = await this.#account();
      const { url } = await beginSignin(id, this.#machineId);
      this.url = url;
      this.phase = "ready";
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
    } catch (error) {
      tab?.close();
      this.phase = this.url ? "ready" : "idle";
      this.problem = error instanceof Error ? error.message : String(error);
    }
  }

  /** Types the pasted code into the machine's login. */
  async done(): Promise<void> {
    const code = this.code.trim();
    if (this.busy || code === "") {
      return;
    }
    this.phase = "checking";
    this.problem = null;
    try {
      const id = await this.#account();
      const result = await completeSignin(id, this.#machineId, code);
      this.email = result.probe?.identity?.email ?? null;
      this.code = "";
      if (result.state === "signed-out") {
        this.phase = "ready";
        this.problem =
          "That code didn't sign the machine in. Open the sign-in link again for a new code.";
        return;
      }
      this.phase = result.state;
    } catch (error) {
      this.phase = "ready";
      this.problem = error instanceof Error ? error.message : String(error);
    }
  }
}
