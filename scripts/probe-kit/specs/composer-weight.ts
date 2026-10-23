/**
 * A comment card loads the composer parts a comment reply shows, and a
 * conversation's composer still loads every part it shows. Read from the stage's own
 * weight of each sheet (Vite's module graph, `/__cawco/weight`), never from
 * pixels, on the dashboard's stage (stage-host/host.ts, as sheet-weight
 * starts it), on scratch states files, each opened in turn on a fresh stage:
 *
 * 1. PinCard.svelte, a thread and its reply composer: its modules and
 *    bytes, and the fleet store (client.svelte.ts) not among them: its
 *    thread's markdown, with no host's references handed in
 *    (markdown-fleet.ts), draws each reference as its label.
 * 2. transcript/Composer.svelte as a comment's reply mounts it
 *    (CommentComposer's props: no fleet, no session, no tray, no ask): its
 *    modules and bytes, and none of `CHAT_PARTS` among them (the fleet
 *    store, the delegate tray, the permission prompt, the recall wheel, the
 *    canvas room, a queued message's lift, Caw's face, the harness block,
 *    `/mcp auth`'s sign-in, the hub seam, the skill chip, the suggestion
 *    chips); then each of them imported on its page in turn, and what each
 *    fetched that nothing before it did.
 * 3. The same Composer as a session's conversation mounts it (the fleet
 *    handed in, a session to recall, a tray row, suggestions): every one of
 *    `CHAT_PARTS` loaded with it, by the time the page is idle.
 *
 * PinCard is weighed first, then the reply: a module the stage has served
 * for a sheet is in its graph for every sheet after it.
 *
 *   bun scripts/probe-kit/run.ts composer-weight
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import type { SheetWeight } from "../../../packages/core/src/stage";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const APP = join(ROOT, "apps/dashboard");
/** The scratch states files' folder, under `src/` (SvelteKit serves only that); gone when the spec ends. */
const SCRATCH = "src/lib/cawco/probe-composer-weight";

/** What a composer in the app reads of the fleet and shows in a conversation (transcript/composer-fleet.ts), by the file each one enters at. */
const CHAT_PARTS = [
  "src/lib/cawco/client.svelte.ts",
  "src/lib/cawco/transcript/DelegateTray.svelte",
  "src/lib/cawco/transcript/Prompt.svelte",
  "src/lib/cawco/transcript/RecallWheel.svelte",
  "src/lib/cawco/transcript/canvas-room.svelte.ts",
  "src/lib/cawco/transcript/lift.svelte.ts",
  "src/lib/cawco/home/CawFace.svelte",
  "src/lib/cawco/HarnessBlock.svelte",
  "src/lib/cawco/harness-block.svelte.ts",
  "src/lib/cawco/fleet.ts",
  "src/lib/cawco/hub-seam.ts",
  "src/lib/cawco/SkillChip.svelte",
  "src/lib/cawco/transcript/SuggestionChips.svelte",
];

const PIN = `{
  id: "pin-weight",
  number: 3,
  kind: "comment",
  by: "person",
  at: "2026-10-23T09:12:00.000Z",
  sentAt: "2026-10-23T09:12:02.000Z",
  seenAt: "2026-10-23T09:20:00.000Z",
  anchor: { selector: "#retry", text: "After a failed reconnect the daemon waits a second.", source: null },
  elements: [],
  thread: [
    { id: "e1", by: "person", at: "2026-10-23T09:12:00.000Z", sentAt: "2026-10-23T09:12:02.000Z", text: "Why does it back off to 30 seconds?" },
    { id: "e2", by: "agent", at: "2026-10-23T09:14:00.000Z", text: "The ceiling came from the hub's **restart** time." },
  ],
}`;

const PIN_STORY = `import { ComposerDraft } from "../transcript/composer-draft.svelte";
import PinCard from "../preview/PinCard.svelte";

const none = () => undefined;

export default {
  component: PinCard,
  args: {
    pin: ${PIN},
    name: "Reconnect",
    parent: null,
    agentName: "Reconnect fix",
    link: "https://example.invalid/a#pin-3",
    problem: null,
    draft: new ComposerDraft({ byReference: true }),
    onreply: none,
    onretry: none,
    onresolve: none,
    ondelete: async () => undefined,
    onplace: none,
    onclose: none,
    onfind: none,
  },
};

export const Thread = { args: {} };
`;

const REPLY_STORY = `import { ComposerDraft } from "../transcript/composer-draft.svelte";
import Composer from "../transcript/Composer.svelte";

export default {
  component: Composer,
  args: {
    action: "Reply",
    attach: true,
    commands: [],
    draft: new ComposerDraft({ byReference: true }),
    flush: true,
    mentionsFrom: null,
    onstop: () => undefined,
    onsubmit: () => undefined,
    paneVisible: false,
    placeholder: { full: "Reply to this comment…", short: "Reply…" },
  },
};

export const Reply = { args: {} };
`;

const CHAT_STORY = `import { composerFleet } from "../transcript/composer-fleet";
import { ComposerDraft } from "../transcript/composer-draft.svelte";
import Composer from "../transcript/Composer.svelte";

export default {
  component: Composer,
  args: {
    chat: composerFleet,
    draft: new ComposerDraft(),
    commands: [],
    mentionsFrom: "s-weight",
    onstop: () => undefined,
    onsubmit: () => undefined,
    recallOf: "s-weight",
    trayRows: [{ id: "s-weight", delegatesOf: "s-weight" }],
    showing: "s-weight",
    suggest: { candidates: [] },
  },
};

export const Chat = { args: {}, parameters: { viewport: 680 } };
`;

const STORIES = {
  pin: { file: "PinCard.stories.ts", text: PIN_STORY },
  reply: { file: "Reply.stories.ts", text: REPLY_STORY },
  chat: { file: "Chat.stories.ts", text: CHAT_STORY },
} as const;

const kB = (bytes: number) => `${(bytes / 1000).toFixed(0)} kB`;
const said = (weight: SheetWeight | null) =>
  weight
    ? `${weight.modules} modules, ${kB(weight.bytes)} (deps ${weight.deps.modules}, ${kB(weight.deps.bytes)}); heaviest ${weight.heaviest.map((one) => `${one.file} ${one.modules}/${kB(one.bytes)} brings [${one.brings.map((b) => `${b.file.split("/").at(-1)} ${b.modules}/${kB(b.bytes)}`).join(", ")}]`).join("; ")}`
    : "no weight";

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

const run = async (kit: Kit) => {
  const dir = join(APP, SCRATCH);
  mkdirSync(dir, { recursive: true });
  for (const { file, text } of Object.values(STORIES)) {
    writeFileSync(join(dir, file), text);
  }
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  stage.stdout.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  stage.stderr.on("data", (chunk: Buffer) => {
    words += chunk.toString("utf8");
  });
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      120_000
    );
    const base = `http://127.0.0.1:${port}`;
    /** One sheet opened on a page of its own until its frames are settled and the page is idle: its weight, what it fetched, its errors. */
    const weigh = async (
      file: string,
      then: (page: Page) => Promise<string> = async () => ""
    ) => {
      const page = await kit.page("desk", {
        scale: 1,
        init: [() => performance.setResourceTimingBufferSize(5000)],
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      const path = `${SCRATCH}/${file}`;
      await page.goto(
        `${base}/@cawco/canvas?file=${encodeURIComponent(path)}`,
        { waitUntil: "load" }
      );
      await page.waitForFunction(
        (wanted) => {
          const sections =
            (
              window as unknown as {
                __cawcoCanvas?: {
                  report?: {
                    sections: { file: string; frames: { state: string }[] }[];
                  };
                };
              }
            ).__cawcoCanvas?.report?.sections ?? [];
          const section = sections.find((one) => one.file === wanted);
          return (
            !!section &&
            section.frames.length > 0 &&
            section.frames.every(
              (frame) => frame.state !== "unseen" && frame.state !== "empty"
            )
          );
        },
        path,
        { timeout: 120_000 }
      );
      // What the page asks for once it is idle (a chat composer's preloads) is its own, too.
      await page.evaluate(
        () =>
          new Promise<void>((done) => {
            requestIdleCallback(() => setTimeout(done, 1500));
          })
      );
      const fetched = await page.evaluate(() =>
        (
          performance.getEntriesByType(
            "resource"
          ) as PerformanceResourceTiming[]
        ).map((one) => new URL(one.name).pathname)
      );
      const states = await page.evaluate(
        (wanted) =>
          (
            window as unknown as {
              __cawcoCanvas?: {
                report?: {
                  sections: {
                    file: string;
                    frames: {
                      state: string;
                      error?: {
                        message: string;
                        file: string | null;
                        line: number | null;
                      };
                    }[];
                  }[];
                };
              };
            }
          ).__cawcoCanvas?.report?.sections
            .find((one) => one.file === wanted)
            ?.frames.map((frame) =>
              frame.error
                ? `${frame.state} (${frame.error.message} at ${frame.error.file}:${frame.error.line})`
                : frame.state
            ) ?? [],
        path
      );
      const answer = (await (
        await fetch(`${base}/__cawco/weight?file=${encodeURIComponent(path)}`)
      ).json()) as { weight: SheetWeight | null };
      const more = await then(page);
      await page.close();
      return { weight: answer.weight, fetched, errors, states, more };
    };
    const partsIn = (fetched: string[]) =>
      CHAT_PARTS.filter((part) => fetched.some((url) => url.endsWith(part)));

    const pin = await weigh(STORIES.pin.file);
    kit.check(
      `1: PinCard's sheet (${pin.states.join(", ")}): ${said(pin.weight)}; of CHAT_PARTS it fetched: ${
        partsIn(pin.fetched)
          .map((part) => part.split("/").at(-1))
          .join(", ") || "none"
      }`,
      !!pin.weight &&
        !pin.fetched.some((url) =>
          url.endsWith("src/lib/cawco/client.svelte.ts")
        ),
      pin.errors.join(" | ")
    );
    /** Each part imported in turn on the reply's page: the modules it fetches that nothing before it did. */
    const eachPart = async (page: Page) => {
      const counts: string[] = [];
      for (const part of CHAT_PARTS) {
        // biome-ignore lint/performance/noAwaitInLoops: in turn, so each part's count is its own
        const fetched = await page.evaluate(async (url) => {
          const before = performance.getEntriesByType("resource").length;
          await import(/* @vite-ignore */ url);
          const entries = performance.getEntriesByType(
            "resource"
          ) as PerformanceResourceTiming[];
          return entries.slice(before).reduce(
            (sum, one) => ({
              modules: sum.modules + 1,
              bytes: sum.bytes + one.decodedBodySize,
            }),
            { modules: 0, bytes: 0 }
          );
        }, `/${part}`);
        counts.push(
          `${part.split("/").at(-1)} ${fetched.modules} modules ${kB(fetched.bytes)}`
        );
      }
      return counts.join(", ");
    };
    const reply = await weigh(STORIES.reply.file, eachPart);
    const replyParts = partsIn(reply.fetched);
    kit.check(
      `2: Composer as a comment's reply (${reply.states.join(", ")}): ${said(reply.weight)}; the chat composer's parts it fetched: ${replyParts.join(", ") || "none"}; each part imported after, in turn, fetches: ${reply.more}`,
      !!reply.weight && replyParts.length === 0,
      reply.errors.join(" | ")
    );
    const chat = await weigh(STORIES.chat.file);
    const composerFleet = partsIn(chat.fetched);
    kit.check(
      `3: Composer in a conversation (${chat.states.join(", ")}): ${said(chat.weight)}; the chat composer's parts loaded by its idle: ${composerFleet.length} of ${CHAT_PARTS.length}`,
      !!chat.weight && composerFleet.length === CHAT_PARTS.length,
      `missing: ${CHAT_PARTS.filter((part) => !composerFleet.includes(part)).join(", ") || "none"}; ${chat.errors.join(" | ")}`
    );
  } finally {
    stage.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "composer-weight", run };
export default spec;
