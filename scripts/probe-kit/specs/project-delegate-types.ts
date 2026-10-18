/**
 * A project's own delegate types on Configure › Delegate types (Projects
 * spec §5.1, D16: "Delegate types are files in `delegates/` and shadow fleet
 * types of the same name"). On a scratch fleet, the built dashboard on the
 * desk: a project gets `delegates/writer.md` and a file named like one of
 * the fleet types the hub seeded, through its folder. The page lists the
 * fleet's types under "The fleet", and both files under the project's name,
 * each with its path; the one named like a fleet type says it shadows it,
 * and writer says nothing of the kind. Read from the DOM.
 *
 *   bun scripts/probe-kit/run.ts project-delegate-types
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const PROJECT = "Harbour";
const WRITER = "writer";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const typeFile = (description: string) =>
  `---\nharness: claude\nmodel: claude-opus-5-5\neffort: high\nlands: none\n---\n${description}\n`;

interface Group {
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

  const repo = join(fleet.sandbox, "harbour");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo harbour > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'Harbour'`
    .cwd(repo)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: PROJECT,
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  for (const [path, content] of [
    [`delegates/${WRITER}.md`, typeFile("Draft posts in the brand voice.")],
    [`delegates/${shadowed}.md`, typeFile("Harbour's own take on it.")],
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: two files, in order
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
  const catalog = await fleet.api<{
    types: { name: string; shadows?: boolean; source: string }[];
  }>(`/api/projects/${project.id}/delegate-types`);
  kit.check(
    "the hub's catalog holds both files as the project's types",
    catalog.types.filter((type) => type.source === "project").length === 2,
    JSON.stringify(catalog.types.map((type) => [type.name, type.source]))
  );

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/config/delegate-types`, `text=${PROJECT}`);
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
  const said = JSON.stringify(groups);
  const fleetGroup = groups.find((group) => group.head === "The fleet");
  const projectGroup = groups.find((group) => group.head === PROJECT);
  kit.check(
    "the fleet's types stand under “The fleet”, writer not among them",
    fleetGroup !== undefined &&
      fleetGroup.rows.length === fleetTypes.length &&
      !fleetGroup.rows.some((row) => row.name === WRITER),
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
