/**
 * A person driving a browser take-over from a phone brings up the keyboard
 * and types into the remote page (Projects spec §5.11, "The view"): letters,
 * a capital, an accented letter the keyboard inserts without a key,
 * Backspace, Return, an autocorrected word, letters outside Latin-1 and an
 * emoji reach the page's field as typing on a desk does, each once.
 *
 * On a scratch fleet (real hub, agent and sessiond; the mock model) with the
 * built dashboard on WebKit at 390×844 (touch, mobile), the project's browser
 * on one host ({@link typeIntoTakeover}). This spec takes the local host
 * (the container runtime hidden by `DOCKER_HOST=unix:///nonexistent`, so it
 * runs in a workspace's boundary): the view sends its typing as CDP's
 * `Input.insertText` and key presses. browser-keyboard-container takes the
 * container host, where it goes as neko's X keysyms.
 *
 * 1. the browser stands on one page (any other closed: an extension the
 *    container's policy installs may open its own), a textarea that counts
 *    its Enter key presses;
 *    the person takes it over from the session's panel, which draws its
 *    frames with "You have control";
 * 2. a tap on the textarea in the stream focuses it in the remote page;
 * 3. Show keyboard floats over the stream there, and a tap on it focuses the
 *    view's keyboard field (what raises a phone's keyboard), the key then
 *    offering Hide keyboard;
 * 4. typed into that field: "Hél" by key, "lo" as the keyboard's inserted
 *    text, a Backspace, a Return, "teh" by key, the field's "teh" replaced
 *    by "the " as autocorrect replaces a word, then "ж€" and "🙂" as the
 *    keyboard's inserted text. The page's textarea reads
 *    `Héll\nthe ж€🙂` and counted one Enter; its keydowns hold no U, no
 *    digit and one Space at most, and no Ctrl+Shift+U shortcut fired (on
 *    the container host "é", "ж€" and "🙂" go as GTK's Unicode entry);
 * 5. with a keyboard covering 300px of the well's foot (its
 *    `--keyboard-lift`), the view stands above it and the picture inside it;
 * 6. a second tap in the stream keeps the keyboard field focused;
 * 7. at 1440 (a mouse) the take-over draws with no Show keyboard.
 *
 * The view is read by the rendered checks driving and with the keyboard up
 * at 390, and driving at 1440; its pictures go to
 * `$TMPDIR/outputs/<spec>/`.
 *
 * Where the tap or the typing never reached the page, the run keeps why
 * with the fleet's evidence, in `fleet-on-failure/browser/`: the phone's
 * view, a picture and the state of each of the browser's pages, and on the
 * container host neko's log and what it says of control and its sessions.
 *
 * What only an iPhone shows is not read here: the soft keyboard coming up
 * on the tap, and iOS's own autocorrect replacing a word.
 *
 *   bun scripts/probe-kit/run.ts browser-keyboard
 */
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { CdpLink } from "../../../packages/agent/src/browser/cdp-takeover";
import { readWithin } from "../../../packages/core/src/bounded";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { browserWords } from "../../../packages/core/src/words/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { answerText, hubAt } from "../hub";
import { kitsOwnMessage, open, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";
import type { Kit, Spec } from "../spec";

const MACHINE = "scratch-fleet";
const VIEW = '[data-slot="browser-view"]';
/** How long a browser may take to go live: a container host's first start builds its image. */
const LIVE_WITHIN_MS = 15 * 60_000;

const respond = (_request: Seen): Reply => ({ everyMs: 5, words: ["ok"] });

/**
 * The remote page: one textarea at its top left, its Enter presses counted
 * on the window, every keydown's key kept in order, and a shortcut on
 * Ctrl+Shift+U (by its key or its code) counted.
 */
const FIELD_PAGE = `data:text/html,${encodeURIComponent(
  "<title>field</title><body style=margin:0><textarea id=f style='position:fixed;left:0;top:0;width:1280px;height:400px;font-size:40px'></textarea><script>window.enters=0;window.keys=[];window.shortcuts=0;f.addEventListener('keydown',e=>{keys.push(e.key);if(e.key==='Enter')window.enters++;if(e.ctrlKey&&e.shiftKey&&(e.key==='U'||e.key==='u'||e.code==='KeyU'))window.shortcuts++})</script>"
)}`;
/** A key of GTK's Unicode entry (U, a hex digit) that would have reached the page. */
const ENTRY_KEY = /^[uU0-9]$/u;
/** Where the textarea is tapped, in the page's own CSS pixels. */
const FIELD_AT = { x: 300, y: 120 };

/** The project's browser on the fleet's machine: its key, and the data home its agent keeps its record in. */
interface Remote {
  dataHome: string;
  key: BrowserKey;
}

/**
 * The fleet's record of the browser, read under its agent's data home for
 * the read alone. Set on this process for longer, every browser the kit
 * launched after it carried the fleet's folders in its environment, and the
 * fleet's teardown ended them as its leftovers: the next spec's page found
 * its WebKit closed.
 */
const recordOf = async (remote: Remote) => {
  const { readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const before = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = remote.dataHome;
  try {
    return await readBrowser(remote.key);
  } finally {
    if (before === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = before;
    }
  }
};

/** A target of the browser's, as DevTools lists it. */
interface Target {
  targetId: string;
  type: string;
  url: string;
}

/** Chromium's own UI, listed as pages (`chrome://omnibox-popup.top-chrome/`): no tab a person sees, and none a close removes. */
const CHROMIUM_UI = /^(chrome|chrome-untrusted|devtools):\/\//u;

/** A page a person can see: a tab, not a piece of Chromium's own UI. */
const seenPage = (target: Target): boolean =>
  target.type === "page" && !CHROMIUM_UI.test(target.url);

/** The browser's DevTools, through its own port on this machine, for `act`. */
const withDevtools = async <T>(
  remote: Remote,
  act: (link: CdpLink, targets: Target[]) => Promise<T>
): Promise<T> => {
  const { portsOf } = await import("../../../packages/agent/src/browser/state");
  const takeover =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  const record = await recordOf(remote);
  if (!record) {
    throw new Error(`no record of ${remote.key} on this machine`);
  }
  const link = await takeover.CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const { targetInfos } = await link.call("Target.getTargets");
    return await act(
      link,
      (Array.isArray(targetInfos) ? targetInfos : []) as Target[]
    );
  } finally {
    link.close();
  }
};

/** What each page of the browser says of itself, and of the field when it is the field page. */
const PAGE_SAYS = `JSON.stringify({
  title: document.title,
  visible: document.visibilityState,
  focus: document.hasFocus(),
  field: typeof f === "object" && f instanceof HTMLTextAreaElement
    ? { value: f.value, focused: document.activeElement === f, enters: window.enters, keys: window.keys, shortcuts: window.shortcuts }
    : null,
})`;

interface PageSays {
  field: {
    enters: number;
    focused: boolean;
    keys: string[];
    shortcuts: number;
    value: string;
  } | null;
  focus: boolean;
  title: string;
  url: string;
  visible: string;
}

/** Every page a person can see ({@link seenPage}), each as it says ({@link PAGE_SAYS}); one that does not answer says why in its title. */
const pagesOf = (remote: Remote): Promise<PageSays[]> =>
  withDevtools(remote, async (link, targets) => {
    const said: PageSays[] = [];
    for (const page of targets.filter(seenPage)) {
      const url = page.url.slice(0, 60);
      try {
        const session = await link.attach(page.targetId);
        const answer = await link.call(
          "Runtime.evaluate",
          { expression: PAGE_SAYS, returnByValue: true },
          session
        );
        const { value } = answer.result as { value?: unknown };
        said.push({ ...(JSON.parse(String(value)) as PageSays), url });
      } catch (error) {
        said.push({
          url,
          title: `no answer: ${String(error)}`,
          visible: "unknown",
          focus: false,
          field: null,
        });
      }
    }
    return said;
  });

/**
 * One step toward the browser standing on one page, the field page: a tab
 * opened on it when none is, then every other page a person can see closed
 * (an extension the container's policy installs may open its own as it
 * lands), so the page brought to the front and the one read back are the
 * field page. Chromium's own UI listed as a page is left be: no close
 * removes it (r441 closed `chrome://omnibox-popup.top-chrome/` 320 times).
 * The field
 * page is opened first and never closed: a browser whose last window closes
 * quits, and its DevTools connection with it (r440: neko's Chromium, which
 * its supervisor starts again). Answers how many pages it closed.
 */
const towardFieldPage = (remote: Remote): Promise<number> =>
  withDevtools(remote, async (link, targets) => {
    const pages = targets.filter(seenPage);
    let field = pages.find((one) => one.url === FIELD_PAGE)?.targetId;
    if (!field) {
      const made = await link.call("Target.createTarget", { url: FIELD_PAGE });
      field = String(made.targetId);
    }
    const others = pages.filter((one) => one.targetId !== field);
    for (const other of others) {
      await link.call("Target.closeTarget", { targetId: other.targetId });
    }
    return others.length;
  });

/** What the browser's pages say when even that read fails: the failure, as its one page. */
const unread = (error: unknown): PageSays[] => [
  {
    url: "",
    title: `no answer: ${String(error)}`,
    visible: "unknown",
    focus: false,
    field: null,
  },
];

/** What the browser view says now. */
const viewOf = (page: Page) =>
  page.evaluate(() => {
    const well = document.querySelector<HTMLElement>(
      '[data-slot="browser-well"]'
    );
    const active = document.activeElement as HTMLElement | null;
    return {
      view: !!document.querySelector('[data-slot="browser-view"]'),
      frames: Number(well?.dataset.frames ?? 0),
      width: Number(well?.dataset.width ?? 0),
      height: Number(well?.dataset.height ?? 0),
      driving: !!document.querySelector(
        '[data-slot="browser-input"][data-driving]'
      ),
      control:
        document
          .querySelector('[data-slot="browser-control"]')
          ?.textContent?.trim() ?? null,
      focused: active?.dataset.slot ?? active?.localName ?? null,
    };
  });

/** The client point over the remote page's `at`, the picture letterboxed in the input layer. */
const pointOver = (page: Page, at: { x: number; y: number }) =>
  page.evaluate((remote) => {
    const well = document.querySelector<HTMLElement>(
      '[data-slot="browser-well"]'
    );
    const layer = document.querySelector('[data-slot="browser-input"]');
    const width = Number(well?.dataset.width ?? 0);
    const height = Number(well?.dataset.height ?? 0);
    const box = layer?.getBoundingClientRect();
    if (!(box && width && height)) {
      return null;
    }
    const scale = Math.min(box.width / width, box.height / height);
    return {
      x: box.left + (box.width - width * scale) / 2 + remote.x * scale,
      y: box.top + (box.height - height * scale) / 2 + remote.y * scale,
    };
  }, at);

/** The field page's textarea (its value, whether it has the focus, the Enter presses it heard), and every page as it says. */
/** Every page as it says, or the read's failure as its one page, so a check's detail names it. */
const pagesNow = (remote: Remote): Promise<PageSays[]> =>
  pagesOf(remote).catch(unread);

const fieldOf = async (remote: Remote) => {
  const pages = await pagesNow(remote);
  return { ...(pages.find((one) => one.field)?.field ?? {}), pages };
};

/** An Engine API stream's frames (8-byte headers, a TTY-less container's logs) as their text. */
const engineText = (bytes: Uint8Array): string => {
  const parts: Uint8Array[] = [];
  let at = 0;
  while (at + 8 <= bytes.length) {
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset + at + 4,
      4
    ).getUint32(0);
    parts.push(bytes.subarray(at + 8, at + 8 + size));
    at += 8 + size;
  }
  return parts.map((part) => new TextDecoder().decode(part)).join("");
};

/** What neko says of control and its sessions, read as the daemon's admin (the record's password). */
const nekoSays = async (record: {
  container?: { adminPassword: string };
  slot?: number;
  host?: string;
  key: BrowserKey;
}) => {
  const { portsOf } = await import("../../../packages/agent/src/browser/state");
  if (!record.container) {
    return null;
  }
  const base = `http://127.0.0.1:${portsOf(record as never).http}/api`;
  const login = (await (
    await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "cawco",
        password: record.container.adminPassword,
      }),
    })
  ).json()) as { token: string };
  const read = async (path: string) =>
    (await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${login.token}` },
    }).then((response) => response.json())) as unknown;
  return {
    control: await read("/room/control"),
    sessions: await read("/sessions"),
  };
};

/**
 * What says why the page heard nothing, kept with the fleet's evidence
 * (`fleet-on-failure/browser/`): the phone's view, a picture of each of the
 * browser's pages, each page as it says, and on the container host neko's
 * own log and what it says of control and its sessions.
 */
const keepEvidence = async (
  kit: Kit,
  remote: Remote,
  page: Page,
  when: string
): Promise<void> => {
  const dir = join(kit.out, "fleet-on-failure", "browser");
  await mkdir(dir, { recursive: true });
  const kept: string[] = [];
  const keep = async (name: string, write: () => Promise<unknown>) => {
    try {
      await write();
      kept.push(name);
    } catch (error) {
      kept.push(`${name} (not kept: ${String(error).slice(0, 200)})`);
    }
  };
  await keep(`${when}-phone.png`, () =>
    page.screenshot({ path: join(dir, `${when}-phone.png`) })
  );
  await keep(`${when}-pages.png`, () =>
    withDevtools(remote, async (link, targets) => {
      let n = 0;
      for (const one of targets.filter(seenPage)) {
        const shot = await link.call(
          "Page.captureScreenshot",
          { format: "png" },
          await link.attach(one.targetId)
        );
        n += 1;
        await Bun.write(
          join(dir, `${when}-page-${n}.png`),
          Buffer.from(String(shot.data), "base64")
        );
      }
    })
  );
  const record = await recordOf(remote);
  await keep(`${when}-pages.json`, async () =>
    Bun.write(
      join(dir, `${when}-pages.json`),
      JSON.stringify(
        {
          pages: await pagesOf(remote),
          neko: record ? await nekoSays(record).catch(String) : null,
          record: {
            state: record?.state,
            host: record?.host,
            takeover: record?.takeover,
          },
        },
        null,
        2
      )
    )
  );
  const container = record?.container;
  if (container?.runtime) {
    const socket = container.runtime.endpoint;
    await keep(`${when}-neko.log`, async () => {
      const response = await fetch(
        `http://engine/containers/${container.id}/logs?stdout=1&stderr=1&tail=400&timestamps=1`,
        { unix: socket } as RequestInit
      );
      await Bun.write(
        join(dir, `${when}-neko.log`),
        engineText(new Uint8Array(await response.arrayBuffer()))
      );
    });
  }
  kit.note(
    `${kit.spec}: kept for the ${when} check, in ${dir}: ${kept.join(", ")}`
  );
};

/**
 * The whole leg on `host`: the browser started there, taken over from a
 * phone, typed into, read back from its page. `name` is the spec's, for its
 * checks and its pictures.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one leg in the order a person takes it, a check at each step
export async function typeIntoTakeover(
  kit: Kit,
  host: "local" | "container",
  name: string
): Promise<void> {
  const shots = join(process.env.TMPDIR ?? tmpdir(), "outputs", name);
  let dockerHost = "unix:///nonexistent";
  if (host === "container") {
    const { findRuntime } =
      await import("../../../packages/agent/src/browser/runtime");
    const runtime = await findRuntime();
    if ("missing" in runtime) {
      kit.check(
        "a container runtime answers on this host",
        false,
        runtime.missing
      );
      return;
    }
    dockerHost = `unix://${runtime.endpoint}`;
  }
  const fleet = await kit.fleet(respond);
  await fleet.up({ agent: { DOCKER_HOST: dockerHost } });

  const project = await fleet.api((hub) =>
    hub.api.projects.post({
      name: "Keyboard",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    })
  );
  const key: BrowserKey = `project:${project.id}`;
  const remote: Remote = {
    key,
    dataHome: fleet.env.XDG_DATA_HOME as string,
  };
  const session = await fleet.spawn("claude", "Keyboard", fleet.repo, {
    projectId: project.id,
  });
  // Started as the panel starts it; answered once it is live, which on a
  // container host's first start waits on its image's build.
  const start = await readWithin(LIVE_WITHIN_MS, async (signal) => {
    const response = await hubAt(fleet.base, { signal })
      .api.browsers({ key })
      .start.post({ machineId: MACHINE });
    return `${response.status} ${answerText(response)}`;
  });
  const answered =
    start.kind === "answered" ? start.value : `no answer (${start.reason})`;
  const record = await until(
    `the project's browser is live on the ${host} host`,
    () => recordOf(remote),
    (now) => now?.state === "live" || now?.state === "failed",
    LIVE_WITHIN_MS
  ).catch(() => recordOf(remote));
  kit.check(
    `the project's browser is live on the ${host} host (${record?.state}, ${record?.host})`,
    record?.state === "live" && record.host === host,
    `start answered ${answered}; record ${JSON.stringify({ state: record?.state, host: record?.host, why: record?.why })}`
  );
  if (record?.state !== "live") {
    return;
  }
  // Stepped until it stands, each step on a DevTools connection of its own:
  // one the browser closes (it quit, and its supervisor starts it again) is
  // opened again by the next step.
  const fieldAlone = async () => {
    let closed = 0;
    const dropped: string[] = [];
    const pages = await until(
      "the browser's one page is the field page",
      async () => {
        try {
          closed += await towardFieldPage(remote);
          return await pagesOf(remote);
        } catch (error) {
          dropped.push(String(error));
          throw error;
        }
      },
      (now) => now.length === 1 && now[0]?.title === "field",
      90_000
    ).catch(() => pagesNow(remote));
    return { closed, dropped, pages };
  };
  const firstAlone = await fieldAlone();

  const base = await fleet.dashboard();
  const page = await kit.page("phone", { engine: "webkit" });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await open(page, `${base}/session/${session}`, '[data-slot="pane"]');
  // Again just before the take-over: a page an extension opened as it
  // landed, since the first, is closed too.
  const alone = await fieldAlone();
  kit.check(
    `the browser stands on one page, the field page (closed ${firstAlone.closed}, then ${alone.closed} other page(s); its DevTools connection lost ${firstAlone.dropped.length + alone.dropped.length} time(s))`,
    alone.pages.length === 1 && alone.pages[0]?.title === "field",
    JSON.stringify({
      pages: alone.pages,
      dropped: [...firstAlone.dropped, ...alone.dropped],
    })
  );

  // 1. Take over from the session's panel: the panel opens on the browser.
  await fleet.api((hub) =>
    hub.api.browsers({ key }).takeover.post({
      instanceId: session,
      machineId: MACHINE,
    })
  );
  const taken = await until(
    "the take-over draws frames with the person in control",
    () => viewOf(page),
    (now) => now.view && now.frames > 0 && now.width > 0 && now.driving,
    120_000
  ).catch(() => viewOf(page));
  kit.check(
    `the panel draws the take-over's frames (${taken.frames}, ${taken.width}×${taken.height}), the head's address "${taken.control}"`,
    taken.driving &&
      taken.frames > 0 &&
      taken.control?.startsWith(browserWords.youHaveControl) === true,
    JSON.stringify(taken)
  );
  if (!taken.driving) {
    return;
  }

  // 2. A tap on the textarea in the stream focuses it in the page.
  const over = await pointOver(page, FIELD_AT);
  if (over) {
    await page.touchscreen.tap(over.x, over.y);
  }
  const tapped = await until(
    "the tap focused the page's textarea",
    () => fieldOf(remote),
    (field) => field.focused === true,
    15_000
  ).catch(() => fieldOf(remote));
  kit.check(
    `a tap at (${Math.round(over?.x ?? 0)}, ${Math.round(over?.y ?? 0)}) on the stream focuses the page's textarea`,
    tapped.focused === true,
    JSON.stringify({ over, tapped })
  );
  if (tapped.focused !== true) {
    await keepEvidence(kit, remote, page, "tap");
  }

  // 3. Show keyboard focuses the view's keyboard field.
  const show = page.getByRole("button", {
    name: browserWords.showKeyboard,
    exact: true,
  });
  const shown = await show.waitFor({ state: "visible", timeout: 15_000 }).then(
    () => true,
    () => false
  );
  kit.check(
    "the stream offers Show keyboard while the person drives from a phone",
    shown,
    JSON.stringify(await viewOf(page))
  );
  if (!shown) {
    return;
  }
  const checks = new RenderedChecks(kit, name, { scope: VIEW });
  await mkdir(shots, { recursive: true });
  await settle(page);
  await checks.at(page, "phone, driving");
  await page.screenshot({ path: join(shots, "phone-driving.png") });
  await show.tap();
  const raised = await viewOf(page);
  const hide = await page
    .getByRole("button", { name: browserWords.hideKeyboard, exact: true })
    .waitFor({ state: "visible", timeout: 5000 })
    .then(
      () => true,
      () => false
    );
  kit.check(
    `a tap on Show keyboard focuses the keyboard field (${raised.focused}), the key then offering Hide keyboard (${hide})`,
    raised.focused === "browser-keys" && hide,
    JSON.stringify(raised)
  );

  await settle(page);
  await checks.at(page, "phone, keyboard up");
  await page.screenshot({ path: join(shots, "phone-keyboard-up.png") });

  // 4. Typing: keys, inserted text, Backspace, Return, an autocorrection.
  await page.keyboard.type("Hél");
  await page.keyboard.insertText("lo");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.keyboard.type("teh");
  await page.evaluate(() => {
    const field = document.querySelector<HTMLTextAreaElement>(
      '[data-slot="browser-keys"]'
    );
    if (!field) {
      return;
    }
    field.value = `${field.value.slice(0, -3)}the `;
    field.setSelectionRange(field.value.length, field.value.length);
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: "the ",
      })
    );
  });
  await page.keyboard.insertText("ж€");
  await page.keyboard.insertText("🙂");
  const want = "Héll\nthe ж€🙂";
  const typed = await until(
    "the page's textarea holds what was typed",
    () => fieldOf(remote),
    (field) => field.value === want,
    15_000
  ).catch(() => fieldOf(remote));
  kit.check(
    `the page's textarea reads ${JSON.stringify(typed.value)} (${JSON.stringify(want)}), with ${typed.enters} Enter press(es) (1)`,
    typed.value === want && typed.enters === 1,
    JSON.stringify(typed)
  );
  // A character off neko's layout goes as GTK's Unicode entry on the
  // container host (browser-stream.ts `unicodeEntry`): the page gets the
  // character and never the entry's keys. The typing presses no U, no digit
  // and one Space ("the "), on either host.
  const leaked = (typed.keys ?? []).filter((pressed) =>
    ENTRY_KEY.test(pressed)
  );
  const spaces = (typed.keys ?? []).filter((pressed) => pressed === " ").length;
  kit.check(
    `the page's keydowns hold no U or digit (${JSON.stringify(leaked)}), at most one Space (${spaces}), and no Ctrl+Shift+U shortcut fired (${typed.shortcuts})`,
    leaked.length === 0 && spaces <= 1 && typed.shortcuts === 0,
    JSON.stringify(typed.keys)
  );
  if (!(typed.value === want && typed.enters === 1)) {
    await keepEvidence(kit, remote, page, "typed");
  }

  // 5. A keyboard over the well's foot: the view and its picture above it.
  const lifted = await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>(
      '[data-slot="browser-view"]'
    );
    const picture = document.querySelector(
      '[data-slot="browser-frames"], [data-slot="browser-video"]'
    );
    const well = document.querySelector<HTMLElement>(
      '[data-slot="browser-well"]'
    );
    if (!(view && picture && well)) {
      return null;
    }
    const foot = view.getBoundingClientRect().bottom;
    view.style.setProperty("--keyboard-lift", "300px");
    const box = view.getBoundingClientRect();
    const drawn = well.getBoundingClientRect();
    const width = Number(well.dataset.width);
    const height = Number(well.dataset.height);
    const scale = Math.min(drawn.width / width, drawn.height / height);
    const pictureFoot =
      drawn.top + (drawn.height - height * scale) / 2 + height * scale;
    view.style.removeProperty("--keyboard-lift");
    return {
      lift: Math.round(foot - box.bottom),
      pictureFoot: Math.round(pictureFoot),
      keyboardTop: Math.round(foot - 300),
    };
  });
  kit.check(
    `with a keyboard over 300px of the well's foot the view stands ${lifted?.lift}px up, the picture's foot at ${lifted?.pictureFoot} over the keyboard's top at ${lifted?.keyboardTop}`,
    !!lifted && lifted.lift === 300 && lifted.pictureFoot <= lifted.keyboardTop,
    JSON.stringify(lifted)
  );

  // 6. Another tap in the stream keeps the keyboard field focused.
  const again = await pointOver(page, { x: 600, y: 200 });
  if (again) {
    await page.touchscreen.tap(again.x, again.y);
  }
  const kept = await viewOf(page);
  kit.check(
    `a tap in the stream with the keyboard up keeps the keyboard field focused (${kept.focused})`,
    kept.focused === "browser-keys",
    JSON.stringify(kept)
  );
  kit.check(
    "the page logged no console error",
    errors.length === 0,
    errors.join("\n")
  );

  // 7. On a desk the stream has no Show keyboard: a click focuses the view.
  const desk = await kit.page("desk");
  await open(desk, `${base}/session/${session}`, VIEW);
  const deskView = await until(
    "the desk's view draws the take-over",
    () => viewOf(desk),
    (now) => now.frames > 0 && now.driving,
    60_000
  ).catch(() => viewOf(desk));
  const deskShow = await desk
    .getByRole("button", { name: browserWords.showKeyboard, exact: true })
    .count();
  kit.check(
    `on a desk the take-over draws (${deskView.frames} frames) with no Show keyboard (${deskShow})`,
    deskView.driving && deskShow === 0,
    JSON.stringify(deskView)
  );
  await settle(desk);
  await checks.at(desk, "desk, driving");
  await desk.screenshot({ path: join(shots, "desk-driving.png") });
  checks.report();
  await desk.close();

  await fleet.api((hub) =>
    hub.api.browsers({ key }).handback.post({ machineId: MACHINE })
  );
  await fleet.api((hub) =>
    hub.api.browsers({ key }).remove.post({ machineId: MACHINE })
  );
  await page.close();
}

const spec: Spec = {
  group: "iPhone Safari",
  name: "browser-keyboard",
  run: (kit) => typeIntoTakeover(kit, "local", "browser-keyboard"),
};

export default spec;
