/**
 * Threads: conversations with Caw in a project (WORDS.md: thread). A thread
 * and its messages are rows here; your message is handed to the project's
 * lead as an event (caw.ts) while Caw is on, and filed as unread by anyone
 * (`delivery: off`) while it is off: nothing wakes a model then. Caw answers
 * with `thread_reply`, a lead-only tool (roles.ts).
 */
import type { InstanceRow } from "@cawco/core";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { CawEvent, CawWake } from "./caw";
import type {
  DbShape,
  ThreadMessageRow,
  ThreadRow,
  ThreadSummaryRow,
} from "./db";

/** The longest message either side may write. */
const BODY_MAX = 20_000;
/** A thread's title, cut from its first message when you give none. */
const TITLE_MAX = 80;
const WHITESPACE = /\s+/g;

export interface ThreadsDeps {
  readonly db: Pick<
    DbShape,
    | "addThreadMessage"
    | "createThread"
    | "project"
    | "projectThread"
    | "projectThreads"
    | "setThreadDelivery"
    | "threadMessages"
  >;
  /** Every dashboard hears a message as it is written or its delivery settles. */
  readonly publish: (projectId: string, message: ThreadMessageRow) => void;
  /** Hands an event to the project's lead (caw.ts `wake`). */
  readonly wake: (projectId: string, event: CawEvent) => Promise<CawWake>;
}

/** Why a thread call was refused, with the status the route answers. */
export class ThreadRefusal extends Error {
  readonly code: 400 | 404;
  constructor(code: 400 | 404, message: string) {
    super(message);
    this.code = code;
  }
}

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A message as given: trimmed, and refused when empty or too long. */
const bodyOf = (body: string): string => {
  const text = body.trim();
  if (!text) {
    throw new ThreadRefusal(400, "Write something to send.");
  }
  if (text.length > BODY_MAX) {
    throw new ThreadRefusal(
      400,
      `A message holds at most ${BODY_MAX} characters; this one has ${text.length}.`
    );
  }
  return text;
};

/** A title from the first line of a message, cut at a word. */
const titleFrom = (body: string): string => {
  const line = (body.split("\n").find((each) => each.trim()) ?? body)
    .replace(WHITESPACE, " ")
    .trim();
  if (line.length <= TITLE_MAX) {
    return line;
  }
  const cut = line.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

export const createThreads = (deps: ThreadsDeps) => {
  const { db } = deps;

  const projectOf = (projectId: string) => {
    const project = db.project(projectId);
    if (!project) {
      throw new ThreadRefusal(404, `No project ${projectId}.`);
    }
    return project;
  };

  const threadOf = (projectId: string, threadId: string): ThreadRow => {
    projectOf(projectId);
    const thread = db.projectThread(threadId);
    if (!thread || thread.projectId !== projectId) {
      throw new ThreadRefusal(
        404,
        `No thread ${threadId} in this project. thread_list names them.`
      );
    }
    return thread;
  };

  /**
   * Your message: filed, then handed to Caw. With Caw off it is filed as
   * read by nobody and nothing wakes; with Caw on its delivery settles
   * after the answer goes back, as starting Caw can take a while.
   */
  const yours = (
    projectId: string,
    thread: ThreadRow,
    body: string
  ): ThreadMessageRow => {
    const on = projectOf(projectId).caw;
    const message = db.addThreadMessage({
      id: crypto.randomUUID(),
      threadId: thread.id,
      author: "you",
      body,
      delivery: on ? null : "off",
    });
    deps.publish(projectId, message);
    if (on) {
      deps
        .wake(projectId, {
          kind: "thread",
          threadId: thread.id,
          title: thread.title,
          body,
        })
        .then((woke) =>
          db.setThreadDelivery(message.id, woke === "off" ? "off" : "sent")
        )
        .catch((error: unknown) =>
          db.setThreadDelivery(message.id, "failed", said(error))
        )
        .then((settled) => {
          if (settled) {
            deps.publish(projectId, settled);
          }
        });
    }
    return message;
  };

  return {
    list(projectId: string): ThreadSummaryRow[] {
      projectOf(projectId);
      return db.projectThreads(projectId);
    },

    read(
      projectId: string,
      threadId: string
    ): { thread: ThreadRow; messages: ThreadMessageRow[] } {
      const thread = threadOf(projectId, threadId);
      return { thread, messages: db.threadMessages(thread.id) };
    },

    /** A new thread, opened by your first message. */
    create(
      projectId: string,
      asked: { body: string; title?: string }
    ): { thread: ThreadRow; message: ThreadMessageRow } {
      projectOf(projectId);
      const body = bodyOf(asked.body);
      const title = asked.title?.trim()
        ? titleFrom(asked.title)
        : titleFrom(body);
      const thread = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title,
      });
      return { thread, message: yours(projectId, thread, body) };
    },

    /** Your message in a thread. */
    post(projectId: string, threadId: string, body: string): ThreadMessageRow {
      return yours(projectId, threadOf(projectId, threadId), bodyOf(body));
    },

    /** Caw's answer in a thread, from its lead session. */
    reply(
      projectId: string,
      threadId: string,
      body: string,
      lead: InstanceRow
    ): ThreadMessageRow {
      const thread = threadOf(projectId, threadId);
      const message = db.addThreadMessage({
        id: crypto.randomUUID(),
        threadId: thread.id,
        author: "caw",
        body: bodyOf(body),
        instanceId: lead.id,
      });
      deps.publish(projectId, message);
      return message;
    },
  };
};

export type Threads = ReturnType<typeof createThreads>;

/** A tool's answer, as the MCP result its handler resolves to. */
const answered = (data: unknown) =>
  Promise.resolve({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });

/** The thread tools on the `cawco` server: the lead's (roles.ts), for its own project. */
export const threadTools = (
  context: { actor: InstanceRow; threads: Threads } | undefined
) => {
  const scope = () => {
    if (!context) {
      throw new Error("Discovery cannot execute tools");
    }
    const { projectId } = context.actor;
    if (!projectId) {
      throw new Error("This session leads no project, so it has no threads.");
    }
    return { projectId, threads: context.threads, actor: context.actor };
  };
  const thread = () =>
    z
      .string()
      .describe("The thread's id, as thread_list or the event names it.");
  return [
    tool(
      "thread_list",
      "List your project's threads, newest first: each one's id, title, how many messages it has, and its newest message.",
      {},
      () => {
        const { projectId, threads } = scope();
        return answered(
          threads.list(projectId).map((each) => ({
            id: each.id,
            title: each.title,
            messages: each.count,
            last: each.last
              ? { author: each.last.author, body: each.last.body }
              : null,
          }))
        );
      }
    ),
    tool(
      "thread_read",
      "Read one of your project's threads: every message, oldest first, each marked as the operator's (you) or yours (caw).",
      { thread: thread() },
      ({ thread: id }) => {
        const { projectId, threads } = scope();
        const { thread: read, messages } = threads.read(projectId, id);
        return answered({
          id: read.id,
          title: read.title,
          messages: messages.map((message) => ({
            author: message.author,
            body: message.body,
            at: message.createdAt,
          })),
        });
      }
    ),
    tool(
      "thread_reply",
      "Answer the operator in one of your project's threads. They read threads, not your transcript, so this is how they hear you. Plain, short markdown.",
      {
        thread: thread(),
        body: z.string().describe("What you say."),
      },
      ({ thread: id, body }) => {
        const { projectId, threads, actor } = scope();
        const message = threads.reply(projectId, id, body, actor);
        return answered({ id: message.id, thread: id, sent: true });
      }
    ),
  ];
};

/** Every thread tool, by name. */
export const THREAD_TOOLS: ReadonlySet<string> = new Set(
  threadTools(undefined).map((entry) => entry.name)
);

const answer = (error: unknown) =>
  error instanceof ThreadRefusal
    ? status(error.code, error.message)
    : status(500, said(error));

/** The dashboard's routes for a project's threads. */
export const threadRoutes = (threads: Threads) =>
  new Elysia()
    .get("/api/projects/:id/threads", ({ params }) => {
      try {
        return threads.list(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads",
      {
        body: t.Object({
          body: t.String(),
          title: t.Optional(t.String()),
        }),
      },
      ({ params, body }) => {
        try {
          return threads.create(params.id, body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .get("/api/projects/:id/threads/:threadId", ({ params }) => {
      try {
        return threads.read(params.id, params.threadId);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads/:threadId/messages",
      { body: t.Object({ body: t.String() }) },
      ({ params, body }) => {
        try {
          return threads.post(params.id, params.threadId, body.body);
        } catch (error) {
          return answer(error);
        }
      }
    );
