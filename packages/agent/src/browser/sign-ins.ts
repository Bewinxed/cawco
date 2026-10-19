/**
 * A browser's sign-ins as they carry from one Chromium to another: its
 * cookies, and the localStorage of every origin its cookies name. Read and
 * written over the daemon's own DevTools connection (cdp-takeover.ts
 * `CdpLink`), never the gate. What moves a local browser into a container
 * carries these rather than its profile dir: a profile is a Chromium
 * version's and a platform key's (a Mac's mock-keychain key is no Linux
 * key), and Chromium on Linux takes a newer version's profile as
 * `Type::kUnsupported` (chrome/browser/downgrade/downgrade_manager.cc).
 *
 * Cookies: `Storage.getCookies` answers every cookie of the default browser
 * context, httpOnly, session and partitioned ones among them, and
 * `Storage.setCookies` takes them back as `Network.CookieParam` (Storage.pdl,
 * Network.pdl). A host-only cookie is named by its URL, so it stays
 * host-only; one with an opaque partition key cannot be named and is not
 * carried.
 *
 * localStorage: `DOMStorage.getDOMStorageItems` and `setDOMStorageItem` act
 * on a frame of the page that holds the storage key, or answer "Frame not
 * found for the given storage id" (blink inspector_dom_storage_agent.cc
 * `FindStorageArea`). So each origin is opened on a page of the daemon's
 * own, its document answered empty by `Fetch.fulfillRequest` so no request
 * leaves the browser and no site's script runs, with service workers
 * bypassed. IndexedDB is not carried: CDP's IndexedDB domain writes nothing.
 */
import { CdpLink } from "./cdp-takeover";

type Json = Record<string, unknown>;

/** One cookie as `Storage.setCookies` takes it. */
type CookieParam = Json & { name: string; value: string };

/** What carries: the cookies, and each origin's localStorage items. */
export interface SignIns {
  cookies: CookieParam[];
  storage: { items: [string, string][]; origin: string }[];
}

/** A `Network.Cookie` as `Storage.getCookies` answers it. */
interface Cookie {
  domain: string;
  expires: number;
  httpOnly: boolean;
  name: string;
  partitionKey?: Json;
  partitionKeyOpaque?: boolean;
  path: string;
  priority?: string;
  sameSite?: string;
  secure: boolean;
  session: boolean;
  sourcePort?: number;
  sourceScheme?: string;
  value: string;
}

const isCookie = (value: unknown): value is Cookie =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Cookie).name === "string" &&
  typeof (value as Cookie).domain === "string";

const cookiesOf = (result: Json): Cookie[] =>
  Array.isArray(result.cookies) ? result.cookies.filter(isCookie) : [];

/** The scheme a cookie was set from: https for a secure one or one set over TLS. */
const schemeOf = (cookie: Cookie): "https" | "http" =>
  cookie.secure || cookie.sourceScheme === "Secure" ? "https" : "http";

/** A domain cookie's leading dot. */
const LEADING_DOT = /^\./;

/** The origin a cookie's host stands for, its port when it was set from another. */
const originOf = (cookie: Cookie): string => {
  const scheme = schemeOf(cookie);
  const host = cookie.domain.replace(LEADING_DOT, "");
  const port = cookie.sourcePort;
  const usual = scheme === "https" ? 443 : 80;
  return port && port > 0 && port !== usual
    ? `${scheme}://${host}:${port}`
    : `${scheme}://${host}`;
};

/**
 * `cookie` as `Storage.setCookies` takes it: a domain cookie by its domain,
 * a host-only one by its URL (a domain given makes it a domain cookie), a
 * session cookie with no expiry.
 */
const paramOf = (cookie: Cookie): CookieParam => ({
  name: cookie.name,
  value: cookie.value,
  ...(cookie.domain.startsWith(".")
    ? { domain: cookie.domain }
    : { url: `${originOf(cookie)}${cookie.path}` }),
  path: cookie.path,
  secure: cookie.secure,
  httpOnly: cookie.httpOnly,
  ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
  ...(cookie.session ? {} : { expires: cookie.expires }),
  ...(cookie.priority ? { priority: cookie.priority } : {}),
  ...(cookie.sourceScheme ? { sourceScheme: cookie.sourceScheme } : {}),
  ...(cookie.sourcePort ? { sourcePort: cookie.sourcePort } : {}),
  ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
});

/** A page of the daemon's own on `link`, each origin it opens answered with an empty document. */
const blankPage = async (
  link: CdpLink
): Promise<{
  close: () => Promise<void>;
  open: (origin: string) => Promise<void>;
  session: string;
}> => {
  const { targetId } = await link.call("Target.createTarget", {
    url: "about:blank",
  });
  if (typeof targetId !== "string") {
    throw new Error("The browser made no page to carry its sign-ins on.");
  }
  const session = await link.attach(targetId);
  link.onEvent = (message) => {
    if (
      message.method === "Fetch.requestPaused" &&
      message.sessionId === session
    ) {
      link.post(
        "Fetch.fulfillRequest",
        {
          requestId: message.params?.requestId,
          responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "text/html" }],
          body: "",
        },
        session
      );
    }
  };
  await link.call("Network.enable", {}, session);
  await link.call("Network.setBypassServiceWorker", { bypass: true }, session);
  await link.call("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
  return {
    session,
    open: async (origin) => {
      await link.call("Page.navigate", { url: `${origin}/` }, session);
    },
    close: async () => {
      link.onEvent = () => undefined;
      await link.call("Target.closeTarget", { targetId });
    },
  };
};

const storageId = (origin: string): Json => ({
  securityOrigin: origin,
  isLocalStorage: true,
});

/** Every origin `cookies` name, once each. */
const originsOf = (cookies: Cookie[]): string[] => [
  ...new Set(cookies.map(originOf)),
];

/** The sign-ins of the Chromium whose DevTools answer at `devtools` (`http://127.0.0.1:<port>`). */
export const readSignIns = async (devtools: string): Promise<SignIns> => {
  const link = await CdpLink.open(devtools);
  try {
    const cookies = cookiesOf(await link.call("Storage.getCookies"));
    const page = await blankPage(link);
    const storage: SignIns["storage"] = [];
    try {
      for (const origin of originsOf(cookies)) {
        // biome-ignore lint/performance/noAwaitInLoops: one origin at a time on the one page.
        await page.open(origin);
        // An origin the page did not land on (Chromium upgraded its http
        // to https) has no frame holding its storage key: said, and passed.
        const read = await link
          .call(
            "DOMStorage.getDOMStorageItems",
            { storageId: storageId(origin) },
            page.session
          )
          .catch((error: unknown) => {
            console.info(
              `[browser] ${origin}'s localStorage was not read: ${error instanceof Error ? error.message : String(error)}`
            );
          });
        const entries = read?.entries;
        const items = (Array.isArray(entries) ? entries : []).filter(
          (entry): entry is [string, string] =>
            Array.isArray(entry) &&
            typeof entry[0] === "string" &&
            typeof entry[1] === "string"
        );
        if (items.length > 0) {
          storage.push({ origin, items });
        }
      }
    } finally {
      await page.close();
    }
    return {
      cookies: cookies
        .filter((cookie) => !cookie.partitionKeyOpaque)
        .map(paramOf),
      storage,
    };
  } finally {
    link.close();
  }
};

/** Writes `signIns` into the Chromium whose DevTools answer at `devtools`. */
export const writeSignIns = async (
  devtools: string,
  signIns: SignIns
): Promise<void> => {
  const link = await CdpLink.open(devtools);
  try {
    if (signIns.cookies.length > 0) {
      await link.call("Storage.setCookies", { cookies: signIns.cookies });
    }
    if (signIns.storage.length === 0) {
      return;
    }
    const page = await blankPage(link);
    try {
      for (const { origin, items } of signIns.storage) {
        // biome-ignore lint/performance/noAwaitInLoops: one origin at a time on the one page.
        await page.open(origin);
        for (const [key, value] of items) {
          // biome-ignore lint/performance/noAwaitInLoops: each item on the origin the page holds, in order.
          await link.call(
            "DOMStorage.setDOMStorageItem",
            { storageId: storageId(origin), key, value },
            page.session
          );
        }
      }
    } finally {
      await page.close();
    }
  } finally {
    link.close();
  }
};

/** A cookie's identity: what makes it the one cookie it is. */
const cookieKey = (cookie: Json): string =>
  [
    cookie.name,
    cookie.domain ?? new URL(String(cookie.url)).hostname,
    cookie.path,
    JSON.stringify(cookie.partitionKey ?? null),
  ].join(" ");

/**
 * What of `signIns` the Chromium at `devtools` does not hold, one line per
 * cookie or item, read back as {@link readSignIns} reads: empty when it
 * holds every one.
 */
export const missingSignIns = async (
  devtools: string,
  signIns: SignIns
): Promise<string[]> => {
  const held = await readSignIns(devtools);
  const cookies = new Map(
    held.cookies.map((cookie) => [cookieKey(cookie), cookie.value])
  );
  const missing = signIns.cookies
    .filter((cookie) => cookies.get(cookieKey(cookie)) !== cookie.value)
    .map((cookie) => `the cookie ${cookie.name} (${cookieKey(cookie)})`);
  const items = new Map(
    held.storage.flatMap(({ origin, items: kept }) =>
      kept.map(([key, value]) => [`${origin} ${key}`, value] as const)
    )
  );
  for (const { origin, items: carried } of signIns.storage) {
    for (const [key, value] of carried) {
      if (items.get(`${origin} ${key}`) !== value) {
        missing.push(`${origin}'s localStorage item ${key}`);
      }
    }
  }
  return missing;
};
