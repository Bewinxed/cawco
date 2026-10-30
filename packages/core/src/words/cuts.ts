/**
 * What a cut says on the call and the line it ended (core turn-cuts.ts):
 * who or what cut the turn, where its harness wrote "rejected" or
 * "aborted". The hub builds them into every transcript, so the dashboard
 * and the app draw them as given.
 */
export const turnCutWords = {
  /** A tool call the cut ended mid-run: what it read in its harness's words was no refusal. */
  call: (cause: string) =>
    `Cut by ${cause} while it ran. Nobody refused it: whatever it did before the cut stands.`,
  /** Why the hub stopped what a cut call had started (hub call-cuts.ts), as "Stopped by the hub (…)" reads it. */
  startedStopped: (tool: string) =>
    `the ${tool} call that started it was cut before it answered`,
  /** The line the turn's cut leaves. */
  line: (cause: string) => `Interrupted by ${cause}`,
  /** The owner's own Stop, from a dashboard or the app. */
  stop: "your Stop",
  /** A session's interrupt_delegate, or its conversation's. */
  interruptFrom: (name: string) => `an interrupt from ${name}`,
  /** A machine's pause, until its end. */
  pause: (machine: string, until: string) =>
    `${machine}'s pause until ${until}`,
  /** A project's Caw turned off mid-turn. */
  cawOff: "Caw being turned off",
  /** Fleet watch's triage stopping a run. */
  triage: "fleet watch's triage",
  /** A delegate's provider still retrying past its deadline. */
  retries: "its provider's retries running past their deadline",
} as const;
