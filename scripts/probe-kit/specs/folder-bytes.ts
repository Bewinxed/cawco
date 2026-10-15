/**
 * Caw writes a project's binary design files himself: folder_write takes
 * `encoding: "base64"`, so the design-system flow can make `design/fonts`
 * and `design/assets`. On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model, which answers as the project's Caw),
 * one run each:
 *
 * 1. Caw's folder_write puts a font (woff2) into the folder from base64, and
 *    the mockup's file route serves it byte-identical.
 * 2. The same for a photo (png).
 * 3. A content that is not base64 is refused with the reason, and Caw
 *    reads it.
 *
 * Caw's session runs in a workspace boundary (bwrap), which does not start
 * inside another: run this on a machine, not from inside a workspace.
 *
 *   bun scripts/probe-kit/run.ts folder-bytes
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one call at a time, as Caw makes them
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { FONT, photo } from "./web/oui-mockup/bytes";

const HARBOUR = join(import.meta.dir, "web", "oui-mockup", "harbour");
const WRITE = "mcp__cawco__folder_write";
const CALL = /PROBE-CALL:(\d+)/g;
/** A service's line about Caw's session: what says why a call never came. */
const ABOUT_CAW = /caw|lead|spawn|boundary|refus/i;

/**
 * The mock model as the project's Caw: a thread's `PROBE-CALL:<n>` is the
 * call asked for under that number, loaded with ToolSearch first while it
 * is deferred; what the tool answered is kept by its number.
 */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(CALL)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** Caw's answer to folder_write with `input`, asked in a thread of `project`'s. */
async function cawWrites(
  kit: Kit,
  fleet: KitFleet,
  project: string,
  input: object
): Promise<string> {
  const marker = String(asks.size + 1);
  asks.set(marker, { name: WRITE, input });
  await fleet.api(`/api/projects/${project}/threads`, {
    body: `PROBE-CALL:${marker}`,
  });
  return await until(
    `Caw's folder_write (${marker})`,
    () => answered.get(marker),
    Boolean,
    240_000
  ).catch(async (error: unknown) => {
    // What the hub and the agent said of Caw, so a call that never came
    // says why (inside a workspace: his boundary cannot start).
    const said = `${await fleet.logs("hub")}\n${await fleet.logs("agent")}`;
    await writeFile(join(kit.out, "services.log"), said);
    const caw = said
      .split("\n")
      .filter((line) => ABOUT_CAW.test(line))
      .slice(-6)
      .join(" ⏎ ");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; the model was asked ${fleet.seen.length} time(s); the services said: ${caw.slice(-1600)}`
    );
  });
}

const spec: Spec = {
  name: "folder-bytes",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // A project on the fleet's checkout, so its Caw can run, with a design
    // whose manifest names the font and the photo.
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Harbour",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    for (const path of [
      "manifest.json",
      "tokens.css",
      "specimens/price-tag.html",
    ]) {
      const written = await fetch(
        `${fleet.base}/api/projects/${project.id}/folder/file`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: `design/${path}`,
            content: await readFile(join(HARBOUR, path), "utf8"),
          }),
        }
      );
      if (!written.ok) {
        throw new Error(
          `design/${path}: ${written.status} ${await written.text()}`
        );
      }
    }

    const files = [
      { path: "design/fonts/harbour-round.woff2", bytes: await readFile(FONT) },
      { path: "design/assets/catch.png", bytes: photo() },
    ];
    for (const [index, file] of files.entries()) {
      const said = await cawWrites(kit, fleet, project.id, {
        path: file.path,
        content: file.bytes.toString("base64"),
        encoding: "base64",
      });
      const served = await fetch(
        `${fleet.base}/api/projects/${project.id}/mockups/file?path=${encodeURIComponent(file.path)}`
      );
      const bytes = Buffer.from(await served.arrayBuffer());
      kit.check(
        `${index + 1}: Caw's folder_write puts ${file.path} in the folder from base64, and the mockup's file route serves it byte-identical`,
        said.includes(file.path) &&
          served.ok &&
          bytes.equals(file.bytes) &&
          served.headers.get("content-type") ===
            (file.path.endsWith(".png") ? "image/png" : "font/woff2"),
        `folder_write said “${said.slice(0, 160)}”; served ${served.status} ${served.headers.get("content-type")}, ${bytes.byteLength} of ${file.bytes.byteLength} bytes, equal ${bytes.equals(file.bytes)}`
      );
    }

    const refused = await cawWrites(kit, fleet, project.id, {
      path: "design/assets/broken.png",
      content: "not base64 at all!",
      encoding: "base64",
    });
    kit.check(
      "3: a content that is not base64 is refused with the reason, and Caw reads it",
      refused.includes("not base64"),
      `folder_write said “${refused.slice(0, 200)}”`
    );
  },
};
export default spec;
