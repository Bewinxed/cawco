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
import { dirname } from "node:path";
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
import type {
  AgyHostAsk,
  AgyHostCommand,
  AgyHostState,
} from "@cawco/core/harness/agy-host-state";
import type { ModelInfo } from "@cawco/core/harness/kinds";
import { type SharedMode, sharedModeNamed } from "@cawco/core/harness/modes";
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
  type PermissionResult,
  type SentMessage,
  type SlashCommand,
} from "@cawco/core/session-messages";
import { withPastedText } from "@cawco/core/transcript-rules";
import { unhandled } from "@cawco/core/unhandled";
import { pricedRequest } from "@cawco/core/usage/pricing";
import { agyWords } from "@cawco/core/words/agy";
import { Deferred, Effect, Exit, Scope, Semaphore } from "effect";
import type { SessionControls, TurnExtras } from "../harness";
import { acknowledgeSessionCredential } from "../session-identity";
import { carriedOf, carriedWords, keepCarried } from "./agy-carry";
import {
  argsOf,
  askedCall,
  callResult,
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
import { agyAnswerTo } from "./agy-judge";
import { type AgyChild, endGroup, signInAcp, startAcp } from "./agy-launch";
import { lastStep, type TurnFault, turnFault } from "./agy-outcome";
import { sendRefusal } from "./agy-pictures";
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
   * One send at a time from its pictures' check to agy taking it, so sends
   * reach agy in the order they came, and none while a conversation is set
   * aside for a new one.
   */
  readonly #sending = Semaphore.makeUnsafe(1);
  /** The carried record, said first in the next prompt of a new conversation (agy-carry.ts). */
  #carry: string | undefined;
  /** The judge's socket, served for as long as this scope is open. */
  readonly #judge = Effect.runSync(Scope.make());
  readonly #asks = new Map<string, ParkedAsk>();
  /** The sends handed to agy it has not taken yet, by uuid. */
  readonly #unread = new Set<string>();
  /** The prompts sent whose answers have not come. */
  #prompts = 0;
  #turn: Turn | undefined;
  /** The running turn's tool calls said as tool uses, by agy's id, and whether each result is said too. */
  readonly #calls = new Map<string, "running" | "ended">();
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
  }

  /** The session the judge answers for, read afresh at each call. */
  #judged() {
    const session = this;
    const denied = new Set(this.#start.denied);
    return {
      denied,
      get mode() {
        return session.#mode;
      },
      // A call raised outside a prompt CawCo sent (agy's own wake-up)
      // cannot be asked about: agy holds its ask until the client's next
      // request (issue #1461).
      get personTurn() {
        return session.#prompts > 0;
      },
      workspace: undefined,
    };
  }

  /** The judge served, agy started and signed in, and the session opened. */
  async open(): Promise<void> {
    const { launch } = this.#start;
    await makeFolder(dirname(launch.judgeSocket));
    const judged = this.#judged();
    await Effect.runPromise(
      serveAgyJudge(launch.judgeSocket, (line) =>
        agyAnswerTo(line, judged)
      ).pipe(Scope.provide(this.#judge))
    );
    await this.#startAgy();
    const resumed = this.#start.spec.resume?.sessionKey;
    await this.#openSession(resumed, this.#append);
  }

  /** agy started, `initialize`d and signed in by the account's method, and whether it takes appended words noted. */
  async #startAgy(): Promise<void> {
    const { launch } = this.#start;
    // Its end, said once the process this start made is known.
    const holder: { agy?: AgyProcess; why?: string } = {};
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
        .onNotification(methods.client.session.update, ({ params }) =>
          this.#updated(params)
        ),
      {
        said: (text) => {
          process.stderr.write(text);
          // A failure quotes agy's last line: its last words before it ended.
          const lines = text.split("\n").filter((line) => line.trim());
          this.#stderr = lines.at(-1) ?? this.#stderr;
        },
        ended: (why) => {
          holder.why = why;
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
      this.#start.clientVersion
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
        ? { _meta: { antigravity: { systemPrompt: { append: APPEND } } } }
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

  #adopted(sessionId: string): void {
    this.sessionId = sessionId;
    this.#ctx.session(sessionId);
  }

  #connection(): ClientConnection {
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

  /** One of agy's `session/update`s, as the session's frames. */
  #updated(notification: SessionNotification): void {
    if (notification.sessionId !== this.sessionId) {
      return;
    }
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
        if (this.#calls.get(update.toolCallId) === "ended") {
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
          this.#answered(update.toolCallId, update.status === "failed", update);
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
      case "plan":
      case "plan_update":
      case "plan_removed":
      case "session_info_update":
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
        keepCarried(this.#start.launch.home, this.sessionId, [
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
    this.#calls.set(id, "running");
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
    update: { content?: readonly unknown[] | null; rawOutput?: unknown }
  ): void {
    this.#calls.set(id, "ended");
    this.#emit({
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            content: callResult(update),
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
    if (UNASKED.has(this.#mode) && allow) {
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
    return await Effect.runPromise(Deferred.await(answer));
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

  /** A send, its pictures read first: one agy or Google can't take fails the send in words naming it, and nothing reaches agy. */
  send(message: SentMessage, extras: TurnExtras): void {
    const images = extras.images ?? [];
    const text = textOf(message, extras);
    const blocks: ContentBlock[] = [
      ...images.map((image): ContentBlock => ({
        type: "image",
        mimeType: image.mediaType,
        data: image.data,
      })),
      { type: "text", text },
    ];
    this.#unread.add(message.uuid);
    // The prompt is handed to agy under the permit and answered after it.
    const handed = this.#sending.withPermit(
      sendRefusal(images, text).pipe(
        Effect.flatMap((refused) =>
          refused
            ? Effect.fail(new Error(refused))
            : Effect.sync(() => ({
                answered: this.#prompt(
                  message.uuid,
                  blocks,
                  false,
                  images.length
                ),
              }))
        )
      )
    );
    Effect.runPromise(handed)
      .then(({ answered }) => answered)
      .catch((error: unknown) => {
        this.#unread.delete(message.uuid);
        this.#ctx.rejected(message.uuid, error);
      });
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
    if (this.#prompts === 0) {
      this.#turn = {
        after: lastStep(this.#start.launch.home, sessionId),
        said: false,
        text: "",
        thinking: "",
        pictures: 0,
        tokens: [],
      };
    }
    this.#prompts += 1;
    if (this.#turn) {
      this.#turn.pictures += pictures;
    }
    this.#ctx.busy(true);
    if (!again) {
      this.#unread.delete(uuid);
      this.#emit({
        type: "system",
        subtype: MESSAGES_READ,
        read: [uuid],
        session_id: sessionId,
      });
      keepCarried(this.#start.launch.home, sessionId, [
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
    } catch (error) {
      this.#prompts = Math.max(0, this.#prompts - 1);
      if (this.#prompts === 0) {
        this.#endTurn("end_turn", { words: saidBy(error) });
      }
      return;
    }
    this.#prompts = Math.max(0, this.#prompts - 1);
    const { stopReason, tokens } = promptAnswer(answer);
    if (tokens) {
      this.#turn?.tokens.push(tokens);
    }
    // A later prompt steered into this turn carries it on.
    if (this.#prompts > 0) {
      return;
    }
    const empty = stopReason === "end_turn" && !this.#turn?.said;
    if (empty && this.#start.launch.methodId === "agent-platform") {
      if (again) {
        this.#endTurn(stopReason, { words: agyWords.emptyTurn });
        return;
      }
      await this.#restart();
      await this.#prompt(uuid, blocks, true, pictures);
      return;
    }
    const fault = this.#faultOf(this.#turn, sessionId, stopReason);
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
      await Effect.runPromise(
        this.#sending.withPermit(Effect.promise(() => this.#setAside(retry)))
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
    const { home } = this.#start.launch;
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

  /** How the turn ended badly, as agy's store says, if it did. */
  #faultOf(turn: Turn | undefined, sessionId: string, stopReason: string) {
    return turn
      ? turnFault(
          this.#start.launch.home,
          sessionId,
          turn.after,
          stopReason,
          Date.now()
        )
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
      wakes: { background: 0, scheduled: 0 },
      session_id: sessionId,
    });
    this.#turn = undefined;
    this.#calls.clear();
    this.#ctx.busy(false);
  }

  async interrupt(): Promise<void> {
    const { sessionId } = this;
    this.#cancelAsks();
    if (sessionId && this.#prompts > 0) {
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
    this.#endAgy();
    await Effect.runPromise(Scope.close(this.#judge, Exit.void));
  }

  /** The host's state, as its snapshot says it. */
  state(): AgyHostState {
    return {
      sessionId: this.sessionId,
      busy: this.#prompts > 0,
      held: [...this.#unread],
      asks: [...this.#asks.values()].map((ask) => ask.asked),
      ...(this.#version ? { version: this.#version } : {}),
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
