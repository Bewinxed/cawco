/**
 * What a session hands another as files in its `$TMPDIR/inputs/`: one entry
 * of `delegate`'s and `handoff`'s `inputs`. A path string is a file or a
 * folder on the caller's machine, admitted file by file and copied there, a
 * folder as its tree (agent inputs.ts); every other entry names
 * something the hub already holds, or carries its bytes, and the hub writes
 * it as a file itself (hub handed-inputs.ts `createHandedInputs`), refused in
 * words when the caller may not read it or it names nothing.
 *
 * An id an entry names is read as every tool reads one (hub handles.ts):
 * whole, by its short id, or by a handle like `cockpit#5a167bde`.
 *
 * - `report`: a work item's report, by its item id or its session's;
 * - `artifact`: a page or decision page with its picks and notes, a preview
 *   with a pass into it for the receiver's browser and its latest picture, a
 *   canvas as its scene and picture, a component canvas as its states files,
 *   stories and frames as its stage drew them;
 * - `pins`: an artifact's pins, each with its thread;
 * - `find`: a `find` hit's ref, as the turns around it;
 * - `attachment`: a file or picture a session's messages carried, by its id
 *   or its name as Files lists it ("Picture 2"), the caller's own session's
 *   unless `session` names another of its tree;
 * - `assets`: the files an item's `outputs` put in its project's folder, at
 *   any depth and landing with their folders, by its item id or its
 *   session's;
 * - `text`: words the caller writes, under `name`;
 * - `blob`: bytes the caller holds, base64, under `name`.
 */
import { z } from "zod";

/** An id, ref or name an entry points at. */
const ref = z.string().min(1).max(400);

/** One path component: not `.` or `..`, no slash. */
const ONE_COMPONENT = /^(?!\.\.?$)[^/\\]+$/u;
const SEPARATORS = /[/\\]+/gu;
const UNSAFE = /[^\w.@+-]+/gu;
const LEADING_DOTS = /^[.-]+/u;

/** A file name an entry lands under: one path component. */
const fileName = z
  .string()
  .min(1)
  .max(200)
  .regex(ONE_COMPONENT, "a file name, with no folder");

/**
 * One entry of `inputs`, every kind the hub resolves. `strict`: an object
 * with a key it does not name is refused, as the hub checks every entry
 * ({@link HANDED_INPUT}). Open, it is the shape a tool shows a harness:
 * OpenCode's input repair deletes the keys a schema with
 * `additionalProperties: false` does not name (hub delegation-tools.ts `tool`).
 */
export const handedInputSchema = (strict: boolean) => {
  const shape = strict ? z.strictObject : z.object;
  return z.union([
    z.string().min(1),
    shape({ report: ref }),
    shape({ artifact: ref }),
    shape({ pins: ref }),
    shape({ find: ref }),
    shape({ attachment: ref, session: ref.optional() }),
    shape({ assets: ref }),
    shape({ text: z.string(), name: fileName }),
    shape({ blob: z.string(), name: fileName }),
  ]);
};

/** What the hub checks every entry against. */
const HANDED_INPUT = handedInputSchema(true);

export type HandedInput = z.infer<typeof HANDED_INPUT>;

/** An entry that names something the hub holds or carries its bytes: every kind but a path. */
export type HeldInput = Exclude<HandedInput, string>;

/** Every entry's shape, in the words a refusal shows. */
const HANDED_SHAPES =
  "an absolute path to a file or folder, or one of { report: id }, { artifact: id }, { pins: artifact id }, { find: ref }, { attachment: id or name, session?: id }, { assets: item id }, { text, name }, { blob: base64, name }";

/**
 * `value` as {@link HandedInput}s, or why it is none: each entry's place
 * and the shapes it may take. The one check every caller's `inputs` meets.
 */
export const handedInputs = (
  value: unknown
): { inputs: HandedInput[] } | { refused: string } => {
  if (!Array.isArray(value)) {
    return { refused: `inputs is a list: each entry ${HANDED_SHAPES}` };
  }
  const inputs: HandedInput[] = [];
  for (const [at, entry] of value.entries()) {
    const parsed = HANDED_INPUT.safeParse(entry);
    if (!parsed.success) {
      return {
        refused: `inputs[${at}] (${String(JSON.stringify(entry)).slice(0, 120)}) is none of the shapes it takes: ${HANDED_SHAPES}`,
      };
    }
    inputs.push(parsed.data);
  }
  return { inputs };
};

/** A name, made one path component an input may land under in `inputs/`. */
export const inputFileName = (raw: string): string => {
  const name = raw
    .replace(SEPARATORS, "-")
    .replace(UNSAFE, "-")
    .replace(LEADING_DOTS, "")
    .slice(0, 120);
  return name || "input";
};
