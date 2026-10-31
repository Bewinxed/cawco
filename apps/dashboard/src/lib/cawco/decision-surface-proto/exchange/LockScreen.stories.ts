/**
 * The Exchange, Lock screen: the push reads as a message from the agent.
 * The owner's open question "When you turn Caw off for a project, what
 * happens to work its conversation already started?" has two options, so
 * it answers in one tap; the two asked together after the audit come as
 * one push that opens the thread.
 */
import LockScreen from "./LockScreen.svelte";
import type { Play } from "./play.js";
import { audit, caw, restart, switchOff } from "./records.js";

const STOPS = /It stops, as before/u;

export default {
  title: "The Exchange/Lock screen",
  component: LockScreen,
  args: { thread: caw, decision: switchOff, push: "push" },
};

/** The push as it lands: who, from where, stops work, the question and the recommended option. */
export const OneTapAsk = { parameters: { viewport: 390 } };

/** Held open: each option as an action and Reply in your words, four at most. */
export const HeldOpen = {
  args: { push: "actions" },
  parameters: { viewport: 390 },
};

/** One tap on the recommended option: the push confirms in its second line. */
export const Sent = {
  from: "HeldOpen",
  args: { push: "sent" },
  parameters: { viewport: 390 },
  play: (async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: STOPS }));
  }) satisfies Play,
};

/** The answer didn't land: said plainly, open it to answer. */
export const CouldntSend = {
  args: { push: "failed" },
  parameters: { viewport: 390 },
};

/** Reply in your words: a text field on the lock screen. */
export const ReplyInWords = {
  args: { push: "reply" },
  parameters: { viewport: 390 },
};

/** A group is one push: its topic, how many stop work, and Open. */
export const GroupPush = {
  args: {
    thread: audit,
    decision: restart,
    group: { topic: "After the audit", count: 2 },
    push: "group",
  },
  parameters: { viewport: 390 },
};
