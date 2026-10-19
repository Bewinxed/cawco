/**
 * fsevents-scope's child for the tail of an adopted Claude CLI's transcript
 * (harnesses/transcript-tail.ts `tailLines`, what claude.ts
 * `#watchTranscript` follows it with): follows the file its parent names,
 * says each line it is handed, and stops on `stop`, so the parent reads the
 * process's FSEvents streams (fsevents.ts) while it follows and after. A
 * build without `tailLines` says `none` and ends.
 *
 *   bun scripts/probe-kit/fsevents-tail-child.ts <file>
 */
export {};

const say = (word: object): void => {
  process.stdout.write(`${JSON.stringify(word)}\n`);
};

const file = process.argv[2] ?? "";
const tail =
  await import("../../packages/agent/src/harnesses/transcript-tail").catch(
    () => undefined
  );
if (!tail) {
  say({ phase: "none" });
  process.exit(0);
}
const stop = await tail.tailLines(
  file,
  (line) => say({ phase: "line", line }),
  (error) => say({ phase: "failed", error: String(error) })
);
say({ phase: "following" });
for await (const line of console) {
  if (line === "stop") {
    stop();
    say({ phase: "stopped" });
  } else if (line === "exit") {
    process.exit(0);
  }
}
