/**
 * A file of a project's folder has an address in the dashboard: the project
 * page's `?file=<path>` (FolderFile, folderFileHref), on a scratch fleet in
 * the built dashboard, read from the page's engine:
 *
 * 1. At 1440: the address opens the file beside the board, drawn as the hub
 *    reads it; a reload opens the same file; Close puts it away and the
 *    address with it.
 * 2. Configure › Delegate types: a project type's row links to its file, and
 *    following it opens that file on its project's page.
 * 3. Refusals, in the hub's words, for a path that climbs out of the folder,
 *    an absolute one and one the folder lacks; nothing of the file drawn.
 * 4. At 390: the address is the file's own page; a reload keeps it; Back
 *    goes to the board and the address loses the file.
 *
 *   bun scripts/probe-kit/run.ts web project-file
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const PLAN = "notes/plan.md";
const PLAN_WORDS = "The plan the address opens";
const TYPE = "delegates/probe.md";
const TYPE_WORDS = "Reads the probe's files";

/** What the page shows of the file at `path`: its words, or the hub's refusal. */
const readFile = (page: Page, path: string) =>
  page.evaluate((at) => {
    const body = document.querySelector(
      `[data-folder-file="${CSS.escape(at)}"]`
    );
    return {
      shown: body !== null,
      words: body?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      refused:
        body
          ?.querySelector("[data-folder-file-refused]")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      drawn:
        body?.querySelector('[data-slot="text"], [data-slot="md"]') !== null &&
        body !== null,
      page: document.querySelector("[data-file-page]") !== null,
      card: document.querySelector('[data-side-surface-class~="folder-file"]')
        ?.isConnected,
      file: new URL(location.href).searchParams.get("file"),
      path: location.pathname,
    };
  }, path);

/** Waits until the file at `path` has its words or its refusal drawn. */
const fileRead = (page: Page, path: string) =>
  page.waitForFunction(
    (at) => {
      const body = document.querySelector(
        `[data-folder-file="${CSS.escape(at)}"]`
      );
      return (
        body !== null &&
        body.querySelector('[data-slot="skeleton"]') === null &&
        (body.textContent ?? "").trim().length > 0
      );
    },
    path,
    { timeout: 30_000 }
  );

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && git remote add origin https://github.com/probe/files.git && echo f > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string; name: string }>(
    "/api/projects",
    { name: "Files", machineId: MACHINE, cwd: src }
  );
  for (const [path, content] of [
    [PLAN, `# Plan\n\n${PLAN_WORDS}.\n`],
    [
      TYPE,
      `---\nharness: claude\nmodel: claude-opus-5-5\ndescription: ${TYPE_WORDS}\n---\n${TYPE_WORDS}, then says what it found.\n`,
    ],
  ] as const) {
    const wrote = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      }
    );
    kit.check(
      `${path} is written into the project's folder`,
      wrote.ok,
      `${wrote.status} ${await wrote.text()}`
    );
  }
  const base = await fleet.dashboard();
  const pageUrl = `${base}/project/${project.id}`;
  const address = (path: string) =>
    `${pageUrl}?${new URLSearchParams({ file: path }).toString().replaceAll("%2F", "/")}`;

  // 1. The address, at a desk: beside the board, then again after a reload.
  const desk = await kit.page("desk");
  await open(desk, address(PLAN), `[data-folder-file="${PLAN}"]`);
  await fileRead(desk, PLAN);
  const opened = await readFile(desk, PLAN);
  kit.check(
    "1440: the address opens the file beside the board, as the hub reads it",
    opened.card === true && opened.drawn && opened.words.includes(PLAN_WORDS),
    JSON.stringify(opened)
  );
  await desk.reload({ waitUntil: "domcontentloaded" });
  await fileRead(desk, PLAN);
  const reloaded = await readFile(desk, PLAN);
  kit.check(
    "1440: a reload opens the same file at the same address",
    reloaded.card === true &&
      reloaded.words.includes(PLAN_WORDS) &&
      reloaded.file === PLAN,
    JSON.stringify(reloaded)
  );
  await desk
    .locator('[data-side-surface-class~="folder-file"] [data-slot="close"]')
    .click();
  await desk.waitForFunction(
    () => document.querySelector("[data-folder-file]") === null,
    null,
    { timeout: 10_000 }
  );
  await settle(desk);
  const closed = await readFile(desk, PLAN);
  kit.check(
    "1440: Close puts the file away, and the address with it",
    !closed.shown && closed.file === null && closed.path.endsWith(project.id),
    JSON.stringify(closed)
  );

  // 2. Configure › Delegate types links the project's type to its file.
  await open(desk, `${base}/config/delegate-types`, `a[href*="?file=${TYPE}"]`);
  const link = desk.locator(`a[href*="?file=${TYPE}"]`);
  const href = await link.getAttribute("href");
  kit.check(
    "Configure › Delegate types: the project's type links to its file's address",
    href === `/project/${project.id}?file=${TYPE}`,
    String(href)
  );
  await link.click();
  await desk.waitForURL((url) => url.searchParams.get("file") === TYPE, {
    timeout: 30_000,
  });
  await fileRead(desk, TYPE);
  const followed = await readFile(desk, TYPE);
  kit.check(
    "following it opens the type's file on its project's page",
    followed.path === `/project/${project.id}` &&
      followed.card === true &&
      followed.words.includes(TYPE_WORDS),
    JSON.stringify(followed)
  );

  // 3. What the hub refuses is said in its words, and nothing is drawn.
  for (const [path, words] of [
    ["../outside.md", "climbs out of the project folder"],
    ["/etc/passwd", "is an absolute path"],
    ["notes/missing.md", "is not in the project folder"],
  ] as const) {
    await open(desk, address(path), `[data-folder-file="${path}"]`);
    await fileRead(desk, path);
    const refused = await readFile(desk, path);
    kit.check(
      `${path} is refused in the hub's words, with nothing of a file drawn`,
      refused.refused?.includes(words) === true && !refused.drawn,
      JSON.stringify(refused)
    );
  }

  // 4. The address on a phone: the file's own page, kept by a reload; Back
  // is the board.
  const phone = await kit.page("phone");
  await open(phone, address(PLAN), `[data-folder-file="${PLAN}"]`);
  await fileRead(phone, PLAN);
  const own = await readFile(phone, PLAN);
  kit.check(
    "390: the address is the file's own page",
    own.page && own.words.includes(PLAN_WORDS),
    JSON.stringify(own)
  );
  await phone.reload({ waitUntil: "domcontentloaded" });
  await fileRead(phone, PLAN);
  const ownAgain = await readFile(phone, PLAN);
  kit.check(
    "390: a reload keeps the file's own page",
    ownAgain.page &&
      ownAgain.words.includes(PLAN_WORDS) &&
      ownAgain.file === PLAN,
    JSON.stringify(ownAgain)
  );
  await phone
    .locator('[data-file-page] [data-slot="page-head"] button', {
      hasText: project.name,
    })
    .click();
  await phone.waitForFunction(
    () => document.querySelector("[data-folder-file]") === null,
    null,
    { timeout: 10_000 }
  );
  const back = await readFile(phone, PLAN);
  kit.check(
    "390: Back goes to the board, and the address loses the file",
    !back.shown && back.file === null,
    JSON.stringify(back)
  );
};

export default { name: "project-file", run } satisfies Spec;
