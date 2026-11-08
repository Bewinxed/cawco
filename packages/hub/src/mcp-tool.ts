/**
 * One CawCo tool, as every harness's model reads it: the one door between
 * a tool's domain answer and the words an agent decides on.
 *
 * A tool's `run` answers its domain value once, typed, the same whoever
 * asks: the shape the hub's HTTP routes answer programs, the dashboard and
 * the app. Its presenter renders that value as the agent reads it (names,
 * titles, states, times in plain words, the short handle a later call takes).
 * `response_format: "detailed"` answers the value itself, as JSON.
 *
 * The answer is `content` only. Claude Code 2.1.302 and OpenCode 2.0.29
 * hand the model a result's `structuredContent` in place of its `content`
 * whenever it carries one, with or without an `outputSchema` (measured
 * 2026-10-22: a stub tool's `content` never reached either model), so a
 * result carries none: what the model reads is this text. pi reads
 * `content` (agent delegation.ts). Beside it a tool that ends the turn
 * carries one `_meta` mark ({@link ToolOptions.endsTurn}).
 */

import { END_TURN_META } from "@cawco/core/no-reply";
import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** A picture beside the words: a canvas's latest, as `artifact_read` answers it. */
export interface Picture {
  data: string;
  mimeType: "image/png";
}

/** What a presenter gives: words, or words with pictures. */
export type Presented = string | { pictures: Picture[]; text: string };

/** How an agent reads a tool's answer, knowing what the call asked. */
export type Presenter<R, A = never> = (answer: R, asked: A) => Presented;

/**
 * A tool whose answer is a sentence already: there is nothing more to give,
 * so it takes no `response_format`.
 */
export const sentence: Presenter<string, unknown> = (text) => text;

/** The answer whole, as the hub keeps it. */
const asJson = (answer: unknown): Presented => JSON.stringify(answer);

const RESPONSE_FORMATS = ["concise", "detailed"] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/**
 * `response_format`, the same on every tool that has a whole record to give.
 * Its meaning is said once, in the server's instructions (delegation-tools.ts
 * `ANSWERS`), not again on each of the tools that carry it.
 */
const responseFormat = () => z.enum(RESPONSE_FORMATS).optional();

/**
 * The one key CawCo adds to a call's arguments that no tool takes: the
 * session credential and call id CawCo's OpenCode plugin stamps into each
 * `cawco_*` call (agent opencode-plugin.ts `admit`), which the hub reads and
 * takes off before a tool runs (delegation-mcp.ts `answer`). Claude Code
 * sends its tool_use id in `_meta` and pi its call id beside the arguments
 * (agent delegation.ts `callDelegationTool`), so neither adds a key.
 *
 * What a harness is shown never says `additionalProperties: false`: OpenCode's
 * own `opencode.tool.input.repair` hook deletes every key such a schema does
 * not name (anomalyco/opencode packages/core/src/plugin/tool-input-repair.ts:
 * `if (!declared && schema.additionalProperties === false && !patterned &&
 * !composed)`), and the refusal is said at the call, by the hub, either way.
 */
export const STAMPED_KEY = "__cawco";

export interface McpTool {
  annotations?: ToolAnnotations;
  /** The call: arguments parsed, the domain answer run and presented. */
  call: (args: unknown) => Promise<CallToolResult>;
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  /** Why `args` is not a call of this tool, in the words its call throws; undefined when it parses. */
  refusal: (args: unknown) => string | undefined;
}

export interface ToolOptions<R, A> {
  annotations?: ToolAnnotations;
  /** The detailed form, when it is more than the answer as JSON (a picture beside it). */
  detailed?: Presenter<R, A>;
  /**
   * Its result ends the turn at the call: no model step follows, so nothing
   * is written after it (core no-reply.ts {@link END_TURN_META}).
   */
  endsTurn?: true;
  /** The whole answer to a call that does not parse, in place of zod's words and {@link inputHelp}. */
  inputError?: string;
  /** One sentence on the input's shape, after what a malformed call got wrong. */
  inputHelp?: string;
}

const resultOf = (presented: Presented): CallToolResult =>
  typeof presented === "string"
    ? { content: [{ type: "text", text: presented }] }
    : {
        content: [
          { type: "text", text: presented.text },
          ...presented.pictures.map((picture) => ({
            type: "image" as const,
            data: picture.data,
            mimeType: picture.mimeType,
          })),
        ],
      };

/**
 * One tool: its zod input as JSON Schema (with `response_format` when its
 * answer is more than a sentence), and its call, which parses the input,
 * runs it, and presents the answer.
 */
export function tool<T extends z.ZodRawShape, R, N extends string = string>(
  name: N,
  description: string,
  input: T,
  /** The domain answer; `format`, for a tool whose detailed form reads more (find's neighbouring turns). */
  run: (args: z.infer<z.ZodObject<T>>, format: ResponseFormat) => Promise<R>,
  present: Presenter<R, z.infer<z.ZodObject<T>>>,
  options: ToolOptions<R, z.infer<z.ZodObject<T>>> = {}
): McpTool & { name: N } {
  const formats = (present as unknown) !== sentence;
  const shape = formats
    ? { ...input, response_format: responseFormat() }
    : input;
  // Every tool refuses a key it does not take: a misspelt setting is said,
  // never dropped. The stamped key alone is admitted, and taken off here.
  const schema = z.strictObject(
    { ...shape, [STAMPED_KEY]: z.unknown().optional() },
    options.inputError ? { error: options.inputError } : undefined
  );
  const names = Object.keys(shape);
  const takes =
    names.length > 0
      ? `${name} takes: ${names.join(", ")}.`
      : `${name} takes no arguments.`;
  // A tool's own input error is its whole answer; any other, what was
  // wrong, what it takes when a key was not one, then the shape.
  const refusalOf = (error: z.ZodError): string => {
    const unknown = error.issues.some(
      (issue) => issue.code === "unrecognized_keys"
    );
    return (
      options.inputError ??
      [
        z.prettifyError(error),
        ...(unknown ? [takes] : []),
        ...(options.inputHelp ? [options.inputHelp] : []),
      ].join("\n")
    );
  };
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(z.object(shape), {
      target: "draft-07",
      io: "input",
    }) as Record<string, unknown>,
    ...(options.annotations ? { annotations: options.annotations } : {}),
    refusal: (args) => {
      const parsed = schema.safeParse(args);
      return parsed.success ? undefined : refusalOf(parsed.error);
    },
    call: async (args) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        throw new Error(refusalOf(parsed.error));
      }
      const {
        response_format: format,
        [STAMPED_KEY]: _stamp,
        ...rest
      } = parsed.data as {
        [STAMPED_KEY]?: unknown;
        response_format?: ResponseFormat;
      } & z.infer<z.ZodObject<T>>;
      const asked = rest as z.infer<z.ZodObject<T>>;
      const answer = await run(asked, format ?? "concise");
      const detailed = options.detailed ?? asJson;
      const result = resultOf(
        format === "detailed" ? detailed(answer, asked) : present(answer, asked)
      );
      return options.endsTurn
        ? { ...result, _meta: { [END_TURN_META]: true } }
        : result;
    },
  };
}
