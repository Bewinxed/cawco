/**
 * An OpenCode whose server cannot start is not started again until
 * something that could change the outcome changes. On a scratch fleet (real
 * hub, agent and sessiond) whose OpenCode is a stand-in on the agent's PATH:
 * it answers `--version` as the release CawCo runs, writes a line for every
 * process started from it, and its `serve` exits before it announces a port.
 * It is put in place once the agent is online, so the probe's first call is
 * the first start. Each call is a machine control the dashboard sends
 * (`getSessionInfo` on OpenCode, which starts its server), read back on the
 * dashboard's own socket:
 *
 * 1. The first call fails within 30 s, saying why, having started `serve`.
 * 2. The next five answer in under a second each, with the same reason,
 *    and start no process at all.
 * 3. The hub's row for the machine carries that reason in its OpenCode
 *    report (`authReason`), where the home says a machine's word.
 * 4. The OpenCode config file touched: the next call starts `serve` again.
 * 5. An OpenCode session started (a person's spawn) starts `serve` again,
 *    and its failure says the reason.
 *
 *   bun scripts/probe-kit/run.ts opencode-refusal
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessReport } from "../../../packages/core/src/harness";
import { toolSpec } from "../../../packages/core/src/tools";
import { delay, MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const REASON = "OpenCode's server did not start";

/** What a control call answered, and how long it took. */
interface Answer {
  error: string | undefined;
  ms: number;
  ok: boolean;
}

const spec: Spec = {
  name: "opencode-refusal",
  run: async (kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const opencode = toolSpec("opencode");
    if (!opencode?.exactVersion) {
      throw new Error("the tool catalog names no OpenCode release");
    }
    // The stand-in's directory leads the agent's PATH, and no directory with
    // a real OpenCode is on it (bun, which shares one with it here, is
    // linked beside the stand-in). It is empty until the agent is online, so
    // the agent's own start-up reads find no OpenCode.
    const bin = join(fleet.sandbox, "opencode-bin");
    const calls = join(fleet.sandbox, "opencode-calls.log");
    await mkdir(bin, { recursive: true });
    await symlink(process.execPath, join(bin, "bun"));
    await symlink(process.execPath, join(bin, "bunx"));
    fleet.env.PATH = [
      bin,
      ...(fleet.env.PATH ?? "")
        .split(":")
        .filter((dir) => dir && !existsSync(join(dir, opencode.bin))),
    ].join(":");
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const stand = join(bin, opencode.bin);
    await writeFile(
      stand,
      [
        "#!/bin/sh",
        `echo "$*" >> '${calls}'`,
        `if [ "$1" = "--version" ]; then echo "opencode v${opencode.exactVersion}"; exit 0; fi`,
        // A second, so the keeper's subscriber hears the exit, as it would a
        // real server dying at boot.
        "sleep 1",
        `echo "the probe's OpenCode refuses to serve" >&2`,
        "exit 1",
        "",
      ].join("\n")
    );
    await chmod(stand, 0o755);
    const started = async (): Promise<{ all: number; serve: number }> => {
      const lines = (
        await Bun.file(calls)
          .text()
          .catch(() => "")
      )
        .split("\n")
        .filter(Boolean);
      return {
        all: lines.length,
        serve: lines.filter((line) => line.startsWith("serve")).length,
      };
    };

    // The dashboard's socket, its control results by request.
    const results = new Map<string, { ok: boolean; error?: string }>();
    const socket = new WebSocket(
      `${fleet.base.replace("http", "ws")}/ws/dashboard`
    );
    await new Promise<void>((done, fail) => {
      socket.onopen = () => done();
      socket.onerror = () =>
        fail(new Error("the dashboard socket did not open"));
    });
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data)) as {
        requestId?: string;
        payload?: {
          kind?: string;
          requestId?: string;
          ok?: boolean;
          error?: string;
        };
      };
      const id = frame.requestId ?? frame.payload?.requestId;
      if (frame.payload?.kind === "control_result" && id) {
        results.set(id, {
          ok: frame.payload.ok === true,
          ...(frame.payload.error ? { error: frame.payload.error } : {}),
        });
      }
    };
    const call = async (): Promise<Answer> => {
      const requestId = crypto.randomUUID();
      const at = performance.now();
      socket.send(
        JSON.stringify({
          verb: "control",
          machineId: MACHINE,
          requestId,
          payload: {
            requestId,
            method: "getSessionInfo",
            args: ["ses_probe_refusal"],
            harness: "opencode",
          },
        })
      );
      const result = await until(
        "the control's answer",
        () => results.get(requestId),
        Boolean,
        90_000
      );
      return {
        ok: result?.ok === true,
        error: result?.error,
        ms: Math.round(performance.now() - at),
      };
    };

    try {
      // 1. The first start. A start-up read made while no OpenCode was
      // installed leaves its "not found" answered for 30 s (the version
      // probe's cache), starting nothing; the first call past it starts.
      let first = await call();
      const deadline = Date.now() + 45_000;
      while (
        (first.error ?? "").includes("not found") &&
        Date.now() < deadline
      ) {
        // biome-ignore lint/performance/noAwaitInLoops: one call at a time, until the cached answer is gone
        await delay(2000);
        first = await call();
      }
      const afterFirst = await started();
      kit.check(
        "the first call fails within 30 s, saying why, having started serve once",
        !first.ok &&
          first.ms < 30_000 &&
          (first.error ?? "").includes(REASON) &&
          afterFirst.serve === 1,
        JSON.stringify({ first, afterFirst })
      );

      // 2. Five more, answered from the record.
      const again: Answer[] = [];
      for (let i = 0; i < 5; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: one call after another, each timed alone
        again.push(await call());
      }
      const afterFive = await started();
      kit.check(
        "the next five answer in under 1 s each with the same reason, and start no process",
        again.every(
          (one) => !one.ok && one.ms < 1000 && one.error === first.error
        ) && afterFive.all === afterFirst.all,
        JSON.stringify({
          ms: again.map((one) => one.ms),
          same: again.map((one) => one.error === first.error),
          processes: { before: afterFirst.all, after: afterFive.all },
        })
      );

      // 3. The reason, where the home reads a machine's word.
      const reported = await until(
        "the hub's OpenCode report with its reason",
        async () =>
          (
            await fleet.api<
              { machineId: string; harnesses?: HarnessReport[] }[]
            >("/api/agents")
          )
            .find((row) => row.machineId === MACHINE)
            ?.harnesses?.find((report) => report.harness === "opencode")
            ?.authReason,
        (reason) => reason?.includes(REASON) === true,
        60_000
      ).catch(() => undefined);
      kit.check(
        "the hub's row for the machine carries the reason in its OpenCode report",
        reported !== undefined && first.error?.includes(reported) === true,
        JSON.stringify({ reported })
      );

      // 4. Its config file touched: tried again.
      const config = join(fleet.home, ".config", "opencode", "opencode.json");
      const now = new Date();
      await utimes(config, now, now);
      const touched = await call();
      const afterTouch = await started();
      kit.check(
        "the config file touched, the next call starts serve again and says why it failed",
        !touched.ok &&
          (touched.error ?? "").includes(REASON) &&
          afterTouch.serve === afterFive.serve + 1,
        JSON.stringify({ touched, serve: afterTouch.serve })
      );

      // 5. A session started: tried again.
      const instanceId = crypto.randomUUID();
      await fleet.post({
        verb: "spawn",
        machineId: MACHINE,
        instanceId,
        requestId: crypto.randomUUID(),
        payload: {
          instanceId,
          cwd: fleet.workdir,
          harness: "opencode",
          model: "mockoc/mock-oc",
          title: "refusal probe",
          permissionMode: "bypassPermissions",
        },
      });
      const failed = await until(
        "the OpenCode session's start failing",
        () => fleet.instance(instanceId),
        (row) => row?.last_error !== null && row?.last_error !== undefined,
        90_000
      ).catch(() => fleet.instance(instanceId));
      const afterSpawn = await started();
      kit.check(
        "an OpenCode session started starts serve again, and its failure says the reason",
        afterSpawn.serve === afterTouch.serve + 1 &&
          (failed?.last_error ?? "").includes(REASON),
        JSON.stringify({ serve: afterSpawn.serve, row: failed })
      );
    } finally {
      socket.close();
    }
  },
};

export default spec;
