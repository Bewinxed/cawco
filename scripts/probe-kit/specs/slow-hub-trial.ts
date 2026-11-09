/**
 * An update's trial keeps a build whose agent registered, however slowly
 * the hub answers for its row, and reads as the hub's silence only a hub
 * that says nothing (the 6796 rollout, 2026-11-05: obelisk's hub, at load
 * average 45, answered uwucloud's row in 4.2 s and more through its SSH
 * forward, every attempt of the trial's 3 s probe read as no answer, and
 * uwucloud's third rollback failed 6796 for good while its new agent had
 * registered on each).
 *
 * On a scratch fleet: its agent online with custody, the hub reached
 * through a proxy of the spec's own that holds every `GET
 * /api/agents/<machine>` for {@link ROW_DELAY_MS} before passing it on (the
 * forward's slowest measured answer, past the 3 s the probe waited) and
 * everything else straight through. The update helper's own verification
 * (cli binary-apply.ts `verify`, through trial-verify-child.ts) judges a
 * trial of the build the agent runs, swapped just before the agent started,
 * as a machine other than the hub's own, from a data dir of its own.
 *
 * (a) The slow hub's answers are read: the verdict is to keep the build,
 *     healthy and held for the confirmation's minute, never a rollback.
 * (b) Each of the probe's reads of the row waited out the proxy's hold:
 *     the hub was asked, slowly, and answered.
 * (c) A trial again, the row answered at once, but {@link SILENT_AFTER_MS}
 *     into the hold the hub falls silent for {@link SILENT_MS}: the proxy
 *     answers the row 502, as a machine's SSH forward does when the hub
 *     does not answer behind it (hub ssh-door.ts `unreachable`). The
 *     silence pauses the hold and counts neither way: the build is
 *     confirmed once its healthy time adds up to the minute, well before a
 *     whole new minute after the hub came back would end.
 *
 *   bun scripts/probe-kit/run.ts slow-hub-trial
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hubPath } from "../../../packages/agent/src/hub-client";
import type { TrialMarker } from "../../../packages/core/src/binary-installation";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE } from "../../scratch-fleet";
import type { Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const CHILD = join(ROOT, "scripts", "probe-kit", "trial-verify-child.ts");

/** How long the proxy holds each read of the machine's row: uwucloud's 4.2 to 5 s through its forward, 2026-11-05. */
const ROW_DELAY_MS = 4500;
/** The trial's deadline from the verification's start: room for the first answer and the minute's hold, and no more. */
const TRIAL_S = 100;
/** The longest the verification is waited on: past its deadline by the last probe's bound. */
const VERIFY_WAIT_MS = (TRIAL_S + 45) * 1000;
/** (c): how far into the hold the hub falls silent, and for how long. */
const SILENT_AFTER_MS = 20_000;
const SILENT_MS = 20_000;
/**
 * (c): the latest the confirmation may come after the hub answers again.
 * The hold is a minute; held {@link SILENT_AFTER_MS} before the silence, the
 * rest is ~40 s. A silence that reset the hold would need the whole minute.
 */
const CONFIRM_AFTER_SILENCE_MS = 50_000;

/** What the SSH door answers when the hub does not answer behind it (hub ssh-door.ts `unreachable`). */
const DOOR_UNREACHABLE = 502;
const spec: Spec = {
  group: "Release checks",
  name: "slow-hub-trial",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const row = (await fleet.api((hub) => hub.api.agents.get())).find(
      (one) => one.machineId === MACHINE
    );
    const version = row?.build?.version;
    const startedAt = row?.build?.startedAt;
    if (!(
      check(
        "the agent is online on a build it names, with its start",
        row?.status === "online" &&
          version !== undefined &&
          startedAt !== undefined,
        JSON.stringify(row)
      ) &&
      version !== undefined &&
      startedAt !== undefined
    )) {
      return;
    }

    // The slow hub: the row held, everything else passed straight on. In
    // (c) the row is answered at once, but goes silent for a stretch.
    const rowPath = hubPath.api.agents({ machineId: MACHINE })["~path"];
    const rowReads: number[] = [];
    let rowDelayMs = ROW_DELAY_MS;
    let silence: { from: number; to: number } | "armed" | undefined;
    let silentAnswers = 0;
    /** When (c)'s silence ends, once its first read set it. */
    let silenceEnd = Number.NaN;
    const proxy = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const held = url.pathname === rowPath;
        const asked = performance.now();
        if (held && silence === "armed") {
          // The first read of (c) is the first healthy answer: the hold starts here.
          silenceEnd = Date.now() + SILENT_AFTER_MS + SILENT_MS;
          silence = { from: silenceEnd - SILENT_MS, to: silenceEnd };
        }
        if (
          held &&
          typeof silence === "object" &&
          Date.now() >= silence.from &&
          Date.now() < silence.to
        ) {
          silentAnswers += 1;
          return new Response("The hub did not answer on its own port.\n", {
            status: DOOR_UNREACHABLE,
          });
        }
        if (held) {
          await Bun.sleep(rowDelayMs);
        }
        const answer = await fetch(
          `${fleet.base}${url.pathname}${url.search}`,
          {
            method: request.method,
            headers: request.headers,
            ...(request.method === "GET" || request.method === "HEAD"
              ? {}
              : { body: await request.arrayBuffer() }),
          }
        );
        const body = await answer.arrayBuffer();
        if (held) {
          rowReads.push(Math.round(performance.now() - asked));
        }
        // The body as fetch decoded it: its encoding and length go with it.
        const headers = new Headers(answer.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        return new Response(body, { status: answer.status, headers });
      },
    });

    // The helper's scratch data dir: the install names the proxy as its hub.
    const data = mkdtempSync(join(tmpdir(), "slow-hub-trial-"));
    /** One trial judged by the helper's own verification: its verdict, when it came, and what the helper said. */
    const judge = async () => {
      const swappedAt = Math.floor(startedAt / 1000) - 1;
      const trial: TrialMarker = {
        version,
        previous: "0.0.1-test.previous",
        role: "agent",
        swappedAt,
        decideBy: Math.floor(Date.now() / 1000) + TRIAL_S,
      };
      const child = Bun.spawn(["bun", CHILD, JSON.stringify(trial)], {
        cwd: ROOT,
        env: {
          ...process.env,
          HOME: data,
          XDG_DATA_HOME: data,
          XDG_CONFIG_HOME: join(data, "config"),
          CAWCO_MACHINE_ID: MACHINE,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const ended =
        (await readWithin(VERIFY_WAIT_MS, () => child.exited)).kind ===
        "answered";
      if (!ended) {
        child.kill("SIGKILL");
      }
      const [out, err] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const lines = out.trimEnd().split("\n");
      const verdict = lines.findLast((line) => line.startsWith("VERDICT "));
      const decidedAt = Number(
        lines.findLast((line) => line.startsWith("DECIDED "))?.slice(8)
      );
      const said = [
        ...lines.filter((line) => line.startsWith("update: ")).slice(-12),
        err.trim()
          ? `stderr: ${err.trim().split("\n").slice(-8).join(" | ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n    ");
      return {
        decidedAt,
        said: `${ended ? (verdict ?? "no verdict") : `no verdict within ${VERIFY_WAIT_MS / 1000}s`}\n    ${said}`,
        confirmed: ended && verdict === "VERDICT confirm",
      };
    };
    try {
      const binary = join(data, "cawco", "binary");
      mkdirSync(binary, { recursive: true });
      writeFileSync(
        join(binary, "installation.json"),
        JSON.stringify({
          hubUrl: proxy.url.origin,
          installedVersion: version,
          role: "agent",
          root: binary,
        })
      );
      const slow = await judge();
      check(
        `(a) a hub that answers the row in ${ROW_DELAY_MS / 1000}s: the build whose agent registered is kept, never rolled back`,
        slow.confirmed,
        slow.said
      );
      check(
        `(b) every read of the row waited out the hub's ${ROW_DELAY_MS / 1000}s and was answered`,
        rowReads.length > 0 && rowReads.every((ms) => ms >= ROW_DELAY_MS),
        `${rowReads.length} reads answered, in ${rowReads.join(", ")} ms`
      );

      rowDelayMs = 0;
      silence = "armed";
      const paused = await judge();
      const back = silenceEnd;
      const afterBack = paused.decidedAt - back;
      check(
        `(c) the hub silent for ${SILENT_MS / 1000}s in the middle of the hold: the build is confirmed once its healthy time adds up to the minute, within ${CONFIRM_AFTER_SILENCE_MS / 1000}s of the hub answering again, not a whole new minute`,
        paused.confirmed &&
          silentAnswers >= SILENT_MS / 2000 &&
          afterBack > 0 &&
          afterBack < CONFIRM_AFTER_SILENCE_MS,
        `${silentAnswers} reads answered ${DOOR_UNREACHABLE}; confirmed ${(afterBack / 1000).toFixed(1)}s after the hub answered again\n    ${paused.said}`
      );
    } finally {
      await proxy.stop(true);
      rmSync(data, { recursive: true, force: true });
    }
  },
};

export default spec;
