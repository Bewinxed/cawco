/**
 * The hub as Caw's settings and his seat meet it, for their states files:
 * one project's Caw, his chat's settings and each trigger kind's, answered
 * here after a wait as the hub would answer them, by what the story's dials
 * say the hub does (accepts, refuses, unreachable).
 *
 * It is the page's Caw to the switch (CawLeadSwitch's `SwitchedLead`) and
 * to his seat (CawSeat's `SeatedLead`). Turning him off through the
 * Caw-off tray goes through stop-work.svelte.ts, which asks the hub's route
 * (`PATCH /api/projects/:id/caw`) itself: that route is answered here too,
 * the page's `fetch` proxied for it alone while a stand-in stands, as the
 * session card's bench answers its move (limit-picker-bench). As the hub
 * does, it answers with what it stopped still running, and each stop
 * arrives after as its own `project.stop`, a beat apart: stopped, or, its
 * machine away, deferred to its return.
 *
 * The trigger settings answer as tsk-310 fixes the API (caw-settings.ts):
 * each kind's own layer, and what is in effect resolved project, then
 * fleet, then Caw's chat.
 */
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type {
  CawInitiated,
  CawStatus,
  ProjectConversationView,
} from "@cawco/core/project-conversation";
import type { TriggerKind } from "@cawco/core/triggers";
import {
  cawSettingsWords,
  triggerKindWords,
} from "@cawco/core/words/caw-settings";
import { conversationWords } from "@cawco/core/words/project-conversation";
import { untrack } from "svelte";
import { z } from "zod";
import { flipCaw } from "#lib/cawco/project/CawLeadSwitch.svelte";
import { takeProjectStop } from "#lib/cawco/stores/projects.svelte.js";
import {
  type CawRunsAs,
  resolveKind,
  type TriggerLayer,
  type TriggerSettingsView,
  UNSET,
} from "./caw-settings";
import { RUNNING } from "./caw-settings-seed";

/** What the stand-in hub does with a change. */
export type HubAnswer = "accepts" | "refuses" | "unreached";

/** How long the stand-in hub takes to answer by default, ms. */
const WAIT_MS = 900;

const wait = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms);
  });

/** The fleet's defaults per kind: comments run on Sonnet in Accept edits; the rest fall to Caw's chat. */
const FLEET: Record<TriggerKind, TriggerLayer> = {
  comments: {
    ...UNSET,
    harness: "claude",
    model: "claude-sonnet-5-5",
    mode: "acceptEdits",
  },
  "routine-results": { ...UNSET, mode: "default" },
  "task-moves": UNSET,
  "inbound-events": UNSET,
};

/** The hub's words for each refusal, as failureWords says them. */
const REFUSED = "The project is moving to kestrel (409)";
const UNREACHED = "The hub didn't answer (timeout)";
/** An account the hub does not know, or one its name matches twice: 400, as tsk-310 answers it. */
const NO_ACCOUNT = "No signed-in account has that name (400 no-account)";

const CawBody = z.object({
  on: z.boolean().optional(),
  initiated: z.object({ stop: z.array(z.string()) }).optional(),
});

/** The stand-ins standing now, newest last: the newest answers the proxied route. */
const standing: StandInCaw[] = [];
let takeDown: (() => void) | null = null;
const CAW_ROUTE = /\/api\/projects\/([^/]+)\/caw$/u;

/** The newest stand-in for the project a request names, or none. */
function standInFor(input: RequestInfo | URL): StandInCaw | undefined {
  const href = input instanceof Request ? input.url : String(input);
  const [, project] =
    CAW_ROUTE.exec(new URL(href, location.href).pathname) ?? [];
  return project
    ? standing.findLast((one) => one.projectId === project)
    : undefined;
}

/** The page's `fetch`, answering the Caw route for a stand-in and passing the rest on. */
function putUp(): () => void {
  const real = window.fetch;
  const answered = (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const caw = standInFor(input);
    if (caw === undefined || init?.method !== "PATCH") {
      return real(input, init);
    }
    return caw
      .answerRoute(CawBody.parse(JSON.parse(String(init.body))))
      .then((view) => Response.json(view));
  };
  window.fetch = Object.assign(answered, { preconnect: real.preconnect });
  return () => {
    window.fetch = real;
  };
}

export class StandInCaw {
  readonly projectId: string;
  /** Which start this is: a story's `again` makes the hub afresh. */
  readonly round: number;
  readonly #answer: () => HubAnswer;
  readonly #running: () => boolean;
  readonly #waitMs: number;

  on = $state<boolean | null>(true);
  moving = $state(false);
  refused = $state<string | null>(null);
  #view = $state<ProjectConversationView | null>(null);
  /** What his chat runs as. */
  chat = $state<CawRunsAs>({
    account: "jude",
    harness: "claude",
    model: "claude-opus-5-5",
    mode: "acceptEdits",
  });
  /** The fleet's default per kind (`/api/fleet/trigger-settings`). */
  fleet = $state<Record<TriggerKind, TriggerLayer>>({ ...FLEET });
  /** The fleet kind whose last change was refused, and the hub's words. */
  refusedFleetKind = $state<{ kind: TriggerKind; words: string } | null>(null);
  /** Each kind's own layer, as the project sets it. */
  own = $state<Record<TriggerKind, TriggerLayer>>({
    comments: { ...UNSET },
    "routine-results": { ...UNSET },
    "task-moves": { ...UNSET },
    "inbound-events": { ...UNSET },
  });
  /** His chat's last change, refused: the hub's words. */
  refusedChat = $state<string | null>(null);
  /** His proposing switch's last change, refused: the hub's words. */
  refusedProposes = $state<string | null>(null);
  /** The kind whose last change was refused, and the hub's words. */
  refusedKind = $state<{ kind: TriggerKind; words: string } | null>(null);
  /** His panel is open (the seat's press). */
  open = $state(false);
  /** His seat, as CawSeat reads it: drawn, at rest, standing nowhere else. */
  readonly anchor = null;
  readonly holds = true;
  readonly inPanel = false;
  readonly shown = true;
  seat(): () => void {
    return () => undefined;
  }

  constructor(options: {
    round: number;
    projectId: string;
    on: boolean;
    answer: () => HubAnswer;
    running: () => boolean;
    /** How long it takes to answer, ms. */
    waitMs?: number;
    own?: Partial<Record<TriggerKind, TriggerLayer>>;
    /** The fleet's defaults, in place of the stand-in's own. */
    fleet?: Record<TriggerKind, TriggerLayer>;
  }) {
    this.projectId = options.projectId;
    this.round = options.round;
    this.on = options.on;
    this.#answer = options.answer;
    this.#running = options.running;
    this.#waitMs = options.waitMs ?? WAIT_MS;
    this.own = { ...this.own, ...options.own };
    this.fleet = options.fleet ?? this.fleet;
  }

  /** The route stands answered while this stand-in stands; returns its release. */
  stand(): () => void {
    standing.push(this);
    takeDown ??= putUp();
    return () => {
      standing.splice(standing.indexOf(this), 1);
      if (standing.length === 0) {
        takeDown?.();
        takeDown = null;
      }
    };
  }

  get view(): ProjectConversationView | null {
    return this.#view;
  }
  /** The hub's view of him is where he stands. */
  set view(next: ProjectConversationView | null) {
    this.#view = next;
    if (next) {
      this.on = next.on;
    }
  }

  /** What its stops have ended so far, as each `project.stop` said. */
  readonly #stopped = new Set<string>();

  #viewOf(on: boolean): ProjectConversationView {
    return {
      attemptsHearComments: true,
      harness: this.chat.harness,
      hearsTasks: true,
      instanceId: "caw-cockpit",
      mode: this.chat.mode,
      model: this.chat.model,
      on,
      problem: null,
      proposesDecides: this.proposesDecides,
      running: this.#running()
        ? RUNNING.filter((one) => !this.#stopped.has(one.id))
        : [],
      spendUsd: 41.2,
      starting: false,
      startingId: null,
    };
  }

  /** The hub's answer after its wait, or the words of its refusal. */
  async #ask(patch: Partial<TriggerLayer> = {}): Promise<string | null> {
    await wait(this.#waitMs);
    switch (this.#answer()) {
      case "accepts":
        return null;
      case "refuses":
        // A change naming an account is refused for the account (400).
        return patch.account ? NO_ACCOUNT : REFUSED;
      case "unreached":
        return UNREACHED;
    }
  }

  /** `PATCH /api/projects/:id/caw`, as stop-work asks it. */
  async answerRoute(body: {
    initiated?: CawInitiated;
    on?: boolean;
  }): Promise<ProjectConversationView> {
    const refusal = await this.#ask();
    if (refusal) {
      throw new Error(refusal);
    }
    this.#confirm(body.initiated?.stop ?? []);
    return this.#viewOf(body.on ?? this.on ?? true);
  }

  /**
   * Each stop's end, a beat apart after the answer, as each machine
   * confirms it: a session on a machine that is away is deferred to its
   * return and runs on meanwhile.
   */
  #confirm(ids: string[]): void {
    const beat = this.#waitMs / 4;
    for (const [at, id] of ids.entries()) {
      const away = RUNNING.find((one) => one.id === id)?.offline ?? false;
      setTimeout(
        () => {
          if (!away) {
            this.#stopped.add(id);
          }
          takeProjectStop({
            kind: "project.stop",
            projectId: this.projectId,
            instanceId: id,
            outcome: away ? "deferred" : "stopped",
          });
        },
        beat * (at + 1)
      );
    }
  }

  /** The switch's ask (CawLead `configure`). */
  async configure(change: {
    harness?: HarnessKind;
    initiated?: CawInitiated;
    model?: string | null;
    on?: boolean;
  }): Promise<void> {
    this.moving = true;
    const refusal = await this.#ask();
    this.moving = false;
    if (refusal) {
      this.refused = cawSettingsWords.refused(
        change.on === false
          ? cawSettingsWords.stillAwake
          : cawSettingsWords.stillAsleep,
        refusal
      );
      return;
    }
    this.refused = null;
    this.view = this.#viewOf(change.on ?? this.on ?? true);
  }

  /** His view read again: what still runs (CawLead `read`). */
  read(): Promise<void> {
    this.#view = this.#viewOf(this.on ?? true);
    return Promise.resolve();
  }

  /** What each kind runs as, as the hub resolves it. */
  readonly triggers = $derived.by((): TriggerSettingsView => {
    const kindOf = (kind: TriggerKind) => ({
      own: this.own[kind],
      inEffect: resolveKind(this.own[kind], this.fleet[kind], this.chat),
    });
    return {
      kinds: {
        comments: kindOf("comments"),
        "routine-results": kindOf("routine-results"),
        "task-moves": kindOf("task-moves"),
        "inbound-events": kindOf("inbound-events"),
      },
    };
  });

  /** His chat's change; the hub answers, or the switch's line says why not. */
  async setChat(patch: Partial<TriggerLayer>): Promise<void> {
    const refusal = await this.#ask(patch);
    if (refusal) {
      this.refusedChat = cawSettingsWords.refused(
        cawSettingsWords.chatUnchanged,
        refusal
      );
      return;
    }
    this.refusedChat = null;
    this.chat = {
      ...this.chat,
      ...Object.fromEntries(
        Object.entries(patch).filter(([field, value]) =>
          field === "harness" ? value !== null : true
        )
      ),
    };
  }

  /** Whether Caw may propose changes to Who decides (a project boolean, `cawProposesDecides`). */
  proposesDecides = $state(false);

  /** His proposing switch's change; the hub answers, or the switch's line says why not. */
  async setProposes(next: boolean): Promise<void> {
    const refusal = await this.#ask();
    if (refusal) {
      this.refusedProposes = cawSettingsWords.refused(
        cawSettingsWords.proposesUnchanged(this.proposesDecides),
        refusal
      );
      return;
    }
    this.refusedProposes = null;
    this.proposesDecides = next;
  }

  /** `PATCH /api/projects/:id/trigger-settings/:kind`: null clears a field. */
  async setKind(
    kind: TriggerKind,
    patch: Partial<TriggerLayer>
  ): Promise<void> {
    const refusal = await this.#ask(patch);
    if (refusal) {
      this.refusedKind = {
        kind,
        words: cawSettingsWords.refused(
          cawSettingsWords.kindUnchanged(triggerKindWords[kind].name),
          refusal
        ),
      };
      return;
    }
    this.refusedKind = null;
    this.own = { ...this.own, [kind]: { ...this.own[kind], ...patch } };
  }

  /** `PATCH /api/fleet/trigger-settings/:kind`: null clears a field. */
  async setFleetKind(
    kind: TriggerKind,
    patch: Partial<TriggerLayer>
  ): Promise<void> {
    const refusal = await this.#ask(patch);
    if (refusal) {
      this.refusedFleetKind = {
        kind,
        words: cawSettingsWords.refused(
          cawSettingsWords.kindUnchanged(triggerKindWords[kind].name),
          refusal
        ),
      };
      return;
    }
    this.refusedFleetKind = null;
    this.fleet = { ...this.fleet, [kind]: { ...this.fleet[kind], ...patch } };
  }

  /**
   * The flip a frame opens on (a story's `asked`), made through the
   * switch's own path (`flipCaw`), untracked so his answer never asks again.
   */
  opensOn(asked: "on" | "off" | null, projectName: string): void {
    if (asked) {
      const project = { id: this.projectId, name: projectName };
      untrack(() => flipCaw(this, project, asked === "on"));
    }
  }

  /** His face's status at his seat: asleep while off, else at rest. */
  readonly status = $derived.by((): CawStatus => {
    if (this.on === null) {
      return "loading";
    }
    return this.on ? "ready" : "sleeping";
  });

  readonly sentence = $derived(
    this.on === false
      ? conversationWords.status.off
      : conversationWords.status.ready
  );
}
