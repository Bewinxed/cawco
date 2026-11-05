/**
 * A scratch fleet's agent's search processes (agent search/host.ts), found
 * by their command line and the fleet's HOME in their environment: the
 * index's writer and its reader, each named by its role, the command's last
 * argument (search/process.ts `host`).
 */
import { readdir, readFile } from "node:fs/promises";
import type { SearchRole } from "../../packages/agent/src/search/host";
import { until } from "../scratch-fleet";

const PID = /^\d+$/u;
/** The search process, run from source or as the binary's verb. */
const SEARCH_HOST = /search\/host\.ts|search-host/u;

/** The agent's search processes in `role`, by the fleet's HOME in their environment. */
const searchProcesses = async (
  home: string,
  role: SearchRole
): Promise<number[]> => {
  const found: number[] = [];
  for (const entry of await readdir("/proc")) {
    if (!PID.test(entry)) {
      continue;
    }
    const read = await Promise.all([
      readFile(`/proc/${entry}/cmdline`, "utf8"),
      readFile(`/proc/${entry}/environ`, "utf8"),
    ]).catch(() => null);
    const args = read?.[0].split("\0").filter((arg) => arg !== "") ?? [];
    if (
      read &&
      SEARCH_HOST.test(read[0]) &&
      args.at(-1) === role &&
      read[1].split("\0").includes(`HOME=${home}`)
    ) {
      found.push(Number(entry));
    }
  }
  return found;
};

/** The one search process in `role` (other than `not`), once it is there. */
export const theProcess = (home: string, role: SearchRole, not?: number) =>
  until(
    `the agent's search ${role === "write" ? "writer" : "reader"}`,
    async () =>
      (await searchProcesses(home, role)).filter((pid) => pid !== not),
    (pids) => pids.length === 1
  ).then((pids) => pids[0] as number);

/** Whether `pid` still runs: there, and not a zombie its parent has yet to reap. */
export const running = async (pid: number): Promise<boolean> => {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  // The state follows the command's closing parenthesis: "1234 (bun) S …".
  const state = stat.slice(
    stat.lastIndexOf(")") + 2,
    stat.lastIndexOf(")") + 3
  );
  return state !== "" && state !== "Z" && state !== "X";
};
