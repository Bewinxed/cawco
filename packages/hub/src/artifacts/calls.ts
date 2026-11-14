/**
 * What the artifact routes do beyond one service call, as a function: the
 * routes answer through them, and a session's artifact tools call them
 * directly (the tools' own checks of what they pass are {@link artifactTools}).
 */

import { INTERACTIONS, type StoryOp } from "@cawco/core/stage";
import { ElysiaStatus, problem, t } from "elysia";
import type { Operation } from "rfc6902";
import type { Static, TSchema } from "typebox";
import Value from "typebox/value";
import { z } from "zod";
import {
  askBody,
  closeQuestionBody,
  commentsFields,
  componentBody,
  createBody,
  readFields,
  replyBody,
  resolveBody,
  SHAPES,
  settleBody,
  statementsBody,
  titleBody,
  updateBody,
} from "./bodies";
import type { StateAsk } from "./component";
import { COMPONENT_EXAMPLE } from "./component";
import type { Artifacts } from "./service";
import type {
  CanvasChange,
  PageChange,
  SheetChange,
  SkeletonElement,
} from "./shapes";
import { isStateStory } from "./tools";

/** A read's frame, from its JSON; refused with the shape when it is none. */
const STATE_ASK = z.object({
  interaction: z.enum(INTERACTIONS).optional(),
  scheme: z.enum(["light", "dark"]).optional(),
  story: z.string().refine(isStateStory),
  width: z.number().positive().optional(),
});
/** A preview's or a page's state: the query or hash its own link for that state adds. */
const STATE_LINK = /^[?#]\S+$/u;
/** A read's `state`, from its JSON: a component's frame, or a preview's or a page's state link; refused with the shape when it is neither. */
const stateOf = (text: string) => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = null;
  }
  if (typeof value === "string" && STATE_LINK.test(value)) {
    const link: { link: string } = { link: value };
    return link;
  }
  const read = STATE_ASK.safeParse(value);
  if (!read.success) {
    return problem(400, {
      code: "artifact-read-state-shape",
      detail: SHAPES.read,
    });
  }
  const state: { state: StateAsk } = { state: read.data };
  return state;
};

/** The one change a sheet's write names. */
export const sheetChangeOf = (body: {
  args?: Extract<SheetChange, { args: unknown }>["args"];
  story?: StoryOp;
}) => {
  if (body.args !== undefined && body.story === undefined) {
    const args: SheetChange = { args: body.args };
    return args;
  }
  if (body.story !== undefined && body.args === undefined) {
    const story: SheetChange = { story: body.story };
    return story;
  }
  return problem(400, {
    code: "artifact-sheet-change-one",
    detail: "A sheet takes exactly one of args or story.",
  });
};

/** The one change an update names (a decision page's statements and a component canvas each have their own route): a page's html or patch, a canvas's elements, delete or mermaid. */
const changeOf = (body: {
  delete?: string[];
  elements?: SkeletonElement[];
  html?: string;
  mermaid?: string;
  patch?: unknown[];
}) => {
  const named = (
    ["html", "patch", "elements", "delete", "mermaid"] as const
  ).filter((key) => body[key] !== undefined);
  return named.length === 1
    ? oneChange(body)
    : problem(400, {
        code: "artifact-update-change-one",
        detail:
          "Pass exactly one of html or patch (a page), or elements, delete or mermaid (a canvas); a decision page's statements, an ask, and a component's args, story, edges, group or dials go through their own routes.",
      });
};

/** The change a body naming exactly one ({@link changeOf}) names. */
const oneChange = (body: {
  delete?: string[];
  elements?: SkeletonElement[];
  html?: string;
  mermaid?: string;
  patch?: unknown[];
}): Exclude<PageChange, { statements: string }> | CanvasChange => {
  if (body.html !== undefined) {
    return { html: body.html };
  }
  if (body.patch !== undefined) {
    return { patch: body.patch as Operation[] };
  }
  if (body.elements !== undefined) {
    return { elements: body.elements };
  }
  return body.delete === undefined
    ? { mermaid: body.mermaid ?? "" }
    : { delete: body.delete };
};

/** An artifact's read as its route asks it (`artifact_read`): its state's JSON read first, refused with the read's shape when it is none. */
export const readAsked = async (
  artifacts: Artifacts,
  instanceId: string,
  id: string,
  query: {
    detail?: "summary" | "story";
    png?: boolean;
    render?: boolean;
    save?: string;
    since?: number;
    state?: string;
    story?: string;
    verify?: boolean;
    width?: number;
  }
) => {
  const state = query.state ? stateOf(query.state) : undefined;
  if (state instanceof ElysiaStatus) {
    return state;
  }
  return await artifacts.read(instanceId, id, query.since, query.png === true, {
    ...(query.detail ? { detail: query.detail } : {}),
    ...(query.story ? { story: query.story } : {}),
    ...(state ?? {}),
    ...(query.save ? { save: query.save } : {}),
    ...(query.render ? { render: true } : {}),
    ...(query.verify ? { verify: true } : {}),
    ...(query.width === undefined ? {} : { width: query.width }),
  });
};

/** A create, as `POST /api/instances/:id/artifacts` answers it. */
export const createArtifact = async (
  artifacts: Artifacts,
  instanceId: string,
  body: Static<typeof createBody>
) => {
  const { kind } = body;
  if (kind === "sheet") {
    return problem(400, {
      code: "artifact-kind-sheet",
      detail: `A component's states are a component canvas now: kind "component", with does and ask. Example: ${COMPONENT_EXAMPLE}.`,
    });
  }
  if (body.draft && kind !== "canvas") {
    return problem(400, {
      code: "artifact-draft-not-canvas",
      detail: "Only a canvas is a draft.",
    });
  }
  return await artifacts.create(instanceId, { ...body, kind });
};

/** A page's or a canvas's update, as `PATCH /api/instances/:id/artifacts/:artifact` answers it. */
export const updateArtifact = async (
  artifacts: Artifacts,
  instanceId: string,
  artifact: string,
  body: Static<typeof updateBody>
) => {
  const change = changeOf(body);
  return change instanceof ElysiaStatus
    ? change
    : await artifacts.update(instanceId, artifact, change);
};

/** A component canvas's change by its session, as `PATCH …/:artifact/component` answers it. */
export const updateComponent = async (
  artifacts: Artifacts,
  instanceId: string,
  artifact: string,
  body: Static<typeof componentBody>
) => {
  const { edges, group, dials, args, story } = body;
  const canvas = [edges, group, dials].some((one) => one !== undefined);
  if (canvas && (args !== undefined || story !== undefined)) {
    return problem(400, {
      code: "artifact-component-change-mixed",
      detail:
        "edges, group and dials change the canvas itself: send them apart from a states file's args or story.",
    });
  }
  if (canvas) {
    return await artifacts.canvasUpdate(instanceId, artifact, {
      edges,
      group,
      dials,
    });
  }
  const change = sheetChangeOf({ args, story });
  return change instanceof ElysiaStatus
    ? change
    : await artifacts.sheetUpdate(instanceId, artifact, change);
};

/**
 * What a session's artifact tools call, for the session `instanceId`: each
 * the same function its route calls, after the check of what the tool hands
 * it against the shape that route's body or query takes (bodies.ts), so a
 * call is held to the route's bounds whichever door it comes by. A call that
 * does not fit is refused as the route refused it, with the tool's shape.
 */
export const artifactTools = (artifacts: Artifacts, instanceId: string) => {
  /** `asked` as `schema` takes it, or the refusal with `shape`. */
  const shaped = <S extends TSchema>(
    schema: S,
    shape: string,
    asked: unknown
  ) =>
    Value.Check(schema, asked)
      ? asked
      : problem(422, { code: "artifact-shape", detail: shape });
  return {
    status: (cursor: string | undefined) =>
      Promise.resolve(artifacts.status(instanceId, { cursor })),
    /** Its newest artifact's id, or the problem. */
    newest: () => {
      const listed = artifacts.list(instanceId);
      return listed instanceof ElysiaStatus ? listed : listed[0]?.id;
    },
    create: async (input: unknown) => {
      const body = shaped(createBody, SHAPES.create, input);
      return body instanceof ElysiaStatus
        ? body
        : await createArtifact(artifacts, instanceId, body);
    },
    read: async (id: string, query: Parameters<typeof readAsked>[3]) => {
      const fits = shaped(readFields, SHAPES.read, {
        story: query.story,
        state: query.state,
        save: query.save,
      });
      return fits instanceof ElysiaStatus
        ? fits
        : await readAsked(artifacts, instanceId, id, query);
    },
    update: async (id: string, change: unknown) => {
      const body = shaped(updateBody, SHAPES.update, change);
      return body instanceof ElysiaStatus
        ? body
        : await updateArtifact(artifacts, instanceId, id, body);
    },
    updateComponent: async (id: string, change: unknown) => {
      const body = shaped(componentBody, SHAPES.update, change);
      return body instanceof ElysiaStatus
        ? body
        : await updateComponent(artifacts, instanceId, id, body);
    },
    askUpdate: (id: string, ask: string) => {
      const body = shaped(askBody, SHAPES.update, { ask });
      return Promise.resolve(
        body instanceof ElysiaStatus
          ? body
          : artifacts.askUpdate(instanceId, id, body.ask)
      );
    },
    titleUpdate: (id: string, title: string) => {
      const body = shaped(titleBody, SHAPES.update, { title });
      return Promise.resolve(
        body instanceof ElysiaStatus
          ? body
          : artifacts.titleUpdate(instanceId, id, body.title)
      );
    },
    revise: async (id: string, statements: string) => {
      const body = shaped(statementsBody, SHAPES.update, { statements });
      return body instanceof ElysiaStatus
        ? body
        : await artifacts.revise(instanceId, id, body.statements);
    },
    settle: async (page: string, picked: unknown) => {
      const body = shaped(settleBody, SHAPES.update, picked);
      return body instanceof ElysiaStatus
        ? body
        : await artifacts.settle(instanceId, page, body);
    },
    closeQuestion: (closing: unknown) => {
      const body = shaped(closeQuestionBody, SHAPES.update, closing);
      return Promise.resolve(
        body instanceof ElysiaStatus
          ? body
          : artifacts.closeQuestion(instanceId, body)
      );
    },
    designMap: (ask: Parameters<Artifacts["designMap"]>[1]) =>
      artifacts.designMap(instanceId, ask),
    show: (id: string) =>
      artifacts.show(instanceId, id, "agent", { top: true }),
    browse: (id: string) => artifacts.browse(instanceId, id),
    promote: (id: string) => artifacts.promote(instanceId, id),
    remove: (id: string) => artifacts.remove(instanceId, id, "agent"),
    commentRead: (asked: {
      artifact?: string;
      filter: "open" | "resolved" | "all";
      since?: string;
    }) => {
      const fits = shaped(t.Object(commentsFields), SHAPES.read, asked);
      return Promise.resolve(
        fits instanceof ElysiaStatus
          ? fits
          : artifacts.commentRead(instanceId, {
              ...asked,
              // The session reads them itself: what it reads counts as heard.
              bySession: true,
            })
      );
    },
    commentReply: (pin: string, reply: unknown) => {
      const body = shaped(replyBody, SHAPES.update, reply);
      return Promise.resolve(
        body instanceof ElysiaStatus
          ? body
          : artifacts.commentReply(instanceId, pin, body)
      );
    },
    commentResolve: (pin: string, resolve: unknown) => {
      const body = shaped(resolveBody, SHAPES.update, resolve);
      return Promise.resolve(
        body instanceof ElysiaStatus
          ? body
          : artifacts.commentResolve(instanceId, pin, body.text)
      );
    },
  };
};
