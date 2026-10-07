import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Elysia, t } from "elysia";
import { DB_PATH } from "./config";
import { hidden } from "./hidden";

/**
 * What the Apple app's MetricKit hands over: its diagnostic payloads (hangs,
 * crashes, CPU exceptions), so a hang on a phone reports its own call stack.
 * Each diagnostic is kept whole, as MetricKit wrote it, one file each beside
 * the hub's database, with what does not depend on the machine (the app's
 * version and build, the OS, the kind, when) beside it for the list. A
 * payload carries no user data beyond what MetricKit itself includes: device
 * model, OS, app version, and the stacks of the app's own threads.
 * `scripts/apple-diagnostics.sh <id>` symbolicates one on the Mac.
 */

const DIR = resolve(dirname(DB_PATH), "diagnostics", "apple");

const KINDS = {
  hangDiagnostics: "hang",
  crashDiagnostics: "crash",
  cpuExceptionDiagnostics: "cpu",
} as const;

type Kind = (typeof KINDS)[keyof typeof KINDS];

interface Stored {
  appVersion: string;
  build: string;
  device: string | null;
  /** MetricKit's diagnostic, whole. */
  diagnostic: Record<string, unknown>;
  /** The payload's window, as MetricKit dated it. */
  from: string | null;
  id: string;
  kind: Kind;
  os: string;
  /** When the hub received it, ms epoch. */
  receivedAt: number;
  to: string | null;
}

interface Frame {
  address?: number;
  binaryName?: string;
  binaryUUID?: string;
  offsetIntoBinaryTextSegment?: number;
  sampleCount?: number;
  subFrames?: Frame[];
}

/**
 * MetricKit's call-stack tree as text: each thread, then its frames down
 * their callers, binary name and offset (what `atos` and xcsym resolve),
 * with the address, the image's UUID and how many samples saw it.
 */
export function stackText(diagnostic: Record<string, unknown>): string {
  const tree = diagnostic.callStackTree as
    | {
        callStacks?: {
          threadAttributed?: boolean;
          callStackRootFrames?: Frame[];
        }[];
      }
    | undefined;
  const lines: string[] = [];
  const walk = (frame: Frame, depth: number) => {
    const offset = frame.offsetIntoBinaryTextSegment ?? 0;
    lines.push(
      `${"  ".repeat(depth)}${frame.binaryName ?? "?"} +${offset} (0x${(frame.address ?? 0).toString(16)}) [${frame.binaryUUID ?? "?"}] ×${frame.sampleCount ?? 1}`
    );
    for (const child of frame.subFrames ?? []) {
      walk(child, depth + 1);
    }
  };
  (tree?.callStacks ?? []).forEach((stack, index) => {
    lines.push(
      `Thread ${index}${stack.threadAttributed ? " (attributed)" : ""}`
    );
    for (const frame of stack.callStackRootFrames ?? []) {
      walk(frame, 1);
    }
  });
  return lines.join("\n");
}

const summary = ({ diagnostic, ...rest }: Stored) => {
  const meta = (diagnostic.diagnosticMetaData ?? {}) as Record<string, unknown>;
  return {
    ...rest,
    hangDuration: meta.hangDuration ?? null,
    exceptionType: meta.exceptionType ?? null,
    signal: meta.signal ?? null,
  };
};

async function readAll(): Promise<Stored[]> {
  let names: string[];
  try {
    names = await readdir(DIR);
  } catch {
    return [];
  }
  const read = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          return JSON.parse(await readFile(join(DIR, name), "utf8")) as Stored;
        } catch {
          return null;
        }
      })
  );
  return read
    .filter((each): each is Stored => each !== null)
    .sort((a, b) => b.receivedAt - a.receivedAt);
}

const ID = /^[a-f0-9]{16}$/;

interface Upload {
  appVersion: string;
  build: string;
  device?: string;
  os: string;
  payload: Record<string, unknown>;
}

const dated = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** One record per diagnostic in a payload, named by its own content's hash. */
function recordsOf(upload: Upload): Stored[] {
  const receivedAt = Date.now();
  return (Object.entries(KINDS) as [keyof typeof KINDS, Kind][]).flatMap(
    ([key, kind]) => {
      const list = upload.payload[key];
      return (Array.isArray(list) ? list : [])
        .filter(
          (each): each is Record<string, unknown> =>
            each !== null && typeof each === "object"
        )
        .map((diagnostic) => ({
          id: createHash("sha256")
            .update(JSON.stringify(diagnostic))
            .digest("hex")
            .slice(0, 16),
          kind,
          appVersion: upload.appVersion,
          build: upload.build,
          os: upload.os,
          device: upload.device ?? null,
          receivedAt,
          from: dated(upload.payload.timeStampBegin),
          to: dated(upload.payload.timeStampEnd),
          diagnostic,
        }));
    }
  );
}

export const appleDiagnosticsRoutes = () =>
  new Elysia()
    .post(
      "/api/diagnostics/apple",
      {
        ...hidden,
        body: t.Object({
          appVersion: t.String({ maxLength: 40 }),
          build: t.String({ maxLength: 40 }),
          os: t.String({ maxLength: 80 }),
          device: t.Optional(t.String({ maxLength: 80 })),
          payload: t.Record(t.String(), t.Unknown()),
        }),
      },
      async ({ body }) => {
        await mkdir(DIR, { recursive: true });
        const records = recordsOf(body);
        // The same diagnostic sent again (a retry, a past payload) is kept once.
        const written = await Promise.all(
          records.map(async (record) => {
            const file = Bun.file(join(DIR, `${record.id}.json`));
            if (await file.exists()) {
              return false;
            }
            await writeFile(
              join(DIR, `${record.id}.json`),
              JSON.stringify(record)
            );
            return true;
          })
        );
        return { ok: true, stored: written.filter(Boolean).length };
      }
    )
    .get(
      "/api/diagnostics/apple",
      {
        ...hidden,
        query: t.Object({
          kind: t.Optional(
            t.Union([t.Literal("hang"), t.Literal("crash"), t.Literal("cpu")])
          ),
        }),
      },
      async ({ query }) =>
        (await readAll())
          .filter((each) => !query.kind || each.kind === query.kind)
          .map(summary)
    )
    .get(
      "/api/diagnostics/apple/:id",
      { ...hidden, query: t.Object({ format: t.Optional(t.Literal("text")) }) },
      async ({ params, query, status }) => {
        if (!ID.test(params.id)) {
          return status(404, "No such diagnostic.");
        }
        const file = Bun.file(join(DIR, `${params.id}.json`));
        if (!(await file.exists())) {
          return status(404, "No such diagnostic.");
        }
        const record = (await file.json()) as Stored;
        const stack = stackText(record.diagnostic);
        if (query.format === "text") {
          const head = `${record.kind} · CawCo ${record.appVersion} (${record.build}) · ${record.os}${record.device ? ` · ${record.device}` : ""}`;
          return new Response(`${head}\n\n${stack}\n`, {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return { ...summary(record), diagnostic: record.diagnostic, stack };
      }
    );
