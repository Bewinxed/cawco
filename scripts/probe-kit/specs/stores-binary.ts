/**
 * The agent's stores thread runs in the compiled binary: it starts from the
 * entry the binary embeds (build-binary.ts, stores/client.ts `WORKER_URL`),
 * not from the source beside it, and the transcript index it holds starts
 * its parse threads from inside it (jsonl-parser pool.ts `workerUrl`),
 * where a path from the thread's own `import.meta.url` alone named
 * `scripts/binary/scripts/binary/…`, which is no entry, and its parse hung.
 *
 * This machine's target compiled as a proof build (assets prepared first
 * when none are), and its `proof-stores` (scripts/binary/proof-stores.ts)
 * run in a scratch HOME holding {@link FILES} stored transcripts:
 * (a) the thread answers OpenCode's own sign-ins (none: "absent"), syncs the
 *     index and finds every transcript by its word, and scans usage.
 *
 *   bun scripts/probe-kit/run.ts stores-binary
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FILES } from "../../binary/proof-stores";
import { compileBinary, prepareAssets, TARGETS } from "../../build-binary";
import { type Kit, ROOT, type Spec } from "../kit";

/** This machine's binary target, as build-binary.ts names it. */
const hostTarget = (): string => {
  const target = `${process.platform}-${process.arch}`;
  if (!TARGETS.includes(target as (typeof TARGETS)[number])) {
    throw new Error(`No binary target for ${target}`);
  }
  return target;
};

export default {
  name: "stores-binary",
  run: async (kit: Kit) => {
    const { check } = kit;
    if (!existsSync(join(ROOT, ".context/binary-build/prepared.json"))) {
      await prepareAssets({ dashboard: true });
    }
    const binary = join(kit.out, "cawco");
    await compileBinary({
      target: hostTarget(),
      outfile: binary,
      version: "0.0.1-stores",
      commit: "stores",
      proof: true,
    });
    // The proof runtime runs only under a scratch HOME it can tell by name.
    const home = join(kit.out, "binary-home");
    await mkdir(home, { recursive: true });
    const child = Bun.spawn([binary, "proof-stores"], {
      cwd: home,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [err, out, code] = await Promise.all([
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
      child.exited,
    ]);
    const said = out.trim().split("\n").at(-1) ?? "";
    kit.note(`the compiled binary's proof-stores exited ${code}: ${said}`);
    check(
      `a: in the compiled binary the stores thread answers the sign-ins read ("absent"), syncs the index over ${FILES} transcripts on its own parse threads and finds each, and scans usage`,
      code === 0 && said.includes(`"found":${FILES}`),
      `${out}\n${err}`.slice(-2000)
    );
  },
} satisfies Spec;
