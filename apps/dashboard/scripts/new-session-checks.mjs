// biome-ignore-all lint/performance/noAwaitInLoops: Browser interactions and measurements are sequential.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_BIN ||
    `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(7000);
const base = process.argv[2] || "http://localhost:5173";
const errors = [];
const frames = [];
let failures = 0;
let fsDelay = 0;
const levels = ["low", "medium", "high", "xhigh", "max"];
/** What each harness reports (packages/agent): pi has no modes; Full Send rides on bypass. */
const permissionModes = {
  claude: ["default", "acceptEdits", "plan", "bypassPermissions", "fullSend"],
  opencode: ["default", "acceptEdits", "plan", "bypassPermissions", "fullSend"],
  pi: [],
};
const machines = ["check-online", "check-pi"].map((machineId) => ({
  machineId,
  hostname: machineId === "check-online" ? "check-host" : "pi-host",
  status: "online",
  os: "linux",
  auth: "authenticated",
  lastSeenAt: null,
  harnesses: ["claude", "opencode", "pi"].map((harness) => ({
    harness,
    installed: machineId !== "check-pi" || harness === "pi",
    capabilities: {
      permissionModes: permissionModes[harness],
      effort: true,
    },
  })),
}));
const projects = machines.map(({ machineId, hostname }) => ({
  id: `project-${machineId}`,
  machineId,
  cwd: "/home/check/project",
  name: `${hostname} project`,
}));
page.on("pageerror", (error) => errors.push(error.message));
await page.routeWebSocket(
  (url) => url.pathname !== "/ws/dashboard",
  () => {
    /* Keep Vite HMR isolated during each browser check. */
  }
);
// No dashboard socket reaches the hub. Spawn frames are captured locally.
// Matched by path: the socket's URL also names the page's wire protocol.
await page.routeWebSocket(
  (url) => url.pathname === "/ws/dashboard",
  (socket) => {
    socket.onMessage(async (message) => {
      const frame = JSON.parse(String(message));
      frames.push(frame);
      if (!["fs", "control"].includes(frame.verb)) {
        return;
      }
      const { payload } = frame;
      if (fsDelay) {
        await new Promise((resolve) => setTimeout(resolve, fsDelay));
      }
      const ok = !payload.path?.startsWith("/definitely");
      const result =
        payload.method === "listRepos"
          ? [{ nameWithOwner: "checks/repo", visibility: "PUBLIC" }]
          : [
              { name: "project", kind: "dir" },
              { name: "work", kind: "dir" },
            ];
      socket.send(
        JSON.stringify({
          verb: "frames",
          payload: {
            kind: "control_result",
            requestId: payload.requestId,
            ok,
            result,
            error: ok ? undefined : "ENOENT: directory does not exist",
          },
        })
      );
    });
  }
);
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  let json = {};
  if (path === "/api/agents") {
    json = machines;
  } else if (path === "/api/projects") {
    json =
      request.method() === "GET"
        ? projects
        : { id: "created-project", ...request.postDataJSON() };
  } else if (path.endsWith("/inspect")) {
    json = { mcp: [], skills: [], plugins: [], memory: null };
  } else if (path === "/api/usage/limits") {
    json = { machines: [] };
  } else if (["/api/instances", "/api/pending"].includes(path)) {
    json = [];
  } else if (request.method() !== "GET") {
    return route.fulfill({
      status: 403,
      json: { error: "Acceptance script blocks writes" },
    });
  }
  await route.fulfill({ json });
});
await page.addInitScript(
  ({ levels: effortLevels }) => {
    const swap = new URL(location.href).searchParams.has("swap");
    const rows = swap
      ? Array.from({ length: 9 }, (_, index) => ({
          value: `claude-opus-5-${index}`,
        }))
      : [
          {
            value: "default",
            resolvedModel: "claude-opus-5[1m]",
            displayName: "Default (recommended)",
          },
          { value: "opus", resolvedModel: "claude-opus-5[1m]" },
          {
            value: "claude-opus-5[1m]",
            supportedEffortLevels: effortLevels,
            supportsEffort: true,
          },
          { value: "sonnet", resolvedModel: "claude-sonnet-5" },
          { value: "claude-fable-5-1" },
        ];
    localStorage.setItem(
      "cawco-models:by-harness",
      JSON.stringify(
        ["claude", "opencode", "pi"].flatMap((harness) =>
          rows.map((row) => ({
            ...row,
            harness,
            supportedEffortLevels:
              harness === "pi" ? [] : row.supportedEffortLevels,
            supportsEffort: harness !== "pi" && row.supportsEffort,
          }))
        )
      )
    );
    localStorage.setItem("cawco-models:recent", "[]");
    localStorage.removeItem("cawco-models:use");
    if (new URL(location.href).searchParams.has("dates")) {
      const dated = JSON.parse(localStorage.getItem("cawco-models:by-harness"));
      for (const row of dated) {
        if (row.value === "claude-opus-5[1m]") {
          row.released = "2026-09-05T12:00:00Z";
        }
      }
      localStorage.setItem("cawco-models:by-harness", JSON.stringify(dated));
      localStorage.setItem(
        "cawco-models:use",
        JSON.stringify({
          claude: {
            lastSpawnAt: "2026-09-07T12:00:00Z",
            lastUsedAt: { "claude-opus-5[1m]": "2026-09-07T12:00:00Z" },
          },
        })
      );
    }
    localStorage.setItem(
      "cawco-spawn-prefs",
      JSON.stringify({
        harness: "claude",
        permissionMode: "default",
        model: "",
        effort: null,
        machineId: "check-online",
        cwd: "/home/check/project",
      })
    );
  },
  { levels }
);

const dialog = page.locator(".session-card");
const start = page.locator("#session-start");
const pop = (name) => page.locator(`#session-${name}-popover`);
const BYPASS = /^Bypass/;
/** A location the form verifies at once, so Start is live. */
const CHECK_PROJECT = { machineId: "check-online", cwd: "/home/check/project" };
const FULL_SEND = /^Full Send/;
const FULL_SEND_ON = /^Full Send is on/;
const trigger = (name) => page.locator(`#session-${name}`);
async function open(query = "", { prefill } = {}) {
  await page.goto(`${base}/motion/new-session${query}`);
  // The bench asks for the dialog as it mounts, and that first ask is not
  // drawn; once it has been made, asked again through the dialog's own
  // store, it opens.
  await page.locator("main button", { hasText: "New session" }).waitFor();
  await page.waitForTimeout(2500);
  await page.evaluate(async (at) => {
    const store = await import("/src/lib/cawco/spawn/new-session.svelte.ts");
    store.spawning.open = false;
    await new Promise((resolve) => setTimeout(resolve, 100));
    store.newSession(at);
  }, prefill);
  await dialog.waitFor();
  await page.waitForTimeout(1000);
}
async function show(name) {
  await trigger(name).click();
  await pop(name).waitFor();
  await page.waitForTimeout(500);
}
async function dismiss(name) {
  await page.keyboard.press("Escape");
  await pop(name).waitFor({ state: "hidden" });
  assert.equal(await dialog.isVisible(), true);
  assert.equal(
    await trigger(name).evaluate((node) => node === document.activeElement),
    true
  );
}
async function check(label, run) {
  if (process.env.NS_CHECK && !label.includes(process.env.NS_CHECK)) {
    return;
  }
  try {
    await run();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}
const spawns = () => frames.filter((frame) => frame.verb === "spawn");
const rect = () => dialog.boundingBox();

async function mobileGates() {
  const facts = await page.evaluate(() => {
    const sheet = document.querySelector(".session-card");
    const rows = [
      ...document.querySelectorAll(".settings-row, .actions-row"),
    ].map((node) => node.getBoundingClientRect());
    const context = document.createElement("canvas").getContext("2d");
    const labels = [
      ...document.querySelectorAll(
        ".settings-row .composer-pill > span:not(.harness-logo):not(.machine-dot)"
      ),
    ]
      .filter((node) => node.getClientRects().length)
      .map((node) => {
        const css = getComputedStyle(node);
        context.font = `${css.fontSize} ${css.fontFamily}`;
        return {
          text: node.textContent.trim(),
          full: node.scrollWidth <= node.clientWidth + 1,
          ellipsis: css.textOverflow === "ellipsis",
          width: node.clientWidth,
          eightCharacters: context.measureText(
            `${node.textContent.trim().slice(0, 8)}…`
          ).width,
        };
      });
    return {
      sheet: sheet.getBoundingClientRect().toJSON(),
      overflow: sheet.scrollWidth - sheet.clientWidth,
      rowHeights: rows.map((row) => row.height),
      gap: rows[1].top - rows[0].bottom,
      startWidth: document
        .querySelector("#session-start")
        .getBoundingClientRect().width,
      effortWidth: document
        .querySelector(".effort-slot")
        .getBoundingClientRect().width,
      labels,
      targets: [
        ...document.querySelectorAll(
          ".composer-pill, #session-start, .effort-slider"
        ),
      ]
        .filter((node) => !node.closest("[inert]"))
        .map((node) => ({
          name: node.id || node.className,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
    };
  });
  const viewport = page.viewportSize();
  assert.ok(Math.abs(facts.sheet.y + facts.sheet.height - viewport.height) < 1);
  assert.equal(facts.sheet.width, viewport.width);
  assert.ok(facts.sheet.y >= 0);
  assert.ok(facts.overflow <= 1);
  assert.deepEqual(facts.rowHeights, [44, 44]);
  assert.equal(facts.gap, 8);
  assert.ok(facts.startWidth >= 96);
  assert.ok(facts.effortWidth >= 160);
  assert.ok(
    facts.labels.every(
      (label) =>
        label.full || (label.ellipsis && label.width >= label.eightCharacters)
    ),
    JSON.stringify(facts.labels)
  );
  assert.ok(
    facts.targets.every((target) => target.width >= 44 && target.height >= 44),
    JSON.stringify(facts.targets)
  );
  console.log(
    `MOBILE ${viewport.width}x${viewport.height}: ${JSON.stringify(facts)}`
  );
}

await check("centered composer, prompt focus, fixed 40px bar", async () => {
  await open();
  const box = await rect();
  assert.ok(Math.abs(box.x + box.width / 2 - 720) < 1);
  assert.ok(Math.abs(box.y + box.height / 2 - 450) < 1);
  assert.equal(box.width, 640);
  assert.equal(
    await page
      .locator(".composer-bar")
      .evaluate((el) => el.getBoundingClientRect().height),
    40
  );
  assert.equal(
    await page
      .locator("textarea")
      .evaluate((el) => el === document.activeElement),
    true
  );
  assert.equal(await page.locator("textarea").getAttribute("rows"), "8");
  await page.addScriptTag({
    path: `${homedir()}/.claude/skills/ui-observer/observer.browser.js`,
  });
  const observations = await page.evaluate(
    () =>
      globalThis.__uiObserver({ scopeSel: ".composer-bar", maxDepth: 2 })
        .observations
  );
  console.log("OBSERVER desktop", JSON.stringify(observations));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/ns-rest.png", caret: "hide" });
  if (process.env.NS_DESKTOP_BASELINE) {
    await page.screenshot({
      path: "/tmp/ns-desktop-before.png",
      caret: "hide",
    });
  }
  if (process.env.NS_DESKTOP_COMPARE) {
    const before = await readFile("/tmp/ns-desktop-before.png");
    const after = await readFile("/tmp/ns-rest.png");
    assert.ok(
      before.equals(after),
      "Desktop screenshot differs from /tmp/ns-desktop-before.png"
    );
    console.log("DESKTOP DIFF: pixel-identical PNG buffers at 1440x900");
  }
});
await check(
  "model naming, dedupe, all harness logos, no layout shift",
  async () => {
    await open();
    const before = await rect();
    const action = await start.boundingBox();
    await show("model");
    for (const harness of ["claude", "opencode", "pi"]) {
      assert.equal(
        await pop("model")
          .locator(`.agent-tile [data-harness-logo="${harness}"] svg`)
          .count(),
        1
      );
    }
    assert.equal(await pop("model").getByRole("option").count(), 3);
    assert.equal(await pop("model").locator(".meta").count(), 0);
    assert.equal(await pop("model").locator(".default-tag").count(), 1);
    assert.equal(
      await pop("model").getByText("Opus 5 · 1M", { exact: true }).count(),
      1
    );
    assert.equal(
      await pop("model").getByText("Fable 5.1", { exact: true }).count(),
      1
    );
    await page.screenshot({ path: "/tmp/ns-model.png" });
    for (const name of ["OpenCode", "pi", "Claude"]) {
      await pop("model").getByRole("radio", { name, exact: true }).click();
      await page.waitForTimeout(1100);
      assert.deepEqual(await rect(), before);
      assert.deepEqual(await start.boundingBox(), action);
    }
    await dismiss("model");
  }
);
await check("mobile two-row sheet and keyboard containment", async () => {
  for (const [width, height] of [
    [390, 844],
    [390, 500],
    [600, 800],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await open();
    assert.equal(await page.locator("textarea").getAttribute("rows"), "6");
    await mobileGates();
    if (width === 390) {
      const path =
        height === 844 ? "/tmp/ns-mobile.png" : "/tmp/ns-mobile-keyboard.png";
      await page.screenshot({ path, caret: "hide" });
    }
    for (const name of ["model", "location", "permission", "options"]) {
      await show(name);
      const bounds = await pop(name).boundingBox();
      assert.deepEqual(bounds, { x: 0, y: 0, width, height });
      assert.ok(
        await pop(name).evaluate(
          (node) => node.scrollWidth <= node.clientWidth + 1
        )
      );
      const targets = await pop(name)
        .locator("button")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          }))
        );
      assert.ok(
        targets.every((target) => target.width >= 44 && target.height >= 44),
        JSON.stringify(targets)
      );
      const modelRows = await pop(name)
        .getByRole("option")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().height)
        );
      assert.ok(
        modelRows.every((rowHeight) =>
          name === "model" ? rowHeight === 48 : rowHeight >= 44
        )
      );
      const tiles = await pop(name)
        .locator(".agent-tile")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.getBoundingClientRect().width,
            y: node.getBoundingClientRect().y,
          }))
        );
      assert.ok(
        tiles.every(
          (tile) =>
            Math.abs(tile.width - tiles[0].width) <= 1 && tile.y === tiles[0].y
        )
      );
      if (width === 390 && height === 844) {
        await page.screenshot({
          path: `/tmp/ns-mobile-${name}.png`,
          caret: "hide",
        });
      }
      await dismiss(name);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await show("model");
  await page
    .getByPlaceholder("Search, or type a model id")
    .fill("company/custom-model-with-a-very-long-name-2026");
  await page.keyboard.press("Enter");
  await show("permission");
  await pop("permission").getByRole("radio", { name: BYPASS }).click();
  await page.waitForTimeout(500);
  await mobileGates();
  const scrolling = await page.locator(".settings-row").evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    return {
      moved: node.scrollLeft > 0,
      scrollbar: getComputedStyle(node).scrollbarWidth,
    };
  });
  assert.deepEqual(scrolling, { moved: true, scrollbar: "none" });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.waitForTimeout(100);
  await mobileGates();
  await page.setViewportSize({ width: 1440, height: 900 });
});
await check("known release metadata relative to last use", async () => {
  await open("?dates=1");
  await show("model");
  assert.equal(
    await pop("model").locator("time").textContent(),
    "2d before last use"
  );
  assert.equal(await pop("model").locator(".default-tag").count(), 1);
});
await check("permission modes: Full Send confirmed every time", async () => {
  const confirm = page.getByRole("alertdialog");
  const fullSend = () =>
    pop("permission").getByRole("radio", { name: FULL_SEND });
  const warning = page.getByText(FULL_SEND_ON);
  await open("", { prefill: CHECK_PROJECT });
  await show("permission");
  assert.equal(await pop("permission").getByRole("radio").count(), 5);
  await page.screenshot({ path: "/tmp/ns-mode.png" });
  // Picking it asks first; Cancel changes nothing and lands on the row.
  await fullSend().click();
  await confirm.waitFor();
  assert.ok((await confirm.textContent()).includes("safety checks"));
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await confirm.waitFor({ state: "hidden" });
  await page.waitForTimeout(400);
  assert.equal((await trigger("permission").textContent()).trim(), "Ask first");
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.perm),
    "fullSend"
  );
  assert.equal(await warning.count(), 0);
  // Its own button applies it, and the form says so while it is chosen.
  await fullSend().click();
  await confirm.getByRole("button", { name: "Switch to Full Send" }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal((await trigger("permission").textContent()).trim(), "Full Send");
  assert.equal(await warning.isVisible(), true);
  const count = spawns().length;
  await page.screenshot({ path: "/tmp/ns-full-send.png" });
  await start.click();
  await page.waitForTimeout(800);
  assert.equal(spawns().at(-1)?.payload.permissionMode, "fullSend");
  assert.equal(spawns().length, count + 1);
  // OpenCode's Bypass already allows every ask: Full Send is not offered.
  await open("", { prefill: CHECK_PROJECT });
  await page.getByRole("radio", { name: "OpenCode", exact: true }).click();
  await show("permission");
  assert.equal(await fullSend().count(), 0);
  await dismiss("permission");
});
await check("options switches", async () => {
  await open();
  await show("options");
  assert.equal(await pop("options").getByRole("switch").count(), 2);
  await pop("options")
    .getByRole("switch", { name: "Scratch", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/ns-options.png" });
  await dismiss("options");
});
await check(
  "stagger both ways at 3 x stagger + 60ms after list entry",
  async () => {
    await open("?swap=1");
    await show("model");
    for (const name of ["pi", "Claude"]) {
      const values = await page.evaluate(
        (nextName) =>
          new Promise((resolve) => {
            const list = document.querySelector(
              '#session-model-popover [role="listbox"]'
            );
            const observer = new MutationObserver(() => {
              if (list.getAttribute("aria-label") !== `${nextName} models`) {
                return;
              }
              observer.disconnect();
              setTimeout(
                () =>
                  resolve(
                    [0, 3, 8].map((index) =>
                      Number(
                        getComputedStyle(
                          list.querySelector(`[data-index="${index}"]`)
                        ).opacity
                      )
                    )
                  ),
                3 * 18 + 60
              );
            });
            observer.observe(list, { attributes: true });
            document
              .querySelector(
                `#session-model-popover [data-value="${nextName.toLowerCase()}"]`
              )
              .click();
          }),
        name
      );
      console.log(`STAGGER ${name}: ${JSON.stringify(values)}`);
      assert.ok(
        values[0] > values[1] && values[1] > values[2],
        JSON.stringify(values)
      );
      await page.waitForTimeout(650);
    }
  }
);
await check("contained popovers desktop and mobile", async () => {
  for (const [width, height] of [
    [1440, 900],
    [1024, 640],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await open();
    const box = await rect();
    const vertical =
      width <= 600
        ? box.y + box.height - height
        : box.y + box.height / 2 - height / 2;
    assert.ok(Math.abs(vertical) < 1);
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    assert.ok(
      await page
        .locator(".composer-pill")
        .evaluateAll((nodes) =>
          nodes.every((node) => node.getBoundingClientRect().width >= 24)
        )
    );
    for (const name of ["model", "location", "permission", "options"]) {
      await show(name);
      const bounds = await pop(name).boundingBox();
      const margin = width <= 600 ? 0 : 7;
      assert.ok(
        bounds.x >= margin &&
          bounds.y >= margin &&
          bounds.x + bounds.width <= width - margin &&
          bounds.y + bounds.height <= height - margin,
        `${name}: ${JSON.stringify(bounds)}`
      );
      await dismiss(name);
    }
    if (width === 390) {
      await page.addScriptTag({
        path: `${homedir()}/.claude/skills/ui-observer/observer.browser.js`,
      });
      console.log(
        "OBSERVER mobile",
        JSON.stringify(
          await page.evaluate(
            () =>
              globalThis.__uiObserver({
                scopeSel: ".composer-bar",
                maxDepth: 2,
              }).observations
          )
        )
      );
      await page.locator("textarea").focus();
      await page.screenshot({ path: "/tmp/ns-mobile.png" });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});
await check(
  "keyboard canonical, typed, untouched and scratch payloads intercepted",
  async () => {
    for (const model of ["default", "foo/bar-9", null]) {
      await open();
      if (model) {
        await show("model");
        await page.getByPlaceholder("Search, or type a model id").fill(model);
        await page.keyboard.press("Enter");
        await pop("model").waitFor({ state: "hidden" });
      }
      if (!model) {
        await show("options");
        await page
          .getByRole("switch", { name: "Scratch", exact: true })
          .click();
        await dismiss("options");
      }
      await page.locator("textarea").fill("Check payload");
      const count = spawns().length;
      await page.keyboard.press("Control+Enter");
      await page.waitForTimeout(500);
      assert.equal(spawns().length, count + 1);
      const { payload } = spawns().at(-1);
      console.log(`PAYLOAD ${JSON.stringify(payload)}`);
      const sent = frames.findLast(
        (frame) =>
          frame.verb === "send" && frame.instanceId === payload.instanceId
      );
      assert.ok(JSON.stringify(sent.payload.message).includes("Check payload"));
      assert.equal(
        payload.model,
        model === "default" ? "claude-opus-5[1m]" : (model ?? undefined)
      );
      if (!model) {
        assert.equal("effort" in payload, false);
        assert.equal(payload.scratch.baseCwd, "/home/check/project");
      }
    }
  }
);
await check("popover gating, invalid directory and cancellation", async () => {
  await open();
  await show("location");
  assert.equal(await start.isDisabled(), true);
  const count = spawns().length;
  await page
    .getByPlaceholder("Search machines, projects, or type a path")
    .fill("/definitely/missing");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  assert.equal(await pop("location").getByRole("alert").count(), 1);
  await page.keyboard.press("Control+Enter");
  assert.equal(spawns().length, count);
  await dismiss("location");
  fsDelay = 500;
  await start.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  fsDelay = 0;
  assert.equal(spawns().length, count);
});
await check("keyboard order and effort detent centering", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open();
  await page.locator("textarea").focus();
  for (const id of [
    "session-model",
    "session-location",
    "session-permission",
  ]) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), id);
  }
  await page.keyboard.press("Tab");
  const slider = page.getByRole("slider", { name: "Effort", exact: true });
  assert.equal(
    await slider.evaluate((node) => node === document.activeElement),
    true
  );
  await page.keyboard.press("Home");
  for (const level of levels) {
    await page.waitForTimeout(400);
    assert.equal(await slider.getAttribute("aria-valuetext"), level);
    const thumb = await page.locator(".effort-thumb").boundingBox();
    const detent = await page.locator(`[data-effort="${level}"]`).boundingBox();
    assert.ok(
      Math.abs(thumb.x + thumb.width / 2 - detent.x - detent.width / 2) <= 1
    );
    assert.equal(thumb.width, 18);
    await page.keyboard.press("ArrowRight");
  }
});
await check("bootstrap payload and installed harness fallback", async () => {
  await open();
  await show("options");
  await page.getByRole("switch", { name: "Bootstrap", exact: true }).click();
  await pop("location").waitFor();
  await pop("location")
    .locator(".directories .row")
    .filter({ hasText: "checks/repo" })
    .click();
  await page.waitForTimeout(800);
  const count = spawns().length;
  await start.click();
  await page.waitForTimeout(500);
  assert.equal(spawns().length, count + 1);
  assert.deepEqual(spawns().at(-1).payload.bootstrap, {
    repo: "checks/repo",
    baseDir: "/home/check/project",
  });
  assert.equal(spawns().at(-1).payload.cwd, "/home/check/project/repo");
  await open();
  await show("location");
  await page
    .getByPlaceholder("Search machines, projects, or type a path")
    .fill("pi-host");
  await pop("location")
    .locator(".directories .row")
    .filter({ hasText: "pi-host project" })
    .click();
  await show("model");
  assert.equal(
    await pop("model")
      .getByRole("radio", { name: "pi", exact: true })
      .getAttribute("aria-checked"),
    "true"
  );
  assert.equal(
    await pop("model")
      .getByRole("radio", { name: "Claude", exact: true })
      .isDisabled(),
    true
  );
  assert.equal(
    await pop("model")
      .getByRole("radio", { name: "OpenCode", exact: true })
      .isDisabled(),
    true
  );
});
await check("polish light and dark desktop and mobile", async () => {
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({
      colorScheme: scheme,
      reducedMotion: "no-preference",
    });
    for (const { width, height, minEffort, iconSize, margin } of [
      { width: 1440, height: 900, minEffort: 150, iconSize: 16, margin: 7 },
      { width: 390, height: 844, minEffort: 160, iconSize: 20, margin: 0 },
    ]) {
      await page.setViewportSize({ width, height });
      await open();
      await page.waitForTimeout(400);
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        scheme === "dark"
      );
      const facts = await page.evaluate(() => {
        const card = document.querySelector(".session-card");
        const bar = document.querySelector(".composer-bar");
        const bounds = bar.getBoundingClientRect();
        const track = document.querySelector(".effort .track");
        return {
          well: getComputedStyle(document.querySelector("textarea"))
            .backgroundColor,
          card: getComputedStyle(card).backgroundColor,
          shadow: getComputedStyle(card).boxShadow,
          track: {
            width: track.getBoundingClientRect().width,
            height: track.getBoundingClientRect().height,
            color: getComputedStyle(track).backgroundColor,
          },
          effortWidth: document.querySelector(".effort").getBoundingClientRect()
            .width,
          icons: [...document.querySelectorAll(".detent svg")].map((svg) => ({
            width: svg.getBoundingClientRect().width,
            height: svg.getBoundingClientRect().height,
            ink: getComputedStyle(svg).color,
          })),
          defaultThumb: Boolean(
            document.querySelector(".effort-thumb.default-value")
          ),
          escapes: [...bar.children]
            .filter((node) => node.getClientRects().length)
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return r.left < bounds.left - 1 || r.right > bounds.right + 1;
            })
            .map((node) => node.id || node.className),
        };
      });
      console.log(`POLISH ${scheme} ${width}: ${JSON.stringify(facts)}`);
      assert.notEqual(facts.well, facts.card);
      assert.notEqual(facts.shadow, "none");
      assert.equal(facts.track.height, 4);
      assert.ok(facts.effortWidth >= minEffort);
      assert.equal(facts.defaultThumb, true);
      assert.deepEqual(facts.escapes, []);
      assert.ok(
        facts.icons.every(
          (icon) => icon.width === iconSize && icon.height === iconSize
        )
      );
      await page.screenshot({
        path: `/tmp/ns-polish-${scheme}-${width}-rest.png`,
      });
      const primary = {
        "dark-1440": "/tmp/ns-dark.png",
        "light-390": "/tmp/ns-mobile.png",
      }[`${scheme}-${width}`];
      if (primary) {
        await page.screenshot({ path: primary, caret: "hide" });
      }
      for (const name of ["model", "location", "permission", "options"]) {
        await show(name);
        assert.equal(await start.isDisabled(), true);
        assert.ok(
          await start.evaluate(
            (node) => Number(getComputedStyle(node).opacity) < 1
          )
        );
        const switches = await pop(name)
          .getByRole("switch")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              track: getComputedStyle(node).backgroundColor,
              thumb: getComputedStyle(
                node.querySelector('[data-slot="switch-thumb"]')
              ).backgroundColor,
              surface: getComputedStyle(node.closest(".composer-popover"))
                .backgroundColor,
            }))
          );
        assert.ok(
          switches.every(
            (control) =>
              control.track !== control.surface &&
              control.thumb !== control.track
          ),
          JSON.stringify(switches)
        );
        const bounds = await pop(name).boundingBox();
        assert.ok(
          bounds.x >= margin &&
            bounds.y >= margin &&
            bounds.x + bounds.width <= width - margin &&
            bounds.y + bounds.height <= height - margin
        );
        console.log(
          `POLISH POPOVER ${scheme} ${width} ${name}: ${JSON.stringify(bounds)}`
        );
        await page.screenshot({
          path: `/tmp/ns-polish-${scheme}-${width}-${name}.png`,
        });
        if (scheme === "light" && width === 1440 && name !== "location") {
          await page.screenshot({ path: `/tmp/ns-${name}.png` });
        }
        await dismiss(name);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
});
await check("reduced motion endpoints", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open();
  assert.equal(
    await dialog.evaluate((el) => getComputedStyle(el).opacity),
    "1"
  );
  await show("model");
  await pop("model").getByRole("radio", { name: "pi", exact: true }).click();
  await page.waitForTimeout(50);
  assert.equal(
    await page.getByRole("listbox", { name: "pi models" }).count(),
    1
  );
  const durations = await page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => Number(animation.effect.getTiming().duration))
  );
  assert.ok(
    durations.every((duration) => duration <= 1),
    JSON.stringify(durations)
  );
  await page.setViewportSize({ width: 390, height: 500 });
  await open();
  await mobileGates();
});
if (process.env.NS_DESKTOP_COMPARE) {
  await check("final desktop screenshot is pixel-identical", async () => {
    const before = await readFile("/tmp/ns-desktop-before.png");
    const after = await readFile("/tmp/ns-rest.png");
    assert.ok(
      before.equals(after),
      "Final desktop screenshot differs from its baseline"
    );
  });
}
if (errors.length) {
  failures += 1;
  console.error(`PAGE ERRORS ${JSON.stringify(errors)}`);
}
await browser.close();
console.log(
  `RESULT ${failures ? "FAIL" : "PASS"}: ${failures} failed checks; ${errors.length} page errors; ${spawns().length} intercepted spawns; zero real sessions`
);
process.exitCode = failures ? 1 : 0;
