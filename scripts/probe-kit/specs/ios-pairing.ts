/**
 * iOS: the app against a hub that requires paired devices (hub hub-auth.ts),
 * both ways. It pairs itself in RFC 8628's shape (`HubConnection.pairing`,
 * CawCoPush `HubPass`), and it answers other devices' pairings, from the
 * fleet model and from the hub's pairing push.
 *
 * A scratch fleet in pairing mode (turned on by a paired client, the probe,
 * with `PUT /api/auth/pairing`), a stand-in Cawrier that keeps every push
 * the hub sends, and the built app on an iPhone simulator of its own (a
 * mac-slot.sh slot, deleted at the end), read from the app's own log
 * (category `Pairing`, and `Hub`'s "fleet read"), in order:
 *
 * (a) the app is refused, reads that it must pair, and waits with a code
 *     the hub lists as an app's;
 * (b) the probe approves that code as a paired client: the app keeps its
 *     pass, its socket opens, and its fleet read lands (`/api/agents` 200);
 * (c) relaunched, it connects on the kept pass with no new pairing;
 * (d) its device removed, the hub refuses the pass: the app forgets it and
 *     asks again, and that ask denied reaches `denied`;
 * (e) a new ask that leaves the hub's table (twenty newer asks push it out)
 *     reaches `expired`;
 * (f) a browser's pairing (a real page's pairing screen) shows in the app's
 *     fleet model, and the app's approve pairs that browser;
 * (g) with the app's push device registered (its post carries the pass),
 *     the hub pushes a waiting pairing: category `CAWCO_PAIRING`, collapse
 *     id `pairing-<code>`, the card's sentence (core `pairingWords`) sealed
 *     and shown; settling it clears that collapse id;
 * (h) that push's Approve, run through the delegate's own handling of a
 *     notification response (PushProbe `-push-probe-act`), approves it.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-pairing
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one scenario, read in order, one check after another.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { pairingWords } from "../../../packages/core/src/words/pairing";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec } from "../kit";

const BUNDLE = "dev.cawco.app";
/** iOS 18.5: where axe and Maestro reach the simulator from a workspace (ios-seen.ts). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const LOG_HEAD = /^.*\] /;
/** A pairing code (RFC 8628 §6.1's base-20 alphabet). */
const CODE = /[B-Z]{3}-[B-Z]{3}/;
const WAITING = /pairing stage waiting ([B-Z]{3}-[B-Z]{3})/;
/** The app's own lines (HubPairing.swift, HubConnection.swift, PushProbe.swift). */
const NEEDED = /pairing needed: .* requires paired devices/;
const KEPT = /pairing approved as .*: pass kept/;
const FLEET_READ = /fleet read: \d+ rows, \d+ machines/;
const FLEET_ROWS = /fleet read: \d+ rows/;
const RELAUNCH_LINES = /airing|fleet read|socket/;
const FORGOTTEN = /pass refused by .*: forgotten/;
const DENIED_STAGE = /pairing stage denied/;
const EXPIRED_STAGE = /pairing stage expired/;
const REGISTERED = /probe registered: (.*)/;
const LISTED_PAIRING =
  /probe listed (\S+) category=CAWCO_PAIRING actions=\[([^\]]*)\]/;
/** How many asks the hub holds at once (hub-auth.ts `PAIRINGS_HELD`). */
const PAIRINGS_HELD = 20;
/** Maestro as probe-ios-push-actions.ts runs it on the Mac. */
const MAESTRO = `JAVA_HOME=/opt/homebrew/opt/openjdk MAESTRO_OPTS="\${MAESTRO_OPTS:-} --enable-final-field-mutation=ALL-UNNAMED" MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true MAESTRO_DISABLE_UPDATE_CHECK=true /opt/homebrew/bin/maestro --no-ansi`;

const respond = (): Reply => ({ words: ["ok"], everyMs: 20 });

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** A push the stand-in Cawrier kept: a visible one (`collapseId`) or a background one. */
interface Captured {
  collapseId?: string;
  pairingId: string;
  payload: {
    aps: {
      alert?: { body: string; title: string };
      category?: string;
      "content-available"?: number;
    };
    cawco: { cleared?: string[]; kind?: string; userCode?: string };
    e?: string;
  };
  pushType?: string;
}

/** A pairing started as an unpaired client starts one: its codes. */
interface Started {
  deviceCode: string;
  userCode: string;
}

async function run(kit: Kit): Promise<void> {
  const { check } = kit;
  const { path: app, problem } = freshApp(ROOT);
  if (!check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }

  const captured: Captured[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/v1/push") {
        captured.push((await request.json()) as Captured);
        return Response.json({ ok: true });
      }
      if (path === "/v1/unenroll") {
        return new Response(null, { status: 204 });
      }
      return new Response("not here", { status: 404 });
    },
  });
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  /** One request to the hub as anyone: its status and body. */
  const ask = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${fleet.base}${path}`, init);
    return { status: response.status, text: await response.text() };
  };
  const json = (body: unknown, token?: string): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Owner ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  // The probe is the first paired device, a client of its own: it turns
  // "Require paired devices" on and holds its token.
  const turned = await ask("/api/auth/pairing", {
    ...json({ required: true, kind: "app", name: "Probe owner" }),
    method: "PUT",
  });
  const owner = (JSON.parse(turned.text) as { token?: string }).token ?? "";
  fleet.authorize(owner);
  const refused = await ask("/api/agents");
  if (
    !check(
      "the hub requires paired devices: an anonymous read is refused",
      owner.length > 0 && refused.status === 401,
      `${turned.status} ${turned.text.slice(0, 120)}; GET /api/agents ${refused.status}`
    )
  ) {
    return;
  }
  const asOwner = (path: string, method = "POST") =>
    ask(path, { method, headers: { authorization: `Owner ${owner}` } });
  const startPairing = async (kind: string, name: string) =>
    JSON.parse((await ask("/api/pair", json({ kind, name }))).text) as Started;
  const requests = async () =>
    JSON.parse((await asOwner("/api/pair/requests", "GET")).text) as {
      kind: string;
      name: string;
      userCode: string;
    }[];

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "${BUNDLE}"'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes(BUNDLE)) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await Bun.sleep(1500);

    const mark = () => heard.length;
    const since = (from: number) => heard.slice(from).join("\n");
    /** The first match of `pattern` in what the app logged after `from`, waited for up to `ms`. */
    const line = (from: number, pattern: RegExp, ms = 60_000) =>
      until(
        `the app logging ${pattern}`,
        () => pattern.exec(since(from)) ?? undefined,
        Boolean,
        ms
      ).catch(() => null);
    const launch = (args = "") =>
      sh(
        `xcrun simctl launch --terminate-running-process ${udid} ${BUNDLE} -paywall-env sandbox -cawco-hub-url ${fleet.base} ${args} >/dev/null`
      );

    // ── (a) Refused, it asks for a code ──────────────────────────────────
    const first = mark();
    await launch();
    const waiting = await line(first, WAITING);
    const code = waiting?.[1] ?? "";
    const listed = await requests();
    check(
      "(a) the app is refused, reads that it must pair, and waits with a code the hub lists as an app's",
      Boolean(
        code &&
        NEEDED.test(since(first)) &&
        since(first).includes("pairing stage asking") &&
        listed.some((one) => one.userCode === code && one.kind === "app")
      ),
      `${code || "no code"}; listed ${JSON.stringify(listed)}; ${since(first)
        .split("\n")
        .filter((one) => one.includes("airing"))
        .join(" | ")
        .slice(0, 600)}`
    );

    // ── (b) Approved by a paired client: the pass kept, the fleet read ───
    const approving = mark();
    const approved = await asOwner(`/api/pair/requests/${code}/approve`);
    const kept = await line(approving, KEPT);
    const read = await line(approving, FLEET_READ);
    check(
      "(b) approved as a paired client: the app keeps its pass, its socket opens and its fleet read lands (/api/agents 200)",
      approved.status === 200 &&
        kept !== null &&
        read !== null &&
        since(approving).includes("hub socket open"),
      `approve ${approved.status}; ${kept?.[0] ?? "no pass kept"}; ${read?.[0] ?? "no fleet read"}`
    );

    // ── (c) Relaunched: the kept pass, no new pairing ────────────────────
    const relaunched = mark();
    await launch();
    const again = await line(relaunched, FLEET_ROWS);
    check(
      "(c) relaunched, it connects on its kept pass with no new pairing",
      again !== null &&
        !since(relaunched).includes("pairing stage asking") &&
        (await requests()).length === 0,
      since(relaunched)
        .split("\n")
        .filter((one) => RELAUNCH_LINES.test(one))
        .join(" | ")
        .slice(0, 600)
    );

    // ── (d) Its pass refused later: it pairs again; denied ───────────────
    const devices = JSON.parse((await asOwner("/api/devices", "GET")).text) as {
      devices: { id: string; kind: string; name: string }[];
    };
    const appDevice = devices.devices.find(
      (one) => one.kind === "app" && one.name !== "Probe owner"
    );
    const removing = mark();
    const removed = await asOwner(`/api/devices/${appDevice?.id}`, "DELETE");
    const forgotten = await line(removing, FORGOTTEN);
    const second = await line(removing, WAITING);
    const denying = mark();
    const denied = await asOwner(`/api/pair/requests/${second?.[1]}/deny`);
    const deniedSeen = await line(denying, DENIED_STAGE);
    check(
      "(d) its device removed, the hub refuses its pass: it forgets it and asks again, and that ask denied reaches denied",
      removed.status === 200 &&
        forgotten !== null &&
        second !== null &&
        second[1] !== code &&
        denied.status === 200 &&
        deniedSeen !== null,
      `remove ${removed.status}; ${forgotten?.[0] ?? "no pass forgotten"}; ${second?.[0] ?? "no new code"}; deny ${denied.status}; ${deniedSeen?.[0] ?? "no denied stage"}`
    );

    // ── (e) An ask that leaves the hub's table: expired ──────────────────
    const third = mark();
    await launch();
    const thirdCode = (await line(third, WAITING))?.[1];
    for (let n = 0; n < PAIRINGS_HELD; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each ask after the one before, oldest first
      await startPairing("cli", `probe flood ${n}`);
    }
    const expired = await line(third, EXPIRED_STAGE, 30_000);
    check(
      "(e) an ask the hub no longer holds (twenty newer asks pushed it out) reaches expired",
      Boolean(thirdCode) &&
        !(await requests()).some((one) => one.userCode === thirdCode) &&
        expired !== null,
      `${thirdCode ?? "no code"}; ${expired?.[0] ?? "no expired stage"}`
    );
    for (const one of await requests()) {
      // biome-ignore lint/performance/noAwaitInLoops: one answer at a time
      await asOwner(`/api/pair/requests/${one.userCode}/deny`);
    }
    // Paired again for what follows.
    const fourth = mark();
    await launch();
    const fourthCode = (await line(fourth, WAITING))?.[1];
    await asOwner(`/api/pair/requests/${fourthCode}/approve`);
    await line(fourth, FLEET_ROWS);

    // ── (f) A browser's pairing, in the app's model and approved there ───
    const dashboard = await fleet.dashboard();
    const browser = await kit.page("desk");
    const codeAt =
      'main[data-slot="pairing"] :is([data-slot="code"], [data-account-setup-code], [data-workflow-run-view-code])';
    await open(browser, `${dashboard}/`, codeAt, 60_000);
    const browserCode =
      CODE.exec(await browser.locator(codeAt).innerText())?.[0] ?? "";
    const heardFrame = await line(
      fourth,
      new RegExp(`pairing requests: 1 waiting \\[${browserCode}\\]`)
    );
    const answering = mark();
    await launch(`-pairing-probe-answer approve ${browserCode}`);
    const onConnect = await line(
      answering,
      new RegExp(`pairing requests: \\d+ waiting \\[[^\\]]*${browserCode}`)
    );
    const answered = await line(
      answering,
      new RegExp(`pairing answer ${browserCode} approve: answered`)
    );
    /** What the browser is to the hub now, as its own page asks; undefined while it reloads. */
    const browserCaller = async (): Promise<string | undefined> => {
      try {
        return await browser.evaluate(async () => {
          const response = await fetch("/api/auth");
          return ((await response.json()) as { caller: string }).caller;
        });
      } catch {
        return undefined;
      }
    };
    const browserAuth = await until(
      "the browser paired",
      browserCaller,
      (caller) => caller === "owner",
      60_000
    ).catch(() => undefined);
    check(
      "(f) a browser's pairing shows in the app's fleet model, from the hub's frame and from its read on connect",
      heardFrame !== null && onConnect !== null,
      `${heardFrame?.[0] ?? "no frame"}; ${onConnect?.[0] ?? "no read on connect"}`
    );
    check(
      "(f) the app's approve pairs that browser",
      answered !== null && browserAuth === "owner",
      `${answered?.[0] ?? "no answer"}; browser is ${browserAuth ?? "not the person"}`
    );

    // ── (g) The pairing push: built, and cleared on settle ───────────────
    // Notifications allowed as probe-ios-push-actions.ts allows them: its
    // runner left out of the prompt (`unset`), the flow taps Allow, and the
    // app registers its push device with the hub on its kept pass.
    const registering = mark();
    const yaml = `appId: ${BUNDLE}
---
- launchApp:
    appId: ${BUNDLE}
    permissions:
      notifications: unset
    arguments:
      paywall-env: sandbox
      cawco-hub-url: "${fleet.base}"
      "-push-probe-register": true
- extendedWaitUntil:
    visible:
      text: "Allow"
    timeout: 90000
- tapOn:
    text: "Allow"
- extendedWaitUntil:
    notVisible:
      text: "Allow"
    timeout: 15000
`;
    await writeFile(join(kit.out, "allow.yaml"), yaml);
    const port = (
      await sh(
        `python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'`
      )
    ).trim();
    const maestro = await sh(
      `${MAESTRO} --device ${udid} --driver-host-port ${port} test "${join(kit.out, "allow.yaml")}" 2>&1`
    ).catch((error: unknown) => String(error));
    await writeFile(join(kit.out, "maestro.log"), maestro);
    const registered = await line(registering, REGISTERED, 240_000);
    const [pushDevice] = fleet.query<{ key: string; pairing_id: string }>(
      "SELECT pairing_id, key FROM push_devices"
    );
    check(
      "(g) the app registers its push device with the hub on its kept pass",
      registered?.[1]?.trim() === "ok" && pushDevice !== undefined,
      `${registered?.[0] ?? "no register line"}; ${pushDevice ? "device kept" : "no push device"}`
    );
    const pushed = await startPairing("cli", "probe push");
    const pushId = `pairing-${pushed.userCode}`;
    const sent = await until(
      "the pairing push",
      () => captured.find((one) => one.collapseId === pushId),
      Boolean,
      30_000
    ).catch(() => undefined);
    const sealed = sent?.payload.e
      ? await (async () => {
          const raw = Buffer.from(sent.payload.e ?? "", "base64");
          const key = await crypto.subtle.importKey(
            "raw",
            Buffer.from(pushDevice?.key ?? "", "base64"),
            "AES-GCM",
            false,
            ["decrypt"]
          );
          const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: raw.subarray(0, 12), tagLength: 128 },
            key,
            raw.subarray(12)
          );
          return JSON.parse(new TextDecoder().decode(plain)) as {
            body: string;
            title: string;
          };
        })().catch(() => undefined)
      : undefined;
    const words = pairingWords.asks(pushed.userCode);
    check(
      "(g) the hub pushes a waiting pairing: CAWCO_PAIRING, collapse id pairing-<code>, the card's sentence shown and sealed",
      sent?.payload.aps.category === "CAWCO_PAIRING" &&
        sent.payload.cawco.kind === "pairing" &&
        sent.payload.cawco.userCode === pushed.userCode &&
        sent.payload.aps.alert?.title === "probe push" &&
        sent.payload.aps.alert?.body === words &&
        sealed?.body === words &&
        sealed.title === "probe push",
      JSON.stringify({
        sent: sent && { ...sent, payload: { ...sent.payload, e: "…" } },
        sealed,
      })
    );
    // Settled where it waits: its push comes down (the background push's cleared ids).
    const settling = await startPairing("cli", "probe settle");
    const settleId = `pairing-${settling.userCode}`;
    await until(
      "the settle push",
      () => captured.find((one) => one.collapseId === settleId),
      Boolean,
      30_000
    ).catch(() => undefined);
    await asOwner(`/api/pair/requests/${settling.userCode}/deny`);
    const cleared = await until(
      "its clear",
      () =>
        captured.find((one) =>
          (one.payload.cawco.cleared ?? []).includes(settleId)
        ),
      Boolean,
      30_000
    ).catch(() => undefined);
    check(
      "(g) settling a pairing clears its push: the next push to the device names its collapse id cleared",
      cleared !== undefined,
      cleared
        ? `${cleared.pushType ?? "visible"} push, cleared ${cleared.payload.cawco.cleared?.join(",")}`
        : `no push names ${settleId} cleared`
    );

    // ── (h) The push's Approve, as a notification response runs it ───────
    if (sent) {
      const apns = JSON.stringify({
        ...sent.payload,
        "Simulator Target Bundle": BUNDLE,
      });
      const file = join(kit.out, "pairing.apns");
      await writeFile(file, apns);
      await sh(`xcrun simctl terminate ${udid} ${BUNDLE} >/dev/null 2>&1 || true
xcrun simctl push ${udid} ${BUNDLE} "${file}" >/dev/null`);
      await Bun.sleep(3000);
      const listing = mark();
      await launch("-push-probe-list");
      const shown = await line(listing, LISTED_PAIRING);
      const acting = mark();
      if (shown) {
        await launch(`-push-probe-act ${shown[1]} APPROVE`);
      }
      const actedOn = await line(
        acting,
        new RegExp(`pairing answer ${pushed.userCode} approve: answered`)
      );
      const polled = JSON.parse(
        (await ask("/api/pair/poll", json({ deviceCode: pushed.deviceCode })))
          .text
      ) as { status: string };
      check(
        "(h) the push's Approve, run through the delegate's handling of a response, approves that pairing",
        shown !== null &&
          shown[2] === "APPROVE|DENY" &&
          actedOn !== null &&
          polled.status === "approved",
        `${shown?.[0] ?? "not delivered"}; ${actedOn?.[0] ?? "no answer"}; its client polls ${polled.status}`
      );
    } else {
      check(
        "(h) the push's Approve approves that pairing",
        false,
        "no pairing push to act on"
      );
    }
  } finally {
    await writeFile(join(kit.out, "app-log.txt"), heard.join("\n"));
    stream?.kill();
    await sim?.release();
    await cawrier.stop(true);
  }
}

export default { name: "ios-pairing", run } satisfies Spec;
