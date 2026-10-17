/**
 * A page's `cawco.pickPlace()` (Caw's setup page, its `place` card): after
 * the person types a folder into the place picker (PlacePick.svelte), a real
 * click on "Use this place" sends the place, and the page's card reads it.
 * Pointer clicks and typed keys throughout, never `requestSubmit`.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a page artifact whose one card asks `cawco.pickPlace()`, in the
 * session's panel on the desk, read from the hub's own record of the page's
 * state and the card's words:
 *
 * A. The machine online: the picker opens with it, a folder typed, a click on
 *    Use this place: the hub holds the place (the machine, its label and the
 *    folder), and the card reads "<label> — <path>" from what pickPlace
 *    answered, the label the dashboard names the machine by (core
 *    `machineLabel`, the picker's select included).
 * B. The picker opened while the only machine is offline, which then comes
 *    back: the picker offers it as soon as it is online, and the same typed
 *    folder and click send the place. (Main seeded the machine once, as the
 *    picker mounted: a machine heard after that was never the pick, and every
 *    click stopped at "Choose a machine that is online.")
 *
 *   bun scripts/probe-kit/run.ts place-pick
 */
import type { Page } from "playwright-core";
import { machineLabel } from "../../../packages/core/src/index";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const NAME = "place";

/** One card, as the setup page's: a button that asks for the place, and the place picked as "<label> — <path>". */
const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Where the work happens</title></head>
<body>
  <main>
    <h1>Where the work happens</h1>
    <p data-place>Not picked</p>
    <button type="button" data-pick>Choose a machine and folder</button>
  </main>
  <script>
    document.querySelector("[data-pick]").addEventListener("click", async () => {
      const place = await window.cawco.pickPlace();
      document.querySelector("[data-place]").textContent = place
        ? place.label + " — " + place.path
        : "Not picked";
    });
  </script>
</body>
</html>`;

/** What each numbered message asks the session to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
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
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

interface Placed {
  label?: string;
  machineId?: string;
  path?: string;
}

interface AgentRow {
  hostname: string;
  machineId: string;
  status: string;
}

/** The hub's row for the fleet's one machine. */
const machineRow = async (fleet: KitFleet): Promise<AgentRow | undefined> =>
  (await fleet.api<AgentRow[]>("/api/agents")).find(
    (row) => row.machineId === MACHINE
  );

/** The hub's online word on the fleet's one machine. */
const machineOnline = async (fleet: KitFleet): Promise<boolean> =>
  (await machineRow(fleet))?.status === "online";

/** The bar's machines glyph's hue, as the dashboard's fleet store has it: `fail` while a machine is down. */
const machinesTone = (page: Page): Promise<string | null> =>
  page.locator("[data-machines]").getAttribute("data-tone");

/**
 * Opens the picker from the page's card, types `folder` into it and clicks
 * Use this place; `between` runs once the picker is open, before the typing.
 * Answers what the hub then holds under `place`, and the card's words.
 */
const pick = async (
  page: Page,
  fleet: KitFleet,
  read: () => Promise<Placed | undefined>,
  folder: string,
  between: () => Promise<void> = async () => undefined
) => {
  const frame = page.frameLocator('iframe[title="Preview"]');
  // The panel's frame takes no press while it is still coming in.
  await settle(page);
  await frame.locator("[data-pick]").click();
  const form = page.getByRole("form", { name: "Pick a machine and folder" });
  await form.waitFor({ timeout: 15_000 });
  await between();
  const field = form.getByLabel("Folder");
  await field.click();
  await field.pressSequentially(folder, { delay: 5 });
  await settle(page);
  const trigger = (
    await form.locator('[data-slot="select-trigger"]').innerText()
  ).trim();
  await form.getByRole("button", { name: "Use this place" }).click();
  const held = await until(
    "the place on the hub",
    read,
    (place) => place?.path === folder,
    10_000
  ).catch(read);
  // A sent place closes the picker (its outro inert while it goes); a refused one keeps it, saying why.
  const closed = await form.waitFor({ state: "detached", timeout: 5000 }).then(
    () => true,
    () => false
  );
  const problem = closed
    ? null
    : (await form.getByRole("alert").allInnerTexts()).join(" ") ||
      "the picker still open";
  if (!closed) {
    await form.getByRole("button", { name: "Cancel" }).click();
    await form.waitFor({ state: "detached", timeout: 5000 });
  }
  const card = (await frame.locator("[data-place]").innerText()).trim();
  return { held, card, trigger, problem, online: await machineOnline(fleet) };
};

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
  const session = await fleet.spawn("claude", "Place", fleet.repo);

  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };

  const created = await call(CREATE, { kind: "page", name: NAME, html: PAGE });
  const id = created.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the place page is made", false, created.slice(0, 400));
    return;
  }
  const read = async (): Promise<Placed | undefined> =>
    (
      await fleet.api<{ state: Record<string, { value?: Placed }> }>(
        `/api/instances/${session}/artifacts/${id}`
      )
    ).state.place?.value;

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(page, `${base}/session/${session}`, "[data-artifact-trigger]");
  await page
    .frameLocator('iframe[title="Preview"]')
    .locator("[data-pick]")
    .waitFor({ timeout: 60_000 });

  // The name the dashboard shows the machine by.
  const label = machineLabel((await machineRow(fleet))?.hostname ?? "");
  /** The place sent whole: held with its label, named on the card and in the select as the dashboard names it. */
  const whole = (picked: Awaited<ReturnType<typeof pick>>, folder: string) =>
    label.length > 0 &&
    picked.held?.machineId === MACHINE &&
    picked.held.label === label &&
    picked.held.path === folder &&
    picked.card === `${label} — ${folder}` &&
    picked.trigger.startsWith(`${label} · `) &&
    picked.problem === null;

  // A. The machine online, a folder typed, a real click.
  const first = `${fleet.repo}/a`;
  const a = await pick(page, fleet, read, first);
  kit.check(
    `A: with the machine online, a typed folder and a click on Use this place send the place with the machine's label; the card reads "${label} — <path>"`,
    whole(a, first),
    JSON.stringify(a)
  );

  // B. The picker opened while the machine is offline; it comes back before the folder is typed.
  await fleet.stop("agent");
  await until(
    "the hub holding the machine offline",
    () => machineOnline(fleet),
    (online) => !online,
    60_000
  );
  const second = `${fleet.repo}/b`;
  await until(
    "the dashboard holding the machine down",
    () => machinesTone(page),
    (tone) => tone === "fail",
    60_000
  );
  const b = await pick(page, fleet, read, second, async () => {
    fleet.launch("agent");
    await fleet.agentUp();
    await until(
      "the dashboard holding the machine back",
      () => machinesTone(page),
      (tone) => tone !== "fail",
      60_000
    );
  });
  kit.check(
    `B: a picker opened while the machine was offline sends the place once it is back, with the machine's label: a typed folder and a click on Use this place; the card reads "${label} — <path>"`,
    b.online && whole(b, second),
    JSON.stringify(b)
  );
};

const spec: Spec = { name: "place-pick", run };
export default spec;
