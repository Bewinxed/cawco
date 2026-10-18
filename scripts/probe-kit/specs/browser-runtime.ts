/**
 * A project's browser on this machine (Projects spec §5.11, build item 1):
 * the container runtime found, our image built, a browser started cold and
 * warm on the container host with its profile kept, the media port
 * published for UDP and TCP on every address (TCP alone where the runtime
 * forwards no UDP, as Colima on ssh) with the capability saying the same, its
 * idle RAM, and the local host (a headless Chromium) when the runtime is
 * hidden. Each start and the
 * RAM are the measurement table's rows: cold ≤ 15 s on Linux, ≤ 25 s on a
 * Mac; warm ≤ 6 s; idle RAM ≤ 1.2 GB; the local host ≤ 4 s.
 *
 * It drives the agent's registry in this process, as `cawco browser` does,
 * with a data dir of its own and keys no project has, so the machine's own
 * browsers are untouched; it removes what it made. Run on the host, outside
 * every workspace boundary (a boundary hides the runtime's socket):
 *
 *   bun scripts/probe-kit/run.ts browser-runtime
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import type { BrowserKey } from "../../../packages/core/src/browser";
import type { Kit, Spec } from "../kit";

type Browsers = typeof import("../../../packages/agent/src/browser/browsers");
type Container = ReturnType<Runtime["docker"]["getContainer"]>;

const CONTAINER_KEY: BrowserKey = "project:probe-runtime";
const LOCAL_KEY: BrowserKey = "project:probe-runtime-local";
const MARK = "/home/neko/.config/chromium/cawco-probe-mark";
/** How long the browser sits untouched before its RAM is read. */
const SETTLE_MS = 20_000;
const MAC = process.platform === "darwin";
const COLD_S = MAC ? 25 : 15;
const WARM_S = 6;
const LOCAL_S = 4;
const IDLE_MB = 1200;
const TAG = /^cawco-browser:[0-9a-f]{12}$/;
const CHROME = /^(?:Headless)?Chrome\/1\d\d/;

const seconds = (since: number): number =>
  Math.round((performance.now() - since) / 100) / 10;

/** Who holds `port` for `proto` on this machine, as `ss` (Linux) or `lsof` (macOS) says. */
const listeners = (proto: "udp" | "tcp", port: number): string => {
  const argv = MAC
    ? ["lsof", "-nP", `-i${proto.toUpperCase()}:${port}`]
    : ["ss", proto === "udp" ? "-lunp" : "-ltnp"];
  return Bun.spawnSync(argv)
    .stdout.toString()
    .split("\n")
    .filter((line) => line.includes(`:${port}`))
    .join(" | ");
};

/** Runs `cmd` in the container as neko and answers what it wrote, once it has ended. */
const execText = async (
  container: Container,
  cmd: string[]
): Promise<string> => {
  const exec = await container.exec({
    Cmd: cmd,
    User: "neko",
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  return new Promise<string>((resolve, reject) => {
    let text = "";
    stream.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    stream.on("end", () => resolve(text));
    stream.on("error", reject);
  });
};

/** A browser's record as the registry wrote it under `data`. */
const recordOf = async (
  data: string,
  key: BrowserKey
): Promise<{ container?: { id: string; volume: string } }> =>
  JSON.parse(
    await readFile(
      join(data, "cawco", "browsers", key.replace(":", "-"), "record.json"),
      "utf8"
    )
  );

/** The runtime, the refused socket (obelisk's), and the image. */
const runtimeAndImage = async (kit: Kit): Promise<Runtime | undefined> => {
  const { findRuntime, probeEndpoint } =
    await import("../../../packages/agent/src/browser/runtime");
  const { ensureImage } =
    await import("../../../packages/agent/src/browser/image");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    kit.check("runtime found", false, runtime.missing);
    return;
  }
  kit.check(
    `runtime found kind=${runtime.kind} endpoint=${runtime.endpoint} api=${runtime.api}${runtime.rootless ? " rootless" : ""}`,
    true
  );
  const docker = "/var/run/docker.sock";
  const answer = await probeEndpoint(docker);
  if ("refused" in answer) {
    kit.check(
      `${docker} refused (${answer.refused}) and skipped`,
      runtime.endpoint !== docker
    );
  } else {
    kit.note(
      `${docker}: ${"absent" in answer ? "no such socket" : `answers (${answer.runtime.kind})`}; the refusal row is obelisk's`
    );
  }
  const imageAt = performance.now();
  const tag = await ensureImage(runtime.docker, "cawco-browser", (step) =>
    kit.note(`image: ${step.stage} ${step.done}/${step.total}`)
  );
  kit.check(`image ${tag} built`, TAG.test(tag));
  kit.note(`measurement: first image ready in ${seconds(imageAt)} s`);
  return runtime;
};

/** Cold start, DevTools, the media port, then a mark in the profile, stop, warm start, the mark read back, and idle RAM. */
const containerHost = async (
  kit: Kit,
  browsers: Browsers,
  runtime: Runtime,
  data: string
): Promise<void> => {
  await browsers.removeBrowser(CONTAINER_KEY);
  const coldAt = performance.now();
  const cold = await browsers.startBrowser({ key: CONTAINER_KEY });
  const coldS = seconds(coldAt);
  const { http, devtools, gate, media = 0 } = cold.ports ?? {};
  kit.check(
    `${CONTAINER_KEY} live in ${coldS} s (cold, ≤ ${COLD_S} s) ports http=${http} devtools=${devtools} gate=${gate} media=${media}`,
    cold.state === "live" && cold.host === "container" && coldS <= COLD_S,
    `${cold.state} on ${cold.host}`
  );

  const version = (await fetch(
    `http://127.0.0.1:${devtools}/json/version`
  ).then((response) => response.json())) as { Browser?: string };
  kit.check(
    `/json/version answers ${version.Browser}`,
    CHROME.test(version.Browser ?? ""),
    JSON.stringify(version)
  );

  const udp = listeners("udp", media);
  const tcp = listeners("tcp", media);
  const everywhere = (line: string): boolean =>
    line.includes(`0.0.0.0:${media}`) || line.includes(`*:${media}`);
  const tool = MAC ? "lsof" : "ss -lunp / ss -ltnp";
  const bound = `udp: ${udp || "nothing"}; tcp: ${tcp || "nothing"}`;
  const { mediaForwarding } =
    await import("../../../packages/agent/src/browser/media-forwarding");
  const forwarding = await mediaForwarding(runtime.endpoint);
  if (forwarding.udp) {
    kit.check(
      `media ${media} bound udp and tcp on 0.0.0.0 (${tool})`,
      everywhere(udp) && everywhere(tcp),
      bound
    );
  } else {
    kit.check(
      `media ${media} bound tcp on 0.0.0.0 and udp nowhere, the runtime forwarding no UDP (${tool})`,
      everywhere(tcp) && !udp,
      bound
    );
    kit.note(forwarding.advice);
  }
  const { probeCapabilities } =
    await import("../../../packages/agent/src/capabilities");
  const capability = (await probeCapabilities()).items.find(
    (item) => item.id === "container-runtime"
  );
  kit.check(
    `container-runtime capability udp=${capability?.udp} matches udp bound=${everywhere(udp)}`,
    capability?.udp === everywhere(udp),
    JSON.stringify(capability)
  );

  const first = await recordOf(data, CONTAINER_KEY);
  await execText(runtime.docker.getContainer(first.container?.id ?? ""), [
    "sh",
    "-c",
    `echo kept > ${MARK}`,
  ]);
  await browsers.stopBrowser(CONTAINER_KEY);
  const warmAt = performance.now();
  const warm = await browsers.startBrowser({ key: CONTAINER_KEY });
  const warmS = seconds(warmAt);
  const again = await recordOf(data, CONTAINER_KEY);
  const container = runtime.docker.getContainer(again.container?.id ?? "");
  const said = await execText(container, ["cat", MARK]);
  kit.check(
    `stop then start live in ${warmS} s (warm, ≤ ${WARM_S} s), same volume`,
    warm.state === "live" &&
      warmS <= WARM_S &&
      again.container?.volume === first.container?.volume &&
      said.includes("kept"),
    `volume ${first.container?.volume} → ${again.container?.volume}; mark: ${JSON.stringify(said.trim())}`
  );

  await Bun.sleep(SETTLE_MS);
  const stats = (await container.stats({ stream: false })) as {
    memory_stats?: { usage?: number; stats?: { inactive_file?: number } };
  };
  const usage =
    (stats.memory_stats?.usage ?? 0) -
    (stats.memory_stats?.stats?.inactive_file ?? 0);
  const mb = Math.round(usage / 1024 / 1024);
  kit.check(
    `idle RAM ${mb} MB (≤ ${IDLE_MB} MB, ${SETTLE_MS / 1000} s after start)`,
    mb > 0 && mb <= IDLE_MB,
    JSON.stringify(stats.memory_stats)
  );
  await browsers.removeBrowser(CONTAINER_KEY);
};

/** The runtime hidden: the same start runs a local Chromium, its profile's preferences written first. */
const localHost = async (
  kit: Kit,
  browsers: Browsers,
  data: string
): Promise<void> => {
  process.env.DOCKER_HOST = "unix:///nonexistent";
  const none = await browsers.browserRuntime(true);
  const localAt = performance.now();
  const local = await browsers.startBrowser({ key: LOCAL_KEY });
  const localS = seconds(localAt);
  const preferences = JSON.parse(
    await readFile(
      join(
        data,
        "cawco",
        "browsers",
        "project-probe-runtime-local",
        "profile",
        "Default",
        "Preferences"
      ),
      "utf8"
    )
  ) as {
    autofill?: { credit_card_enabled?: boolean; profile_enabled?: boolean };
    credentials_enable_service?: boolean;
  };
  const { autofill } = preferences;
  kit.check(
    `local host (runtime hidden by DOCKER_HOST=unix:///nonexistent) live in ${localS} s (≤ ${LOCAL_S} s), profile written with credentials_enable_service=false`,
    "missing" in none &&
      local.state === "live" &&
      local.host === "local" &&
      localS <= LOCAL_S &&
      preferences.credentials_enable_service === false &&
      autofill?.profile_enabled === false &&
      autofill?.credit_card_enabled === false,
    `${local.state} on ${local.host}; ${JSON.stringify({ credentials_enable_service: preferences.credentials_enable_service, autofill })}`
  );
  await browsers.removeBrowser(LOCAL_KEY);
};

const run = async (kit: Kit): Promise<void> => {
  const data = await mkdtemp(join(tmpdir(), "cawco-browser-runtime-"));
  process.env.XDG_DATA_HOME = data;
  const hidden = process.env.DOCKER_HOST;
  const browsers = await import("../../../packages/agent/src/browser/browsers");
  try {
    const runtime = await runtimeAndImage(kit);
    if (runtime) {
      await containerHost(kit, browsers, runtime, data);
    }
    await localHost(kit, browsers, data);
  } finally {
    if (hidden === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = hidden;
    }
    await browsers.browserRuntime(true);
    await Promise.allSettled([
      browsers.removeBrowser(CONTAINER_KEY),
      browsers.removeBrowser(LOCAL_KEY),
    ]);
    await rm(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  name: "browser-runtime",
  run,
};

export default spec;
