/**
 * iOS: a message sent from the app reaches its session exactly once, however
 * the connection to the hub fails while it goes, across a relaunch too; the
 * app says it failed only when the hub itself refused it. The app keeps every
 * send on disk before it goes (CawCoCore/SendOutbox.swift), draws it "waiting
 * for the hub" while no connection holds it, and sends it again under its own
 * uuid when one opens (`SessionsStore.drain`); the hub keeps a repeated uuid
 * once (resend-once, send-once).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with one session whose first turn ended, and the built app on
 * an iPhone 16 Pro simulator on iOS 18.5 (a mac-slot.sh slot, deleted at the
 * end). The app reaches the hub through the kit's relay (relay.ts), and each
 * send is the app's DEBUG `-probe-send`: its words with a picture of about
 * 2 MB, which goes on the socket as wire parts. In order:
 *
 * 1. Cut while it uploads: the socket is cut as the picture's second part
 *    goes, the hub gone; the app is closed and opened again, and its row
 *    waits; the hub comes back. One message in the session, carrying the
 *    picture byte for byte, and the row moved from waiting to the hub's.
 * 2. Answer lost: the hub takes the send whole and its answer never comes
 *    back; the socket is cut, then the hub comes back. The app sends it again
 *    under the same uuid, the hub keeps one, the session reads it once.
 * 3. Refused: the hub refuses the send (the session's Claude conversation is
 *    gone, `CLAUDE_CONVERSATION_GONE`). The row says so in the hub's words,
 *    with Send again, and nothing goes by itself after: not on a new
 *    connection, not after a relaunch.
 *
 * Every assertion reads the hub's stored sends (`sent_messages`), what the
 * mock model was asked, and the app's log (the Outbox's lines, the
 * transcript's `probe sends`); the refused row's words are its accessibility
 * labels. None reads a screenshot.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-send-outbox
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { type Fleet, type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import { type Relay, relay } from "../relay";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5: where axe reaches the simulator from a workspace (ios-seen.ts). */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const TITLE = "Send outbox probe";
const LOG_HEAD = /^.*\] /;
/**
 * A frame this long is one of a large message's wire parts (WireParts.swift
 * `Wire.frames`, 1 MiB of JSON each): only the probe's send is one.
 */
const PART_CHARS = 512 * 1024;

/**
 * Whether `text` is a wire part, read as the hub reads one (core wire.ts
 * `isPart`): by its `part` field. JSONEncoder sets the keys in no fixed
 * order, so its `text` may come before its head.
 */
const isPart = (text: string) =>
  text.length > PART_CHARS &&
  typeof (JSON.parse(text) as { part?: unknown }).part === "object";
/** The app's line as `-probe-send` sends: its words and its picture's size. */
const PROBE_SEND = /probe send: (.+) with a picture of (\d+) bytes/;
/** A picture the hub keeps for a send's record (media.ts `store`): its sha256 is its name. */
const MEDIA = /\/api\/media\/([a-f0-9]{64})\.png/;
/** What each case sends: words of its own, so each is found alone. */
const WORDS = {
  cut: "Outbox probe cut while it uploads",
  lost: "Outbox probe answer lost",
  refused: "Outbox probe refused by the hub",
};
/** The refused row's line (TurnViews.swift), in the hub's words. */
const REFUSED_LINE = `Couldn't send that message. ${CLAUDE_CONVERSATION_GONE}`;
/** Long enough for the app to reconnect, and for a send it would make by itself to show. */
const SETTLE_MS = 20_000;

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

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

/** A send the hub keeps, as the probe reads it. */
interface Kept {
  body: string | null;
  state: string;
  uuid: string;
}

/** What every case drives and reads: the fleet, the relay, the app and its log. */
interface Probe {
  /** The fault the next send meets, turned as its first wire part passes. */
  arm: (fault: "cut" | "mute") => void;
  fleet: Fleet;
  heard: { at: number; line: string }[];
  kit: Kit;
  relay: Relay;
  session: string;
  udid: string;
}

/** The app opened afresh on the session (closed first), sending `words` once it can. */
const open = (p: Probe, words?: string) =>
  sh(
    `xcrun simctl terminate ${p.udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl launch ${p.udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${p.relay.url} -open-session ${p.session}${words ? ` -probe-send "${words}"` : ""} >/dev/null`
  );

/** The app's lines since `from` holding `text`. */
const lines = (p: Probe, from: number, text: string) =>
  p.heard
    .slice(from)
    .filter((h) => h.line.includes(text))
    .map((h) => h.line);

/** The first such line, waited for; undefined when none came in `ms`. */
const waitFor = (
  p: Probe,
  label: string,
  from: number,
  text: string,
  ms = 90_000
) =>
  until(
    label,
    () => Promise.resolve(lines(p, from, text).at(0)),
    Boolean,
    ms
  ).catch(() => undefined);

/**
 * The Outbox's word that the hub has the send `id`, waited for: its ack
 * (`taken by the hub`), or the hub's row for it read first, which lets it go
 * as surely (Sessions.swift `settleLocal`: `gone`).
 */
const waitTaken = (p: Probe, label: string, from: number, id: string) =>
  until(
    label,
    () =>
      Promise.resolve(
        lines(p, from, `outbox: ${id} `).find(
          (line) =>
            line.endsWith("taken by the hub") || line.includes(" gone, ")
        )
      ),
    Boolean,
    90_000
  ).catch(() => undefined);

/** How often the Outbox put the send `id` on the socket since `from`. */
const sendings = (p: Probe, from: number, id: string) =>
  lines(p, from, `outbox: ${id} to `).filter((line) =>
    line.endsWith(" sending")
  ).length;

/**
 * The uuid (its first 8) the app sends `words` under, from the Outbox's
 * first `sending` after the probe's send, and the picture's size it logged.
 */
async function sentAs(p: Probe, from: number, words: string) {
  const said = await waitFor(
    p,
    `the app sent "${words}"`,
    from,
    `probe send: ${words}`
  );
  const at = p.heard.findIndex(
    (h, i) => i >= from && h.line.includes(`probe send: ${words}`)
  );
  const sending = new RegExp(
    `outbox: ([0-9a-f]{8}) to ${p.session.slice(0, 8)} sending`
  );
  const uuid = await until(
    "the Outbox sent it",
    () =>
      Promise.resolve(
        p.heard
          .slice(Math.max(at, from))
          .map((h) => sending.exec(h.line)?.[1])
          .find(Boolean)
      ),
    Boolean,
    30_000
  ).catch(() => undefined);
  return {
    id: uuid ?? "-",
    sent: uuid !== undefined,
    size: Number(PROBE_SEND.exec(said ?? "")?.[2] ?? 0),
  };
}

/** The `probe sends` states the transcript drew for `id` since `from`, in order: `local:waitingx1`, `queue:pendingx1`, … */
const drawn = (p: Probe, from: number, id: string) =>
  lines(p, from, "probe sends ")
    .map((line) => new RegExp(`${id}=(\\S+)`).exec(line)?.[1])
    .filter((state): state is string => Boolean(state));

/** Waits for the row of `id` to be drawn `state`; undefined when it was not. */
const drawnAs = (p: Probe, from: number, id: string, state: string) =>
  until(
    `its row drawn ${state}`,
    () => Promise.resolve(drawn(p, from, id).at(-1)),
    (last) => last === state,
    60_000
  ).catch(() => undefined);

/** The hub's kept sends in the session carrying `words`. */
const kept = (p: Probe, words: string) =>
  p.fleet
    .query<Kept>(
      "SELECT uuid, state, body FROM sent_messages WHERE instance_id = ?",
      p.session
    )
    .filter((row) => row.body?.includes(words));

/** One kept send under `id`, and only one, for `words`. */
const keptOnce = (p: Probe, words: string, id: string) => {
  const rows = kept(p, words);
  return rows.length === 1 && rows[0]?.uuid.startsWith(id) === true;
};

const keptSays = (p: Probe, words: string) =>
  `hub keeps ${kept(p, words)
    .map((row) => `${row.uuid.slice(0, 8)} ${row.state}`)
    .join(", ")} (${kept(p, words).length})`;

/** How many times the session's model was given `words`: its newest request holds every user message so far. */
const modelRead = (p: Probe, words: string) => {
  const last = p.fleet.seen.filter((one) => one.tools).at(-1);
  return last ? last.all.split(words).length - 1 : 0;
};

const modelReads = (p: Probe, words: string) =>
  until(
    "the session's model reads it",
    () => Promise.resolve(modelRead(p, words)),
    (n) => n > 0,
    90_000
  ).catch(() => 0);

/** The words the simulator's screen says: every element's accessibility label and value. */
async function labels(p: Probe): Promise<string[]> {
  const out: string[] = [];
  const walk = (node: Record<string, unknown>) => {
    for (const said of [node.AXLabel ?? node.label, node.AXValue]) {
      if (typeof said === "string" && said) {
        out.push(said);
      }
    }
    for (const kid of (node.children as
      Record<string, unknown>[] | undefined) ?? []) {
      walk(kid);
    }
  };
  const roots = JSON.parse(
    await sh(`${AXE} describe-ui --udid ${p.udid}`)
  ) as Record<string, unknown>[];
  for (const root of roots) {
    walk(root);
  }
  return out;
}

/** The picture the hub kept for the send carrying `words`, when it is the bytes its name hashes. */
function keptPicture(p: Probe, words: string): Uint8Array | undefined {
  const name = MEDIA.exec(kept(p, words)[0]?.body ?? "")?.[1];
  const file = join(p.fleet.sandbox, "hub", "media", `${name}.png`);
  if (!(name && existsSync(file))) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(file));
  return createHash("sha256").update(bytes).digest("hex") === name
    ? bytes
    : undefined;
}

/** 1. Cut while it uploads, the app closed and opened again, then the hub back. */
async function cutWhileUploading(p: Probe): Promise<void> {
  const from = p.heard.length;
  p.arm("cut");
  await open(p, WORDS.cut);
  const send = await sentAs(p, from, WORDS.cut);
  const waiting = await waitFor(
    p,
    "the send waits for the hub",
    from,
    `outbox: ${send.id} unanswered`,
    30_000
  );
  p.kit.check(
    "cut while it uploads: the hub is cut off mid-send and holds none of it; the app waits",
    send.sent &&
      p.relay.fault.cutAt !== undefined &&
      waiting !== undefined &&
      kept(p, WORDS.cut).length === 0,
    `sent as ${send.id} with ${send.size} bytes of picture; cut ${p.relay.fault.cutAt ? "mid-send" : "never"}; ${waiting ?? "no unanswered line"}; ${keptSays(p, WORDS.cut)}`
  );

  const reopened = p.heard.length;
  await open(p);
  const before = await waitFor(
    p,
    "the relaunched app finds the send it kept",
    reopened,
    "unsent from before",
    60_000
  );
  const row = await drawnAs(p, reopened, send.id, "local:waitingx1");
  p.kit.check(
    "cut while it uploads: opened again with the hub still gone, the send is kept and its row waits",
    before?.includes(send.id) === true && row !== undefined,
    `${before ?? "no unsent line"}; row ${drawn(p, reopened, send.id).join(" → ") || "never drawn"}`
  );

  const back = p.heard.length;
  p.relay.release();
  const taken = await waitTaken(p, "the hub takes it", back, send.id);
  await modelReads(p, WORDS.cut);
  await Bun.sleep(5000);
  const picture = keptPicture(p, WORDS.cut);
  p.kit.check(
    "cut while it uploads: once the hub is back, one message in the session, carrying the picture as the app sent it",
    taken !== undefined &&
      keptOnce(p, WORDS.cut, send.id) &&
      picture?.length === send.size &&
      modelRead(p, WORDS.cut) === 1,
    `${taken ?? "never taken"}; ${keptSays(p, WORDS.cut)}; picture ${picture ? `${picture.length} bytes, its hash its name` : "not kept"}; model read it ${modelRead(p, WORDS.cut)}×`
  );
  const rows = drawn(p, back, send.id);
  const last = rows.at(-1) ?? "";
  p.kit.check(
    "cut while it uploads: the row moved from waiting to the hub's, and never said failed",
    !last.startsWith("local:") &&
      last.endsWith("x1") &&
      lines(p, from, `outbox: ${send.id} refused`).length === 0 &&
      !drawn(p, from, send.id).some((state) => state.includes("refused")),
    `row ${drawn(p, reopened, send.id).join(" → ")}`
  );
}

/** 2. The hub took it and its answer was lost; the socket cut, then the hub back. */
async function answerLost(p: Probe): Promise<void> {
  const from = p.heard.length;
  p.arm("mute");
  await open(p, WORDS.lost);
  const send = await sentAs(p, from, WORDS.lost);
  const took = await until(
    "the hub takes the send whole",
    () => Promise.resolve(kept(p, WORDS.lost).length),
    (n) => n > 0,
    60_000
  ).catch(() => 0);
  const heard = [
    ...lines(p, from, `outbox: ${send.id} taken by the hub`),
    ...lines(p, from, `outbox: ${send.id} gone`),
  ];
  p.kit.check(
    "answer lost: the hub keeps the send whole, and the app never hears it did",
    send.sent &&
      took === 1 &&
      p.relay.fault.mutedAt !== undefined &&
      heard.length === 0,
    `sent as ${send.id}; hub keeps ${took}; answers ${p.relay.fault.mutedAt ? "swallowed" : "never muted"}; ${heard.join(" | ") || "no word heard"}`
  );

  p.relay.cut();
  const waiting = await waitFor(
    p,
    "the send waits for the hub",
    from,
    `outbox: ${send.id} unanswered`,
    30_000
  );
  await Bun.sleep(3000);
  const back = p.heard.length;
  p.relay.release();
  const taken = await waitTaken(
    p,
    "the hub has the send sent again",
    back,
    send.id
  );
  await modelReads(p, WORDS.lost);
  await Bun.sleep(SETTLE_MS);
  const again = sendings(p, back, send.id);
  p.kit.check(
    "answer lost: back, the app sends it again under its own uuid, the hub keeps one, and the session reads it once",
    waiting !== undefined &&
      again >= 1 &&
      taken !== undefined &&
      keptOnce(p, WORDS.lost, send.id) &&
      modelRead(p, WORDS.lost) === 1,
    `${waiting ?? "no unanswered line"}; sent again ${again}×; ${taken ?? "never taken"}; ${keptSays(p, WORDS.lost)}; model read it ${modelRead(p, WORDS.lost)}×; row ${drawn(p, from, send.id).join(" → ")}`
  );
}

/** 3. The hub refuses it: the row says so, and nothing goes by itself after. */
async function refused(p: Probe): Promise<void> {
  // The hub's own refusal of a send (server.ts `inputRefusal`): its session's conversation is gone.
  p.fleet.write(
    "UPDATE instances SET last_error = ? WHERE id = ?",
    CLAUDE_CONVERSATION_GONE,
    p.session
  );
  const from = p.heard.length;
  await open(p, WORDS.refused);
  const send = await sentAs(p, from, WORDS.refused);
  const refusal = await waitFor(
    p,
    "the hub refuses it",
    from,
    `outbox: ${send.id} refused by the hub`,
    30_000
  );
  const row = await drawnAs(p, from, send.id, "local:refusedx1");
  let shown: string[] = [];
  const says = await until(
    "the row says why, with Send again",
    async () => {
      shown = await labels(p);
      return shown;
    },
    (all) =>
      all.some((label) => label.includes(REFUSED_LINE)) &&
      all.includes("Send again"),
    30_000
  ).catch(() => undefined);
  if (!says) {
    await writeFile(
      join(p.kit.out, "refused-labels.json"),
      JSON.stringify(shown, null, 2)
    );
  }
  p.kit.check(
    "refused: the row says the hub refused it, in the hub's words, with Send again",
    refusal?.endsWith(CLAUDE_CONVERSATION_GONE) === true &&
      row !== undefined &&
      says !== undefined,
    `${refusal ?? "no refusal line"}; row ${drawn(p, from, send.id).join(" → ") || "never drawn"}; ${says ? "its line and Send again shown" : "not shown (refused-labels.json)"}`
  );

  // A new connection, then a relaunch: neither sends it by itself.
  p.relay.cut();
  await Bun.sleep(2000);
  p.relay.release();
  await Bun.sleep(SETTLE_MS);
  const reopened = p.heard.length;
  await open(p);
  const before = await waitFor(
    p,
    "the relaunched app keeps it refused",
    reopened,
    "unsent from before",
    60_000
  );
  await Bun.sleep(SETTLE_MS);
  const sent = sendings(p, from, send.id);
  p.kit.check(
    "refused: nothing is sent by itself after, on a new connection or after a relaunch",
    sent === 1 &&
      before?.includes(`${send.id} refused`) === true &&
      drawn(p, reopened, send.id).at(-1) === "local:refusedx1" &&
      kept(p, WORDS.refused).length === 0 &&
      modelRead(p, WORDS.refused) === 0,
    `sent ${sent}×; ${before ?? "no unsent line"}; row ${drawn(p, reopened, send.id).join(" → ") || "never drawn"}; ${keptSays(p, WORDS.refused)}; model read it ${modelRead(p, WORDS.refused)}×`
  );
}

/** Reads the app's log lines into `heard` until the stream ends. */
async function listen(
  child: Subprocess<"ignore", "pipe", "ignore">,
  heard: Probe["heard"]
): Promise<void> {
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
      if (line.includes("dev.cawco.app")) {
        heard.push({ at: Date.now(), line: line.replace(LOG_HEAD, "") });
      }
    }
  }
}

async function run(kit: Kit): Promise<void> {
  const { path: bundle, problem } = freshApp(ROOT);
  if (
    !kit.check("the app is built from this tree", !problem, problem ?? bundle)
  ) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", TITLE);
  await fleet.send(session, "Say hello.");
  await until(
    "the first turn ended",
    () =>
      fleet.query<{ turn_ended_at: number | null }>(
        "SELECT turn_ended_at FROM instances WHERE id = ?",
        session
      )[0]?.turn_ended_at ?? 0,
    (at) => at > 0,
    120_000
  );

  // Armed, the send's first wire part turns the fault on: the part after it
  // is cut off (`cutAfter(0)`), or the hub's answers are swallowed
  // (`muteAfter(0)`) while the rest of it reaches the hub whole.
  let armed: "cut" | "mute" | undefined;
  const hubRelay = relay(fleet.base, {
    toHub: (text) => {
      if (!(armed && isPart(text))) {
        return;
      }
      if (armed === "cut") {
        hubRelay.cutAfter(0);
      } else {
        hubRelay.muteAfter(0);
      }
      console.log(`  relay: ${armed} on the send's first part`);
      armed = undefined;
    },
  });

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: Probe["heard"] = [];
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}, relay ${hubRelay.port} → ${fleet.base}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${bundle}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Outbox" OR category == "Transcript" OR category == "Probe")'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    listen(child, heard).catch(() => undefined);
    await Bun.sleep(1500);

    const probe: Probe = {
      arm: (fault) => {
        armed = fault;
      },
      fleet,
      heard,
      kit,
      relay: hubRelay,
      session,
      udid,
    };
    await cutWhileUploading(probe);
    await answerLost(probe);
    await refused(probe);
  } finally {
    await writeFile(
      join(kit.out, "app-log.txt"),
      heard.map((h) => `${new Date(h.at).toISOString()} ${h.line}`).join("\n")
    );
    stream?.kill();
    await sim?.release();
    hubRelay.stop();
  }
}

export default { name: "ios-send-outbox", run } satisfies Spec;
