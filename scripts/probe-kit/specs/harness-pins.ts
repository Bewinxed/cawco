/**
 * A harness CawCo pins goes on the way the machine already has it, before the
 * build that pins it, and the machine's word on it never waits for a restart.
 * On a scratch fleet (real hub, agent and sessiond) whose OpenCode is a stub
 * installed as a bun global: `~/.bun/bin/opencode2` links into
 * `~/.bun/install/global/node_modules/@opencode/cli`, as on obelisk, and says
 * the version a state file holds, one below the release CawCo runs. The
 * fleet's `bun` is a stand-in that writes every call it gets to a log, and
 * for `install -g … @opencode/cli@<v>` puts <v> in the state file (or fails,
 * while a fail file is there); anything else goes to the real bun. No npm
 * copy is ever involved: the stub came from bun, so bun is what must run.
 *
 * 1. The agent reads the stub as OpenCode installed with bun, at its version,
 *    and failed against the pin, saying so.
 * 2. The machine's capabilities name the bun command at the pin.
 * 3. A build's pins put on before the swap (`cawco binary-pins`, as the
 *    updater runs it from the staged build) with bun failing: it exits 1 with
 *    one sentence naming bun, having run the bun command; nothing moved.
 * 4. The same with bun working: the bun command at the pin ran, the stub
 *    says the pin, and what it replaced is recorded.
 * 5. That build not running after all (`binary-pins back`): the recorded
 *    version goes back on with bun, and the record goes.
 * 6. The dashboard's install action: it runs the bun command at the pin, and
 *    the hub's tool row reads installed, with bun, without the agent
 *    restarting or reconnecting.
 * 7. A hand change of the installed version, seen by an OpenCode call: the
 *    hub's row follows it (failed at the old version, then installed at the
 *    pin) with no restart.
 *
 *   bun scripts/probe-kit/run.ts harness-pins
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MachineCapabilities } from "../../../packages/core/src/capabilities";
import type { ToolStatus } from "../../../packages/core/src/tools";
import { toolSpec } from "../../../packages/core/src/tools";
import { delay, MACHINE, until } from "../../scratch-fleet";
import { ROOT, type Spec } from "../kit";

interface Row {
  machineCapabilities?: MachineCapabilities;
  machineId: string;
  tools?: Record<string, ToolStatus>;
}

/** One below `version` in its last segment: the release the stub starts at. */
const below = (version: string): string => {
  const parts = version.split(".").map(Number);
  const last = parts.length - 1;
  parts[last] = (parts[last] ?? 1) - 1;
  return parts.join(".");
};

const spec: Spec = {
  name: "harness-pins",
  run: async (kit) => {
    const opencode = toolSpec("opencode");
    if (!opencode?.exactVersion) {
      throw new Error("the tool catalog names no OpenCode release");
    }
    const pin = opencode.exactVersion;
    const old = below(pin);
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));

    // The stub, as `bun install -g --trust @opencode/cli` lays it out.
    const bunBin = join(fleet.home, ".bun", "bin");
    const global = join(fleet.home, ".bun", "install", "global");
    const pkg = join(global, "node_modules", "@opencode", "cli");
    const versionFile = join(fleet.sandbox, "opencode-version");
    const bunCalls = join(fleet.sandbox, "bun-calls.log");
    const bunFails = join(fleet.sandbox, "bun-fails");
    await mkdir(join(pkg, "bin"), { recursive: true });
    await mkdir(bunBin, { recursive: true });
    await writeFile(versionFile, old);
    await writeFile(
      join(global, "package.json"),
      JSON.stringify({ dependencies: { "@opencode/cli": old } })
    );
    await writeFile(join(global, "bun.lock"), "{}\n");
    const exe = join(pkg, "bin", "opencode.exe");
    await writeFile(
      exe,
      [
        "#!/bin/sh",
        `if [ "$1" = "--version" ]; then echo "opencode v$(cat '${versionFile}')"; exit 0; fi`,
        "sleep 1",
        `echo "the probe's OpenCode does not serve" >&2`,
        "exit 1",
        "",
      ].join("\n")
    );
    await chmod(exe, 0o755);
    await symlink(
      "../install/global/node_modules/@opencode/cli/bin/opencode.exe",
      join(bunBin, opencode.bin)
    );
    const fakeBun = join(bunBin, "bun");
    await writeFile(
      fakeBun,
      [
        "#!/bin/sh",
        `if [ "$1" = install ] && [ "$2" = -g ]; then`,
        `  echo "bun $*" >> '${bunCalls}'`,
        `  if [ -e '${bunFails}' ]; then echo "error: GET https://registry.npmjs.org/@opencode%2fcli - 503" >&2; exit 1; fi`,
        `  for arg in "$@"; do case "$arg" in @opencode/cli@*) echo "\${arg#@opencode/cli@}" > '${versionFile}';; esac; done`,
        "  exit 0",
        "fi",
        `exec '${process.execPath}' "$@"`,
        "",
      ].join("\n")
    );
    await chmod(fakeBun, 0o755);
    await symlink(process.execPath, join(bunBin, "bunx"));
    // bun's global bin leads the PATH, and no directory with a real OpenCode
    // is on it.
    fleet.env.PATH = [
      bunBin,
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

    const row = async (): Promise<Row | undefined> =>
      (await fleet.api<Row[]>("/api/agents")).find(
        (one) => one.machineId === MACHINE
      );
    const tool = async (): Promise<ToolStatus | undefined> =>
      (await row())?.tools?.opencode;
    const calls = async (): Promise<string[]> =>
      (
        await Bun.file(bunCalls)
          .text()
          .catch(() => "")
      )
        .split("\n")
        .filter(Boolean);
    const installed = async (): Promise<string> =>
      (await Bun.file(versionFile).text()).trim();
    const pinCommand = `bun install -g --trust @opencode/cli@${pin}`;

    // 1.
    const first = await until(
      "the hub's OpenCode tool row",
      tool,
      (status) => status?.state === "failed",
      60_000
    ).catch(() => undefined);
    kit.check(
      "the agent reads the stub as installed with bun at its version, failed against the pin",
      first?.method === "bun" &&
        first.version === old &&
        (first.detail ?? "").includes("with bun; CawCo runs"),
      JSON.stringify(first)
    );

    // 2.
    const capability = (await row())?.machineCapabilities?.items.find(
      (item) => item.id === "opencode"
    );
    kit.check(
      "the machine's capabilities name the bun command at the pin",
      capability?.installCommand === pinCommand,
      JSON.stringify(capability)
    );

    // `cawco binary-pins`, as the updater runs it from the staged build.
    const binaryPins = async (
      ...args: string[]
    ): Promise<{ code: number; err: string; out: string }> => {
      const child = Bun.spawn(
        [
          process.execPath,
          join(ROOT, "packages/cli/src/cli.ts"),
          "binary-pins",
          ...args,
        ],
        { cwd: ROOT, env: fleet.env, stdout: "pipe", stderr: "pipe" }
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, err: err.trim(), out: out.trim() };
    };
    const record = join(
      fleet.env.XDG_DATA_HOME ?? join(fleet.home, ".local", "share"),
      "cawco",
      "binary",
      "pins-before.json"
    );

    // 3.
    await writeFile(bunFails, "");
    const refused = await binaryPins();
    const afterRefused = await calls();
    kit.check(
      "binary-pins with bun failing exits 1 with one sentence naming bun, having run the bun command, and moves nothing",
      refused.code === 1 &&
        refused.err.split("\n").length === 1 &&
        refused.err.includes(`${opencode.name} ${pin}`) &&
        refused.err.includes("did not go on with bun") &&
        afterRefused.at(-1) === pinCommand &&
        (await installed()) === old &&
        !existsSync(record),
      JSON.stringify({ refused, calls: afterRefused })
    );
    await rm(bunFails);

    // 4.
    const put = await binaryPins();
    const afterPut = await calls();
    const recorded = existsSync(record)
      ? ((await Bun.file(record).json()) as {
          build: string;
          tools: Record<string, string>;
        })
      : undefined;
    kit.check(
      "binary-pins runs the bun command at the pin, the stub says the pin, and what it replaced is recorded",
      put.code === 0 &&
        afterPut.at(-1) === pinCommand &&
        afterPut.length === afterRefused.length + 1 &&
        (await installed()) === pin &&
        recorded?.tools.opencode === old,
      JSON.stringify({ put, calls: afterPut, recorded })
    );

    // 5. Run as the build that runs instead runs it: naming the build that
    // will not run, whose record it is.
    const back = await binaryPins("back", recorded?.build ?? "");
    const afterBack = await calls();
    kit.check(
      "binary-pins back puts the recorded version back on with bun, and the record goes",
      back.code === 0 &&
        afterBack.at(-1) === `bun install -g --trust @opencode/cli@${old}` &&
        (await installed()) === old &&
        !existsSync(record),
      JSON.stringify({ back, calls: afterBack })
    );

    // 6. The dashboard's install action, on its own socket.
    const results = new Map<
      string,
      { ok: boolean; error?: string; result?: unknown }
    >();
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
          result?: unknown;
        };
      };
      const id = frame.requestId ?? frame.payload?.requestId;
      if (frame.payload?.kind === "control_result" && id) {
        results.set(id, {
          ok: frame.payload.ok === true,
          error: frame.payload.error,
          result: frame.payload.result,
        });
      }
    };
    const control = async (
      method: string,
      args: unknown[],
      harness?: string
    ) => {
      const requestId = crypto.randomUUID();
      socket.send(
        JSON.stringify({
          verb: "control",
          machineId: MACHINE,
          requestId,
          payload: {
            requestId,
            method,
            args,
            ...(harness ? { harness } : {}),
          },
        })
      );
      return await until(
        `${method}'s answer`,
        () => results.get(requestId),
        Boolean,
        120_000
      );
    };
    const registered = async (): Promise<number> =>
      (await fleet.logs("agent")).split("registered with").length - 1;

    try {
      const answer = await control("installTool", ["opencode"]);
      const afterInstall = await calls();
      const settled = await until(
        "the hub's tool row reading installed",
        tool,
        (status) => status?.state === "installed",
        30_000
      ).catch(() => undefined);
      kit.check(
        "the install action runs the bun command at the pin, and the hub's row reads installed with bun without a restart",
        answer?.ok === true &&
          afterInstall.at(-1) === pinCommand &&
          afterInstall.length === afterBack.length + 1 &&
          settled?.version === pin &&
          settled.method === "bun" &&
          (await registered()) === 1,
        JSON.stringify({
          answer,
          calls: afterInstall,
          settled,
          registered: await registered(),
        })
      );

      // 7. A hand change, seen by OpenCode's next call (its version probe
      // is read again at most every 30 s).
      const follows = async (
        version: string,
        state: ToolStatus["state"]
      ): Promise<{ answers: string[]; row: ToolStatus | undefined }> => {
        await writeFile(versionFile, version);
        const answers: string[] = [];
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const at = performance.now();
          // biome-ignore lint/performance/noAwaitInLoops: one call at a time, until the hub's row follows
          const said = await control(
            "getSessionInfo",
            ["ses_probe_pins"],
            "opencode"
          );
          answers.push(
            `${Math.round(performance.now() - at)}ms ${said?.error?.slice(0, 60) ?? "ok"}`
          );
          const now = await tool();
          if (now?.state === state && now.version === version) {
            return { answers, row: now };
          }
          await delay(5000);
        }
        return { answers, row: await tool() };
      };
      const down = await follows(old, "failed");
      const up = await follows(pin, "installed");
      kit.check(
        "a hand change of OpenCode's version is followed on the hub's row, failed then installed, with no restart",
        down.row?.state === "failed" &&
          down.row.version === old &&
          up.row?.state === "installed" &&
          up.row.version === pin &&
          (await registered()) === 1,
        JSON.stringify({ down, up, registered: await registered() })
      );
    } finally {
      socket.close();
      // What a reviewer reads after a failure: the agent's own words.
      await writeFile(join(kit.out, "agent.log"), await fleet.logs("agent"));
    }
  },
};

export default spec;
