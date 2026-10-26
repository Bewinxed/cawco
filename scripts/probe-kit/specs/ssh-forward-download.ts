/**
 * Updates › a machine added over SSH downloads the build its hub offers
 * through the hub's forward (hub ssh-door.ts, binary-updates.ts), however
 * long the hub takes to fetch it from its release host.
 *
 * 2026-10-23, both VPSes added over SSH: "The hub could not supply the
 * build: 401", the hub's journal `[hub-auth] refused anonymous GET
 * /api/binary-updates/artifacts/…`. The first ask of a build waits while the
 * hub downloads its archive from GitHub; the door cut it at Bun's 10 s idle
 * default, the machine's fetch sent the same request again with the same
 * proof, and the hub, which takes each proof once, read it as no one's. A
 * hub that requires paired devices holds every caller through a forward so.
 *
 * The scratch target is the ssh2 server of ssh-password-join (ssh-target.ts)
 * on this host's loopback, trusting the hub's key: an add signs in by key,
 * the hub's connection forwards a port on the target's loopback to the
 * hub's door, the hub writes the machine's key there, and the install step
 * is held (`$HOME/.hold`, ssh-target.ts `machineBin`), so the forward stands
 * while the machine asks. The hub reaches GitHub through a proxy that holds
 * every answer while the spec says ({@link HOLD_MS}): a release host that
 * slow.
 *
 * (a) Through the forward, with the key the add wrote, the machine reads
 *     its update settings and then the offered build's archive for this
 *     host's target, as the updater does (core machine-key.ts
 *     `machineFetch`), while the release host's answer is held past the
 *     door's old cut: 200, the bytes the signed manifest names, and the hub
 *     refused nothing as anonymous.
 * (b) The same for another target's archive, which the hub fetches afresh,
 *     held {@link HUB_HOLD_MS}: past the hub's own idle timer, which its
 *     archive route lifts for the request (binary-updates.ts), since a cut
 *     there is the door's request sent again with the proof already taken.
 *
 *   bun scripts/probe-kit/run.ts ssh-forward-download
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AuthContext } from "ssh2";
import type { SshJoinJob } from "../../../packages/core/src/join";
import { until } from "../../scratch-fleet";
import { heldProxy } from "../held-proxy";
import { type Kit, ROOT, type Spec } from "../kit";
import { keyAccepted, machineBin, serveTarget, WAYS } from "../ssh-target";

const USER = "probe";
/** The machine the target is, as its proofs name it. */
const MACHINE = "ssh-forward-box";
/** How long the release host's answer is held: past the 10 s Bun's idle default cut at, and its next tick. */
const HOLD_MS = 25_000;
/**
 * How long leg (b) holds the release host: past the hub's own 120 s idle
 * timer (hub index.ts) and the up to twice that Bun takes to cut at it
 * (measured: a 10 s timer cut a silent request at 12 s).
 */
const HUB_HOLD_MS = 250_000;
/** The hub's step once it has written the machine's key there (hub join.ts `KEY_STEP`). */
const KEY_STEP = "giving the machine its key to this hub";
/** The refusal the VPSes' downloads met in the hub's log. */
const REFUSED =
  "[hub-auth] refused anonymous GET /api/binary-updates/artifacts/";

interface Manifest {
  artifacts: {
    archive: string;
    sha256: string;
    size: number;
    target: string;
  }[];
  version: string;
}

/** What the machine's ask said: its settings' status, then the build's answer. */
interface MachineRead {
  ms: number;
  said: string;
  settings: number;
  sha256: string;
  size: number;
  status: number;
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const dir = join(fleet.sandbox, "ssh-target");
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-probe-hub -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  const authorized = join(home, ".ssh", "authorized_keys");
  writeFileSync(authorized, readFileSync(`${hubKey}.pub`), { mode: 0o600 });
  writeFileSync(
    join(dir, "ssh_config"),
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\nStrictHostKeyChecking accept-new\n`
  );
  // OpenSSH reads `~` from the password database, never $HOME: the scratch
  // hub's key and known_hosts are named for it.
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`
  );
  chmodSync(join(bin, "ssh"), 0o755);
  const { port, server } = await serveTarget({
    authenticate: (ctx: AuthContext) => {
      if (
        ctx.username === USER &&
        ctx.method === "publickey" &&
        keyAccepted(authorized, ctx)
      ) {
        ctx.accept();
        return;
      }
      ctx.reject(WAYS);
    },
    home,
    host: "127.0.0.1",
    hostKey: readFileSync(join(dir, "host_key")),
    path: machineBin(join(dir, "machine-bin")),
    port: 0,
  });
  // The asset host alone: what a slow release host is slow to send.
  const proxy = await heldProxy((target) =>
    target.startsWith("release-assets.")
  );
  const hold = join(home, ".hold");
  let added: SshJoinJob | undefined;
  try {
    const loopback =
      fleet.env.no_proxy ?? fleet.env.NO_PROXY ?? "localhost,127.0.0.1,::1";
    fleet.launch("hub", [], {
      PATH: `${bin}:${fleet.env.PATH}`,
      HTTPS_PROXY: proxy.url,
      https_proxy: proxy.url,
      NO_PROXY: loopback,
      no_proxy: loopback,
    });
    await fleet.hubUp();
    const offer = await fleet
      .api<{ manifest?: Manifest }>("/api/binary-updates/latest")
      .catch((error: Error) => ({ manifest: undefined, error: error.message }));
    const target = `${process.platform}-${process.arch}`;
    const { manifest } = offer;
    const artifact = manifest?.artifacts.find((row) => row.target === target);
    kit.check(
      `the hub offers a build with a ${target} archive (found on GitHub, through the proxy)`,
      artifact !== undefined && proxy.targets().length > 0,
      `latest ${JSON.stringify(offer).slice(0, 400)}; proxy carried ${JSON.stringify(proxy.targets())}`
    );
    if (!(artifact && manifest)) {
      return;
    }

    // The add, held on the machine once its key is written: the forward stands.
    writeFileSync(hold, "");
    added = await fleet.api<SshJoinJob>("/api/machines/ssh", {
      target: `${USER}@127.0.0.1`,
      port,
    });
    const keyFile = join(home, ".config", "cawco", "machine-key");
    const job = await until(
      "the add carrying the hub and the machine's key written",
      () => fleet.api<SshJoinJob>(`/api/machines/ssh/${added?.id}`),
      (read) =>
        read.state !== "running" ||
        (Boolean(read.hubUrl) &&
          read.lines.some((line) => line.includes(KEY_STEP)) &&
          existsSync(keyFile)),
      60_000
    );
    const hubUrl = job.hubUrl ?? "";
    if (!(job.state === "running" && hubUrl && existsSync(keyFile))) {
      kit.check(
        "the add carries the hub to the machine and writes its key there",
        false,
        `${job.state}, hub ${hubUrl}; lines ${JSON.stringify(job.lines.slice(-6))}`
      );
      return;
    }

    // The machine's asks, as its updater makes them: its settings, then the build.
    const ask = join(dir, "ask-build.ts");
    writeFileSync(
      ask,
      `import { createHash } from "node:crypto";
import { machineFetch } from ${JSON.stringify(join(ROOT, "packages/core/src/machine-key.ts"))};
const [hub, url] = process.argv.slice(2);
const settings = await machineFetch(\`\${hub}/api/binary-updates/settings\`);
await settings.arrayBuffer();
console.error("asking");
const from = Date.now();
const answer = await machineFetch(url ?? "");
const bytes = new Uint8Array(await answer.arrayBuffer());
console.log(JSON.stringify({ settings: settings.status, status: answer.status, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, ms: Date.now() - from, said: answer.ok ? "" : new TextDecoder().decode(bytes).slice(0, 200) }));
`
    );
    /** One download of `wanted` through the forward, the release host held `holdMs` once the machine asks. */
    const download = async (
      leg: string,
      wanted: Manifest["artifacts"][number],
      holdMs: number,
      past: string
    ) => {
      const url = `${hubUrl}/api/binary-updates/artifacts/${encodeURIComponent(manifest.version)}/${encodeURIComponent(wanted.archive)}`;
      const child = Bun.spawn([process.execPath, ask, hubUrl, url], {
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          CAWCO_MACHINE_ID: MACHINE,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      // The release host answers once the hold is let go.
      const errors = (async () => {
        let said = "";
        let held = false;
        for await (const chunk of child.stderr) {
          said += new TextDecoder().decode(chunk);
          if (!held && said.includes("asking")) {
            held = true;
            proxy.hold(true);
            setTimeout(() => proxy.hold(false), holdMs);
          }
        }
        return said;
      })();
      const out = await new Response(child.stdout).text();
      await child.exited;
      const said = await errors;
      let got: MachineRead | undefined;
      try {
        got = JSON.parse(out) as MachineRead;
      } catch {
        // Not the ask's line: `got` stays undefined and the check says what came out.
      }
      const log = await fleet.logs("hub");
      const refused = log
        .split("\n")
        .filter(
          (line) => line.includes(REFUSED) && line.includes(wanted.archive)
        );
      kit.check(
        `${leg}: through the forward, with the key its add wrote, the machine's download of the offered build's ${wanted.target} archive waits out a release host held ${holdMs / 1000} s (${past}) and comes whole: 200, the signed manifest's bytes, nothing refused as anonymous`,
        got?.settings === 200 &&
          got.status === 200 &&
          got.sha256 === wanted.sha256 &&
          got.size === wanted.size &&
          got.ms >= holdMs &&
          refused.length === 0,
        `machine read ${JSON.stringify(got)} (wanted sha256 ${wanted.sha256}, ${wanted.size} bytes); its stderr ${JSON.stringify(said.slice(-400))}; hub refused ${JSON.stringify(refused)}; far ends closed ${JSON.stringify(proxy.closes())}; the hub's updates lines ${JSON.stringify(log.split("\n").filter((line) => line.startsWith("[updates]") && line.includes(wanted.archive)))}; idle cuts in the hub's log ${log.split("\n").filter((line) => line.includes("timed out a request")).length}`
      );
    };
    await download("a", artifact, HOLD_MS, "past the door's old 10 s cut");
    // Another target's archive, so the hub fetches it afresh: held past the
    // hub's own idle timer (index.ts `idleTimeout`), which its route lifts.
    const other = manifest.artifacts.find((row) => row.target !== target);
    if (other) {
      await download(
        "b",
        other,
        HUB_HOLD_MS,
        "past the hub's own 120 s idle timer and the cut after it"
      );
    } else {
      kit.check(
        "b: the offered build has an archive for another target to fetch afresh",
        false,
        JSON.stringify(manifest.artifacts.map((row) => row.target))
      );
    }
  } finally {
    rmSync(hold, { force: true });
    if (added) {
      await fleet
        .api(`/api/machines/ssh/${added.id}/stop`, {})
        .catch(() => undefined);
    }
    proxy.stop();
    server.close();
    writeFileSync(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default {
  group: "Release checks",
  name: "ssh-forward-download",
  run,
} satisfies Spec;
