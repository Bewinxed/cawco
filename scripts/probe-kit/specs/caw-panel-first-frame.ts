/**
 * Caw's panel on a project's page opens drawn whole from its first frame:
 * his line and his switch's word are read from what the dashboard holds as
 * the page opens (the project's row, the machines), never from his view
 * (`GET /api/projects/:id/caw`), which carries only what he started that
 * still runs, what his own turn answers, and his spend.
 *
 * On a scratch fleet (real hub, agent and sessiond), a project with Caw off,
 * at desk 1440 in light: the page opened with his view held on its way (a
 * hub reached over a slow link answers it late), and his panel opened from
 * his seat. Every frame painted from the first the panel stands in is read
 * (a task posted from each frame's callbacks runs once that frame is
 * painted): the first already says he is off ("Caw · off", "Answers when
 * you write") and has the composer, while the view is still held; once it
 * is let through, the panel says the same.
 *
 *   bun scripts/probe-kit/run.ts caw-panel-first-frame
 */
import { MACHINE, until } from "../../scratch-fleet";
import { open, type Spec, settle } from "../kit";
import { fleetUp } from "./artifact-resize-loop";

/** Caw's panel as one frame painted it. */
interface PanelFrame {
  /** The panel has the composer to write to him. */
  composer: boolean;
  /** His line under his name. */
  line: string | null;
  /** His name says he is off. */
  off: boolean;
}

declare global {
  interface Window {
    /** Every frame painted from the first Caw's panel stands in. */
    __panelFrames?: PanelFrame[];
  }
}

/**
 * Reads each frame as it was painted, from the first one Caw's panel stands
 * in, up to 300: a message posted from the frame's callbacks is a task,
 * which runs once that frame's rendering is done. Runs in the page before
 * its own scripts.
 */
function panelFrames() {
  const painted: PanelFrame[] = [];
  window.__panelFrames = painted;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const panel = document.querySelector("[data-caw-panel]");
    if (panel) {
      painted.push({
        line:
          panel.querySelector("[data-caw-line]")?.textContent?.trim() ?? null,
        off: !!panel.querySelector('[data-slot="off-word"]'),
        composer: !!panel.querySelector('[data-slot="composer-field"]'),
      });
    }
  };
  const tick = () => {
    if (painted.length < 300) {
      channel.port2.postMessage(0);
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/** What his line says while he is off and at rest (CawThread `said`). */
const OFF_LINE = "Answers when you write";

const spec: Spec = {
  name: "caw-panel-first-frame",
  async run(kit) {
    const fleet = await fleetUp(kit);
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Chip wraps",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const base = await fleet.dashboard();
    const page = await kit.page("desk", {
      theme: "light",
      init: [panelFrames],
    });
    // The person put his panel away here before: it opens from his seat.
    await page.addInitScript((key) => {
      localStorage.setItem(key, "0");
    }, `cawco.caw.open.${project.id}`);
    // His view, held on its way until the panel's frames are read.
    let release: () => void = () => undefined;
    const released = new Promise<void>((done) => {
      release = done;
    });
    let held = 0;
    let answered = 0;
    const viewPath = `/api/projects/${project.id}/caw`;
    await page.route(`**${viewPath}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      held += 1;
      await released;
      await route.continue();
    });
    page.on("requestfinished", (request) => {
      if (request.method() === "GET" && request.url().endsWith(viewPath)) {
        answered += 1;
      }
    });
    try {
      await open(
        page,
        `${base}/project/${project.id}`,
        '[data-slot="caw-seat"]'
      );
      await page.locator('[data-slot="caw-seat"]:visible').first().click();
      await page.locator("[data-caw-panel]").waitFor({ timeout: 30_000 });
      await page.waitForFunction(
        () => (window.__panelFrames?.length ?? 0) >= 10
      );
      const first = await page.evaluate(() => window.__panelFrames ?? []);
      const stillHeld = held > 0 && answered === 0;
      kit.check(
        "Caw's panel opened while his view was still on its way",
        stillHeld,
        JSON.stringify({ held, answered })
      );
      const [opening] = first;
      kit.check(
        "the first frame Caw's panel is painted in says he is off and has the composer",
        !!opening &&
          opening.off &&
          opening.line === OFF_LINE &&
          opening.composer,
        JSON.stringify({ firstFrames: first.slice(0, 6) })
      );
      kit.check(
        "no frame of the panel's opening says anything else",
        first.every(
          (frame) => frame.off && frame.line === OFF_LINE && frame.composer
        ),
        JSON.stringify({
          others: first.filter(
            (frame) => !(frame.off && frame.line === OFF_LINE && frame.composer)
          ),
        })
      );
      release();
      await until(
        "his view answered",
        () => answered,
        (count) => count > 0,
        30_000
      );
      await settle(page);
      const now = await page.evaluate(
        () => window.__panelFrames?.at(-1) ?? null
      );
      kit.check(
        "once his view comes, the panel says the same",
        !!now && now.off && now.line === OFF_LINE && now.composer,
        JSON.stringify({ now, answered })
      );
    } finally {
      release();
      await page.context().close();
    }
  },
};
export default spec;
