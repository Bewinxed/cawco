/**
 * A tool's own sign-in on one machine (core `ToolSpec.signin`: the
 * Antigravity CLI's Google sign-in), the way an account's is
 * (accounts/signin.svelte.ts): the hub asks the machine for the link, the
 * link opens in a new tab, the code its page shows is pasted back, and the
 * machine reads the tool's sign-in again.
 *
 * The sign-in belongs to the tool on that machine, not to the popover that
 * draws it (DESIGN.md, The Work Outlives Its Surface Rule): every flow in
 * this tab is held here by `machine:tool`, so putting the popover away
 * parks it on its cell, and drawing it again draws the same link. The link,
 * its expiry and the popover that was open are kept in the tab (TabDraft),
 * so a reload opens it again on the same link until it lapses. The hub has
 * no read of a waiting tool sign-in; it answers the kept link to a second
 * begin, which this never needs while the tab holds it.
 *
 * The machine waits ten minutes for the code (agent tool-signin.ts
 * `KEEP_MS`); a code refused, or the machine's own refusal, ends that wait,
 * so the link is spent and the next press asks for a new one. A machine
 * that didn't answer may still be waiting, so its link is kept.
 * The link opens in a tab opened in the press (`openSigninTab`).
 */
import { toolSpec } from "@cawco/core/tools";
import { toolWords } from "@cawco/core/words/tools";
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { failureWords } from "#lib/platform/hub-read.js";
import {
  openSigninTab,
  type PasteSignin,
  type SigninPhase,
} from "./accounts/signin.svelte";
import { TabDraft } from "./tab-draft.svelte";
import {
  beginToolSignin,
  completeToolSignin,
  ToolSigninRefusal,
} from "./tools";

const LINK = z.object({ url: z.string(), expiresAt: z.number() });

/** What the tab keeps: each link under way by `machine:tool`, and the popover open. */
const kept = new TabDraft(
  "cawco:tool-signin",
  z.object({
    open: z.string().nullable(),
    links: z.record(z.string(), LINK),
  }),
  () => ({ open: null, links: {} })
);

export const toolSigninKey = (machineId: string, toolId: string): string =>
  `${machineId}:${toolId}`;

export class ToolSigninFlow implements PasteSignin {
  phase = $state<SigninPhase>("idle");
  /** The link the tool's sign-in printed, while the machine waits for its code. */
  url = $state<string | null>(null);
  /** Until when the machine waits for the code (epoch ms). */
  expiresAt = $state<number | null>(null);
  code = $state("");
  /** A refusal or a lapse, in words, until the next try. */
  problem = $state<string | null>(null);

  readonly machineId: string;
  readonly toolId: string;
  readonly #key: string;
  readonly #name: string;
  #lapse: ReturnType<typeof setTimeout> | undefined;

  constructor(machineId: string, toolId: string) {
    this.machineId = machineId;
    this.toolId = toolId;
    this.#key = toolSigninKey(machineId, toolId);
    this.#name = toolSpec(toolId)?.name ?? toolId;
    const link = kept.value.links[this.#key];
    if (link && link.expiresAt > Date.now()) {
      this.#hold(link);
    } else if (link) {
      delete kept.value.links[this.#key];
    }
  }

  get busy(): boolean {
    return this.phase === "opening" || this.phase === "checking";
  }

  /** Under way: asking for the link, holding one, or checking its code. */
  get live(): boolean {
    return this.busy || this.url !== null;
  }

  #hold(link: z.output<typeof LINK>): void {
    this.url = link.url;
    this.expiresAt = link.expiresAt;
    this.phase = "ready";
    kept.value.links[this.#key] = link;
    clearTimeout(this.#lapse);
    this.#lapse = setTimeout(() => {
      // A code typed in the last moment is the machine's to answer.
      if (this.phase !== "checking") {
        this.#spend();
        this.phase = "idle";
        this.problem = toolWords.signinExpired(this.#name);
      }
    }, link.expiresAt - Date.now());
  }

  /** The machine's sign-in is over: its link opens nothing now. */
  #spend(): void {
    clearTimeout(this.#lapse);
    this.url = null;
    this.expiresAt = null;
    delete kept.value.links[this.#key];
  }

  /** Asks the machine for the link and opens it in a new tab. */
  async open(): Promise<void> {
    if (this.busy) {
      return;
    }
    const opened = openSigninTab(() =>
      beginToolSignin(this.machineId, this.toolId)
    );
    this.phase = "opening";
    this.problem = null;
    try {
      this.#hold(await opened);
    } catch (error) {
      this.#refused(error);
    }
  }

  /** A refusal, said; the link kept where the machine may still wait on it. */
  #refused(error: unknown): void {
    this.problem = failureWords(error);
    this.phase = this.url === null ? "idle" : "ready";
  }

  /** Types the pasted code into the machine's waiting sign-in. */
  async done(): Promise<void> {
    const code = this.code.trim();
    if (this.url === null || this.busy || code === "") {
      return;
    }
    this.problem = null;
    this.phase = "checking";
    try {
      const tool = await completeToolSignin(this.machineId, this.toolId, code);
      this.code = "";
      this.#spend();
      if (tool.signin?.state === "signed-in") {
        this.phase = "signed-in";
        return;
      }
      this.phase = "idle";
      this.problem = toolWords.signinRefused(this.#name);
    } catch (error) {
      if (error instanceof ToolSigninRefusal && error.spent) {
        this.code = "";
        this.#spend();
      }
      this.#refused(error);
    }
  }

  dispose(): void {
    clearTimeout(this.#lapse);
  }
}

const flows = new SvelteMap<string, ToolSigninFlow>();

/**
 * The tool sign-ins, started: what the tab keeps written as it changes, and
 * each link a reload kept that still works a flow again, its lapse timed.
 * The app starts it once (start.ts `startApp`); importing this module only
 * reads what the tab kept, and a popover drawn before the start shows no
 * kept link. Returns its stop: the flows it made again dropped, their lapses cleared.
 */
export function startToolSignins(): () => void {
  const stopKeeping = kept.keep();
  const resumed = new Map<string, ToolSigninFlow>();
  for (const key of Object.keys(kept.value.links)) {
    const { machineId, toolId } = signinOf(key);
    if (machineId && toolId && !flows.has(key)) {
      const flow = new ToolSigninFlow(machineId, toolId);
      if (flow.live) {
        flows.set(key, flow);
        resumed.set(key, flow);
      }
    }
  }
  return () => {
    for (const [key, flow] of resumed) {
      flow.dispose();
      if (flows.get(key) === flow) {
        flows.delete(key);
      }
    }
    stopKeeping();
  };
}

/**
 * The sign-in of the tool on the machine: the one under way, or a new one.
 * One that signed in is held until the next starts, so its popover leaves
 * with its outcome drawn and its cell keeps the tick it drew.
 */
export function toolSigninFlow(
  machineId: string,
  toolId: string
): ToolSigninFlow {
  const key = toolSigninKey(machineId, toolId);
  const held = flows.get(key);
  if (held && held.phase !== "signed-in") {
    return held;
  }
  held?.dispose();
  const made = new ToolSigninFlow(machineId, toolId);
  flows.set(key, made);
  return made;
}

/** The flow under `key`, if one is under way or has an outcome to show. */
export const heldToolSignin = (key: string): ToolSigninFlow | undefined =>
  flows.get(key);

/** The sign-in is over and its outcome seen: the next starts afresh. */
export function dropToolSignin(key: string): void {
  flows.get(key)?.dispose();
  flows.delete(key);
}

/** The popover open, by `machine:tool`, kept across a reload. */
export const openToolSignin = (): string | null => kept.value.open;

/** Opens the popover of `key`'s sign-in, or none. */
export function showToolSignin(key: string | null): void {
  kept.value.open = key;
}

/** The machine and tool a `machine:tool` key names. */
export function signinOf(key: string): { machineId: string; toolId: string } {
  const cut = key.lastIndexOf(":");
  return { machineId: key.slice(0, cut), toolId: key.slice(cut + 1) };
}

/**
 * A popover a reload opens again draws its sign-in from its first frame:
 * the flow of the popover the tab kept open, made as the page is.
 */
export function reopenToolSignin(): void {
  const key = kept.value.open;
  if (key !== null) {
    const { machineId, toolId } = signinOf(key);
    toolSigninFlow(machineId, toolId);
  }
}
