/**
 * The page hosts a source checkout's hub builds on first request (the
 * decision host, decision-host.ts; the canvas host, canvas-host.ts), each
 * built once per process on a thread of its own (host-build-worker.ts), so
 * the hub's event loop serves every other request while it runs. On the
 * hub's own thread the decision host's Svelte compiler, Tailwind and woff2
 * subsetting held it in blocks of up to 900 ms (sampled with bun:jsc), and
 * the canvas host's 30-90 ms where a built one cost 4-7 ms. The standalone
 * binary serves both prebuilt and never starts the thread.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Which host a build is of. */
export type HostName = "decision" | "canvas";

/** One built file as the build's thread hands it over: its bytes moved, not copied. */
export interface HostFile {
  bytes: ArrayBuffer;
  name: string;
  type: string;
}

/** What the build's thread answers: every file, or why the build failed. */
export type HostBuilt = { files: HostFile[] } | { error: string };

const WORKER_URL = new URL("./host-build-worker.ts", import.meta.url);

/**
 * The modules the process was started with `--preload`, which the build's
 * thread loads too: Bun runs a process's preloads on its main thread only,
 * so a plugin one registers (a scratch fleet's stand-ins, scripts/stand-ins
 * preload.ts) never reached the build, and the fleet's canvas page went
 * without its probe binding. A Worker's own `preload` option carries them.
 */
const preloads = (): string[] =>
  process.execArgv.flatMap((arg, i, all) => {
    if (arg === "--preload") {
      return all[i + 1] === undefined ? [] : [all[i + 1]];
    }
    return arg.startsWith("--preload=") ? [arg.slice("--preload=".length)] : [];
  });

/** Each host's files by name: one build per process; a failure clears its slot so the next request retries. */
const built = new Map<HostName, Promise<Map<string, Blob>>>();

/** What each host is called in a failed build's error. */
const LABELS: Record<HostName, string> = {
  decision: "The decision host",
  canvas: "The canvas host",
};

/** Host `host`'s files by name, built on a thread of its own once per process. */
export const hostFiles = (host: HostName): Promise<Map<string, Blob>> => {
  const kept = built.get(host);
  if (kept) {
    return kept;
  }
  const building = new Promise<Map<string, Blob>>((done, fail) => {
    const worker = new Worker(WORKER_URL, { preload: preloads() });
    const end = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<HostBuilt>) => {
      end();
      const answer = event.data;
      if ("error" in answer) {
        fail(new Error(answer.error));
        return;
      }
      done(
        new Map(
          answer.files.map(({ name, bytes, type }) => [
            name,
            new Blob([bytes], { type }),
          ])
        )
      );
    };
    worker.onerror = (event) => {
      end();
      fail(
        new Error(
          `${LABELS[host]}'s build thread failed: ${event.message || "no reason given"}`
        )
      );
    };
    worker.postMessage(host);
  }).catch((error: unknown) => {
    built.delete(host);
    throw error;
  });
  built.set(host, building);
  return building;
};

/**
 * A release build's host files written to `outdir`, emptied first: an
 * earlier build's chunks are not this one's.
 */
export const writeHostFiles = async (
  outdir: string,
  files: Map<string, Blob>
): Promise<void> => {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await Promise.all(
    [...files].map(([name, file]) => Bun.write(join(outdir, name), file))
  );
};
