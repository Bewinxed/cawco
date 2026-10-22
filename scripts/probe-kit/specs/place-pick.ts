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
 * A. The machine online: the picker opens on no machine ("Choose a machine":
 *    nothing goes back to the page that nobody chose), the machine chosen
 *    from its select, a folder typed, a click on Use this place: the hub
 *    holds the place (the machine, its label and the folder), and the card
 *    reads "<label> — <path>" from what pickPlace answered, the label the
 *    dashboard names the machine by (core `machineLabel`, the picker's select
 *    included).
 * B. The picker opened while the only machine is offline ("No machines
 *    online"), which then comes back: the select lists it as soon as it is
 *    online, and the same choice, typed folder and click send the place.
 *    (Main once seeded the machine as the picker mounted: a machine heard
 *    after that could never be the pick, and every click stopped at "Choose
 *    a machine that is online.")
 * C. The host in the page's own window (the app's host script stands on the
 *    page's origin; a page in a tab of its own is its own parent): one
 *    `cawco:capture` ask is answered once, as `cawco:captured`, and never
 *    echoed; `pickPlace()` waits for the host's JSON-RPC answer, and the
 *    place it answers is on the hub. (Main took its own messages for the
 *    host's: the capture answered itself on and on, and pickPlace resolved
 *    null at once.)
 *
 *   bun scripts/probe-kit/run.ts place-pick
 */
import type { Page } from "playwright-core";
import {
  machineLabel,
  placePickWords as pickWords,
} from "../../../packages/core/src/index";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  pressIn,
  type Spec,
  settle,
} from "../kit";

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
 * Opens the picker from the page's card, chooses the machine named `label`
 * from its select, types `folder` and clicks Use this place; `between` runs
 * once the picker is open, before the choice. Answers what the hub then holds
 * under `place`, the card's words, and the select's words as it opened
 * (`opened`) and once chosen (`trigger`).
 */
const pick = async (
  page: Page,
  fleet: KitFleet,
  read: () => Promise<Placed | undefined>,
  label: string,
  folder: string,
  between: () => Promise<void> = async () => undefined
) => {
  const frame = page.frameLocator('iframe[title="Preview"]');
  await pressIn(frame, "[data-pick]");
  const form = page.getByRole("form", { name: "Pick a machine and folder" });
  await form.waitFor({ timeout: 15_000 });
  const select = form.locator('[data-slot="select-trigger"]');
  const opened = (await select.innerText()).trim();
  await between();
  await select.click();
  await page
    .getByRole("option")
    .filter({ hasText: `${label} · ` })
    .first()
    .click();
  await settle(page);
  const field = form.getByLabel("Folder");
  await field.click();
  await field.pressSequentially(folder, { delay: 5 });
  await settle(page);
  const trigger = (await select.innerText()).trim();
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
  return {
    held,
    card,
    opened,
    trigger,
    problem,
    online: await machineOnline(fleet),
  };
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
    asks.set(marker, {
      name: tool,
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      input: { response_format: "detailed", ...input },
    });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };

  const created = await call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: NAME,
    html: PAGE,
  });
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

  // A. The machine online: no machine until it is chosen, then a folder typed, a real click.
  const first = `${fleet.repo}/a`;
  const a = await pick(page, fleet, read, label, first);
  kit.check(
    `A: with the machine online, the picker opens on no machine ("${pickWords.chooseMachine}"); once it is chosen, a typed folder and a click on Use this place send the place with the machine's label; the card reads "${label} — <path>"`,
    a.opened === pickWords.chooseMachine && whole(a, first),
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
  const b = await pick(page, fleet, read, label, second, async () => {
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
    `B: a picker opened while the machine was offline ("${pickWords.noMachines}") lists it once it is back, and choosing it, a typed folder and a click on Use this place send the place with the machine's label; the card reads "${label} — <path>"`,
    b.online && b.opened === pickWords.noMachines && whole(b, second),
    JSON.stringify(b)
  );

  await oneWindow(kit, page, id, read, {
    machineId: MACHINE,
    label,
    path: `${fleet.repo}/c`,
  });
};

/** How long C listens to the window after one capture ask: the answer, and any echo of it. Our call. */
const ECHO_MS = 3000;
/** How long C's pickPlace must stay unanswered while its host says nothing. Our call. */
const UNANSWERED_MS = 1000;

/**
 * C. The host in the page's own window, as the app's host script stands
 * (its origin is the page's) and as the page in a tab of its own is: the
 * served page opened alone, the probe its host in that window, every
 * message on it heard. One `cawco:capture` ask is answered once, as
 * `cawco:captured`, and the ask is never taken up again; `pickPlace()`
 * waits for the host's JSON-RPC answer, and the place it answers is kept.
 */
const oneWindow = async (
  kit: Kit,
  page: Page,
  id: string,
  read: () => Promise<Placed | undefined>,
  place: Required<Placed>
) => {
  const src = await page
    .locator('iframe[title="Preview"]')
    .first()
    .getAttribute("src");
  if (!src) {
    kit.check("C: the page's address in the panel", false, "no src");
    return;
  }
  const alone = await kit.page("desk");
  await alone.goto(src);
  await alone.locator("[data-pick]").waitFor({ timeout: 30_000 });
  const said = await alone.evaluate(
    async ({ artifactId, name, place: picked, echoMs, unansweredMs }) => {
      const heard: Record<string, unknown>[] = [];
      addEventListener("message", (event) => heard.push(event.data));
      /** Whether `done` holds within `ms`, looked at every 50 ms. */
      const holds = (done: () => boolean, ms: number) =>
        new Promise<boolean>((resolve) => {
          const end = performance.now() + ms;
          const look = () => {
            if (done() || performance.now() >= end) {
              resolve(done());
              return;
            }
            setTimeout(look, 50);
          };
          look();
        });
      postMessage(
        {
          type: "cawco:hello",
          artifact: { id: artifactId, kind: "page", name },
          sync: `/__cawco/artifact/${artifactId}`,
        },
        location.origin
      );
      const synced = await holds(
        () =>
          heard.some(
            (one) => one?.type === "cawco:sync" && one.state === "synced"
          ),
        10_000
      );
      // One capture ask, then the window heard for its answer and any echo.
      heard.length = 0;
      postMessage({ type: "cawco:capture" }, location.origin);
      await new Promise((resolve) => setTimeout(resolve, echoMs));
      const captureAsks = heard.filter(
        (one) => one?.type === "cawco:capture"
      ).length;
      const answers = heard.filter(
        (one) => one?.type === "cawco:captured"
      ).length;
      const png =
        typeof heard.find((one) => one?.type === "cawco:captured")?.png ===
        "string";
      // pickPlace: unanswered while the host says nothing, then the host's answer.
      heard.length = 0;
      const out: { settled: { place: unknown } | { error: string } | null } = {
        settled: null,
      };
      (
        window as unknown as { cawco: { pickPlace: () => Promise<unknown> } }
      ).cawco
        .pickPlace()
        .then(
          (one) => {
            out.settled = { place: one };
          },
          (error: unknown) => {
            out.settled = { error: String(error) };
          }
        );
      await new Promise((resolve) => setTimeout(resolve, unansweredMs));
      const waited = out.settled === null;
      const ask = heard.find(
        (one) => one?.jsonrpc === "2.0" && one.method === "cawco/pick-place"
      );
      if (ask) {
        postMessage(
          { jsonrpc: "2.0", id: ask.id, result: picked },
          location.origin
        );
      }
      await holds(() => out.settled !== null, 5000);
      return {
        synced,
        asks: captureAsks,
        answers,
        png,
        waited,
        asked: !!ask,
        settled: out.settled,
      };
    },
    {
      artifactId: id,
      name: NAME,
      place,
      echoMs: ECHO_MS,
      unansweredMs: UNANSWERED_MS,
    }
  );
  kit.check(
    "C: host and overlay in one window, one capture ask: one answer (`cawco:captured`, a picture), the ask heard once and never taken up again",
    said.synced && said.asks === 1 && said.answers === 1 && said.png,
    JSON.stringify({
      synced: said.synced,
      asks: said.asks,
      answers: said.answers,
      png: said.png,
    })
  );
  const held = await until(
    "C's place on the hub",
    read,
    (one) => one?.path === place.path,
    10_000
  ).catch(read);
  const resolved = said.settled as { place?: Placed } | null;
  kit.check(
    "C: host and overlay in one window, pickPlace() waits for the host's answer, answers its place, and the hub keeps it",
    said.waited &&
      said.asked &&
      resolved?.place?.path === place.path &&
      held?.path === place.path &&
      held.machineId === place.machineId,
    JSON.stringify({
      waited: said.waited,
      asked: said.asked,
      settled: said.settled,
      held,
    })
  );
  await alone.close();
};

const spec: Spec = { name: "place-pick", run };
export default spec;
