/**
 * An Antigravity session as its host runs it (agy-host.ts): Google's `agy
 * acp`, a child of the host in its own process group, spoken to over ACP
 * through `@agentclientprotocol/sdk`, and the judge its hook asks before
 * every call (agy-judge.ts), served on the session's socket.
 *
 * - **Start.** `initialize` names CawCo honestly (`clientInfo`) and
 *   advertises no file system, terminal or elicitation; `authenticate`
 *   always names the account's method, so agy never runs on another
 *   (issue #1701); then `session/new`, or `session/resume` of a stored one,
 *   with CawCo's MCP servers and CawCo's few words appended to agy's system
 *   prompt (`_meta.antigravity.systemPrompt.append`), never in place of it.
 *   The model and its thinking level are set after every start and resume,
 *   which drops them (issue #1460).
 * - **Turns.** Each send is a `session/prompt`; one sent while a turn runs
 *   steers it (agy ends the running prompt and goes on in the new one), so
 *   the turn ends with the last prompt's answer. Its text and thinking
 *   stream, its tool calls and their results are said as tool uses, and
 *   its end reads agy's store for an error agy reported only there
 *   (agy-outcome.ts): a spent quota is the account's limit with its reset.
 * - **Asks.** agy is in its own `default` mode with `always-proceed`; the
 *   judge answers each call by the session's CawCo mode, and a call the
 *   mode asks about is `force_ask`, which agy raises as
 *   `session/request_permission`: parked as CawCo's ask, answered with the
 *   person's choice.
 * - **Agent Platform's hour.** agy stops refreshing a Google Cloud token
 *   after about an hour and then answers every prompt with an empty
 *   `end_turn` (issue #1722): such a turn on an Agent Platform account
 *   starts agy again, which reads its credential afresh, resumes and sends
 *   the prompt once more; a second empty end is said in words. No turn ends
 *   silently.
 * - **Pictures.** agy keeps a prompt's pictures in its conversation and
 *   sends them again with every later request, so one Google can't read
 *   fails every turn after it. A send's pictures go to agy only once they
 *   decode whole within every model's limits (agy-pictures.ts); one refused
 *   fails that send alone, in words naming it. A request Google still
 *   refuses as invalid sets the conversation aside: agy offers no edit of
 *   its history, and a resume sends the same history again, so the session
 *   goes on in a new agy conversation whose first prompt carries what was
 *   said (agy-carry.ts). A turn that carried no picture of its own is sent
 *   again there at once; one that did ends naming it, and the next message
 *   goes to the new conversation.
 */
import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  type ClientConnection,
  type ContentBlock,
  client,
  methods,
  type NewSessionRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { makeFolder } from "@cawco/core/folders";
import type { SessionCredentialInstall } from "@cawco/core/harness";
import { AGY_TOOLS } from "@cawco/core/harness/agy";
import type {
  AgyHostAsk,
  AgyHostCommand,
  AgyHostState,
} from "@cawco/core/harness/agy-host-state";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { type SharedMode, sharedModeNamed } from "@cawco/core/harness/modes";
import { AGY_APP_DATA, agyOwnCarryHome } from "@cawco/core/paths/harnesses";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
} from "@cawco/core/session/controls";
import {
  MESSAGES_READ,
  type NeutralMessage,
  OWN_SETTINGS,
  type PermissionResult,
  type SentMessage,
  type SlashCommand,
} from "@cawco/core/session-messages";
import { withPastedText } from "@cawco/core/transcript-rules";
import { unhandled } from "@cawco/core/unhandled";
import { pricedRequest } from "@cawco/core/usage/pricing";
import { agyWords } from "@cawco/core/words/agy";
import { readPolicy } from "@cawco/core/workspace-judge";
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Queue,
  Scope,
  Semaphore,
} from "effect";
import { runPromise, runSync } from "../daemon-runtime";
import type { SessionControls, TurnExtras } from "../harness";
import { fromPromise } from "../rejected";
import { acknowledgeSessionCredential } from "../session-identity";
import { carriedOf, carriedWords, keepCarried } from "./agy-carry";
import { AgyFleetHooks } from "./agy-fleet-hooks";
import {
  argsOf,
  askedCall,
  callResult,
  carriesHookNotice,
  commandsOf,
  currentOption,
  levelFor,
  levelsOffered,
  modelsOf,
  type PromptTokens,
  promptAnswer,
  takesAppend,
} from "./agy-frames";
import { serveAgyJudge } from "./agy-hook";
import {
  type AgyAnswer,
  type AgyTurnEvent,
  agyTurnEventOf,
  type AgySession as Judged,
} from "./agy-judge";
import {
  type AgyChild,
  endGroup,
  signedInAt,
  signInAcp,
  startAcp,
} from "./agy-launch";
import { type AgyHostNote, changeAgyHostNote } from "./agy-notes";
import {
  type AgySteps,
  lastStep,
  type TurnFault,
  turnFault,
} from "./agy-outcome";
import { sendRefusal } from "./agy-pictures";
import { accountStore, applyAgyDeletes } from "./agy-store-files";
import { type WrittenAt, writtenAt, writtenResult } from "./agy-transcript";
import { credentialControls } from "./credential-controls";

/** A start's command, as the host was handed it. */
type AgyStart = Extract<AgyHostCommand, { type: "start" }>;

/** What a host's session tells its host, which says each on its line (agy-host.ts). */
interface AgyHostContext {
  /** Whether a prompt runs. */
  busy: (active: boolean) => void;
  /** The session failed of something its reader should see. */
  failed: (error: unknown) => void;
  frame: (message: NeutralMessage) => void;
  /** An ask agy raised, parked with CawCo. */
  permission: (ask: AgyHostAsk) => void;
  /** An ask the session settled itself (an interrupt cancels it). */
  permissionResolved: (
    requestId: string,
    outcome: "answered" | "cancelled"
  ) => void;
  /** The host stopped agy as no longer to be trusted, in words that say why. */
  refused: (error: string) => void;
  /** A send agy refused. */
  rejected: (uuid: string, error: unknown) => void;
  session: (sessionId: string) => void;
  /** The running agy's version, as its `initialize` said it. */
  version: (version: string) => void;
}

/** One of agy's asks, parked with CawCo until the person answers it. */
interface ParkedAsk {
  readonly allow: string | undefined;
  readonly answer: Deferred.Deferred<RequestPermissionResponse>;
  /** The ask as CawCo was handed it. */
  readonly asked: AgyHostAsk;
  readonly reject: string | undefined;
}

/** A running agy and CawCo's connection to it. */
interface AgyProcess {
  readonly child: AgyChild;
  readonly connection: ClientConnection;
  /** Set once CawCo ended it itself, so its exit is no failure. */
  ended: boolean;
}

/** One of agy's updates, or a mark a turn's end waits on ({@link AgySession.#drained}). */
type Update =
  | { readonly update: SessionNotification }
  | { readonly drained: Deferred.Deferred<void> }
  /** A turn's start or end as agy's hook told it, read in its place among the updates ({@link AgySession.turnEvent}). */
  | { readonly turn: AgyTurnEvent };

/** How long a stop waits for agy to end before it keeps its home's deleted conversations out (agy ends at once on SIGTERM; our own bound). */
const AGY_EXIT_WAIT = "5 seconds";

/** What the running turn has said so far. */
interface Turn {
  /** The store's last step before it began (agy-outcome.ts `lastStep`). */
  readonly after: number;
  /** How many pictures its prompts carried. */
  pictures: number;
  /** Whether agy said anything in it: text, thinking, a tool call. */
  said: boolean;
  text: string;
  thinking: string;
  /** Its prompts' tokens, one entry per prompt answered. */
  readonly tokens: PromptTokens[];
}

/** The modes that ask nothing: an ask agy raises in one is allowed at once. */
const UNASKED: ReadonlySet<SharedMode> = new Set([
  "bypassPermissions",
  "fullSend",
]);

/**
 * CawCo's words appended to agy's own system prompt: as few as name CawCo's
 * tools, which stand in for agy's own question, subagent and browser tools
 * (Google limits requests carrying another harness's tool names on consumer
 * sign-in, issue #1701).
 */
const APPEND =
  "You run inside CawCo. Ask the person with mcp_cawco_ask, and hand work off with mcp_cawco_delegate.";

/** The words a session's mode refuses with when it names one agy's judge does not take. */
const noMode = (mode: string): string => `Antigravity takes no ${mode} mode.`;

/** The mode a start names, as the judge reads it. */
const modeOf = (named: string | undefined): SharedMode => {
  const mode = sharedModeNamed(named ?? "default");
  if (!mode) {
    throw new Error(noMode(String(named)));
  }
  return mode;
};

/** A prompt's own words, as the carried record keeps them (agy-carry.ts). */
const wordsOf = (blocks: readonly ContentBlock[]): string =>
  blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");

/** A send's words, its pasted texts after them. */
const textOf = (message: SentMessage, extras: TurnExtras): string => {
  const { content } = message.message;
  const typed =
    typeof content === "string"
      ? content
      : content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n");
  return withPastedText(typed, extras.attachments ?? []);
};

/** The model CawCo names, or none for agy's own default. */
const modelNamed = (model: string | undefined): string | undefined =>
  model && model !== "default" ? model : undefined;

class AgySession {
  sessionId: string | null = null;
  readonly #ctx: AgyHostContext;
  readonly #start: AgyStart;
  #mode: SharedMode;
  #model: string | undefined;
  #effort: string | undefined;
  #agy: AgyProcess | undefined;
  /** Whether the running agy takes CawCo's words appended to its system prompt. */
  #append = false;
  /**
   * One send at a time from its pictures' check and the fleet's
   * `UserPromptSubmit` hooks to agy taking it, so sends reach agy in the
   * order they came, and none while a conversation is set aside for a new
   * one.
   */
  readonly #sending = Semaphore.makeUnsafe(1);
  /** The carried record, said first in the next prompt of a new conversation (agy-carry.ts). */
  #carry: string | undefined;
  /** The judge's socket and the reader of agy's updates, served for as long as this scope is open. */
  readonly #judge = runSync(Scope.make());
  /**
   * agy's `session/update`s, and the marks a turn's end waits on, read one
   * at a time in the order they came ({@link #read}): a call's end waits
   * there for the result agy writes behind it, and what agy says after it
   * waits behind that.
   */
  readonly #updates = runSync(Queue.unbounded<Update>());
  /** The fiber that reads {@link #updates}, once the session opened. */
  #reader: Fiber.Fiber<never> | undefined;
  /** The fleet's hooks, run on its events (agy-fleet-hooks.ts). */
  readonly #fleet: AgyFleetHooks;
  readonly #asks = new Map<string, ParkedAsk>();
  /** The sends handed to agy it has not taken yet, by uuid. */
  readonly #unread = new Set<string>();
  /**
   * The prompts sent whose answers have not come. agy answers a prompt only
   * once nothing of the conversation runs on, so one stays open while a
   * command it moved to the background or a wake-up it set is pending, and
   * the turns those start run inside it (the project's
   * `assets/b5b3ca96/REPORT.md` §2, §3).
   */
  #prompts = 0;
  /** CawCo's running turn: the person's, or one agy started itself inside an open prompt. */
  #turn: Turn | undefined;
  /**
   * The tool calls said as tool uses, by agy's id: each running one, by its
   * name and when it began, until its result is said; each ended one until
   * its turn ends. A running one that outlives its turn is a command agy
   * moved to the background or a wake-up it set ({@link pending}).
   */
  readonly #calls = new Map<
    string,
    { ended: boolean; name: string; since: number }
  >();
  /** The tool each call agy began names, by agy's id, until it ends: a command's result is proven by it. */
  readonly #callTools = new Map<string, string>();
  /**
   * In a workspace, each command the judge let run, by its call's id, until
   * it ends: whether the judge rewrote it to run through the executor, so
   * its result must carry agy's word on the rewrite ({@link #proven}).
   */
  readonly #ran = new Map<string, boolean>();
  /** Why the host stopped agy as no longer to be trusted, once it has. */
  #refused: string | undefined;
  /** Where agy writes each ended call's result, by agy's id, until its end is said (agy-transcript.ts). */
  readonly #writtenAt = new Map<string, WrittenAt>();
  #models: ModelInfo[] = [];
  #commands: SlashCommand[] = [];
  /** The last answer that named the session's config options: what thinking levels its model takes. */
  #options: unknown;
  /** The context as agy's last `usage_update` said it. */
  #context: { size: number; used: number } | undefined;
  #stderr = "";
  #stopped: boolean;
  /** The running agy's version, as its last `initialize` said it. */
  #version: string | undefined;

  constructor(start: AgyStart, ctx: AgyHostContext) {
    this.#start = start;
    this.#ctx = ctx;
    this.#stopped = false;
    this.#mode = modeOf(start.spec.permissionMode);
    this.#model = modelNamed(start.spec.model);
    this.#effort = start.spec.effort;
    this.#fleet = new AgyFleetHooks(
      start.spec.cwd,
      start.mcpServers.map((server) => server.name),
      () => this.sessionId,
      start.workspace ? { prefix: start.workspace.prefix } : undefined
    );
  }

  /** The session the judge answers for, read afresh at each call. */
  #judged(): Judged {
    const session = this;
    const denied = new Set(this.#start.denied);
    const { home } = this.#start.launch;
    const { workspace } = this.#start;
    return {
      denied,
      get mode() {
        return session.#mode;
      },
      // A call raised outside an open prompt cannot be asked about: agy
      // would hold its ask until the client's next request (issue #1461).
      // Over ACP agy runs no tool with no prompt open (the project's
      // `assets/b5b3ca96/REPORT.md` §2, §3), so this denial is a fail-safe.
      get personTurn() {
        return session.#prompts > 0;
      },
      noted: (callId, tool, answer) => this.#noted(callId, tool, answer),
      // Where agy saves this conversation's outputs and background
      // commands' logs (`<app-data>/brain/<id>/`, the project's
      // `assets/3c6f6f4e/ppersist.summary.txt`), named from the
      // conversation agy opened, never from a call.
      get ownOutputs() {
        return session.sessionId
          ? join(home, AGY_APP_DATA, "brain", session.sessionId)
          : undefined;
      },
      workspace: workspace
        ? { exec: workspace.exec, policy: () => readPolicy(workspace.policy) }
        : undefined,
    };
  }

  /** A command the judge let run in a workspace, kept for its result's proof ({@link #proven}). */
  #noted(callId: string, tool: string, answer: AgyAnswer): void {
    if (
      !this.#start.workspace ||
      AGY_TOOLS[tool] !== "shell" ||
      answer.decision === "deny"
    ) {
      return;
    }
    // A hook agy ran twice for one call (issue #1462) rewrote it the first time.
    const rewritten =
      answer.overwrite?.CommandLine !== undefined ||
      this.#ran.get(callId) === true;
    this.#ran.set(callId, rewritten);
  }

  /**
   * In a workspace, a command that ran is proven to have run through its
   * executor (the project's `assets/50e9e4c3/agy-harness-decisions.md` §1
   * decision 11): the judge let it run, and when the judge rewrote it, agy's
   * word on the rewrite opens its output. One that is not stops the
   * session as no longer to be trusted. Any other call proves nothing here.
   */
  #proven(
    id: string,
    update: { content?: readonly unknown[] | null; rawOutput?: unknown }
  ): void {
    const tool = this.#callTools.get(id);
    const rewritten = this.#ran.get(id);
    this.#callTools.delete(id);
    this.#ran.delete(id);
    if (
      !this.#start.workspace ||
      (rewritten === undefined &&
        (tool === undefined || AGY_TOOLS[tool] !== "shell"))
    ) {
      return;
    }
    if (rewritten === undefined) {
      this.#refuse(agyWords.commandNotJudged);
    } else if (rewritten && !carriesHookNotice(update)) {
      this.#refuse(agyWords.commandNotRewritten);
    }
  }

  /** agy and all it started ended for good, as no longer to be trusted, and said so once in `words`. */
  #refuse(words: string): void {
    if (this.#refused !== undefined) {
      return;
    }
    this.#refused = words;
    console.warn(`[agy] ${this.#start.spec.instanceId}: ${words}`);
    this.#endAgy();
    this.#cancelAsks();
    this.#ctx.refused(words);
    this.#prompts = 0;
    this.#turn = undefined;
    this.#calls.clear();
    this.#ctx.busy(false);
  }

  /** Whether it runs in agy's own default home, under agy's own settings (agy-launch.ts `agyOwnLaunch`). */
  get #own(): boolean {
    return this.#start.launch.accountId === undefined;
  }

  /**
   * The judge served, agy started and signed in, and the session opened. In
   * agy's own default home no hook of CawCo's runs, so no judge is served,
   * no fleet hook runs, and the session says once that agy's own settings
   * hold. A turn's start or end the hook tells is read in its place among
   * agy's updates.
   */
  async open(): Promise<void> {
    const { launch } = this.#start;
    if (!this.#own) {
      await makeFolder(dirname(launch.judgeSocket));
      const judged = this.#judged();
      await runPromise(
        serveAgyJudge(launch.judgeSocket, (line) => {
          const turn = agyTurnEventOf(line);
          if (turn) {
            if (turn.conversationId === this.sessionId) {
              Queue.offerUnsafe(this.#updates, { turn });
            }
            return Promise.resolve({});
          }
          const ended = writtenAt(line);
          if (Option.isSome(ended)) {
            this.#writtenAt.set(ended.value.id, ended.value.at);
          }
          return this.#fleet.answer(line, judged);
        }).pipe(Scope.provide(this.#judge))
      );
    }
    this.#reader = runSync(
      Effect.forkIn(
        Effect.forever(
          Queue.take(this.#updates).pipe(
            Effect.flatMap((one) => this.#read(one))
          )
        ),
        this.#judge
      )
    );
    await this.#startAgy();
    const resumed = this.#start.spec.resume?.sessionKey;
    await this.#openSession(resumed, this.#append);
    if (this.#own) {
      this.#emit({
        type: "system",
        subtype: OWN_SETTINGS,
        content: agyWords.ownSettings,
        ...(this.sessionId ? { session_id: this.sessionId } : {}),
      });
    } else {
      await this.#fleet.started(resumed ? "resume" : "startup");
    }
  }

  /** agy started, `initialize`d and signed in by the account's method, and whether it takes appended words noted. */
  async #startAgy(): Promise<void> {
    const { launch } = this.#start;
    // Its end, said once the process this start made is known.
    const holder: { agy?: AgyProcess; why?: string } = {};
    const signedIn = await signedInAt(launch.home);
    const since = Date.now();
    const { child, connection } = startAcp(
      {
        bin: launch.bin,
        args: launch.args,
        env: launch.env,
        cwd: this.#start.spec.cwd,
      },
      client({ name: "cawco" })
        .onRequest(methods.client.session.requestPermission, ({ params }) =>
          this.#asked(params)
        )
        .onNotification(methods.client.session.update, ({ params }) => {
          if (params.sessionId === this.sessionId) {
            Queue.offerUnsafe(this.#updates, { update: params });
          }
        }),
      {
        said: (text) => {
          process.stderr.write(text);
          // A failure quotes agy's last line: its last words before it ended.
          const lines = text.split("\n").filter((line) => line.trim());
          this.#stderr = lines.at(-1) ?? this.#stderr;
        },
        ended: (why) => {
          holder.why = why;
          this.#applyDeletes();
          if (holder.agy) {
            this.#agyEnded(holder.agy, why);
          }
        },
      }
    );
    const agy: AgyProcess = { child, connection, ended: false };
    holder.agy = agy;
    this.#agy = agy;
    if (holder.why !== undefined) {
      this.#agyEnded(agy, holder.why);
    }
    const initialized = await signInAcp(
      connection,
      launch.methodId,
      this.#start.clientVersion,
      { end: () => endGroup(child), home: launch.home, signedIn, since }
    );
    if (initialized.agentInfo?.version) {
      this.#version = initialized.agentInfo.version;
      this.#ctx.version(initialized.agentInfo.version);
    }
    this.#append = takesAppend(initialized);
  }

  /** The session opened in the running agy: new, or the stored one resumed, its model and level set. */
  async #openSession(
    resumed: string | undefined,
    append: boolean
  ): Promise<void> {
    const connection = this.#connection();
    const params: NewSessionRequest = {
      cwd: this.#start.spec.cwd,
      mcpServers: [...this.#start.mcpServers],
      ...(append
        ? {
            _meta: {
              antigravity: {
                systemPrompt: { append: APPEND },
              },
            },
          }
        : {}),
    };
    let answer: unknown;
    if (resumed) {
      answer = await connection.agent.request(methods.agent.session.resume, {
        sessionId: resumed,
        ...params,
      });
      this.#adopted(resumed);
    } else {
      const created = await connection.agent.request(
        methods.agent.session.new,
        params
      );
      answer = created;
      this.#adopted(created.sessionId);
    }
    const listed = modelsOf(answer);
    if (listed.length > 0) {
      this.#models = listed;
    }
    this.#options = answer;
    await this.#setModel(this.#model);
    await this.#setEffort(this.#effort);
  }

  /** The conversation the session runs in, said, and CawCo's note of where it runs kept (agy-notes.ts). */
  #adopted(sessionId: string): void {
    this.sessionId = sessionId;
    this.#ctx.session(sessionId);
    const { accountId, dir } = this.#start.launch;
    const { cwd } = this.#start.spec;
    this.#note(sessionId, (note) => ({
      ...note,
      ...(accountId ? { accountId } : {}),
      ...(dir ? { dir: basename(dir) } : {}),
      cwd: note.cwd ?? cwd,
      createdAt: note.createdAt ?? Date.now(),
    }));
  }

  /** CawCo's note of conversation `sessionId` changed; a write that fails is said, as the note is the listing's aid, not the session's. */
  #note(sessionId: string, change: (note: AgyHostNote) => AgyHostNote): void {
    changeAgyHostNote(sessionId, change).catch((error: unknown) =>
      console.warn(
        `[agy] ${this.#start.spec.instanceId}: noting conversation ${sessionId} failed: ${saidBy(error)}`
      )
    );
  }

  /**
   * A turn's start or end as agy's hook told it, read in its place among
   * agy's updates:
   * - a model call with none of CawCo's turns running is a turn agy began
   *   itself inside an open prompt (a background command ended, a wake-up
   *   came): it runs as a turn of its own, and says what it does as it
   *   does it;
   * - a turn's first model call while one runs (a wake-up that came while
   *   the person's turn ran) closes what was said so far, so its words are
   *   their own;
   * - agy's turn ending with a command in the background or a wake-up still
   *   set ends CawCo's turn there, though agy holds its prompt open, and
   *   the result counts what is pending. A turn that ends fully idle ends
   *   with the prompt's own answer, which follows at once and carries its
   *   tokens.
   */
  #turnEvent(event: AgyTurnEvent): void {
    if (event.conversationId !== this.sessionId) {
      return;
    }
    if (event.kind === "invocation") {
      if (!this.#turn) {
        this.#beginTurn();
      } else if (event.invocationNum === 0 && this.#turn.said) {
        this.#flush();
      }
      return;
    }
    if (!event.fullyIdle && this.#turn) {
      this.#endTurn(
        "end_turn",
        this.#faultOf(this.#turn, this.sessionId, "end_turn")
      );
    }
  }

  /** A turn of CawCo's begun: the session busy. */
  #beginTurn(): void {
    const { sessionId } = this;
    this.#turn = {
      after: sessionId ? lastStep(this.#steps(), sessionId) : -1,
      said: false,
      text: "",
      thinking: "",
      pictures: 0,
      tokens: [],
    };
    this.#ctx.busy(true);
  }

  /** The calls still running: once no turn runs, what agy holds for later. */
  #pending(): { id: string; name: string; since: number }[] {
    return [...this.#calls]
      .filter(([, call]) => !call.ended)
      .map(([id, call]) => ({ id, name: call.name, since: call.since }));
  }

  #connection(): ClientConnection {
    if (this.#refused !== undefined) {
      throw new Error(this.#refused);
    }
    const agy = this.#agy;
    if (!agy || agy.ended) {
      throw new Error(agyWords.ended);
    }
    return agy.connection;
  }

  /** agy ended: by CawCo's own stop or restart, nothing; else the session fails, saying agy's last words. */
  #agyEnded(agy: AgyProcess, why: string): void {
    if (agy.ended) {
      return;
    }
    agy.ended = true;
    agy.connection.close();
    this.#cancelAsks();
    if (this.#stopped || this.#agy !== agy) {
      return;
    }
    const tail = this.#stderr.trim();
    this.#ctx.failed(new Error(tail ? `${why}: ${tail}` : why));
    this.#prompts = 0;
    this.#turn = undefined;
    // Its background commands and wake-ups ended with it.
    this.#calls.clear();
    this.#ctx.busy(false);
  }

  /** agy and every process it started ended, CawCo's own doing. */
  #endAgy(): void {
    const agy = this.#agy;
    if (!agy || agy.ended) {
      return;
    }
    agy.ended = true;
    agy.connection.close();
    endGroup(agy.child);
  }

  // ---------------------------------------------------------- updates

  #emit(message: NeutralMessage): void {
    this.#ctx.frame(message);
  }

  /**
   * One update read off {@link #updates}: a mark, met; a call's end that
   * carries no result, said once the result agy writes of it is read; any
   * other, said at once.
   */
  #read(one: Update): Effect.Effect<void> {
    if ("drained" in one) {
      return Deferred.succeed(one.drained, undefined);
    }
    if ("turn" in one) {
      return Effect.sync(() => this.#turnEvent(one.turn));
    }
    const { update } = one.update;
    const at =
      update.sessionUpdate === "tool_call_update" &&
      (update.status === "completed" || update.status === "failed") &&
      callResult(update, undefined) === ""
        ? this.#writtenAt.get(update.toolCallId)
        : undefined;
    if (!at) {
      return Effect.sync(() => this.#updated(one.update, undefined));
    }
    return writtenResult(at).pipe(
      Effect.map((written) =>
        this.#updated(one.update, Option.getOrUndefined(written))
      )
    );
  }

  /** Every update agy sent so far said: what a turn's end waits on before it is said. */
  async #drained(): Promise<void> {
    const reader = this.#reader;
    if (!reader) {
      return;
    }
    const drained = Deferred.makeUnsafe<void>();
    Queue.offerUnsafe(this.#updates, { drained });
    await runPromise(
      Effect.raceFirst(
        Deferred.await(drained),
        Effect.asVoid(Fiber.await(reader))
      )
    );
  }

  /** One of agy's `session/update`s, as the session's frames; `written`, what agy wrote of a call it ends with no result. */
  #updated(
    notification: SessionNotification,
    written: string | undefined
  ): void {
    const { update } = notification;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          this.#streamed("text", update.content.text);
        }
        return;
      case "agent_thought_chunk":
        if (update.content.type === "text") {
          this.#streamed("thinking", update.content.text);
        }
        return;
      case "tool_call":
        this.#called(update.toolCallId, update.name ?? update.title, update);
        return;
      case "tool_call_update":
        if (this.#calls.get(update.toolCallId)?.ended) {
          return;
        }
        if (!this.#calls.has(update.toolCallId)) {
          this.#called(
            update.toolCallId,
            update.name ?? update.title ?? "tool",
            update
          );
        }
        if (update.status === "completed" || update.status === "failed") {
          this.#answered(
            update.toolCallId,
            update.status === "failed",
            update,
            written
          );
          if (update.status === "completed") {
            this.#proven(update.toolCallId, update);
          } else {
            this.#callTools.delete(update.toolCallId);
            this.#ran.delete(update.toolCallId);
          }
        }
        return;
      case "available_commands_update":
        this.#commands = commandsOf(update.availableCommands);
        this.#emit({
          type: "system",
          subtype: "commands_changed",
          commands: this.#commands,
        });
        return;
      case "usage_update":
        this.#context = { used: update.used, size: update.size };
        return;
      case "config_option_update":
        this.#options = { configOptions: update.configOptions };
        return;
      case "session_info_update":
        if (update.title && this.sessionId) {
          const { title } = update;
          this.#note(this.sessionId, (note) => ({ ...note, title }));
        }
        this.#emit({ type: "raw", harness: "agy", message: update });
        return;
      case "plan":
      case "plan_update":
      case "plan_removed":
      case "notice":
        // No frame of CawCo's draws them yet: forwarded whole.
        this.#emit({ type: "raw", harness: "agy", message: update });
        return;
      // CawCo's own sends, which it says itself; agy's mode, which CawCo
      // never sets; and what agy 1.5.18 does not send: compaction, its
      // subagents (denied) and whole messages.
      case "user_message_chunk":
      case "current_mode_update":
      case "compaction_update":
      case "compaction_summary_chunk":
      case "subagent_update":
      case "session_message":
      case "session_message_chunk":
        return;
      default:
        unhandled("session update", update);
    }
  }

  /** A part of agy's reply or thinking as it streams, kept for the whole frame it closes into. */
  #streamed(kind: "text" | "thinking", text: string): void {
    const turn = this.#turn;
    if (turn) {
      turn.said = true;
      if (kind === "text") {
        turn.text += text;
      } else {
        turn.thinking += text;
      }
    }
    this.#emit({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta:
          kind === "text"
            ? { type: "text_delta", text }
            : { type: "thinking_delta", thinking: text },
      },
    });
  }

  /** The thinking and text said since the last flush, each as a whole frame. */
  #flush(): void {
    const turn = this.#turn;
    if (!turn) {
      return;
    }
    if (turn.thinking) {
      this.#emit({
        type: "assistant",
        uuid: crypto.randomUUID(),
        parent_tool_use_id: null,
        message: { content: [{ type: "thinking", thinking: turn.thinking }] },
      });
    }
    if (turn.text) {
      if (this.sessionId) {
        keepCarried(this.#carryHome(), this.sessionId, [
          { who: "agent", text: turn.text },
        ]);
      }
      this.#emit({
        type: "assistant",
        uuid: crypto.randomUUID(),
        parent_tool_use_id: null,
        message: {
          ...(this.#model ? { model: this.#model } : {}),
          content: [{ type: "text", text: turn.text }],
        },
      });
    }
    turn.thinking = "";
    turn.text = "";
  }

  /** A tool call agy began, as a tool use. */
  #called(id: string, name: string, update: { rawInput?: unknown }): void {
    if (this.#calls.has(id)) {
      return;
    }
    this.#calls.set(id, { ended: false, name, since: Date.now() });
    this.#callTools.set(id, name);
    if (this.#turn) {
      this.#turn.said = true;
    }
    this.#flush();
    this.#emit({
      type: "assistant",
      uuid: `${id}:call`,
      parent_tool_use_id: null,
      message: {
        content: [
          { type: "tool_use", id, name, input: { ...argsOf(update.rawInput) } },
        ],
      },
    });
  }

  /** A tool call ended, as its result. */
  #answered(
    id: string,
    failed: boolean,
    update: { content?: readonly unknown[] | null; rawOutput?: unknown },
    written: string | undefined
  ): void {
    const call = this.#calls.get(id);
    this.#calls.set(id, {
      ended: true,
      name: call?.name ?? "tool",
      since: call?.since ?? Date.now(),
    });
    this.#writtenAt.delete(id);
    this.#emit({
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            content: callResult(update, written),
            is_error: failed,
          },
        ],
      },
    });
  }

  // ---------------------------------------------------------- asks

  /** An ask agy raised: allowed at once in a mode that asks nothing, else parked with CawCo until answered. */
  async #asked(
    params: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> {
    const allow = params.options.find(
      (option) => option.kind === "allow_once" || option.kind === "allow_always"
    )?.optionId;
    const reject = params.options.find(
      (option) =>
        option.kind === "reject_once" || option.kind === "reject_always"
    )?.optionId;
    // In agy's own home its own settings decide what it asks, and every ask
    // reaches the person.
    if (!this.#own && UNASKED.has(this.#mode) && allow) {
      return { outcome: { outcome: "selected", optionId: allow } };
    }
    const { toolCall } = params;
    let requestId = `agy-${toolCall.toolCallId}`;
    while (this.#asks.has(requestId)) {
      requestId = `${requestId}+`;
    }
    const answer = Deferred.makeUnsafe<RequestPermissionResponse>();
    const call = askedCall(
      toolCall.name ?? toolCall.title ?? "tool",
      argsOf(toolCall.rawInput)
    );
    const asked: AgyHostAsk = {
      requestId,
      toolName: call.toolName,
      input: call.input,
      toolUseId: toolCall.toolCallId,
    };
    this.#asks.set(requestId, { allow, reject, answer, asked });
    this.#ctx.permission(asked);
    // The promise edge of the person's answer.
    return await runPromise(Deferred.await(answer));
  }

  #settle(requestId: string, response: RequestPermissionResponse): boolean {
    const ask = this.#asks.get(requestId);
    if (!ask) {
      return false;
    }
    this.#asks.delete(requestId);
    Deferred.doneUnsafe(ask.answer, Exit.succeed(response));
    return true;
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    const ask = this.#asks.get(requestId);
    if (!ask) {
      return;
    }
    const chosen = result.behavior === "allow" ? ask.allow : ask.reject;
    this.#settle(
      requestId,
      chosen
        ? { outcome: { outcome: "selected", optionId: chosen } }
        : { outcome: { outcome: "cancelled" } }
    );
  }

  withdrawPermission(requestId: string, _message?: string): void {
    const ask = this.#asks.get(requestId);
    this.#settle(
      requestId,
      ask?.reject
        ? { outcome: { outcome: "selected", optionId: ask.reject } }
        : { outcome: { outcome: "cancelled" } }
    );
  }

  /** Every parked ask answered cancelled, as ACP asks of a cancelled turn, and said so to CawCo. */
  #cancelAsks(): void {
    for (const requestId of [...this.#asks.keys()]) {
      if (this.#settle(requestId, { outcome: { outcome: "cancelled" } })) {
        this.#ctx.permissionResolved(requestId, "cancelled");
      }
    }
  }

  // ---------------------------------------------------------- turns

  /**
   * A send, its pictures read first and the fleet's `UserPromptSubmit`
   * hooks run on it: a picture agy or Google can't take, or a hook's block,
   * fails the send in words and nothing reaches agy; what the hooks say
   * goes after its words.
   */
  send(message: SentMessage, extras: TurnExtras): void {
    const images = extras.images ?? [];
    const text = textOf(message, extras);
    this.#unread.add(message.uuid);
    // The prompt is handed to agy under the permit and answered after it.
    const handed = this.#sending.withPermit(
      sendRefusal(images, text).pipe(
        Effect.flatMap((refused) =>
          refused
            ? Effect.fail(new Error(refused))
            : fromPromise(() => this.#promptHooks(text))
        ),
        Effect.flatMap((hooked) =>
          "refused" in hooked
            ? Effect.fail(new Error(agyWords.promptRefused(hooked.refused)))
            : Effect.sync(() => ({
                answered: this.#prompt(
                  message.uuid,
                  [
                    ...images.map((image): ContentBlock => ({
                      type: "image",
                      mimeType: image.mediaType,
                      data: image.data,
                    })),
                    { type: "text", text },
                    ...hooked.context.map((said): ContentBlock => ({
                      type: "text",
                      text: said,
                    })),
                  ],
                  false,
                  images.length
                ),
              }))
        )
      )
    );
    runPromise(handed)
      .then(({ answered }) => answered)
      .catch((error: unknown) => {
        this.#unread.delete(message.uuid);
        this.#ctx.rejected(message.uuid, error);
      });
  }

  /** The fleet's `UserPromptSubmit` hooks on a send; none in agy's own home, which runs under its own settings. */
  #promptHooks(
    text: string
  ): Promise<{ readonly refused: string } | { readonly context: string[] }> {
    return this.#own
      ? Promise.resolve({ context: [] })
      : this.#fleet.prompted(text);
  }

  /** The fleet's `Stop` hooks on a turn that ended: a block's reason is sent as a prompt that starts another turn. */
  async #stopHooks(): Promise<void> {
    const reason = await this.#fleet.stopped();
    if (reason !== undefined && !this.#stopped) {
      await this.#prompt(
        crypto.randomUUID(),
        [{ type: "text", text: reason }],
        true,
        0
      );
    }
  }

  /** One prompt to agy; the turn ends with the last prompt's answer. */
  async #prompt(
    uuid: string,
    blocks: ContentBlock[],
    again: boolean,
    pictures: number
  ): Promise<void> {
    const connection = this.#connection();
    const { sessionId } = this;
    if (!sessionId) {
      throw new Error(agyWords.ended);
    }
    // A prompt sent while agy holds an earlier one open (its turn over, a
    // command in the background or a wake-up pending) goes to agy as a
    // prompt of its own: agy answers the earlier one at once and runs this
    // one, its pending work running on (`assets/b5b3ca96/REPORT.md` §2).
    // Nothing is cancelled.
    if (!this.#turn) {
      this.#beginTurn();
    }
    this.#prompts += 1;
    if (this.#turn) {
      this.#turn.pictures += pictures;
    }
    if (!again) {
      this.#unread.delete(uuid);
      this.#emit({
        type: "system",
        subtype: MESSAGES_READ,
        read: [uuid],
        session_id: sessionId,
      });
      keepCarried(this.#carryHome(), sessionId, [
        {
          who: "person",
          text: wordsOf(blocks),
          ...(pictures > 0 ? { pictures } : {}),
        },
      ]);
    }
    // A new conversation's first prompt says what the one set aside held.
    const carry = this.#carry;
    this.#carry = undefined;
    let answer: unknown;
    try {
      answer = await connection.agent.request(methods.agent.session.prompt, {
        sessionId,
        prompt: carry ? [{ type: "text", text: carry }, ...blocks] : blocks,
      });
      await this.#drained();
    } catch (error) {
      await this.#drained();
      this.#prompts = Math.max(0, this.#prompts - 1);
      // A turn agy's Stop ended already has said its end.
      if (this.#prompts === 0 && this.#turn) {
        // A session the host refused ends its turn in the refusal's words,
        // not in the connection's close they caused.
        this.#endTurn("end_turn", { words: this.#refused ?? saidBy(error) });
      }
      return;
    }
    this.#prompts = Math.max(0, this.#prompts - 1);
    await this.#promptAnswered(
      sessionId,
      { uuid, blocks, again, pictures },
      answer
    );
  }

  /** A prompt's answer: the turn's end once it is the last prompt's, or the prompt sent again where agy answered it empty or refused it as invalid. */
  async #promptAnswered(
    sessionId: string,
    sent: {
      again: boolean;
      blocks: ContentBlock[];
      pictures: number;
      uuid: string;
    },
    answer: unknown
  ): Promise<void> {
    const { uuid, blocks, again, pictures } = sent;
    const { stopReason, tokens } = promptAnswer(answer);
    if (tokens) {
      this.#turn?.tokens.push(tokens);
    }
    // A later prompt steered into this turn carries it on.
    if (this.#prompts > 0) {
      return;
    }
    // agy answers its last prompt once nothing of the conversation runs
    // on, or as a cancel ended it all: no call of it is pending now.
    this.#dropPending();
    const turn = this.#turn;
    // Its turn already ended at agy's Stop ({@link #turnEvent}).
    if (!turn) {
      return;
    }
    const empty = stopReason === "end_turn" && !turn.said;
    if (empty && this.#start.launch.methodId === "agent-platform") {
      if (again) {
        this.#endTurn(stopReason, { words: agyWords.emptyTurn });
        return;
      }
      await this.#restart();
      await this.#prompt(uuid, blocks, true, pictures);
      return;
    }
    const fault = this.#faultOf(turn, sessionId, stopReason);
    if (fault?.atLimit === undefined && fault?.invalid) {
      await this.#invalidEnd(uuid, blocks, again, stopReason, fault);
      return;
    }
    this.#endTurn(stopReason, fault);
  }

  /**
   * A turn Google refused as invalid: its conversation set aside for a new
   * one. A turn that carried no picture of its own failed of what the
   * conversation already held, and goes again in the new one at once; a
   * turn with pictures ends naming them.
   */
  async #invalidEnd(
    uuid: string,
    blocks: ContentBlock[],
    again: boolean,
    stopReason: string,
    fault: Exclude<TurnFault, { atLimit: true }>
  ): Promise<void> {
    const pictures = this.#turn?.pictures ?? 0;
    const retry = !again && pictures === 0;
    try {
      await runPromise(
        this.#sending.withPermit(fromPromise(() => this.#setAside(retry)))
      );
    } catch (error) {
      this.#endTurn(stopReason, { words: saidBy(error) });
      return;
    }
    if (retry) {
      await this.#prompt(uuid, blocks, true, 0);
      return;
    }
    this.#endTurn(
      stopReason,
      pictures > 0 ? { words: agyWords.pictureRefused(fault.said) } : fault
    );
  }

  /**
   * The running conversation set aside: a new one opened on the same agy,
   * which keeps what the old one kept and says it first in its next prompt
   * (but the prompt about to go again, which goes as itself).
   */
  async #setAside(retrying: boolean): Promise<void> {
    const home = this.#carryHome();
    const old = this.sessionId;
    const kept = old ? carriedOf(home, old) : [];
    const carried =
      retrying && kept.at(-1)?.who === "person" ? kept.slice(0, -1) : kept;
    const window = this.#context?.size;
    await this.#openSession(undefined, this.#append);
    this.#context = undefined;
    this.#carry =
      carried.length > 0 ? carriedWords(carried, window) : undefined;
    if (this.sessionId) {
      keepCarried(home, this.sessionId, kept);
    }
    if (old) {
      // agy's store keeps it; its live session is let go.
      this.#connection()
        .agent.request(methods.agent.session.close, { sessionId: old })
        .catch(() => undefined);
    }
  }

  /** agy started again in place of the running one, its credential read afresh, the session resumed. */
  async #restart(): Promise<void> {
    const sessionId = this.sessionId ?? undefined;
    this.#endAgy();
    await this.#startAgy();
    await this.#openSession(sessionId, this.#append);
  }

  /** What the turn's prompts spent, as one request of its model. */
  #turnUsage() {
    const tokens = this.#turn?.tokens ?? [];
    if (tokens.length === 0) {
      return [];
    }
    const spent = tokens.reduce((sum, one) => ({
      input: sum.input + one.input,
      output: sum.output + one.output,
      cacheRead: sum.cacheRead + one.cacheRead,
      cacheWrite: sum.cacheWrite + one.cacheWrite,
    }));
    return [pricedRequest(this.#model ?? "agy", spent, Date.now())];
  }

  /**
   * Where CawCo keeps what the conversation said (agy-carry.ts): its
   * account's home, or for agy's own home, which CawCo never writes, a dir
   * of CawCo's.
   */
  #carryHome(): string {
    return this.#own ? agyOwnCarryHome() : this.#start.launch.home;
  }

  /** Where the conversation's steps are read (agy-outcome.ts). */
  #steps(): AgySteps {
    return { home: this.#start.launch.home, own: this.#own };
  }

  /** How the turn ended badly, as agy's store says, if it did. */
  #faultOf(turn: Turn | undefined, sessionId: string, stopReason: string) {
    return turn
      ? turnFault(this.#steps(), sessionId, turn.after, stopReason, Date.now())
      : undefined;
  }

  /** The turn's end: its last words whole, how it ended, and the session at rest. */
  #endTurn(stopReason: string, fault?: TurnFault): void {
    const turn = this.#turn;
    const lastText = turn?.text ?? "";
    this.#flush();
    const sessionId = this.sessionId ?? "";
    const turnUsage = this.#turnUsage();
    this.#emit({
      type: "result",
      uuid: crypto.randomUUID(),
      subtype: fault ? "error_during_execution" : "success",
      is_error: fault !== undefined,
      result: lastText,
      turnUsage,
      total_cost_usd: turnUsage.reduce(
        (sum, one) => sum + (one.costUsd ?? 0),
        0
      ),
      ...(fault ? { errors: [fault.words] } : {}),
      ...(fault?.atLimit ? { atLimit: true } : {}),
      ...(this.#context ? { contextTokens: this.#context.used } : {}),
      ...(stopReason === "cancelled" ? { stop_reason: "interrupted" } : {}),
      wakes: this.#wakes(),
      session_id: sessionId,
    });
    this.#turn = undefined;
    for (const [id, call] of this.#calls) {
      if (call.ended) {
        this.#calls.delete(id);
      }
    }
    this.#writtenAt.clear();
    this.#ctx.busy(false);
    if (stopReason === "end_turn" && !fault && !this.#own) {
      this.#stopHooks().catch((error: unknown) => this.#ctx.failed(error));
    }
  }

  /** What will wake the session as its turn ends: its commands in the background and its wake-ups, each a call still running. */
  #wakes(): { background: number; scheduled: number } {
    const pending = this.#pending();
    const scheduled = pending.filter(
      (call) => AGY_TOOLS[call.name] === "schedule"
    ).length;
    return { background: pending.length - scheduled, scheduled };
  }

  /** Every call still running forgotten: agy ended them all. */
  #dropPending(): void {
    for (const [id, call] of this.#calls) {
      if (!call.ended) {
        this.#calls.delete(id);
      }
    }
  }

  /**
   * The running turn cancelled. agy's cancel ends every command it moved to
   * the background and every wake-up it set (`assets/b5b3ca96/REPORT.md`
   * §3), so none is sent while no turn of CawCo's runs: an interrupt then
   * has nothing to stop, and agy's pending work runs on.
   */
  async interrupt(): Promise<void> {
    const { sessionId } = this;
    this.#cancelAsks();
    if (sessionId && this.#turn && this.#prompts > 0) {
      await this.#connection().agent.notify(methods.agent.session.cancel, {
        sessionId,
      });
    }
  }

  async stop(): Promise<void> {
    if (this.#stopped) {
      return;
    }
    await this.interrupt().catch(() => undefined);
    this.#stopped = true;
    this.#fleet.end();
    const agy = this.#agy;
    this.#endAgy();
    await runPromise(Scope.close(this.#judge, Exit.void));
    if (agy) {
      await runPromise(
        Effect.promise(() => agy.child.exited).pipe(
          Effect.timeout(AGY_EXIT_WAIT),
          Effect.ignore
        )
      );
    }
    await this.#applyDeletes();
    const { tmp, dir } = this.#start.launch;
    if (tmp) {
      await rm(tmp, { recursive: true, force: true });
    }
    // A session dir that never held a conversation names none to delete it
    // with: it goes with its host.
    if (dir && !this.sessionId) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * The conversations deleted from the account's home kept out of agy's
   * shared files once this agy has ended, as one running may have written
   * them back (agy-store-files.ts). None in agy's own home, which CawCo
   * never writes.
   */
  async #applyDeletes(): Promise<void> {
    const { accountId } = this.#start.launch;
    if (accountId) {
      await applyAgyDeletes(accountStore(accountId)).catch((error: unknown) =>
        console.warn(
          `[agy] ${this.#start.spec.instanceId}: keeping deleted conversations out failed: ${saidBy(error)}`
        )
      );
    }
  }

  /** The host's state, as its snapshot says it. */
  state(): AgyHostState {
    return {
      sessionId: this.sessionId,
      busy: this.#turn !== undefined,
      held: [...this.#unread],
      pending: this.#pending(),
      asks: [...this.#asks.values()].map((ask) => ask.asked),
      ...(this.#version ? { version: this.#version } : {}),
      ...(this.#start.gateForm ? { gateForm: this.#start.gateForm } : {}),
      ...(this.#refused === undefined ? {} : { refused: this.#refused }),
    };
  }

  /** The model set on agy, then the session's thinking level on it, as its levels differ by model. */
  async #setModel(model: string | undefined): Promise<void> {
    const { sessionId } = this;
    if (!(model && sessionId)) {
      return;
    }
    this.#options = await this.#connection().agent.request(
      methods.agent.session.setConfigOption,
      { sessionId, configId: "model", value: model }
    );
    this.#model = model;
  }

  async #setEffort(effort: string | undefined): Promise<void> {
    const { sessionId } = this;
    if (!(effort && sessionId)) {
      return;
    }
    this.#effort = effort;
    const level = levelFor(effort, levelsOffered(this.#options));
    if (!level || currentOption(this.#options, "thought_level") === level) {
      return;
    }
    this.#options = await this.#connection().agent.request(
      methods.agent.session.setConfigOption,
      { sessionId, configId: "thought_level", value: level }
    );
  }

  #contextUsage() {
    const used = this.#context?.used ?? 0;
    const size = this.#context?.size ?? 0;
    return Promise.resolve({
      categories: [{ name: "Conversation", tokens: used, color: "blue" }],
      maxTokens: size,
      percentage: size > 0 ? Math.round((used / size) * 100) : 0,
      totalTokens: used,
    });
  }

  /** The launch's own credential, its header in CawCo's server already: acknowledged to the hub. */
  async #installCredential(
    credential: string,
    initial: boolean
  ): Promise<SessionCredentialInstall> {
    if (!initial || credential !== this.#start.sessionCredential) {
      throw new Error(agyWords.liveCredential);
    }
    await acknowledgeSessionCredential(credential);
    return {
      installed: true,
      harness: "agy",
      instanceId: this.#start.spec.instanceId,
    };
  }

  /** The credential the host was started with, proved to the hub again. */
  async #verifyCredential(): Promise<{ credential?: string }> {
    const credential = this.#start.sessionCredential;
    if (!credential) {
      throw new Error("This Antigravity session holds no CawCo credential.");
    }
    await acknowledgeSessionCredential(credential);
    return { credential };
  }

  readonly controls: SessionControls<"agy"> = {
    ...credentialControls(
      (credential, initial) => this.#installCredential(credential, initial),
      () => this.#verifyCredential()
    ),
    [CONTROL_INTERRUPT]: () => this.interrupt(),
    [CONTROL_SET_MODEL]: async (model) => {
      await this.#setModel(model);
      await this.#setEffort(this.#effort);
    },
    [CONTROL_SET_EFFORT]: (effort) => this.#setEffort(effort),
    [CONTROL_SET_PERMISSION_MODE]: (mode) => {
      const named = sharedModeNamed(mode);
      if (!named) {
        return Promise.reject(new Error(noMode(mode)));
      }
      this.#mode = named;
      return Promise.resolve({ permissionMode: named });
    },
    [CONTROL_SUPPORTED_MODELS]: () => Promise.resolve(this.#models),
    [CONTROL_SUPPORTED_COMMANDS]: () => Promise.resolve(this.#commands),
    [CONTROL_CONTEXT_USAGE]: () => this.#contextUsage(),
  };
}

/** An error's words as agy said them. */
const saidBy = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A session started in this host on `start`: its judge served, agy signed in, its session open. */
export const startAgyHost = async (
  start: AgyStart,
  ctx: AgyHostContext
): Promise<AgySession> => {
  const session = new AgySession(start, ctx);
  try {
    await session.open();
  } catch (error) {
    await session.stop().catch(() => undefined);
    throw error;
  }
  return session;
};

export type { AgySession };
