/**
 * Host mode's pass as a browser meets it (hub preview-access.ts), for the
 * specs that read a decision page's embeds on host mode's names
 * (project-origin, project-origin-sheet): the names under a domain of the
 * Public Suffix List's, behind a Cloudflare-like front answering https, the
 * dashboard behind one of its own under the same domain (as the owner's
 * tunnel serves both), what the browser asks of the names, and an embed's
 * remount.
 *
 * The domain is localtest.me's: "The entire domain name localtest.me—and all
 * wildcard entries—point to 127.0.0.1"
 * (weblogs.asp.net/owscott/introducing-testing-domain-localtest-me). A
 * `.localhost` name will not do: Chromium takes each one for a site of its
 * own, so no `SameSite=Lax` pass reaches a frame there, and the hub refuses
 * such a pattern. Where no DNS answers (a workspace), the browser is told
 * the names ({@link PASS_HOSTS}), and host mode is stored as the hub keeps
 * it and the hub started on it ({@link storeHostMode}).
 */
import type { Frame, Page } from "playwright-core";
import { cloudflareTo, scratchCertificate } from "./cloudflare-front";
import type { KitFleet } from "./kit";

/** The names' domain: localtest.me and every name under it are 127.0.0.1. */
export const PASS_DOMAIN = "localtest.me";

/** The browser's own answer for the names, as DNS gives it (kit `hostRules`). */
export const PASS_HOSTS = `MAP *.${PASS_DOMAIN} 127.0.0.1, MAP ${PASS_DOMAIN} 127.0.0.1`;

/**
 * The fleet's preview mode as Settings › Previews keeps it, the hub
 * stopped, the row written and the hub started on it. Settings' save first
 * checks that one of the names resolves (hub preview.ts `probePattern`),
 * which a workspace, having no DNS, never passes; a hub starts on a stored
 * pattern as it is kept. Every session and page goes on across the restart.
 */
export async function storeHostMode(
  fleet: KitFleet,
  settings: { mode: "port" } | { mode: "host"; pattern: string }
): Promise<void> {
  await fleet.stop("hub");
  fleet.write(
    "INSERT INTO preview_settings (id, mode, pattern) VALUES ('preview', ?, ?) ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, pattern = excluded.pattern",
    settings.mode,
    settings.mode === "host" ? settings.pattern : null
  );
  fleet.launch("hub");
  await fleet.hubUp();
}

/** Host mode's settings for `placeholder` (`{port}` or `{session}`), its names behind the https front on `front`. */
export const passPattern = (
  placeholder: "{port}" | "{session}",
  front: number
) => ({
  mode: "host" as const,
  pattern: `https://p-${placeholder}.${PASS_DOMAIN}:${front}`,
});

/**
 * The owner's tunnel for a scratch fleet: https in front of the range's
 * first port (`first`) and of the dashboard (`base`), its certificate made
 * in `dir`. `board`: the dashboard's address under the names' domain.
 */
export async function passTunnel(dir: string, first: number, base: string) {
  const certificate = await scratchCertificate(dir, [
    `*.${PASS_DOMAIN}`,
    PASS_DOMAIN,
  ]);
  const names = cloudflareTo(`127.0.0.1:${first}`, certificate);
  const dashboard = cloudflareTo(new URL(base).host, certificate, true);
  return {
    board: `https://${PASS_DOMAIN}:${dashboard.port}`,
    front: names.port as number,
    stop: () => {
      names.stop(true);
      dashboard.stop(true);
    },
  };
}

/** One thing a tab's browser did with a preview name, in order: asked its entry, was answered, was answered 401. */
export interface Heard {
  host: string;
  kind: "enter" | "answer" | "locked";
  url: string;
}

const TICKET = /ticket=[^&]+/u;

/** Everything `tab`'s browser asks of a preview name (one under the domain, never the dashboard's own) and is answered, in order. */
export const hear = (tab: Page): Heard[] => {
  const heard: Heard[] = [];
  const named = (address: string): URL | null => {
    const url = new URL(address);
    return url.hostname.endsWith(`.${PASS_DOMAIN}`) ? url : null;
  };
  tab.context().on("request", (request) => {
    const url = named(request.url());
    if (url?.pathname === "/__cawco/enter") {
      heard.push({
        kind: "enter",
        host: url.hostname,
        url: url.href.replace(TICKET, "ticket=…"),
      });
    }
  });
  tab.context().on("response", (response) => {
    const url = named(response.url());
    if (url) {
      heard.push({
        kind: response.status() === 401 ? "locked" : "answer",
        host: url.hostname,
        url: url.href.replace(TICKET, "ticket=…"),
      });
    }
  });
  return heard;
};

/**
 * Whether what was heard is the owner's case held ("Every embed loads with
 * no 401, one `/__cawco/enter` per browser in total, and none per
 * remount"): nothing was answered 401, the page's first load included (the
 * dashboard enters before it: dashboard preview/pass.ts), one entry was
 * asked in all, and from `remounts` on (where the remounts began) nothing
 * entered; and the lines that say so.
 */
export const passHeld = (
  heard: Heard[],
  embeds: Set<string>,
  remounts: number
) => {
  const enters = heard.filter((one) => one.kind === "enter");
  const locks = heard.filter((one) => one.kind === "locked");
  const embedAnswers = heard.filter(
    (one) => one.kind !== "enter" && embeds.has(one.host)
  );
  const sinceRemounts = heard
    .slice(remounts)
    .filter((one) => one.kind !== "answer");
  return {
    held:
      embedAnswers.length > 0 &&
      embedAnswers.every((one) => one.kind === "answer") &&
      locks.length === 0 &&
      enters.length === 1 &&
      sinceRemounts.length === 0,
    said: {
      embedAnswers: embedAnswers.length,
      locked: locks.map((one) => one.url),
      enters: enters.map((one) => one.url),
      sinceRemounts: sinceRemounts.map((one) => `${one.kind} ${one.url}`),
    },
  };
};

/** Each embed's frame mounted again in the page, as a Preview mounting anew loads it: its address as the page was served set again. */
export const remount = (page: Frame): Promise<void> =>
  page.evaluate(() => {
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(
      "iframe[data-slot=embed]"
    )) {
      frame.src = frame.getAttribute("src") ?? frame.src;
    }
  });
