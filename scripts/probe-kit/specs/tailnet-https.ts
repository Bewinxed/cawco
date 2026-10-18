/**
 * HTTPS on the hub machine's tailnet name (hub tailnet-https.ts), against a
 * stubbed `tailscale` on the hub's PATH whose state the probe sets. Its
 * tailnet address is `::1`, so the hub's TLS listeners stand on IPv6
 * loopback while its plain ones keep 127.0.0.1, as a real machine's keep
 * its LAN address beside the tailnet one.
 *
 * 1. absent (no daemon): `/api/tailnet-https` says `absent`; `/health`
 *    hands out no ts.net address; Needs you shows nothing.
 * 2. signed out: `signed-out`, still nothing to show.
 * 3. HTTPS off: `needs` · `enable-https`; Caw's Needs you shows "HTTPS on
 *    your tailnet" with the step's line and its one button, Open
 *    Tailscale's DNS page, at console.tailscale.com/admin/dns.
 * 4. operator missing (cert access denied): `needs` · `operator`, the row
 *    moves on to `sudo tailscale set --operator=<user>` and Copy command.
 * 5. HTTPS on: `serving`; the row ticks ("HTTPS is on." and Open the HTTPS
 *    dashboard at https://<name>:<port>), then leaves; `/health` hands out
 *    the https name as `dashboard` and `secureDashboard`. The dashboard
 *    answers over TLS on the tailnet address through the hub's relay, in a
 *    secure context with the name mapped there, its API and its socket
 *    included, while plain http on 127.0.0.1 still answers.
 * 6. A preview port (in-process listeners on the same stub): TLS on the
 *    tailnet address with `origin-agent-cluster: ?1`, plain http beside it;
 *    its address names its tailnet origin, which `previewRoute` gives a
 *    client that reached the hub over the tailnet and no other.
 *
 *   bun scripts/probe-kit/run.ts tailnet-https
 */
// biome-ignore-all lint/performance/noAwaitInLoops: each state is set, then waited on, before the next
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { freePortRange, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const NAME = "probe-box.tail0000.ts.net";
/** How long a state takes to be read: the hub reads Tailscale every 30 s. */
const READ_MS = 45_000;
/** An environment variable that names a proxy. */
const PROXY_VARIABLE = /proxy/i;
const ROW =
  ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) [data-slot="row"][data-kind="tailnet"]';

type StubState = "absent" | "signed-out" | "https-off" | "operator" | "on";

/**
 * `tailscale` as the hub runs it: `status --json` and `cert` by the state
 * file's word. Its files are written into it, never read from the
 * environment: a Bun process spawns with the environment it started with,
 * whatever this one sets later.
 */
const stubOf = (state: string, cert: string, key: string) => `#!/bin/sh
state=$(cat "${state}")
running='"BackendState":"Running","TUN":true,"CurrentTailnet":{"MagicDNSEnabled":true},"Self":{"DNSName":"${NAME}.","TailscaleIPs":["::1"]}'
case "$1" in
status)
  case "$state" in
  absent) echo "failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)" >&2; exit 1 ;;
  signed-out) echo '{"BackendState":"NeedsLogin","TUN":true,"Self":{"DNSName":"","TailscaleIPs":[]},"CertDomains":null}' ;;
  https-off) echo "{$running,\\"CertDomains\\":null}" ;;
  *) echo "{$running,\\"CertDomains\\":[\\"${NAME}\\"]}" ;;
  esac ;;
cert)
  if [ "$state" = operator ]; then
    echo "Access denied: cert access denied" >&2
    exit 1
  fi
  cat "${cert}" "${key}" ;;
*) exit 2 ;;
esac
`;

interface Read {
  command?: string;
  dashboard?: string;
  state: string;
  step?: string;
}

/** The row's words and its one button, as the engine has them. */
const readRow = (page: Page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(selector);
    if (!row) {
      return null;
    }
    const text = (slot: string) =>
      row.querySelector(`[data-slot="${slot}"]`)?.textContent?.trim() ?? "";
    const button = row.querySelector(
      '[data-slot="peers"] [data-slot="button"]'
    );
    return {
      name: text("name"),
      want: text("want"),
      meta: text("meta"),
      button: button?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      href: button?.getAttribute("href") ?? null,
      buttons: row.querySelectorAll('[data-slot="peers"] [data-slot="button"]')
        .length,
    };
  }, ROW);

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const stub = join(fleet.sandbox, "tailscale-stub");
  await mkdir(stub, { recursive: true });
  const cert = join(stub, "cert.pem");
  const key = join(stub, "key.pem");
  await Bun.$`openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ${key} -out ${cert} -days 1 -subj /CN=${NAME} -addext subjectAltName=DNS:${NAME},IP:::1`.quiet();
  const stateFile = join(stub, "state");
  await writeFile(join(stub, "tailscale"), stubOf(stateFile, cert, key));
  await chmod(join(stub, "tailscale"), 0o755);
  const set = (state: StubState) => writeFile(stateFile, state);
  const env = { PATH: `${stub}:${fleet.env.PATH}` };
  const read = async (): Promise<Read> =>
    (await fetch(`${fleet.base}/api/tailnet-https`)).json() as Promise<Read>;
  const health = async () =>
    (await fetch(`${fleet.base}/health`)).json() as Promise<{
      dashboard: string;
      secureDashboard: string | null;
    }>;
  const reads = (what: string, ok: (state: Read) => boolean) =>
    until(what, read, ok, READ_MS);

  // 1. absent.
  await set("absent");
  fleet.launch("hub", [], env);
  await fleet.hubUp();
  const absent = await reads(
    "the hub reading no Tailscale",
    (r) => r.state === "absent"
  );
  const before = await health();
  kit.check(
    "1: no daemon reads absent, and the hub hands out no ts.net address",
    absent.state === "absent" &&
      !before.dashboard.includes(NAME) &&
      !before.secureDashboard?.includes(NAME),
    `${JSON.stringify(absent)}; health ${JSON.stringify(before)}`
  );

  // The hub again, its dashboard port the built dashboard's, which its TLS
  // listener relays to on loopback.
  const base = await fleet.dashboard();
  const dashboardPort = new URL(base).port;
  await fleet.stop("hub");
  await set("signed-out");
  fleet.launch("hub", [], { ...env, CAWCO_DASHBOARD_PORT: dashboardPort });
  await fleet.hubUp();

  // 2. signed out.
  const signedOut = await reads("signed out", (r) => r.state === "signed-out");
  kit.check(
    "2: signed out reads signed-out, with no step",
    signedOut.step === undefined,
    JSON.stringify(signedOut)
  );

  // 3. HTTPS off: the step, in Caw's Needs you.
  const page = await kit.page("desk");
  await open(page, base, "[data-needs-caw]");
  await set("https-off");
  const off = await reads("HTTPS off", (r) => r.state === "needs");
  kit.check(
    "3: HTTPS certificates off reads needs · enable-https",
    off.step === "enable-https",
    JSON.stringify(off)
  );
  await page.click("[data-needs-caw]");
  await page.waitForSelector(ROW, { timeout: 30_000 });
  await settle(page, 300);
  const asking = await readRow(page);
  kit.check(
    "3: Needs you shows HTTPS on your tailnet, the step's line, and one button that opens Tailscale's DNS page",
    asking?.name === "HTTPS on your tailnet" &&
      asking.want.startsWith(
        "Turn on HTTPS Certificates on Tailscale's DNS page"
      ) &&
      asking.meta.startsWith("Onboarding · Tailscale on ") &&
      asking.buttons === 1 &&
      asking.button === "Open Tailscale's DNS page" &&
      asking.href === "https://console.tailscale.com/admin/dns",
    JSON.stringify(asking)
  );

  // 4. The operator right missing: the row moves on to its command.
  await set("operator");
  const operator = await reads(
    "cert access denied",
    (r) => r.step === "operator"
  );
  const command = `sudo tailscale set --operator=${userInfo().username}`;
  kit.check(
    "4: cert access denied reads needs · operator, with the command",
    operator.command === command,
    JSON.stringify(operator)
  );
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent?.includes("Copy command"),
    ROW,
    { timeout: 30_000 }
  );
  const copying = await readRow(page);
  kit.check(
    "4: the row says to run the command there once, its one button Copy command",
    copying?.want.includes(`Run ${command} there once.`) === true &&
      copying.buttons === 1 &&
      copying.button === "Copy command",
    JSON.stringify(copying)
  );

  // 5. HTTPS on: the row ticks, the hub serves the name and hands it out.
  await set("on");
  const on = await reads("serving", (r) => r.state === "serving");
  const https = `https://${NAME}:${dashboardPort}`;
  kit.check(
    "5: a certificate reads serving, at the https name",
    on.dashboard === https,
    JSON.stringify(on)
  );
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent?.includes("HTTPS is on."),
    ROW,
    { timeout: 30_000 }
  );
  const ticked = await readRow(page);
  kit.check(
    "5: the row ticks: HTTPS is on, and its one button opens the https dashboard",
    ticked?.want ===
      `HTTPS is on. Every device on your tailnet opens CawCo at ${https}.` &&
      ticked.button === "Open the HTTPS dashboard" &&
      ticked.href === https,
    JSON.stringify(ticked)
  );
  await page.waitForSelector(ROW, { state: "detached", timeout: 30_000 });
  kit.check("5: the ticked row leaves Needs you", true);
  const after = await health();
  kit.check(
    "5: /health hands out the https name as the dashboard and the secure dashboard",
    after.dashboard === https && after.secureDashboard === https,
    JSON.stringify(after)
  );

  const tls = { rejectUnauthorized: false };
  const overTls = await fetch(`https://[::1]:${dashboardPort}/`, { tls });
  const plain = await fetch(`http://127.0.0.1:${dashboardPort}/`);
  kit.check(
    "5: the dashboard answers over TLS on the tailnet address, and plain http on 127.0.0.1 still answers",
    overTls.status === 200 &&
      (await overTls.text()).includes("<html") &&
      plain.status === 200,
    `tls ${overTls.status}, plain ${plain.status}`
  );
  const socket = await new Promise<string>((done) => {
    const ws = new WebSocket(`wss://[::1]:${dashboardPort}/ws/dashboard`, {
      headers: { origin: `https://[::1]:${dashboardPort}` },
      tls,
    } as never);
    const timer = setTimeout(() => done("no frame within 15 s"), 15_000);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      ws.close();
      done(`frame ${String(event.data).slice(0, 60)}`);
    };
    ws.onerror = () => done("error");
  });
  kit.check(
    "5: the dashboard's socket opens through the relay over TLS and hears the hub",
    socket.startsWith("frame "),
    socket
  );

  // The dashboard on its name, as a device on the tailnet opens it: the name
  // mapped to the tailnet address, with none of a workspace's proxy
  // variables, which Chromium takes over its own flags and whose proxy can't
  // reach the name (measured: 407, ERR_TUNNEL_CONNECTION_FAILED).
  const browser = await chromium.launch({
    headless: true,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          !PROXY_VARIABLE.test(entry[0]) && entry[1] !== undefined
      )
    ),
    args: ["--no-sandbox", `--host-resolver-rules=MAP ${NAME} [::1]`],
  });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const named = await context.newPage();
    await open(named, `${https}/`, "[data-needs-caw]");
    const secure = await named.evaluate(async () => ({
      secure: window.isSecureContext,
      origin: location.origin,
      api: (await fetch("/api/tailnet-https")).status,
    }));
    kit.check(
      "5: on its name the dashboard loads in a secure context, its API through the relay",
      secure.secure && secure.origin === https && secure.api === 200,
      JSON.stringify(secure)
    );
  } finally {
    await browser.close();
  }

  // 6. A preview port, in-process on the same stub: named by its path, since
  // Bun finds a bare command on the PATH this process started with.
  Object.assign(process.env, {
    CAWCO_DB_PATH: join(fleet.sandbox, "in-process.db"),
    CAWCO_PREVIEW_PORTS: await freePortRange(4),
  });
  const { createTailnetHttps } =
    await import("../../../packages/hub/src/tailnet-https");
  const { createPreviewListeners } =
    await import("../../../packages/hub/src/preview");
  const { previewRoute } = await import("../../../packages/core/src/frames");
  const tailnet = createTailnetHttps({
    bin: join(stub, "tailscale"),
    dashboardPort: 1,
  });
  const serving = new Promise<boolean>((done) => {
    const timer = setTimeout(() => done(false), READ_MS);
    tailnet.onChange((state) => {
      if (state.state === "serving") {
        clearTimeout(timer);
        done(true);
      }
    });
  });
  tailnet.start();
  if (
    !kit.check(
      "6: the in-process listeners read the stub as serving",
      await serving,
      JSON.stringify(tailnet.state())
    )
  ) {
    return;
  }
  const listeners = createPreviewListeners(
    "127.0.0.1",
    {} as Parameters<typeof createPreviewListeners>[1],
    {
      settings: () => ({ mode: "port", pattern: null }),
      ports: () => [],
      keepPort: () => undefined,
      dropPort: () => undefined,
      setSettings: () => undefined,
    } as unknown as Parameters<typeof createPreviewListeners>[2],
    tailnet
  );
  const session = "00000000-0000-4000-8000-00000000a011";
  try {
    const address = listeners.address(session);
    const secured = await fetch(`https://[::1]:${address.port}/`, { tls });
    const beside = await fetch(`http://127.0.0.1:${address.port}/`);
    kit.check(
      "6: a preview port answers TLS on the tailnet address with origin-agent-cluster ?1, and plain http beside it",
      secured.headers.get("origin-agent-cluster") === "?1" &&
        beside.headers.get("origin-agent-cluster") === "?1",
      `tls ${secured.status} ${secured.headers.get("origin-agent-cluster")}, plain ${beside.status}`
    );
    const origin = `https://${NAME}:${address.port}`;
    const viaTailnet = previewRoute(address, {
      hostname: "[::1]",
      protocol: "http:",
    });
    const viaName = previewRoute(address, {
      hostname: NAME,
      protocol: "https:",
    });
    const viaLan = previewRoute(address, {
      hostname: "127.0.0.1",
      protocol: "http:",
    });
    kit.check(
      "6: its address names the tailnet origin, which a client on the tailnet loads and a LAN client does not",
      address.tailnet?.origin === origin &&
        viaTailnet?.origin === origin &&
        viaName?.origin === origin &&
        viaLan?.origin === `http://127.0.0.1:${address.port}`,
      JSON.stringify({ address, viaTailnet, viaName, viaLan })
    );
  } finally {
    listeners.release(session);
    await set("absent");
  }
};

export default { name: "tailnet-https", run } satisfies Spec;
