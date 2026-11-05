/**
 * A person driving a browser take-over from a phone brings up the keyboard
 * and types into the remote page (Projects spec §5.11, "The view"): letters,
 * an accented letter the keyboard inserts without a key, Backspace, Return
 * and an autocorrected word reach the page's field as typing on a desk does,
 * each once.
 *
 * On a scratch fleet (real hub, agent and sessiond; the mock model) with the
 * built dashboard on WebKit at 390×844 (touch, mobile), the project's browser
 * on the local host (the container runtime hidden by
 * `DOCKER_HOST=unix:///nonexistent`, so it runs in a workspace's boundary):
 *
 * 1. the browser's page is a textarea that counts its Enter key presses;
 *    the person takes it over from the session's panel, which draws its
 *    frames with "You have control";
 * 2. a tap on the textarea in the stream focuses it in the remote page;
 * 3. the band's Show keyboard stands there, and a tap on it focuses the
 *    view's keyboard field (what raises a phone's keyboard), the band then
 *    offering Hide keyboard;
 * 4. typed into that field: "hél" by key, "lo" as the keyboard's inserted
 *    text, a Backspace, a Return, "teh" by key, then the field's "teh"
 *    replaced by "the " as autocorrect replaces a word. The page's textarea
 *    reads `héll\nthe ` and counted one Enter;
 * 5. with a keyboard covering 300px of the well's foot (its
 *    `--keyboard-lift`), the view stands above it and the picture inside it;
 * 6. a second tap in the stream keeps the keyboard field focused;
 * 7. at 1440 (a mouse) the take-over draws with no Show keyboard.
 *
 * The view is read by the rendered checks driving and with the keyboard up
 * at 390, and driving at 1440; its pictures go to
 * `$TMPDIR/outputs/browser-keyboard/`.
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
import type { BrowserKey } from "../../../packages/core/src/browser";
import { browserWords } from "../../../packages/core/src/words/browser";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, kitsOwnMessage, open, type Spec, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";

const MACHINE = "scratch-fleet";
const VIEW = '[data-slot="browser-view"]';
/** Where the view's pictures go for a person to look at. */
const SHOTS = join(
  process.env.TMPDIR ?? tmpdir(),
  "outputs",
  "browser-keyboard"
);

const respond = (_request: Seen): Reply => ({ everyMs: 5, words: ["ok"] });

/** The remote page: one textarea at its top left, its Enter presses counted on the window. */
const FIELD_PAGE = `data:text/html,${encodeURIComponent(
  "<title>field</title><body style=margin:0><textarea id=f style='position:fixed;left:0;top:0;width:1280px;height:400px;font-size:40px'></textarea><script>window.enters=0;f.addEventListener('keydown',e=>{if(e.key==='Enter')window.enters++})</script>"
)}`;
/** Where the textarea is tapped, in the page's own CSS pixels. */
const FIELD_AT = { x: 300, y: 120 };

/** `act` in each page of `key`'s browser, through its own DevTools port: what each answered. */
const eachPage = async <T>(
  key: BrowserKey,
  act: (link: CdpLink, session: string) => Promise<T>
): Promise<T[]> => {
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const takeover =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  const record = await readBrowser(key);
  if (!record) {
    throw new Error(`no record of ${key} on this machine`);
  }
  const link = await takeover.CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const { targetInfos } = await link.call("Target.getTargets");
    const pages = (
      (Array.isArray(targetInfos) ? targetInfos : []) as {
        targetId: string;
        type: string;
      }[]
    ).filter((info) => info.type === "page");
    const answers: T[] = [];
    for (const one of pages) {
      answers.push(await act(link, await link.attach(one.targetId)));
    }
    return answers;
  } finally {
    link.close();
  }
};

/** `expression`'s value in each page of `key`'s browser. */
const inPage = (key: BrowserKey, expression: string) =>
  eachPage(key, async (link, session) => {
    const answer = await link.call(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      session
    );
    return (answer.result as { value?: unknown }).value;
  });

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

/** The remote textarea: its value, whether it has the focus, and the Enter presses it heard. */
const fieldOf = async (key: BrowserKey) => {
  const [value] = await inPage(
    key,
    "JSON.stringify({ value: f.value, focused: document.activeElement === f, enters: window.enters })"
  );
  return JSON.parse(String(value ?? "{}")) as {
    value?: string;
    focused?: boolean;
    enters?: number;
  };
};

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], { DOCKER_HOST: "unix:///nonexistent" });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Keyboard",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const key: BrowserKey = `project:${project.id}`;
  const keyPath = `/api/browsers/${encodeURIComponent(key)}`;
  const session = await fleet.spawn("claude", "Keyboard", fleet.repo, {
    projectId: project.id,
  });
  const started = await fleet
    .api<{ state?: string; host?: string }>(`${keyPath}/start`, {
      machineId: MACHINE,
    })
    .catch((error: unknown) => ({ state: String(error), host: undefined }));
  kit.check(
    `the project's browser is live on the local host (${started.state}, ${started.host})`,
    started.state === "live" && started.host === "local",
    JSON.stringify(started)
  );
  if (started.state !== "live") {
    return;
  }
  await eachPage(key, (link, at) =>
    link.call("Page.navigate", { url: FIELD_PAGE }, at)
  );
  await until(
    "the browser's page is the field page",
    () => inPage(key, "document.title"),
    (titles) => titles.every((title) => title === "field"),
    30_000
  );

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

  // 1. Take over from the session's panel: the panel opens on the browser.
  await fleet.api(`${keyPath}/takeover`, {
    instanceId: session,
    machineId: MACHINE,
  });
  const taken = await until(
    "the take-over draws frames with the person in control",
    () => viewOf(page),
    (now) => now.view && now.frames > 0 && now.width > 0 && now.driving,
    120_000
  ).catch(() => viewOf(page));
  kit.check(
    `the panel draws the take-over's frames (${taken.frames}, ${taken.width}×${taken.height}), the band "${taken.control}"`,
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
    () => fieldOf(key),
    (field) => field.focused === true,
    15_000
  ).catch(() => fieldOf(key));
  kit.check(
    `a tap at (${Math.round(over?.x ?? 0)}, ${Math.round(over?.y ?? 0)}) on the stream focuses the page's textarea`,
    tapped.focused === true,
    JSON.stringify({ over, tapped })
  );

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
    "the band offers Show keyboard while the person drives from a phone",
    shown,
    JSON.stringify(await viewOf(page))
  );
  if (!shown) {
    return;
  }
  const checks = new RenderedChecks(kit, "browser-keyboard", { scope: VIEW });
  await mkdir(SHOTS, { recursive: true });
  await settle(page);
  await checks.at(page, "phone, driving");
  await page.screenshot({ path: join(SHOTS, "phone-driving.png") });
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
    `a tap on Show keyboard focuses the keyboard field (${raised.focused}), the band then offering Hide keyboard (${hide})`,
    raised.focused === "browser-keys" && hide,
    JSON.stringify(raised)
  );

  await settle(page);
  await checks.at(page, "phone, keyboard up");
  await page.screenshot({ path: join(SHOTS, "phone-keyboard-up.png") });

  // 4. Typing: keys, inserted text, Backspace, Return, an autocorrection.
  await page.keyboard.type("hél");
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
  const want = "héll\nthe ";
  const typed = await until(
    "the page's textarea holds what was typed",
    () => fieldOf(key),
    (field) => field.value === want,
    15_000
  ).catch(() => fieldOf(key));
  kit.check(
    `the page's textarea reads ${JSON.stringify(typed.value)} (${JSON.stringify(want)}), with ${typed.enters} Enter press(es) (1)`,
    typed.value === want && typed.enters === 1,
    JSON.stringify(typed)
  );

  // 5. A keyboard over the well's foot: the view and its picture above it.
  const lifted = await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>(
      '[data-slot="browser-view"]'
    );
    const picture = document.querySelector('[data-slot="browser-frames"]');
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

  // 7. On a desk the band has no Show keyboard: a click focuses the view.
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
  await desk.screenshot({ path: join(SHOTS, "desk-driving.png") });
  checks.report();
  await desk.close();

  await fleet.api(`${keyPath}/handback`, { machineId: MACHINE });
  await fleet.api(`${keyPath}/remove`, { machineId: MACHINE });
  await page.close();
};

const spec: Spec = {
  group: "iPhone Safari",
  name: "browser-keyboard",
  run,
};

export default spec;
