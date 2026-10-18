/**
 * Jev as a scratch fleet's hub reaches it on the TypeSafe route
 * (`CAWCO_TYPESAFE_URL`, hub jev.ts), as scripts/probe-fleet-watch.ts
 * stands one in: every request kept whole, every question answered by its
 * type (https://docs.typesafe.ai/api.md). A noul is answered no (yes when it
 * asks about a candidate whose description the call's prompt says), a score its
 * lowest level, a choice `none` when it offers one, else its first option.
 * A starters call (hub jev-placement.ts `jevStarters`: its state holds
 * `shown` and `repository`) is answered by `starters`, which picks each
 * question's choice and probability, and may add answers of its own.
 *
 * Jev is on once the hub holds a TypeSafe key: {@link jevOn}.
 */

/** One question as the hub asked it. */
export interface JevAsked {
  criteria?: unknown;
  instructions: unknown;
  type: "noul" | "choice" | "score";
}

/** One request the hub sent: when, its state, and its questions by id. */
export interface JevCall {
  at: number;
  questions: Record<string, JevAsked>;
  state: Record<string, unknown>;
}

/** A starters call's answer to one question: the option chosen and its probability. */
export interface StarterPick {
  choice: string;
  p: number;
}

export interface JevMock {
  calls: JevCall[];
  /** The starters calls, oldest first; for one project when named. */
  starterCalls: (projectName?: string) => JevCall[];
  stop: () => void;
  /** What `CAWCO_TYPESAFE_URL` names. */
  url: string;
}

export const isStartersCall = (call: JevCall): boolean =>
  "shown" in call.state && "repository" in call.state;

const options = (asked: JevAsked): string[] =>
  asked.criteria && typeof asked.criteria === "object"
    ? Object.keys(asked.criteria as Record<string, unknown>)
    : [];

/** A choice answer as the API writes one. */
const choiceAnswer = (asked: JevAsked, pick: StarterPick) => {
  const rest = options(asked).filter((option) => option !== pick.choice);
  const share = rest.length > 0 ? (1 - pick.p) / rest.length : 0;
  return {
    type: "choice",
    choice: pick.choice,
    confidence: pick.p,
    probabilities: Object.fromEntries([
      [pick.choice, pick.p],
      ...rest.map((option) => [option, share]),
    ]),
  };
};

/**
 * The starters answer when none is given: each question's first ask that is
 * not `none`, at 0.9.
 */
export const firstAsk = (call: JevCall): Record<string, StarterPick> =>
  Object.fromEntries(
    Object.entries(call.questions).map(([id, asked]) => [
      id,
      {
        choice: options(asked).find((option) => option !== "none") ?? "none",
        p: 0.9,
      },
    ])
  );

/** A description's closing stop, which a prompt saying the same task leaves off. */
const CLOSING_STOP = /[.!]\s*$/;

/**
 * A noul's answer: yes (0.9) when it asks whether a candidate (a composer
 * suggestion's skill, tool or MCP server: hub suggest.ts) is made for the
 * task the call's prompt describes, and the prompt says what the
 * candidate's description says; no (0.05) otherwise.
 */
const candidateFits = (call: JevCall, asked: JevAsked): number => {
  const { candidate } = (asked.instructions ?? {}) as {
    candidate?: { description?: unknown };
  };
  const { prompt } = call.state;
  const said =
    typeof candidate?.description === "string"
      ? candidate.description.replace(CLOSING_STOP, "").trim().toLowerCase()
      : "";
  return said !== "" &&
    typeof prompt === "string" &&
    prompt.toLowerCase().includes(said)
    ? 0.9
    : 0.05;
};

export const jevMock = (
  starters: (call: JevCall) => Record<string, StarterPick> = firstAsk
): JevMock => {
  const calls: JevCall[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        questions: Record<string, JevAsked>;
        state: Record<string, unknown>;
      };
      const call: JevCall = {
        at: Date.now(),
        state: body.state,
        questions: body.questions,
      };
      calls.push(call);
      const picks = isStartersCall(call) ? starters(call) : {};
      const answers: Record<string, unknown> = {};
      for (const [id, asked] of Object.entries(body.questions)) {
        if (asked.type === "noul") {
          answers[id] = { type: "noul", noul: candidateFits(call, asked) };
        } else if (asked.type === "score") {
          answers[id] = {
            type: "score",
            score: 0,
            confidence: 1,
            legend: { "0": (asked.criteria as unknown[])[0] },
            probabilities: { "0": 1 },
          };
        } else {
          const pick = picks[id] ?? {
            choice: options(asked).includes("none")
              ? "none"
              : (options(asked)[0] ?? "none"),
            p: 0.9,
          };
          answers[id] = choiceAnswer(asked, pick);
        }
      }
      // Answers the hub never asked for: a starters pick on an id no
      // question had (the grounding gate's case).
      for (const [id, pick] of Object.entries(picks)) {
        if (!(id in answers)) {
          answers[id] = {
            type: "choice",
            choice: pick.choice,
            confidence: pick.p,
            probabilities: { [pick.choice]: pick.p },
          };
        }
      }
      return Response.json({
        answers,
        model: "jev-probe",
        usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
      });
    },
  });
  return {
    calls,
    url: `http://127.0.0.1:${server.port}/systemone`,
    starterCalls: (projectName) =>
      calls.filter(
        (call) =>
          isStartersCall(call) &&
          (projectName === undefined ||
            (call.state.project as { name?: string } | undefined)?.name ===
              projectName)
      ),
    stop: () => {
      server.stop(true);
    },
  };
};

/** Jev on: the hub holds a TypeSafe key, as Settings saves one. */
export const jevOn = async (base: string): Promise<void> => {
  const saved = await fetch(`${base}/api/jev/typesafe-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: `ts-probe-${crypto.randomUUID()}` }),
  });
  if (!saved.ok) {
    throw new Error(`the TypeSafe key was refused: ${await saved.text()}`);
  }
};
