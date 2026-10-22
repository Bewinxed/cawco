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
 * `content` (agent delegation.ts).
 */
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

export const RESPONSE_FORMATS = ["concise", "detailed"] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

/** `response_format`, the same on every tool that has a whole record to give. */
const responseFormat = () =>
  z
    .enum(RESPONSE_FORMATS)
    .optional()
    .describe("detailed: the whole record, as JSON");

export interface McpTool {
  annotations?: ToolAnnotations;
  /** The call: arguments parsed, the domain answer run and presented. */
  call: (args: unknown) => Promise<CallToolResult>;
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

export interface ToolOptions<R, A> {
  annotations?: ToolAnnotations;
  /** The detailed form, when it is more than the answer as JSON (a picture beside it). */
  detailed?: Presenter<R, A>;
  /**
   * A tool with its own input error refuses unknown keys itself, as it
   * parses. What a harness is shown never says `additionalProperties:
   * false`: OpenCode 2.0.29's own `opencode.tool.input.repair` hook deletes
   * every key such a schema does not name, so a call would reach the hub
   * without the `__cawco` credential the CawCo plugin stamps into it.
   */
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
export function tool<T extends z.ZodRawShape, R>(
  name: string,
  description: string,
  input: T,
  /** The domain answer; `format`, for a tool whose detailed form reads more (find's neighbouring turns). */
  run: (args: z.infer<z.ZodObject<T>>, format: ResponseFormat) => Promise<R>,
  present: Presenter<R, z.infer<z.ZodObject<T>>>,
  options: ToolOptions<R, z.infer<z.ZodObject<T>>> = {}
): McpTool {
  const formats = (present as unknown) !== sentence;
  const shape = formats
    ? { ...input, response_format: responseFormat() }
    : input;
  const schema = options.inputError
    ? z.strictObject(shape, { error: options.inputError })
    : z.object(shape);
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(z.object(shape), {
      target: "draft-07",
      io: "input",
    }) as Record<string, unknown>,
    ...(options.annotations ? { annotations: options.annotations } : {}),
    call: async (args) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        // A tool's own input error is its whole answer; any other, what was wrong, then the shape.
        throw new Error(
          options.inputError ??
            `${z.prettifyError(parsed.error)}${options.inputHelp ? `\n${options.inputHelp}` : ""}`
        );
      }
      const { response_format: format, ...rest } = parsed.data as {
        response_format?: ResponseFormat;
      } & z.infer<z.ZodObject<T>>;
      const asked = rest as z.infer<z.ZodObject<T>>;
      const answer = await run(asked, format ?? "concise");
      if (format === "detailed") {
        return resultOf(
          options.detailed ? options.detailed(answer, asked) : asJson(answer)
        );
      }
      return resultOf(present(answer, asked));
    },
  };
}
