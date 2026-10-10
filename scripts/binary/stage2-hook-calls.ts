/**
 * Hands a shell call to a workspace's PreToolUse hook every second, as a work item's claude session does before
 * each of its Bash calls, and runs the command the hook rewrote it to, as the CLI then does, on the host. Run inside
 * the joined container by the installed binary acting as bun (BUN_BE_BUN=1), while the machine updates with the
 * workspace open: the hook must be answered by a live judge from before the agent restarts until after the boundary
 * is handed over to the new build's keeper.
 *
 *   cawco stage2-hook-calls.ts <workspace state dir> <clone> <stop file>
 *
 * Output, one line per call: `<epoch ms> ran`, when the hook allowed the call and its command printed what the
 * clone's README.md holds (`proof`); `<epoch ms> refused <what the hook said>`, when the hook refused it;
 * `<epoch ms> failed <why>`, when it allowed the call but its command did not run whole. A last line
 * `done calls=<n> ran=<n> refused=<n> failed=<n>`. It ends once the stop file is there, or after 900 s.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const [, , state, clone, stop] = Bun.argv;
if (!(state && clone && stop)) {
  throw new Error("usage: stage2-hook-calls.ts STATE_DIR CLONE STOP_FILE");
}
const EVERY_MS = 1000;
const DEADLINE = Date.now() + 900_000;
const hook = join(state, "hook");
/** The call's JSON as the CLI hands a PreToolUse hook a Bash call. */
const call = `${JSON.stringify({
  session_id: "stage2-hook-calls",
  transcript_path: "",
  cwd: clone,
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: {
    command: "cat README.md",
    description: "Read the clone's README",
  },
})}\n`;

const oneLine = (text: string): string => text.trim().replaceAll("\n", " | ");

const counts = { calls: 0, ran: 0, refused: 0, failed: 0 };

const once = async (): Promise<string> => {
  const asked = Bun.spawn([hook], {
    stdin: new TextEncoder().encode(call),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [said, why, status] = await Promise.all([
    new Response(asked.stdout).text(),
    new Response(asked.stderr).text(),
    asked.exited,
  ]);
  if (status !== 0) {
    counts.refused += 1;
    return `refused exit ${status}: ${oneLine(why)}`;
  }
  let command: unknown;
  try {
    command = (
      JSON.parse(said) as {
        hookSpecificOutput?: { updatedInput?: { command?: unknown } };
      }
    ).hookSpecificOutput?.updatedInput?.command;
  } catch {
    command = undefined;
  }
  if (typeof command !== "string") {
    counts.failed += 1;
    return `failed: the hook allowed the call with no command: ${oneLine(said)}`;
  }
  const ran = Bun.spawn(["/bin/bash", "-c", command], {
    cwd: clone,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(ran.stdout).text(),
    new Response(ran.stderr).text(),
    ran.exited,
  ]);
  if (code !== 0 || out.trim() !== "proof") {
    counts.failed += 1;
    return `failed: its command exited ${code}: ${oneLine(out)} ${oneLine(err)}`;
  }
  counts.ran += 1;
  return "ran";
};

while (!existsSync(stop) && Date.now() < DEADLINE) {
  const started = Date.now();
  counts.calls += 1;
  // biome-ignore lint/performance/noAwaitInLoops: one call a second, in order, as a session makes them
  console.log(`${started} ${await once()}`);
  await Bun.sleep(Math.max(0, started + EVERY_MS - Date.now()));
}
console.log(
  `done calls=${counts.calls} ran=${counts.ran} refused=${counts.refused} failed=${counts.failed}`
);
