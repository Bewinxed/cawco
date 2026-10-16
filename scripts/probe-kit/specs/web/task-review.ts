/**
 * A task's review is a message from the session that worked it, then what
 * that session presented. On the built dashboard against a scratch fleet
 * seeded by scripts/task-review-preview/seed.ts:
 * - (a) tsk-2: its session presented a page artifact, with a file and a
 *   link: the stage holds the artifact's frame, loaded;
 * - (b) tsk-1: files only: the stage is its words, the files attachments;
 * - (c) tsk-7: its session failed: Try again in the decision band;
 * - (d) tsk-5: two sessions: Details › Sessions lists both.
 * In each, at a desk's split (1440) and a phone's page (390): only the
 * stage scrolls, the decision band stands at the pane's foot, and nothing
 * shows a file's name as a heading.
 *
 * Then one assertion per pin the owner left on the review (2026-10-15),
 * each read from the engine:
 *  1. "it's not clear if these are tags or action buttons": the labels are
 *     badges on the facts line that take no press (not focusable, no
 *     pointer, no role), and the decision's actions are buttons.
 *  2. "what are tehse parts supposed to indicate?": no strip of chips; the
 *     pane's only tabs are Review and Details, and what the session
 *     attached is a row of links, each opening what it names.
 *  3. "why are you spamming the files etc in a vertical view? what is the
 *     .json suppsoed to say?": one stage, holding one thing (the presented
 *     page, or the session's words), no raw JSON anywhere in the pane.
 *  4. "what are attempts? are weable to even attempt again?, what does the
 *     Done or time mean": the word Attempt, Done and a duration appear
 *     nowhere; a failed session says Failed and the hub's reason, with Try
 *     again in Approve's place.
 *  5. "we talked before about giving a way for the agents to present their
 *     results": what the session presented with artifact_create is drawn by
 *     the artifact panel's own renderer (PreviewPane, inset).
 *  6. (an empty pin on the side card): the task stands beside the board,
 *     the board live and wide beside it, never a sheet over it.
 *  7. "no padding or even proper layout for the transcript? no way to
 *     expand it?": Open ↗ shows the session's own transcript, its padding
 *     and columns, at the page's full height, the task beside it.
 *
 * Each case writes its capture at both widths to the spec's folder for the
 * critique.
 *
 *   bun scripts/probe-kit/run.ts web task-review
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one task at a time
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each pin is read in order, one assertion after another
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { respond } from "../../../task-review-preview/mock";
import { type Kit, open, ROOT, type Spec, settle } from "../../kit";

interface Seeded {
  project: string;
}

/** A file's name as a heading would say it: `post.json`, `plan.md`. */
const FILE_NAME = /\.[a-z0-9]{2,5}$/i;
/** What a pane says of attempts, a bare Done, or a run's length. */
const ATTEMPT_WORDS = /\bAttempt\b|\bDone ·|· Done\b|Finished in|\b\d+ min\b/;
/** JSON as a file holds it: an object's opening, a quoted key. */
const RAW_JSON = /\{\s*"|"kind"\s*:/;
const WHITESPACE = /\s+/g;
/** An overflow that scrolls. */
const SCROLLABLE = /(auto|scroll)/;
/** The hub's reason tsk-7's session failed (seed.ts). */
const FAILED_WHY = "post 3 is 312 characters";

/** What the open task's pane shows, read from the engine. */
const read = (page: Page) =>
  page.evaluate(
    ({ fileName, attemptWords, rawJson, scrollable }) => {
      const pane = document.querySelector<HTMLElement>("[data-task-pane]");
      const box = (el: Element | null | undefined) =>
        el ? el.getBoundingClientRect() : null;
      const scrollers: string[] = [];
      const scrolls = new RegExp(scrollable);
      for (const el of pane ? [pane, ...pane.querySelectorAll("*")] : []) {
        const style = getComputedStyle(el);
        if (
          scrolls.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          scrollers.push(
            (el as HTMLElement).dataset.band ??
              `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`
          );
        }
      }
      const decide = pane?.querySelector("[data-band=decide]");
      const stage = pane?.querySelector<HTMLElement>("[data-band=stage]");
      const meta = pane?.querySelector(".meta");
      const control = (el: Element) => {
        const style = getComputedStyle(el);
        return {
          text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
          tag: el.tagName,
          role: el.getAttribute("role"),
          focusable: (el as HTMLElement).tabIndex >= 0,
          cursor: style.cursor,
          inFacts: !!meta?.contains(el),
        };
      };
      const frame = stage?.querySelector<HTMLIFrameElement>(
        ".preview-pane.preview-inset iframe"
      );
      const text = pane?.innerText ?? "";
      return {
        scrollers,
        paneBottom: box(pane)?.bottom ?? 0,
        decideBottom: box(decide)?.bottom ?? null,
        viewport: innerHeight,
        headings: [
          ...(pane?.querySelectorAll(
            "h1, h2, h3, h4, h5, h6, [role=heading]"
          ) ?? []),
        ]
          .map((el) => el.textContent?.trim() ?? "")
          .filter((words) => new RegExp(fileName, "i").test(words)),
        badges: [...(pane?.querySelectorAll("[data-slot=badge]") ?? [])].map(
          control
        ),
        actions: [...(decide?.querySelectorAll("button") ?? [])].map(
          (button) => ({
            ...control(button),
            name: button.getAttribute("aria-label") ?? "",
          })
        ),
        tabs: [...(pane?.querySelectorAll("[role=tab]") ?? [])].map(
          (tab) => tab.textContent?.trim() ?? ""
        ),
        frame: frame
          ? {
              src: frame.getAttribute("src") ?? "",
              ready: frame.classList.contains("ready"),
              height: Math.round(frame.getBoundingClientRect().height),
            }
          : null,
        /** What the stage holds, one entry per thing drawn in it. */
        staged: [...(stage?.children ?? [])].map((el) =>
          [...el.classList].join(".")
        ),
        attachments: [...(pane?.querySelectorAll(".attachment") ?? [])].map(
          (el) => ({
            text: el.textContent?.trim() ?? "",
            tag: el.tagName,
            href: el.getAttribute("href") ?? "",
            glyph: !!el.querySelector("svg"),
          })
        ),
        stageText: stage?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        attemptWords: text.match(new RegExp(attemptWords))?.[0] ?? null,
        rawJson: new RegExp(rawJson).test(text),
        session: pane?.querySelector(".session")?.textContent ?? "",
        ended: pane?.querySelector(".ended")?.textContent?.trim() ?? "",
      };
    },
    {
      fileName: FILE_NAME.source,
      attemptWords: ATTEMPT_WORDS.source,
      rawJson: RAW_JSON.source,
      scrollable: SCROLLABLE.source,
    }
  );

type Seen = Awaited<ReturnType<typeof read>>;

/** The decision band's button by its accessible name (its pending words share its cell). */
const decision = (page: Page, task: string, name: string) =>
  page
    .locator(`[data-task-pane="${task}"] [data-band=decide]`)
    .getByRole("button", { name, exact: true })
    .count();

async function views(kit: Kit, base: string, seeded: Seeded) {
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const show = async (task: string) => {
      await open(
        page,
        `${base}/project/${seeded.project}?task=${task}`,
        `[data-task-pane="${task}"] [data-band=result]`
      );
      await settle(page, 400);
    };
    const shoot = (task: string) =>
      page.screenshot({ path: join(kit.out, `${view}-${task}.png`) });
    const bands = (task: string, seen: Seen) => {
      kit.check(
        `${view} ${task}: only the stage scrolls`,
        seen.scrollers.every((name) => name === "stage"),
        seen.scrollers.join(", ") || "nothing scrolls"
      );
      kit.check(
        `${view} ${task}: the decision band stands at the pane's foot`,
        seen.decideBottom !== null &&
          Math.abs(seen.decideBottom - seen.paneBottom) <= 1 &&
          seen.decideBottom <= seen.viewport + 1,
        `decide ${seen.decideBottom}, pane ${seen.paneBottom}, viewport ${seen.viewport}`
      );
      kit.check(
        `${view} ${task}: no file's name as a heading`,
        seen.headings.length === 0,
        seen.headings.join(", ")
      );
      kit.check(
        `${view} ${task}: pin 4, no Attempt, no bare Done, no run's length`,
        seen.attemptWords === null,
        seen.attemptWords ?? ""
      );
    };

    // (a) the presented page artifact, drawn in the stage.
    await show("tsk-2");
    await page
      .waitForSelector(
        '[data-task-pane="tsk-2"] [data-band=stage] .preview-inset iframe.ready',
        { timeout: 60_000 }
      )
      .catch(() => undefined);
    const a = await read(page);
    await shoot("tsk-2");
    bands("tsk-2", a);
    const labels = a.badges.filter((badge) =>
      ["x", "launch"].includes(badge.text)
    );
    kit.check(
      `${view} tsk-2: pin 1, labels are badges on the facts line that take no press; actions are buttons`,
      labels.length === 2 &&
        labels.every(
          (badge) =>
            badge.inFacts &&
            !badge.focusable &&
            badge.role === null &&
            badge.cursor !== "pointer"
        ) &&
        a.actions.length >= 2 &&
        a.actions.every(
          (action) => action.tag === "BUTTON" && action.focusable
        ),
      `labels ${JSON.stringify(labels)} · actions ${a.actions.map((action) => action.text).join(" | ")}`
    );
    kit.check(
      `${view} tsk-2: pin 2, no chip strip: the only tabs are Review and Details; what it attached are links that open it`,
      a.tabs.join("|") === "Review|Details" &&
        a.attachments.length === 2 &&
        a.attachments.every(
          (one) => one.tag === "A" && one.href.length > 0 && one.glyph
        ) &&
        a.attachments.some((one) => one.text === "press-notes.md") &&
        a.attachments.some((one) => one.text.startsWith("Launch card · ")),
      `tabs ${a.tabs.join("|")} · ${JSON.stringify(a.attachments)}`
    );
    kit.check(
      `${view} tsk-2: pin 3, one stage holding one thing, the page itself, no raw JSON`,
      a.staged.length === 1 &&
        a.staged[0]?.includes("preview-inset") === true &&
        !a.rawJson,
      `${JSON.stringify(a.staged)} · raw JSON ${a.rawJson}`
    );
    kit.check(
      `${view} tsk-2: pin 5, what it presented is drawn by the artifact panel's renderer, loaded`,
      !!a.frame?.src && a.frame.ready && a.frame.height > 200,
      JSON.stringify(a.frame)
    );
    if (view === "desk") {
      const beside = await page.evaluate(() => {
        const board = document
          .querySelector(".view-pane-side")
          ?.getBoundingClientRect();
        const pane = document
          .querySelector("[data-task-pane]")
          ?.getBoundingClientRect();
        return {
          board: board ? { right: board.right, width: board.width } : null,
          pane: pane ? { left: pane.left, width: pane.width } : null,
          cards: document.querySelectorAll(".view-pane-side a[href*='task=']")
            .length,
          overlay: !!document.querySelector(
            "[data-slot=sheet-overlay], [data-dialog-overlay]"
          ),
        };
      });
      kit.check(
        "desk tsk-2: pin 6, the task stands beside the board, the board live beside it, no sheet over it",
        !!beside.board &&
          !!beside.pane &&
          beside.board.width > 600 &&
          beside.pane.left >= beside.board.right - 1 &&
          beside.cards > 0 &&
          !beside.overlay,
        JSON.stringify(beside)
      );
    }

    // (b) files only: the words are the stage.
    await show("tsk-1");
    const b = await read(page);
    await shoot("tsk-1");
    bands("tsk-1", b);
    kit.check(
      `${view} tsk-1: pin 3, its words are the one stage, its files attachments, no raw JSON`,
      b.frame === null &&
        b.staged.length === 1 &&
        b.stageText.startsWith("Drafted the Build in Public post") &&
        b.stageText.includes("Check") &&
        b.attachments.map((one) => one.text).join(" | ") ===
          "tsk-1.post.json | tsk-1.plan.md" &&
        b.attachments.every((one) =>
          one.href.includes("/tasks/tsk-1/outputs/file?name=")
        ) &&
        !b.rawJson,
      `${b.stageText.slice(0, 60)}… · ${b.attachments.map((one) => one.href).join(" | ")}`
    );
    const markers = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-task-pane="tsk-1"] [data-band=stage] .check-list li'
        ),
      ].map((item) => getComputedStyle(item).listStyleType)
    );
    kit.check(
      `${view} tsk-1: what to check is a list, each line with its marker`,
      markers.length === 2 && markers.every((type) => type === "disc"),
      markers.join(", ")
    );
    if (view === "desk") {
      const served = await page.evaluate(async (href) => {
        const response = await fetch(href);
        return { status: response.status, text: await response.text() };
      }, b.attachments[1]?.href ?? "");
      kit.check(
        "desk tsk-1: an attachment opens the output the hub keeps",
        served.status === 200 && served.text.startsWith("# Build in Public"),
        `${served.status} ${served.text.slice(0, 40)}`
      );
    }

    // Open ↗: its session's page, the task standing beside the transcript.
    if (view === "desk") {
      const session = await page.getAttribute(
        '[data-task-pane="tsk-1"] [data-session]',
        "data-session"
      );
      await page
        .getByRole("link", { name: "Open its session beside this task" })
        .click();
      await page
        .waitForSelector(
          '.transcript-pane .tr [data-row], [data-task-pane="tsk-1"]',
          {
            timeout: 60_000,
          }
        )
        .catch(() => undefined);
      await settle(page, 800);
      await shoot("tsk-1-session");
      const beside = await page.evaluate(() => {
        const pane = document
          .querySelector('[data-task-pane="tsk-1"]')
          ?.getBoundingClientRect();
        const transcript = document.querySelector(".transcript-pane");
        const rows = transcript?.querySelector<HTMLElement>(".tr");
        const style = rows ? getComputedStyle(rows) : null;
        const at = transcript?.getBoundingClientRect();
        return {
          path: location.pathname,
          pane: pane ? { left: pane.left, width: pane.width } : null,
          transcript: at
            ? {
                right: at.right,
                width: at.width,
                top: at.top,
                height: at.height,
              }
            : null,
          padding: style
            ? [
                Number.parseFloat(style.paddingInlineStart),
                Number.parseFloat(style.paddingInlineEnd),
              ]
            : null,
          columns: rows?.classList.contains("tx-columns") ?? false,
          viewport: innerHeight,
        };
      });
      kit.check(
        "desk tsk-1: pin 7, Open ↗ shows its session's own transcript, padded, in its columns, full height, the task beside it",
        beside.path === `/session/${session}` &&
          !!beside.pane &&
          !!beside.transcript &&
          beside.transcript.width > 300 &&
          beside.transcript.height >=
            beside.viewport - beside.transcript.top - 2 &&
          beside.pane.left >= beside.transcript.right - 1 &&
          !!beside.padding &&
          beside.padding.every((pad) => pad > 0) &&
          beside.columns,
        JSON.stringify(beside)
      );
    }

    // (c) a failed session: Failed, the hub's words, Try again.
    await show("tsk-7");
    const c = await read(page);
    await shoot("tsk-7");
    bands("tsk-7", c);
    const tryAgain = await decision(page, "tsk-7", "Try again");
    const approve = await page
      .locator('[data-task-pane="tsk-7"] [data-band=decide] button')
      .filter({ hasText: "Approve" })
      .count();
    kit.check(
      `${view} tsk-7: pin 4, its session says Failed and the hub's reason, with Try again in Approve's place`,
      c.session.includes("Failed") &&
        c.ended.includes(FAILED_WHY) &&
        tryAgain === 1 &&
        approve === 0,
      `${c.session.replace(WHITESPACE, " ").trim()} · ${c.ended} · Try again ${tryAgain}, Approve ${approve}`
    );

    // (d) two sessions: Details › Sessions.
    await show("tsk-5");
    bands("tsk-5", await read(page));
    await page
      .locator('[data-task-pane="tsk-5"]')
      .getByRole("tab", { name: "Details" })
      .click();
    await settle(page, 300);
    const sessions = await page.evaluate(() => {
      const pane = document.querySelector('[data-task-pane="tsk-5"]');
      const head = [...(pane?.querySelectorAll("h3") ?? [])].find((el) =>
        el.textContent?.trim().startsWith("Sessions")
      );
      return {
        head: head?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        rows: pane?.querySelectorAll(".sessions > li").length ?? 0,
        attempts: (pane as HTMLElement | null)?.innerText.includes("Attempt"),
      };
    });
    await shoot("tsk-5-details");
    kit.check(
      `${view} tsk-5: pin 4, Details › Sessions lists its two sessions, no Attempt`,
      sessions.head === "Sessions 2" &&
        sessions.rows === 2 &&
        !sessions.attempts,
      JSON.stringify(sessions)
    );

    kit.check(
      `${view}: no page errors`,
      errors.length === 0,
      errors.join(" | ")
    );
  }
}

const spec: Spec = {
  name: "task-review",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // The seed, on this fleet.
    await mkdir(kit.out, { recursive: true });
    const infoPath = join(kit.out, "info.json");
    await writeFile(
      infoPath,
      JSON.stringify({
        base: fleet.base,
        sandbox: fleet.sandbox,
        home: fleet.home,
        db: join(fleet.sandbox, "hub", "hub.db"),
        workdir: fleet.workdir,
        repo: fleet.repo,
      })
    );
    const seeding = Bun.spawn(
      ["bun", join(ROOT, "scripts", "task-review-preview", "seed.ts")],
      {
        cwd: ROOT,
        env: { ...process.env, TASK_REVIEW_INFO: infoPath },
        stdout: "ignore",
        stderr: "pipe",
      }
    );
    const seededOk = (await seeding.exited) === 0;
    if (
      !kit.check(
        "the seed ran",
        seededOk,
        seededOk ? "" : await new Response(seeding.stderr).text()
      )
    ) {
      return;
    }
    const seeded = (await Bun.file(
      join(kit.out, "seeded.json")
    ).json()) as Seeded;

    const base = await fleet.dashboard();
    await views(kit, base, seeded);
    kit.note(`captures in ${kit.out}`);
  },
};

export default spec;
