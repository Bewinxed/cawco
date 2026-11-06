/**
 * The tool door's proof (tool-call.ts): each `@ts-expect-error` below is a
 * call the tool refuses or drops, and `bun run check` fails when one of them
 * stops being a type error. Never imported: its lines are only type-checked.
 */
import { type ToolSession, toolCall, toolRecord, toolWords } from "./tool-call";

declare const session: ToolSession;
/** A window as a probe once typed it, with a bound of its own. */
declare const window: { since: string; until: string };

// What the tools take, from literals and typed variables.
await toolWords(session, "wait_item", { minutes: 1, reason: "a build" });
await toolWords(session, "delegate_list");
await toolRecord(session, toolCall("find", { around: "s1" }));

// @ts-expect-error `seconds` is no argument of wait_item
await toolWords(session, "wait_item", { minutes: 1, reason: "a", seconds: 1 });
// @ts-expect-error `until` is no argument of delegate_list
await toolRecord(session, toolCall("delegate_list", window));
// @ts-expect-error wait_item needs its minutes and reason
await toolWords(session, "wait_item");
// @ts-expect-error no session is listed a tool by that name
await toolWords(session, "no_such_tool", {});
