/**
 * Each Mac simulator slot (apps/apple/scripts/mac-slot.sh) gets a Safari of
 * its own. A slot is a `simctl clone` of a settled template, and the clone
 * carries the template's LaunchServices store (`data/var/db/lsd/*.csstore`),
 * which records every system app's data container as an absolute path. A
 * clone booted on a copied store runs Safari against the template's folder:
 * every slot, at once or one after another, shares one Safari profile. On
 * slots of the default device (the newest iPhone Pro, as build-both.sh and
 * most probes take), two held at once and a third taken after both are
 * released, it asserts:
 *
 *  - each slot's Safari data container (`simctl get_app_container … data`)
 *    lies in that slot's own data folder: not the template's, not another
 *    slot's;
 *  - a persistent cookie Safari keeps in slot A (set by a local page, sent
 *    back when A's Safari opens that page again) is not sent from slot B,
 *    held beside A, nor from slot C, taken after A wrote it to disk and
 *    both were deleted, C a clone of the very template A and B came from.
 *
 * It takes both of the Mac's simulator slots for a while (lib/mac-sim.ts).
 *
 *   bun scripts/probe-kit/run.ts ios-slot-safari
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one slot, one page at a time
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type MacSim, macSim } from "../../lib/mac-sim";
import type { Kit, Spec } from "../kit";

const SAFARI = "com.apple.mobilesafari";
/** How long Safari has to ask for a page opened with `simctl openurl`: a cold Safari on a loaded Mac. */
const ASKED_MS = 120_000;
/** How long Safari has to write its cookie to disk. */
const STORED_MS = 60_000;
/** Where Safari keeps its cookies, inside its data container. */
const COOKIES = join("Library", "Cookies", "Cookies.binarycookies");

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

interface Device {
  dataPath: string;
  deviceTypeIdentifier: string;
  name: string;
  /** The runtime's identifier, the key simctl lists the device under. */
  runtime: string;
  udid: string;
}

async function devices(): Promise<Device[]> {
  const listed = JSON.parse(await sh("xcrun simctl list devices -j")) as {
    devices: Record<string, Omit<Device, "runtime">[]>;
  };
  return Object.entries(listed.devices).flatMap(([runtime, list]) =>
    list.map((device) => ({ ...device, runtime }))
  );
}

/** The UDIDs of the templates a slot like `udid` is cloned from: its device type, on its runtime. */
async function templatesFor(udid: string): Promise<string[]> {
  const all = await devices();
  const slot = all.find((d) => d.udid === udid);
  return all
    .filter(
      (d) =>
        d.name.startsWith("CawCo template ") &&
        d.deviceTypeIdentifier === slot?.deviceTypeIdentifier &&
        d.runtime === slot?.runtime
    )
    .map((d) => d.udid);
}

/** A slot's Safari data container, and the slot's own data folder. */
async function safariOf(
  udid: string
): Promise<{ container: string; data: string }> {
  const container = (
    await sh(`xcrun simctl get_app_container ${udid} ${SAFARI} data`)
  ).trim();
  const data = (await devices()).find((d) => d.udid === udid)?.dataPath ?? "";
  return { container, data };
}

const within = (path: string, folder: string) =>
  folder !== "" && path.startsWith(`${folder}/`);

const run = async (kit: Kit) => {
  /** A token no earlier run's cookie carries. */
  const token = crypto.randomUUID();
  /** The Cookie header each page was asked for with, by its path. */
  const asked = new Map<string, string>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/favicon.ico") {
        return new Response(null, { status: 404 });
      }
      asked.set(path, request.headers.get("cookie") ?? "");
      const headers = new Headers({
        "content-type": "text/html",
        "cache-control": "no-store",
      });
      if (path.startsWith("/set/")) {
        headers.set(
          "set-cookie",
          `probe=${token}; Max-Age=86400; Path=/; SameSite=Lax`
        );
      }
      return new Response(
        `<!doctype html><meta name="viewport" content="width=device-width"><title>${path}</title><h1>${path}</h1>`,
        { headers }
      );
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  /** Opens `path` in the slot's Safari; the Cookie header Safari asked with. */
  const open = async (udid: string, path: string): Promise<string | null> => {
    await sh(`xcrun simctl openurl ${udid} '${base}${path}'`);
    const start = performance.now();
    while (performance.now() - start < ASKED_MS) {
      const cookie = asked.get(path);
      if (cookie !== undefined) {
        return cookie;
      }
      await Bun.sleep(250);
    }
    return null;
  };
  const sent = (cookie: string | null) =>
    cookie === null
      ? "Safari never asked for the page"
      : `Cookie: ${cookie || "(none)"}`;

  const held: MacSim[] = [];
  try {
    const a = await macSim();
    held.push(a);
    const b = await macSim();
    held.push(b);
    const templates = (await devices())
      .filter((d) => d.name.startsWith("CawCo template "))
      .map((d) => d.dataPath);
    /** The one template A and B are clones of. */
    const templateAB = await templatesFor(a.udid);
    const safariA = await safariOf(a.udid);
    const safariB = await safariOf(b.udid);
    console.log(`  slot A ${a.udid}: Safari's data ${safariA.container}`);
    console.log(`  slot B ${b.udid}: Safari's data ${safariB.container}`);
    const own = (safari: { container: string; data: string }) =>
      within(safari.container, safari.data) &&
      !templates.some((t) => within(safari.container, t));
    kit.check(
      "two slots held at once: each slot's Safari data container is in its own data folder, none in a template's, and they differ",
      own(safariA) && own(safariB) && safariA.container !== safariB.container,
      `A ${safariA.container} (its folder ${safariA.data}); B ${safariB.container} (its folder ${safariB.data})`
    );

    const setA = await open(a.udid, "/set/a");
    const backA = await open(a.udid, "/read/a");
    kit.check(
      "slot A's Safari keeps the cookie its page set (the control)",
      setA !== null && backA?.includes(token) === true,
      `set page asked: ${setA !== null}; read again with ${sent(backA)}`
    );
    // On disk before B looks and before C is cloned: a Safari that shares
    // the template's folder would hand it on from there.
    const cookies = join(safariA.container, COOKIES);
    const start = performance.now();
    let stored = false;
    while (!stored && performance.now() - start < STORED_MS) {
      stored =
        existsSync(cookies) &&
        readFileSync(cookies).includes(token, 0, "latin1");
      if (!stored) {
        await Bun.sleep(1000);
      }
    }
    kit.note(
      `slot A's Safari ${stored ? "wrote" : "had not written"} the cookie to ${cookies} after ${((performance.now() - start) / 1000).toFixed(1)}s`
    );

    const readB = await open(b.udid, "/read/b");
    kit.check(
      "slot B, held beside A, does not send A's cookie",
      readB !== null && !readB.includes(token),
      sent(readB)
    );

    await Promise.all(held.splice(0).map((sim) => sim.release()));
    const c = await macSim();
    held.push(c);
    // C must come from the template A's Safari ran beside: a template remade
    // in between (another TEMPLATE_VERSION's slot, run meanwhile, drops it)
    // would hide a cookie that template handed on.
    const templateC = await templatesFor(c.udid);
    kit.check(
      "slot C is a clone of the same template as A and B",
      templateAB.length === 1 &&
        templateC.length === 1 &&
        templateC[0] === templateAB[0],
      `A and B: ${templateAB.join(", ") || "none"}; C: ${templateC.join(", ") || "none"}`
    );
    const safariC = await safariOf(c.udid);
    console.log(`  slot C ${c.udid}: Safari's data ${safariC.container}`);
    kit.check(
      "slot C, taken after A and B are gone: its Safari data container is in its own data folder, none in a template's, and not A's or B's",
      own(safariC) &&
        safariC.container !== safariA.container &&
        safariC.container !== safariB.container,
      `C ${safariC.container} (its folder ${safariC.data})`
    );
    const readC = await open(c.udid, "/read/c");
    kit.check(
      "slot C does not send the cookie A's Safari kept",
      readC !== null && !readC.includes(token),
      sent(readC)
    );
  } finally {
    await Promise.all(held.map((sim) => sim.release()));
    server.stop(true);
  }
};

const spec: Spec = { name: "ios-slot-safari", run };
export default spec;
