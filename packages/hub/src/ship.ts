/**
 * Shipping what an item landed: the agent that fixed something ships it.
 * A `finish_item` with `ship` (its end-user release notes) has its project's
 * `Ship:` command (gate.md, gate-file.ts) run once its work landed on main:
 * on the hub's own machine, in the project's checkout there, which holds
 * what a delegate's boundary never reaches (the signing keys, the user's
 * service manager). `{commit}` is the landed commit and `{notes}` a file of
 * the notes, both shell-quoted. The command answers at once (CawCo's own,
 * scripts/ship.sh, starts the release as a unit of its own and returns, or
 * refuses in its words, as at Apple's notarization limit), and what it said
 * is the finish_item answer's last paragraph.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { hubDbPath } from "@cawco/core/paths";
import { quote } from "./landing";

/** Past this the ship command is stopped: it starts a release, it does not run one. */
const SHIP_TIMEOUT_MS = 120_000;

/** What a run of the ship command said, as the finish_item answer's last paragraph. */
export const shipLanded = async (options: {
  checkout: string;
  command: string;
  commit: string;
  notes: string;
}): Promise<string> => {
  const dir = join(hubDbPath(), "..", "ship");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const notes = join(dir, `${options.commit.slice(0, 12)}-${Date.now()}.md`);
  await writeFile(notes, options.notes, { mode: 0o600 });
  try {
    const command = options.command
      .replaceAll("{commit}", quote(options.commit))
      .replaceAll("{notes}", quote(notes));
    const ran = await readWithin(SHIP_TIMEOUT_MS, async (signal) => {
      const child = Bun.spawn(["sh", "-c", command], {
        cwd: options.checkout,
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
      const [out, err, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { said: `${out}${err}`.trim(), status };
    });
    if (ran.kind === "unanswered") {
      return `Not shipped: \`${command}\` in ${options.checkout} did not end within ${SHIP_TIMEOUT_MS / 1000} s and was stopped.`;
    }
    const { said, status } = ran.value;
    return status === 0
      ? `Shipping: ${said || `\`${command}\` started it`}`
      : `Not shipped: \`${command}\` in ${options.checkout} ended with exit status ${status}${said ? `:\n${said}` : "."}`;
  } finally {
    await rm(notes, { force: true });
  }
};
