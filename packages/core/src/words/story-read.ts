/**
 * Why the inspector can't write a story's props (agent stage-host
 * story-file.ts): the one line it shows above the props
 * (SheetInspector), and the refusal a write to such a story meets. The
 * story is named by its export; a part of the file's own code is set in
 * backticks. The way on is a pin: the agent it reaches edits the file.
 * The inspector calls them props, so these do too.
 */
export const storyReadWords = {
  /** The reader couldn't follow the story at all: `why`, one of the clauses below. */
  unread: (name: string, why: string) =>
    `${name}'s props can't be read: ${why}. A pin changes them.`,
  /** A story written as a function. */
  aFunction: "it is a function, not a story object",
  /** Its object is built by `code`, a call the reader followed. */
  builtBy: (name: string, code: string) =>
    `${name} is built by ${code}: a pin changes its props.`,
  /** Its args spread from `code`. */
  propsFrom: (name: string, code: string) =>
    `${name}'s props come from ${code}: a pin changes them.`,
  /** Its args are `code`, not an object the file writes out. */
  propsAre: (name: string, code: string) =>
    `${name}'s props are ${code}, not an object: a pin changes them.`,
  /** A write to a story that is a function or no object, refused. */
  notWritable: (name: string, file: string) =>
    `${name} in ${file} is a function or not an object, so its props can't be written: a pin changes them.`,

  // Why the reader can't follow a value: each a clause after "can't be read: ".
  imported: (name: string, source: string) =>
    `${name} is imported from ${source}, which this reader doesn't open`,
  undeclared: (name: string) =>
    `${name} isn't declared at the top of this file`,
  noValue: "it has no value",
  tooDeep: (code: string) => `${code} goes deeper than the reader follows`,
  computed: (code: string) => `${code} is computed`,
  noSuchKey: (code: string) => `${code} names no key it has`,
  notAnObject: (code: string) =>
    `${code} is computed, not an object this file writes`,
  computedKey: (code: string) => `${code} has a computed key`,
  noNamedCall: (code: string) => `${code} calls no function by name`,
  notAFunction: (name: string) => `${name} is no function this file declares`,
  doesMore: (name: string) => `${name} does more than return an object`,
  spreadsArguments: (name: string) => `\`${name}(…)\` spreads its arguments`,
  patternArguments: (name: string) =>
    `${name} takes its arguments as a pattern`,
  notAValue: (code: string) =>
    `${code} is computed, not a value this file writes`,
} as const;
