/**
 * A project's own delegate types on Configure › Delegate types (Projects
 * spec §5.1, D16: "Delegate types are files in `delegates/` and shadow fleet
 * types of the same name"). On a scratch fleet, the built dashboard on the
 * desk: project Harbour gets `delegates/writer.md`, a file named like one of
 * the fleet types the hub seeded, and `delegates/broken.md` with no front
 * matter, through its folder; project Quay gets only a broken one. The page
 * lists the fleet's types under "The fleet", and Harbour's two types under
 * its name, each with its path; the one named like a fleet type says it
 * shadows it, and writer says nothing of the kind. Each broken file is said
 * under its project in the hub's words, and Quay, with no type at all, still
 * has its group. Read from the DOM.
 *
 *   bun scripts/probe-kit/run.ts project-delegate-types
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const PROJECT = "Harbour";
const BROKEN_ONLY = "Quay";
const WRITER = "writer";
const BROKEN = "delegates/broken.md";
/** What the hub says of a type file with no front matter (project-delegate-types.ts). */
const NO_FRONT_MATTER = `${BROKEN}: the file has no front matter (a --- block on top)`;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const typeFile = (description: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\neffort: high\nlands: none\n---\n${description}\n`;

interface Group {
  /** The fault lines under it. */
  faults: string[];
  head: string;
  rows: {
    badge: string | null;
    /** The badge's computed font-family. */
    badgeFace: string | null;
    /** The name's link or label, its computed font-family. */
    face: string;
    meta: string;
    name: string;
  }[];
}

/** A project on a repository of its own, its folder holding `files`. */
async function projectWith(
  fleet: KitFleet,
  name: string,
  files: [path: string, content: string][]
): Promise<string> {
  const repo = join(fleet.sandbox, name.toLowerCase());
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo ${name} > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm ${name}`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  for (const [path, content] of files) {
    // biome-ignore lint/performance/noAwaitInLoops: a few files, in order
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      }
    );
    if (!put.ok) {
      throw new Error(`${path}: ${put.status} ${await put.text()}`);
    }
  }
  return project.id;
}

async function probe(kit: Kit) {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();

  const fleetTypes = (
    await fleet.api<{ types: { name: string }[] }>("/api/delegate-types")
  ).types.map((type) => type.name);
  const [shadowed] = fleetTypes;
  kit.check(
    "the hub seeded fleet types, none named writer",
    shadowed !== undefined && !fleetTypes.includes(WRITER),
    fleetTypes.join(", ")
  );

  const harbour = await projectWith(fleet, PROJECT, [
    [`delegates/${WRITER}.md`, typeFile("Draft posts in the brand voice.")],
    [`delegates/${shadowed}.md`, typeFile("Harbour's own take on it.")],
    [BROKEN, "Just a brief, with no front matter.\n"],
  ]);
  await projectWith(fleet, BROKEN_ONLY, [
    [BROKEN, "Just a brief, with no front matter.\n"],
  ]);
  const catalog = await fleet.api<{
    problems: { path: string; problem: string }[];
    types: { name: string; shadows?: boolean; source: string }[];
  }>(`/api/projects/${harbour}/delegate-types`);
  kit.check(
    "the hub's catalog holds two of Harbour's files as its types, and says why broken.md is none",
    catalog.types.filter((type) => type.source === "project").length === 2 &&
      catalog.problems.some(
        (one) => `${one.path}: ${one.problem}` === NO_FRONT_MATTER
      ),
    JSON.stringify({
      types: catalog.types.map((type) => [type.name, type.source]),
      problems: catalog.problems,
    })
  );

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/config/delegate-types`, `text=${BROKEN_ONLY}`);
  const { groups, faces } = await page.evaluate(() => {
    const faceOf = (element: Element | null) =>
      element ? getComputedStyle(element).fontFamily : null;
    /** What a font token resolves to, on a span of its own. */
    const token = (name: string) => {
      const span = document.createElement("span");
      span.style.fontFamily = `var(${name})`;
      document.body.append(span);
      const face = faceOf(span) ?? "";
      span.remove();
      return face;
    };
    return {
      faces: { mono: token("--font-mono"), body: token("--font-body") },
      groups: [...document.querySelectorAll('[data-slot="group"]')].map(
        (group): Group => ({
          head:
            group.querySelector('[data-slot="head"]')?.textContent?.trim() ??
            "",
          faults: [
            ...group.querySelectorAll(
              ':scope > [data-slot="row-fault"] [data-slot="reason"]'
            ),
          ].map((reason) => reason.textContent?.trim() ?? ""),
          rows: [...group.querySelectorAll<HTMLElement>("[data-row-name]")].map(
            (row) => {
              const badge = row.querySelector('[data-slot="badge"]');
              return {
                name: row.dataset.rowName ?? "",
                meta:
                  row
                    .querySelector('[data-slot="meta"]')
                    ?.textContent?.trim() ?? "",
                badge: badge?.textContent?.trim() ?? null,
                badgeFace: faceOf(badge),
                face:
                  faceOf(
                    row.querySelector('[data-slot="name"] > :is(.link, .label)')
                  ) ?? "",
              };
            }
          ),
        })
      ),
    };
  });
  /** The page's groups as heads, row names and fault lines: what each check failing prints. */
  const said = JSON.stringify(
    groups
      .filter((group) => group.head !== "")
      .map((group) => ({
        head: group.head,
        rows: group.rows.map((row) => row.name),
        faults: group.faults,
      }))
  );
  const fleetGroup = groups.find((group) => group.head === "The fleet");
  const projectGroup = groups.find((group) => group.head === PROJECT);
  const brokenGroup = groups.find((group) => group.head === BROKEN_ONLY);
  kit.check(
    "the fleet's types stand under “The fleet”, writer not among them",
    fleetGroup !== undefined &&
      fleetGroup.rows.length === fleetTypes.length &&
      !fleetGroup.rows.some((row) => row.name === WRITER) &&
      fleetGroup.faults.length === 0,
    said
  );
  kit.check(
    `both of the project's types stand under “${PROJECT}”`,
    projectGroup !== undefined &&
      projectGroup.rows
        .map((row) => row.name)
        .sort()
        .join() === [WRITER, shadowed].sort().join(),
    said
  );
  const writer = projectGroup?.rows.find((row) => row.name === WRITER);
  kit.check(
    "writer's row shows its file and shadows nothing",
    writer?.meta.startsWith(`delegates/${WRITER}.md · `) === true &&
      writer.badge === null,
    JSON.stringify(writer)
  );
  const shadow = projectGroup?.rows.find((row) => row.name === shadowed);
  kit.check(
    `${shadowed}'s row shows its file and “shadows the fleet's ${shadowed}”`,
    shadow?.meta.startsWith(`delegates/${shadowed}.md · `) === true &&
      shadow.badge === `shadows the fleet's ${shadowed}`,
    JSON.stringify(shadow)
  );
  kit.check(
    `broken.md is said under “${PROJECT}” in the hub's words`,
    projectGroup?.faults.join("|") === NO_FRONT_MATTER,
    said
  );
  kit.check(
    `“${BROKEN_ONLY}”, whose only file is broken, has its group with that line and no rows`,
    brokenGroup !== undefined &&
      brokenGroup.rows.length === 0 &&
      brokenGroup.faults.join("|") === NO_FRONT_MATTER,
    said
  );
  kit.check(
    "a fleet row's name keeps the mono face",
    faces.mono !== faces.body &&
      fleetGroup?.rows[0]?.face === faces.mono &&
      shadow?.face === faces.mono,
    `${JSON.stringify(faces)}; fleet ${fleetGroup?.rows[0]?.face}; project ${shadow?.face}`
  );
  kit.check(
    "the shadow badge is set in the body face",
    shadow?.badgeFace === faces.body,
    `${shadow?.badgeFace} against ${JSON.stringify(faces)}`
  );
}

const spec: Spec = { name: "project-delegate-types", run: probe };
export default spec;
