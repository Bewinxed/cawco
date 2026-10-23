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
 * 3. A fresh tailnet (MagicDNS off, no certificates, no operator): `needs`
 *    with both steps standing; Caw's Needs you shows "HTTPS on your
 *    tailnet", its line, and the two steps in order: the admin console's
 *    switches with Open Tailscale's DNS page at console.tailscale.com/admin/dns,
 *    and `sudo tailscale set --operator=<user>` whole in its command box. At
 *    the desk and on the phone, light and dark: nothing wider
 *    than the row, the command never cut.
 * 4. Each step ticks by itself, in either order: the operator given first
 *    (its tick, the admin step still standing), then HTTPS on with the
 *    operator missing (the admin tick, the command standing), then the
 *    operator refused by `tailscale cert` where the prefs can't be read
 *    (a macOS hub's way).
 * 5. HTTPS on: `serving`; the row ticks ("HTTPS is on." and Open the HTTPS
 *    dashboard at https://<name>:<port>), then leaves; `/health` hands out
 *    the https name as `dashboard` and `secureDashboard`. The dashboard
 *    answers over TLS on the tailnet address through the hub's relay, in a
 *    secure context with the name mapped there, its API and its socket
 *    included, while plain http on 127.0.0.1 still answers. Plain http on
 *    the tailnet address, by the address and by the name, answers the door's
 *    308 to `https://<name>:<port>` with the path and query (hub
 *    tailnet-door.ts). A new pair (a renewal) is served on new connections
 *    while a socket opened on the old one stays open.
 * 6. A preview port (in-process listeners on the same stub): TLS on the
 *    tailnet address with `origin-agent-cluster: ?1`, plain http beside it,
 *    and plain http on the tailnet address the door's 308 as in 5; its
 *    address names its tailnet origin, which `previewRoute` gives a client
 *    that reached the hub over the tailnet and no other.
 *
 *   bun scripts/probe-kit/run.ts tailnet-https
 */
// biome-ignore-all lint/performance/noAwaitInLoops: each state is set, then waited on, before the next
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { connect } from "node:tls";
import { chromium, type Page } from "playwright-core";
import { tailnetWords } from "../../../packages/core/src/words/tailnet";
import { leasePortRange, until } from "../../scratch-fleet";
import { launchEnv } from "../browser-leftovers";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

export const NAME = "probe-box.tail0000.ts.net";
/** How long a state takes to be read: the hub reads Tailscale every 5 s while a step stands, else every 30 s. */
const READ_MS = 45_000;
/** An environment variable that names a proxy. */
const PROXY_VARIABLE = /proxy/i;
const ROW =
  ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) [data-slot="row"][data-kind="tailnet"]';
const USER = userInfo().username;
const COMMAND = `sudo tailscale set --operator=${USER}`;

/**
 * The stub's states, as a person meets them:
 * - `fresh`: a new tailnet: MagicDNS off, no certificates, no operator;
 * - `operator-first`: the operator given, the admin console's switches not yet;
 * - `https-off`: MagicDNS on, no certificates, no operator;
 * - `operator`: certificates on, no operator (`cert` refused);
 * - `denied`: certificates on, the prefs unreadable and `cert` refused;
 * - `on`: certificates on, the operator given, `cert` answers.
 */
type StubState =
  | "absent"
  | "signed-out"
  | "fresh"
  | "operator-first"
  | "https-off"
  | "operator"
  | "denied"
  | "on";

/**
 * `tailscale` as the hub runs it: `status --json`, `debug prefs` and `cert`
 * by the state file's word. Its files are written into it, never read from
 * the environment: a Bun process spawns with the environment it started
 * with, whatever this one sets later.
 */
const stubOf = (state: string, cert: string, key: string) => `#!/bin/sh
state=$(cat "${state}")
self='"BackendState":"Running","TUN":true,"Self":{"DNSName":"${NAME}.","TailscaleIPs":["::1"]}'
case "$1" in
status)
  case "$state" in
  absent) echo "failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)" >&2; exit 1 ;;
  signed-out) echo '{"BackendState":"NeedsLogin","TUN":true,"Self":{"DNSName":"","TailscaleIPs":[]},"CertDomains":null}' ;;
  fresh|operator-first) echo "{$self,\\"CurrentTailnet\\":{\\"MagicDNSEnabled\\":false},\\"CertDomains\\":null}" ;;
  https-off) echo "{$self,\\"CurrentTailnet\\":{\\"MagicDNSEnabled\\":true},\\"CertDomains\\":null}" ;;
  *) echo "{$self,\\"CurrentTailnet\\":{\\"MagicDNSEnabled\\":true},\\"CertDomains\\":[\\"${NAME}\\"]}" ;;
  esac ;;
debug)
  case "$state" in
  denied) echo "prefs access denied" >&2; exit 1 ;;
  operator-first|on) echo '{"OperatorUser":"${USER}"}' ;;
  *) echo '{}' ;;
  esac ;;
cert)
  case "$state" in
  operator|denied) echo "Access denied: cert access denied" >&2; exit 1 ;;
  esac
  cat "${cert}" "${key}" ;;
*) exit 2 ;;
esac
`;

/**
 * The stub on `fleet`'s PATH (`env`), its certificate for {@link NAME}
 * written by `pairAt` (again for a renewal), its state set by `set`.
 */
export const tailnetStub = async (fleet: KitFleet) => {
  const stub = join(fleet.sandbox, "tailscale-stub");
  await mkdir(stub, { recursive: true });
  const cert = join(stub, "cert.pem");
  const key = join(stub, "key.pem");
  const pairAt = () =>
    Bun.$`openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ${key} -out ${cert} -days 1 -subj /CN=${NAME} -addext subjectAltName=DNS:${NAME},IP:::1`.quiet();
  await pairAt();
  const stateFile = join(stub, "state");
  const bin = join(stub, "tailscale");
  await writeFile(bin, stubOf(stateFile, cert, key));
  await chmod(bin, 0o755);
  return {
    bin,
    env: { PATH: `${stub}:${fleet.env.PATH}` },
    pairAt,
    set: (state: StubState) => writeFile(stateFile, state),
  };
};

/**
 * Plain http to `port` on the tailnet address `[::1]`, named by `host` (the
 * address itself when absent): its status and Location, never followed.
 */
export const plainAt = async (
  port: number | string,
  path: string,
  host?: string
) => {
  const answer = await fetch(`http://[::1]:${port}${path}`, {
    redirect: "manual",
    ...(host ? { headers: { host } } : {}),
  });
  return `${answer.status} ${answer.headers.get("location")}`;
};

interface Read {
  command?: string;
  dashboard?: string;
  state: string;
  step?: string;
  steps?: { command?: string; done: boolean; step: string }[];
}

/** The steps as the hub says them: `step:done` each, in order. */
const stepsOf = (read: Read): string =>
  (read.steps ?? [])
    .map((todo) => `${todo.step}:${todo.done ? "done" : "stands"}`)
    .join(" ");

/**
 * The row's words, its steps and its one button, as the engine has them:
 * each step's label, note, tick, command (whole, and whether its box shows
 * it whole) and link; and whether anything in the row is wider than it.
 */
const readRow = (page: Page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(selector);
    if (!row) {
      return null;
    }
    const text = (slot: string, from: Element = row) =>
      from
        .querySelector(`[data-slot="${slot}"]`)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "";
    const button = row.querySelector(
      '[data-slot="peers"] [data-slot="button"]'
    );
    const edge = row.getBoundingClientRect().right;

    /**
     * The mark's centre against the label's first line's: the label's box is
     * its lines, each one line-height tall (the mark line's padding gives
     * back what its trim took).
     */
    const geometry = (step: Element) => {
      const labelBox = step.querySelector('[data-slot="step-label"]');
      const markRect = step
        .querySelector('[data-slot="step-mark"]')
        ?.getBoundingClientRect();
      if (!(labelBox && markRect)) {
        return { lines: 0, markOff: null };
      }
      const lineHeight = Number.parseFloat(
        getComputedStyle(labelBox).lineHeight
      );
      const labelRect = labelBox.getBoundingClientRect();
      return {
        lines: Math.round(labelRect.height / lineHeight),
        markOff: Math.abs(
          markRect.top + markRect.height / 2 - (labelRect.top + lineHeight / 2)
        ),
      };
    };

    /** The label as it shows, without what only a screen reader hears ("Done: …"), and as it is spoken. */
    const labelOf = (step: Element) => ({
      label: [
        ...(step.querySelector('[data-slot="step-label"]')?.childNodes ?? []),
      ]
        .filter(
          (node) =>
            !(node instanceof Element && node.classList.contains("sr-only"))
        )
        .map((node) => node.textContent)
        .join("")
        .trim(),
      spoken: text("step-label", step),
    });

    /** The number a standing step draws (its attribute, through `::before`), and whether it is hidden from a screen reader. */
    const numberOf = (step: Element) => {
      const shown = step.querySelector('[data-slot="step-number"]');
      return {
        number:
          shown && getComputedStyle(shown, "::before").content !== "none"
            ? shown.getAttribute("data-n")
            : null,
        numberHidden: shown?.getAttribute("aria-hidden") ?? null,
      };
    };

    /** What a hand's selection over `code` copies: its words with their spaces. */
    const selectionOf = (code: Element): string => {
      const selection = getSelection();
      if (!selection) {
        return "";
      }
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
      const copied = selection.toString();
      selection.removeAllRanges();
      return copied;
    };

    /** A step's command box: its words, whether it shows them whole, its Copy and its height. */
    const commandOf = (step: Element) => {
      const code = step.querySelector('[data-slot="step-command"] code');
      if (!code) {
        return {
          command: null,
          commandWhole: null,
          wordsWhole: null,
          selected: null,
          copy: null,
          boxMinHeight: null,
        };
      }
      const line = Number.parseFloat(getComputedStyle(code).lineHeight);
      const box = code.parentElement;
      return {
        command: code.textContent,
        commandWhole: code.scrollWidth <= code.clientWidth,
        // Each word on one line: broken between words, never inside one.
        wordsWhole: [...code.querySelectorAll('[data-slot="word"]')].every(
          (word) => word.getBoundingClientRect().height <= line + 0.5
        ),
        selected: selectionOf(code),
        copy: box?.querySelector("button")?.textContent?.trim() ?? null,
        boxMinHeight: box ? getComputedStyle(box).minHeight : null,
      };
    };

    return {
      name: text("name"),
      want: text("want"),
      meta: text("meta"),
      steps: [...row.querySelectorAll('[data-slot="step"]')].map((step) => {
        const link = step.querySelector('[data-slot="step-link"] a');
        return {
          step: step.getAttribute("data-step"),
          done: step.hasAttribute("data-done"),
          ticked: step.querySelector('[data-slot="step-mark"] svg') !== null,
          ...labelOf(step),
          ...geometry(step),
          ...numberOf(step),
          ...commandOf(step),
          note: text("step-note", step),
          link: link?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          href: link?.getAttribute("href") ?? null,
        };
      }),
      listRole:
        row.querySelector('[data-slot="steps"]')?.getAttribute("role") ?? null,
      button: button?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      href: button?.getAttribute("href") ?? null,
      buttons: row.querySelectorAll('[data-slot="peers"] [data-slot="button"]')
        .length,
      spills: [...row.querySelectorAll("*")].some(
        (one) => one.getBoundingClientRect().right > edge + 0.5
      ),
    };
  }, ROW);

type Row = NonNullable<Awaited<ReturnType<typeof readRow>>>;

const LISTITEM = /^\s*- listitem/;
const DIGIT_ONLY = /^\s*- (text: )?"?\d+"?\s*$/;

/**
 * Chromium's accessibility tree of the steps (Playwright's ARIA snapshot)
 * read as a person with a screen reader meets it: a list, one listitem per
 * step whose first words are its label as spoken, and no digit alone.
 */
const treeReads = (tree: string, row: Row): boolean => {
  const lines = tree.split("\n");
  const items = lines.flatMap((line, at) =>
    LISTITEM.test(line) ? [`${line} ${lines[at + 1] ?? ""}`] : []
  );
  return (
    lines[0]?.trim().startsWith("- list") === true &&
    items.length === row.steps.length &&
    row.steps.every((todo, at) => items[at]?.includes(todo.spoken)) &&
    !lines.some((line) => DIGIT_ONLY.test(line))
  );
};

/** Where the row is read: the desk light first, its words' reference. */
const PASSES = [
  { view: "desk", theme: "light" },
  { view: "desk", theme: "dark" },
  { view: "phone", theme: "light" },
  { view: "phone", theme: "dark" },
] as const;

type Hand = (typeof PASSES)[number]["view"];

/** A press where a hand presses: the mouse at the desk, a finger's tap on the phone. */
const press = async (page: Page, view: Hand, selector: string) => {
  const at = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find(
      (one) => one.getBoundingClientRect().width > 0
    );
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, selector);
  if (!at) {
    throw new Error(`nothing drawn at ${selector}`);
  }
  await (view === "phone"
    ? page.touchscreen.tap(at.x, at.y)
    : page.mouse.click(at.x, at.y));
};

/** Caw's panel opened from his head in the bar, as a hand opens it. */
const openNeeds = async (page: Page, view: Hand, base: string) => {
  await open(page, base, "[data-needs-caw]");
  await press(page, view, "[data-needs-caw]");
  await page.waitForSelector(
    ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"])[data-shown]',
    { timeout: 30_000 }
  );
  await settle(page, 400);
};

/**
 * 5, the door and a renewal on the dashboard's port (`dashboardPort`,
 * served on {@link NAME}): plain http on the tailnet address answers the
 * door's 308 to the name, the path and query kept, by the address and by
 * the name, and nothing is served; then a new pair (`pairAt`) is served on
 * new connections while a socket opened on the old one stays open (the new
 * listener opens before the old one stops).
 */
const doorAndRenewal = async (
  kit: Kit,
  dashboardPort: string,
  pairAt: () => Promise<unknown>
) => {
  const https = `https://${NAME}:${dashboardPort}`;
  const byAddress = await plainAt(dashboardPort, "/session?from=ip");
  const byName = await plainAt(
    dashboardPort,
    "/a/b?c=d&e",
    `${NAME}:${dashboardPort}`
  );
  kit.check(
    "5: plain http to the dashboard port on the tailnet address answers 308 to https://<name>:<port> with the path and query, by the address and by the name",
    byAddress === `308 ${https}/session?from=ip` &&
      byName === `308 ${https}/a/b?c=d&e`,
    `by address: ${byAddress}; by name: ${byName}`
  );

  // The served certificate as a new connection meets it (fetch runs no
  // checkServerIdentity under rejectUnauthorized: false, measured on 1.4.4).
  const fingerprint = () =>
    new Promise<string>((done) => {
      const socket = connect(
        {
          host: "::1",
          port: Number(dashboardPort),
          servername: NAME,
          rejectUnauthorized: false,
        },
        () => {
          done(socket.getPeerCertificate().fingerprint256);
          socket.end();
        }
      );
      socket.on("error", (error) => done(`error ${error.message}`));
    });
  const oldPair = await fingerprint();
  // At the address, whose origin the dashboard's /ws gate admits.
  const held = new WebSocket(`wss://[::1]:${dashboardPort}/ws/dashboard`, {
    headers: { origin: `https://[::1]:${dashboardPort}` },
    tls: { rejectUnauthorized: false },
  } as never);
  const heldOpen = await new Promise<boolean>((done) => {
    const timer = setTimeout(() => done(false), 15_000);
    held.onmessage = () => {
      clearTimeout(timer);
      done(true);
    };
  });
  let heldClosed = "";
  held.onclose = (event) => {
    heldClosed = `closed ${event.code}`;
  };
  await pairAt();
  const renewed = await until(
    "the renewed pair served",
    fingerprint,
    (now) => now !== oldPair,
    READ_MS
  );
  kit.check(
    "5: a renewal serves the new pair on a new connection while a socket opened on the old pair stays open",
    heldOpen &&
      renewed !== oldPair &&
      held.readyState === WebSocket.OPEN &&
      heldClosed === "",
    `before ${oldPair.slice(0, 20)}…, after ${renewed.slice(0, 20)}…, held socket ${heldOpen ? "heard" : "silent"}, ${heldClosed || `readyState ${held.readyState}`}`
  );
  held.close();
};

/** 6, the door on preview port `port`: plain http on the tailnet address answers its 308 as in 5. */
const previewDoor = async (kit: Kit, port: number) => {
  const byAddress = await plainAt(port, "/x?y=1");
  const byName = await plainAt(port, "/", `${NAME}:${port}`);
  kit.check(
    "6: plain http to the preview port on the tailnet address answers 308 to https://<name>:<port> with the path and query, by the address and by the name",
    byAddress === `308 https://${NAME}:${port}/x?y=1` &&
      byName === `308 https://${NAME}:${port}/`,
    `by address: ${byAddress}; by name: ${byName}`
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const { bin, env, pairAt, set } = await tailnetStub(fleet);
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

  // Caw's panel open at the desk and on the phone, light and dark, as a hand
  // opens it: the mouse at the desk, a finger's tap on the phone.
  const pages = await Promise.all(
    PASSES.map(async (shot) => {
      const page = await kit.page(shot.view, { theme: shot.theme });
      page.setDefaultTimeout(60_000);
      await openNeeds(page, shot.view, base);
      return { ...shot, page, label: `${shot.view} ${shot.theme}` };
    })
  );
  const [desk] = pages;
  if (!desk) {
    return;
  }
  const { page } = desk;

  /** Every step whose label wrapped to two lines or more, on any page. */
  const wrapped: Row["steps"] = [];
  /**
   * The row on every page once `ready` holds, each page held to
   * nothing wider than the row, every command whole in its box, and every
   * step's mark on its label's first line.
   */
  const capture = async (name: string, ready: (row: Row) => boolean) => {
    const rows: Record<string, Row> = {};
    for (const one of pages) {
      const row = await until(
        `${name} on ${one.label}`,
        async () => (await readRow(one.page)) ?? undefined,
        ready,
        30_000
      );
      await settle(one.page, 300);
      rows[one.label] = row;
      if (row.steps.length > 0) {
        const tree = await one.page
          .locator(`${ROW} [data-slot="steps"]`)
          .ariaSnapshot();
        kit.check(
          `${name}, ${one.label}: the steps are a list (role="list") in the accessibility tree, each a listitem led by its label, no number read out`,
          row.listRole === "list" && treeReads(tree, row),
          tree
        );
      }
      kit.check(
        `${name}, ${one.label}: nothing in the row is wider than it; every command shows whole, no word broken, with Copy, in a box at least 36px tall; every standing step draws its number; every step's mark sits on its label's first line within 0.5px`,
        !row.spills &&
          row.steps.every(
            (todo, index) =>
              (todo.command === null ||
                (todo.commandWhole === true &&
                  todo.wordsWhole === true &&
                  todo.selected === todo.command &&
                  todo.copy === "Copy" &&
                  todo.boxMinHeight === "36px")) &&
              (todo.done ||
                (todo.number === String(index + 1) &&
                  todo.numberHidden === "true")) &&
              todo.markOff !== null &&
              todo.markOff <= 0.5
          ),
        JSON.stringify(row)
      );
    }
    wrapped.push(
      ...Object.values(rows).flatMap((row) =>
        row.steps.filter((todo) => todo.lines >= 2)
      )
    );
    return rows["desk light"] as Row;
  };

  // 3. A fresh tailnet: every step at once.
  await set("fresh");
  const fresh = await reads(
    "a fresh tailnet",
    (r) => stepsOf(r) === "enable-magicdns:stands operator:stands"
  );
  kit.check(
    "3: a fresh tailnet reads needs with both steps standing, MagicDNS first, the operator's command with this user",
    fresh.state === "needs" &&
      fresh.step === "enable-magicdns" &&
      fresh.steps?.[1]?.command === COMMAND,
    JSON.stringify(fresh)
  );
  const asking = await capture(
    "fresh",
    (row) => row.steps.length === 2 && row.steps.every((todo) => !todo.done)
  );
  const [admin, operator] = asking.steps;
  kit.check(
    "3: Needs you says HTTPS on your tailnet, its line, then step 1 the DNS page's switches with its link, step 2 the command whole in its box",
    asking.name === tailnetWords.title &&
      asking.want === tailnetWords.lead &&
      asking.meta.startsWith("Onboarding · Tailscale on ") &&
      admin?.label === tailnetWords.stepMagicDns &&
      admin.note === tailnetWords.adminNote &&
      admin.link === tailnetWords.openDnsPage &&
      admin.href === "https://console.tailscale.com/admin/dns" &&
      operator?.label === tailnetWords.stepOperator &&
      operator.note.startsWith("Run it once in a terminal on ") &&
      operator.command === COMMAND &&
      asking.buttons === 0,
    JSON.stringify(asking)
  );

  // Every label fits one line at 390px; at 320px (the narrowest phone) the
  // admin step's wraps, and its mark stays on the first line.
  const narrow = pages.find((one) => one.label === "phone light");
  if (narrow) {
    await narrow.page.setViewportSize({ width: 320, height: 844 });
    const squeezed = await until(
      "a step label wrapped at 320px",
      async () => (await readRow(narrow.page)) ?? undefined,
      (row) => row.steps.some((todo) => todo.lines >= 2),
      30_000
    );
    wrapped.push(...squeezed.steps.filter((todo) => todo.lines >= 2));
    kit.check(
      "3, phone 320 light: nothing in the row is wider than it, and the command shows whole with no word broken; its text and a hand selection over it copy the command with its spaces",
      !squeezed.spills &&
        squeezed.steps.every(
          (todo) =>
            todo.command === null ||
            (todo.commandWhole === true &&
              todo.wordsWhole === true &&
              todo.selected === COMMAND &&
              todo.command === COMMAND)
        ),
      JSON.stringify(squeezed)
    );
    await narrow.page.setViewportSize({ width: 390, height: 844 });
  }

  // 4. Each step ticks by itself, in either order.
  await set("operator-first");
  const given = await reads(
    "the operator given first",
    (r) => stepsOf(r) === "enable-magicdns:stands operator:done"
  );
  kit.check(
    "4: the operator given first reads its step done, the admin console's still standing",
    given.step === "enable-magicdns" && given.command === undefined,
    JSON.stringify(given)
  );
  const ticking = await capture(
    "operator-first",
    (row) => row.steps[1]?.done === true
  );
  kit.check(
    "4: the operator's step ticks by itself: its tick and label, no command; the admin step stands with its link",
    ticking.steps[1]?.ticked === true &&
      ticking.steps[1].label === tailnetWords.stepOperator &&
      ticking.steps[1].spoken ===
        "Done: Let CawCo take Tailscale's certificate" &&
      ticking.steps[1].command === null &&
      ticking.steps[1].note === "" &&
      ticking.steps[0]?.done === false &&
      ticking.steps[0].link === tailnetWords.openDnsPage,
    JSON.stringify(ticking)
  );

  await set("https-off");
  const off = await reads(
    "MagicDNS on, no certificates, no operator",
    (r) => stepsOf(r) === "enable-https:stands operator:stands"
  );
  kit.check(
    "4: MagicDNS on with no certificates reads enable-https first, the operator standing",
    off.step === "enable-https",
    JSON.stringify(off)
  );
  const httpsOff = await until(
    tailnetWords.stepHttps,
    async () => (await readRow(page)) ?? undefined,
    (row) => row.steps[0]?.label === tailnetWords.stepHttps,
    30_000
  );
  kit.check(
    "4: the admin step says Turn on HTTPS Certificates alone",
    httpsOff.steps[1]?.command === COMMAND,
    JSON.stringify(httpsOff)
  );

  await set("denied");
  const denied = await reads(
    "certificates on, cert refused",
    (r) => stepsOf(r) === "enable-https:done operator:stands"
  );
  kit.check(
    "4: certificates on with cert access denied (no prefs to read) reads the admin step done, the operator standing with its command",
    denied.step === "operator" && denied.command === COMMAND,
    JSON.stringify(denied)
  );
  const httpsOn = await capture(
    "https-on",
    (row) => row.steps[0]?.done === true && row.steps[1]?.done === false
  );
  kit.check(
    "4: the admin step ticks by itself, and the command stands whole",
    httpsOn.steps[0]?.ticked === true &&
      httpsOn.steps[0].label === tailnetWords.stepHttps &&
      httpsOn.steps[0].link === null &&
      httpsOn.steps[1]?.command === COMMAND,
    JSON.stringify(httpsOn)
  );

  kit.check(
    "3–4: a step whose label wraps to two lines (at 320px) keeps its mark on the first line's centre within 0.5px",
    wrapped.length > 0 &&
      wrapped.every((todo) => todo.markOff !== null && todo.markOff <= 0.5),
    JSON.stringify(
      wrapped.map(({ label, lines, markOff }) => ({ label, lines, markOff }))
    )
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
  const ticked = await capture("done", (row) =>
    row.want.startsWith("HTTPS is on.")
  );
  kit.check(
    "5: the row ticks: HTTPS is on, no steps, and its one button opens the https dashboard",
    ticked.want ===
      `HTTPS is on. Every device on your tailnet opens CawCo at ${https}.` &&
      ticked.steps.length === 0 &&
      ticked.button === tailnetWords.openDashboard &&
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

  await doorAndRenewal(kit, dashboardPort, pairAt);

  // The dashboard on its name, as a device on the tailnet opens it: the name
  // mapped to the tailnet address, with none of a workspace's proxy
  // variables, which Chromium takes over its own flags and whose proxy can't
  // reach the name (measured: 407, ERR_TUNNEL_CONNECTION_FAILED).
  const browser = await chromium.launch({
    headless: true,
    env: launchEnv(
      Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            !PROXY_VARIABLE.test(entry[0]) && entry[1] !== undefined
        )
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
    CAWCO_PREVIEW_PORTS: (await leasePortRange(4)).range,
  });
  const { createTailnetHttps } =
    await import("../../../packages/hub/src/tailnet-https");
  const { createPreviewListeners } =
    await import("../../../packages/hub/src/preview");
  const { previewRoute } = await import("../../../packages/core/src/frames");
  const { makeLifetime } = await import("../../../packages/hub/src/lifetime");
  const lifetime = makeLifetime();
  const tailnet = createTailnetHttps({
    bin,
    dashboardPort: 1,
    lifetime,
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
    lifetime.close();
    return;
  }
  const listeners = createPreviewListeners(
    "127.0.0.1",
    {} as Parameters<typeof createPreviewListeners>[1],
    {
      settings: () => ({ mode: "port", pattern: null }),
      // The session the leg opens is held: it keeps a port (preview.ts `portFor`).
      ownerHeld: () => true,
      ports: () => [],
      keepPort: () => true,
      dropPort: () => undefined,
      setSettings: () => undefined,
    } satisfies Parameters<typeof createPreviewListeners>[2],
    // Port mode alone here: no listener holds host mode's lock, so no pass is read.
    {} as Parameters<typeof createPreviewListeners>[3],
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
    await previewDoor(kit, address.port);
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
    lifetime.close();
  }
};

export default { name: "tailnet-https", run } satisfies Spec;
