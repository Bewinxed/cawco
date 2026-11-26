/**
 * Usability feedback (core usability-feedback.ts): an agent's report of a
 * CawCo tool that refused it wrongly, left it no route, or that it worked
 * around, filed as an issue on CawCo's repository, or as a comment on the
 * issue already open for the same problem (the owner, ask_6c6a3972).
 *
 * It is on while the person allowed it (`supervisor_config`, asked once in
 * the dashboard) and a machine of the fleet signs in to GitHub, whose
 * sign-in files it, through the write door (writes.ts `issueOnce`), which
 * records it: the issue comes back on a synced repository as a task like
 * any outsider's, and a later report's comment comes back as CawCo's own.
 * Off, no
 * session is listed the tool, no refusal names it (delegation-mcp.ts), and
 * no machine's DevTools gate does (the `policy` item's `usabilityFeedback`).
 *
 * The tool's `tool` is an enum of CawCo's own tool names, so a report on
 * anything else is refused by its schema (ask_f10aaf6f). What the hub knows
 * to be private is taken out of every field before it leaves
 * (`scrubPrivate`), CawCo's own names kept: the issues are public.
 *
 * Every report of one problem lands on one issue: its fingerprint is the
 * tool and the refusal's identity (core `refusalIdentity`). The hub keeps
 * each session's refusals of each tool as the tool door hands them back
 * (`heard`), so a report quoting one is filed by the code the hub refused
 * with, whatever lists, counts and ids the agent's copy of its words holds.
 */

import { makeKeyedLock } from "@cawco/core/keyed-lock";
import type { InstanceRow } from "@cawco/core/protocol";
import {
  FEEDBACK_HOST,
  type FeedbackConsent,
  type FeedbackState,
  feedbackBody,
  feedbackFingerprint,
  feedbackMarker,
  feedbackTitle,
  firstClause,
  type HeardRefusal,
  type PrivateKnown,
  refusalIdentity,
  scrubPrivate,
} from "@cawco/core/usability-feedback";
import {
  USABILITY_FEEDBACK_TOOL,
  usabilityFeedbackWords as words,
} from "@cawco/core/words/usability-feedback";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Effect, Result } from "effect";
import { problem } from "elysia";
import { z } from "zod";
import type { HubLifetimeShape } from "./lifetime";
import { awayProblem } from "./machine-answers";
import { defineTool, refusalCode, withoutRefusalCode } from "./mcp-tool";
import type { Writes } from "./writes";

/** What a report came to: a new issue, or a comment on the one already open. */
interface Filed {
  kind: "opened" | "commented";
  url: string;
}

export interface UsabilityFeedbackDeps {
  /** Feedback turned on or off: every session's tools listed again, every machine sent the policy. */
  readonly changed: (on: boolean) => void;
  /** The person's answer (`supervisor_config.usability_feedback`). */
  readonly consent: () => FeedbackConsent;
  /** The hosts `machineId`'s gh signs in to (agent `CONTROL_GH_ACCOUNTS`); undefined when it did not answer. */
  readonly ghHosts: (
    machineId: string
  ) => Promise<readonly string[] | undefined>;
  /** Keeps the person's answer. */
  readonly keepConsent: (on: boolean) => void;
  /** The hub's lifetime: a report is filed on it. */
  readonly lifetime: HubLifetimeShape;
  /** The machines connected now. */
  readonly online: () => readonly string[];
  /** What the hub knows to be private, for a report `actor` files. */
  readonly privateKnown: (actor: InstanceRow) => PrivateKnown;
  /** The repository issues go to, `host/owner/repo` (config.ts `FEEDBACK_REPO_AT`). */
  readonly repo: string;
  /** The write door: a report is filed on a machine with its own sign-in (writes.ts `issueOnce`). */
  readonly writes: Pick<Writes, "issueOnce">;
}

/** The tool's definition: its `tool` is one of `names`, CawCo's own tools. */
const definitionOf = (names: readonly [string, ...string[]]) =>
  defineTool(
    USABILITY_FEEDBACK_TOOL,
    words.tool.description,
    {
      tool: z.enum(names).describe(words.tool.tool),
      wanted: z.string().trim().min(1).describe(words.tool.wanted),
      got: z.string().trim().min(1).describe(words.tool.got),
      workaround: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(words.tool.workaround),
    },
    (filed: Filed) =>
      filed.kind === "opened"
        ? words.opened(filed.url)
        : words.commented(filed.url),
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }
  );

/** `names` with this tool's own taken out, as the enum takes them; never empty, as the tool list never is. */
const reportable = (names: readonly string[]): [string, ...string[]] => {
  const [first, ...rest] = [...new Set(names)]
    .filter((name) => name !== USABILITY_FEEDBACK_TOOL)
    .sort();
  if (first === undefined) {
    throw new Error("usability_feedback was built with no CawCo tool to name");
  }
  return [first, ...rest];
};

/** The definition last built, by the names it was built of. */
let built:
  { definition: ReturnType<typeof definitionOf>; key: string } | undefined;

/**
 * The tool's definition, its `tool` an enum of `names` (CawCo's own tools,
 * delegation-mcp.ts `cawcoToolNames`), built once for them.
 */
export const feedbackDefinition = (names: readonly string[]) => {
  const enumed = reportable(names);
  const key = enumed.join(",");
  if (built?.key !== key) {
    built = { key, definition: definitionOf(enumed) };
  }
  return built.definition;
};

/** A result's words: its text parts, joined. */
const wordsOf = (result: CallToolResult): string =>
  result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

export const createUsabilityFeedback = (deps: UsabilityFeedbackDeps) => {
  /** The machines whose gh signs in to GitHub, as last read on each. */
  const senders = new Set<string>();
  const on = (): boolean => deps.consent() === true && senders.size > 0;
  /**
   * The refusals each session was sent while feedback was on, by session
   * and tool, oldest first: one of each (its code and first clause), the
   * newest time it came. Held until the session's row goes (`forget`).
   */
  const heardBy = new Map<string, Map<string, HeardRefusal[]>>();
  /**
   * Filings of one fingerprint, one at a time: each looks for the open issue
   * only once the filing before it has ended, so reports of one problem that
   * arrive together find the issue the first one opened.
   */
  const byFingerprint = makeKeyedLock();

  /** Runs `change`, and says so when it turned feedback on or off. */
  const moving = (change: () => void): void => {
    const before = on();
    change();
    const after = on();
    if (before !== after) {
      console.info(
        `[feedback] usability feedback is ${after ? "on" : "off"} for agents`
      );
      deps.changed(after);
    }
  };

  /** Reads whether `machineId` signs in to GitHub; a machine that did not answer keeps what was read before. */
  const readMachine = async (machineId: string): Promise<void> => {
    const hosts = await deps.ghHosts(machineId);
    if (hosts === undefined) {
      return;
    }
    moving(() => {
      if (hosts.includes(FEEDBACK_HOST)) {
        senders.add(machineId);
      } else {
        senders.delete(machineId);
      }
    });
  };

  /** The machine a report from `actor` is filed through: its own when it signs in to GitHub, else another that does, online. */
  const senderFor = (actor: InstanceRow): string | undefined => {
    const online = new Set(deps.online());
    if (senders.has(actor.machineId) && online.has(actor.machineId)) {
      return actor.machineId;
    }
    return [...senders].find((machineId) => online.has(machineId));
  };

  /** `actor`'s report, scrubbed, filed once: a new issue, or a comment on the open one; `names` are CawCo's own tools, kept by the scrub. */
  const file = async (
    actor: InstanceRow,
    names: readonly string[],
    asked: { got: string; tool: string; wanted: string; workaround?: string }
  ) => {
    if (!on()) {
      return problem(409, { code: "feedback-off", detail: words.off });
    }
    const sender = senderFor(actor);
    if (!sender) {
      // Feedback is on, so a machine signs in to GitHub: none is online.
      const [away = ""] = senders;
      return awayProblem(away, words.noSender);
    }
    const known = deps.privateKnown(actor);
    const scrub = (text: string): string => scrubPrivate(text, known, names);
    const report = {
      tool: asked.tool,
      harness: actor.harness,
      wanted: scrub(asked.wanted),
      got: scrub(asked.got),
      ...(asked.workaround ? { workaround: scrub(asked.workaround) } : {}),
    };
    // The refusals heard are scrubbed as the report is, so the two compare
    // alike.
    const heard = (heardBy.get(actor.id)?.get(report.tool) ?? []).map(
      (refusal) => ({ ...refusal, words: scrub(refusal.words) })
    );
    const fingerprint = feedbackFingerprint(
      report.tool,
      refusalIdentity(report.got, heard)
    );
    const outcome = await deps.lifetime.run(
      byFingerprint.withLock(
        fingerprint,
        Effect.result(
          deps.writes.issueOnce({
            by: "hub",
            projectId: null,
            target: { machine: sender, repo: deps.repo },
            title: feedbackTitle(report),
            body: feedbackBody(report, fingerprint),
            marker: feedbackMarker(fingerprint),
            search: fingerprint,
          })
        )
      )
    );
    if (Result.isFailure(outcome)) {
      const { failure } = outcome;
      if (failure.reason === "machine") {
        // A sign-in gone since it was read: read again, so the tool goes
        // from the lists when no machine has one.
        await readMachine(sender);
        return problem(422, {
          code: "feedback-not-filed",
          detail: words.failed(failure.words),
        });
      }
      return problem(502, {
        code: "feedback-not-filed",
        detail: words.failed(failure.words),
      });
    }
    const made = outcome.success;
    const url = made.comment?.url ?? made.item?.url;
    if (!url) {
      return problem(502, {
        code: "feedback-not-filed",
        detail: words.failed("the forge named no issue it filed."),
      });
    }
    const filed: Filed = {
      kind: made.existing ? "commented" : "opened",
      url,
    };
    console.info(
      `[feedback] ${actor.id}'s report on ${report.tool} ${filed.kind === "opened" ? "opened" : "commented on"} ${filed.url}`
    );
    return filed;
  };

  return {
    /** Whether agents are listed the tool and refusals name it now. */
    on,
    /** What the dashboard reads. */
    state: (): FeedbackState => ({
      consent: deps.consent(),
      signedIn: senders.size > 0,
    }),
    /** The person's answer, kept. */
    setConsent: (allowed: boolean): void => {
      moving(() => deps.keepConsent(allowed));
    },
    /** A machine connected: whether it signs in to GitHub, read again. */
    readMachine,
    /** Every connected machine read again: the dashboard asks before it shows the answer. */
    readAll: async (): Promise<void> => {
      await Promise.all(
        deps.online().map((machineId) => readMachine(machineId))
      );
    },
    /** The tool, bound to the session that calls it, its enum CawCo's own tools `names`. */
    tool: (actor: InstanceRow, names: readonly string[]) =>
      feedbackDefinition(names).run((asked) => file(actor, names, asked)),
    /**
     * The tool door's hand-back of `actorId`'s call of `name`: a refusal,
     * while feedback is on, kept for a report of it to be grouped by
     * (`file`). Answers the result without the refusal's code, as the
     * harness reads it (mcp-tool.ts `REFUSAL_CODE_META`).
     */
    heard: (
      actorId: string,
      name: string,
      result: CallToolResult
    ): CallToolResult => {
      const sent = withoutRefusalCode(result);
      if (!(result.isError && on()) || name === USABILITY_FEEDBACK_TOOL) {
        return sent;
      }
      const code = refusalCode(result);
      const said = wordsOf(sent);
      const clause = firstClause(said);
      const tools = heardBy.get(actorId) ?? new Map<string, HeardRefusal[]>();
      const refusals = (tools.get(name) ?? []).filter(
        (each) => each.code !== code || firstClause(each.words) !== clause
      );
      tools.set(name, [
        ...refusals,
        { ...(code ? { code } : {}), words: said },
      ]);
      heardBy.set(actorId, tools);
      return sent;
    },
    /** A session's row went: its refusals heard go with it. */
    forget: (actorId: string): void => {
      heardBy.delete(actorId);
    },
    /**
     * A tool's result as the agent reads it: a refusal of one of CawCo's own
     * tools ends with the line naming usability_feedback while feedback is
     * on. This tool's own refusals carry none.
     */
    withLine: (name: string, result: CallToolResult): CallToolResult => {
      if (!(result.isError && on()) || name === USABILITY_FEEDBACK_TOOL) {
        return result;
      }
      const content = [...result.content];
      const at = content.findLastIndex((part) => part.type === "text");
      const last = content[at];
      if (last?.type === "text") {
        content[at] = { ...last, text: `${last.text}\n\n${words.refusalLine}` };
      } else {
        content.push({ type: "text", text: words.refusalLine });
      }
      return { ...result, content };
    },
  };
};

export type UsabilityFeedback = ReturnType<typeof createUsabilityFeedback>;
