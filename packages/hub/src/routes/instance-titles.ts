import { accountNameAmong } from "@cawco/core/accounts";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { harnessNamed } from "@cawco/core/harness/kinds";
import { TAB_NAMES_PER_ASK } from "@cawco/core/protocol";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";
import { Elysia, problem, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { contextSizeCalls } from "../session-calls";

/**
 * How many conversations one naming request may ask about. A reader's open tabs
 * are a couple of dozen at the outside; the cap is what keeps a hand-written
 * body from turning a single request into a fleet-wide transcript sweep.
 */
const TITLE_ASK_LIMIT = 64;

/**
 * How many stored entries each window of a conversation's head holds, read
 * to name it: its first turn is almost always among the first few. Ours.
 */
const TITLE_WINDOW = 40;

export const instanceTitleRoutes = ({
  db,
  firstTurnOf,
  handMoveRefusal,
  laws,
  moveByHand,
  nameFromFirstTurn,
  owedCarries,
  owedMoves,
  registry,
  reportedContextOf,
  sessionName,
  storedRecent,
  storedWindow,
  tabNamed,
}: Pick<
  HubContext,
  | "db"
  | "firstTurnOf"
  | "handMoveRefusal"
  | "laws"
  | "moveByHand"
  | "nameFromFirstTurn"
  | "owedCarries"
  | "owedMoves"
  | "registry"
  | "reportedContextOf"
  | "sessionName"
  | "storedRecent"
  | "storedWindow"
  | "tabNamed"
>) =>
  new Elysia()
    // Moves a session to another account of its provider, whole: its
    // conversation is carried into the account's store and resumed there,
    // with no summary. Now when it is at rest, else at its turn's end
    // (`pending` until then). A fork may be moved too: it is the person's
    // choice.
    .post(
      "/api/instances/:id/account",
      { body: t.Object({ accountId: t.String() }) },
      async ({ params, body }) => {
        // A move it owed being carried now goes first: its machine refuses
        // a second carry of the conversation meanwhile, and this one
        // starts from where that one left the row.
        await owedCarries.get(params.id)?.catch(() => undefined);
        const [row] = db.getInstancesByIds([params.id]);
        if (!row) {
          return problem(404, {
            code: "session-not-found",
            detail: "Session not found",
          });
        }
        const account = db.accounts.get(body.accountId);
        if (!account) {
          return problem(404, {
            code: "no-account",
            detail: `There is no account ${body.accountId}.`,
          });
        }
        const why = handMoveRefusal(row, account);
        if (why) {
          return problem(409, { code: "move-refused", detail: why });
        }
        if (row.accountId === account.id) {
          // Back to the account it runs on: a move asked mid-turn is off.
          if (owedMoves.get(row.id)?.to !== undefined) {
            owedMoves.delete(row.id);
          }
          return {
            state: "moved" as const,
            accountId: account.id,
            why: `${sessionName(row)} already runs on ${accountNameAmong(account, db.accounts.list())}.`,
          };
        }
        const moved = await moveByHand(row, account);
        // A person's move, in the words its answer gives them.
        console.info(
          `[accounts] ${"refusal" in moved ? moved.refusal : moved.why}`
        );
        return "refusal" in moved
          ? problem(409, { code: "move-refused", detail: moved.refusal })
          : moved;
      }
    )
    .post("/api/instances/:id/context-size", hidden, ({ params }) =>
      contextSizeCalls({ db, reportedContextOf }).contextSize(params.id)
    )
    // Recent's stored transcripts, as the hub keeps them (stored-recent.ts).
    .get("/api/stored", () => laws.raise(storedRecent.now))
    // What each tab's id names, as the dashboard asks of the tabs it kept
    // from an earlier visit and of an address before it reads them: the
    // session it is read by (itself, a former id's session, a harness key's
    // row, the one row a short id begins, an ask parked under it, a stored
    // conversation a connected machine holds), none, or unknown while the
    // machine it names, or one asked, is away. Never a 404: a tab naming
    // nothing is dropped, not read.
    .post(
      "/api/instances/named",
      {
        body: t.Object({
          ids: t.Array(
            t.Object({
              id: t.String(),
              machine: t.Optional(t.Nullable(t.String())),
            }),
            { maxItems: TAB_NAMES_PER_ASK }
          ),
        }),
      },
      async ({ body }) => {
        const asked = new Map<string, string | null>();
        for (const ask of body.ids) {
          // Bounded by the schema: a reader's tabs, never a sweep. A strip
          // of more is asked in requests of this many (core `TAB_NAMES_PER_ASK`).
          if (ask.id) {
            asked.set(ask.id, ask.machine ?? null);
          }
        }
        return await Promise.all(
          [...asked].map(([id, machine]) => tabNamed(id, machine))
        );
      }
    )
    // What these conversations are called — *whether or not the board still
    // lists them*.
    //
    // The listing is a working board: it drops a session that has not moved in
    // a day. A reader's open tabs are not a board, though — the strip carries
    // whatever they left open, and a tab the listing has aged out had no row to
    // read a name off, so the first server render called it by eight characters
    // of its id and only found the real name once the reader clicked it. The
    // name was never missing; it was filtered out. This answers by id straight
    // off the row, past the cut-off.
    //
    // Each ask is an id, or an id with a stored session's machine/cwd/harness.
    // Cheap first: a name
    // already written down costs one query for the whole batch. Only a row that
    // has never been named at all reaches for its machine, and then only if the
    // machine is connected — and what comes back is written down, so no session
    // is ever read twice for its name.
    .post(
      "/api/instances/titles",
      {
        body: t.Object({
          ids: t.Array(
            t.Union([
              t.String(),
              t.Object({
                id: t.String(),
                machine: t.Optional(t.Nullable(t.String())),
                cwd: t.Optional(t.String()),
                harness: t.Optional(t.String()),
              }),
            ])
          ),
        }),
      },
      async ({ body }) => {
        const asked = new Map<
          string,
          {
            id: string;
            machine?: string;
            cwd?: string;
            harness?: HarnessKind;
          }
        >();
        for (const ask of body.ids) {
          const one =
            typeof ask === "string"
              ? { id: ask }
              : {
                  ...ask,
                  machine: ask.machine ?? undefined,
                  harness: harnessNamed(ask.harness),
                };
          if (!one.id || asked.has(one.id)) {
            continue;
          }
          // Bounded by what a reader can plausibly have open, so a hand-written
          // body cannot turn one request into a fleet-wide transcript sweep.
          if (asked.size >= TITLE_ASK_LIMIT) {
            break;
          }
          asked.set(one.id, one);
        }
        if (asked.size === 0) {
          return [];
        }

        const rows = new Map(
          db
            .getInstancesByIds([...asked.keys()])
            .map((row) => [row.id, row] as const)
        );

        return await Promise.all(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves every field of one supervisor answer (title, model, harness, whether it needs asking again) in one place; splitting it would scatter the fallback order this route depends on.
          [...asked.values()].map(async (ask) => {
            const row = rows.get(ask.id);
            const named = row?.title ?? row?.derivedTitle;
            if (named) {
              return { id: ask.id, title: named };
            }

            // Never named, so ask the machine that stores the conversation. A
            // machine that is not connected leaves the tab to its fallback:
            // nothing here can invent a name nobody has ever written down.
            //
            // Two mutually exclusive cases, never mixed: a hub row is the
            // single authority for its session's key, machine, folder and
            // harness (a row without a key has nothing stored to name); an
            // id without a row is a stored session key, and the ask says
            // where it lives.
            let machineId: string | undefined;
            let sessionKey: string;
            let cwd: string | undefined;
            let harness: HarnessKind | undefined;
            if (row) {
              if (!row.sessionId) {
                return { id: ask.id, title: null };
              }
              ({ machineId } = row);
              sessionKey = row.sessionId;
              cwd = row.cwd || undefined;
              ({ harness } = row);
            } else {
              machineId = ask.machine;
              sessionKey = ask.id;
              cwd = ask.cwd || undefined;
              ({ harness } = ask);
            }
            if (!(machineId && harness && registry.agent(machineId))) {
              return { id: ask.id, title: null };
            }

            // The conversation's head, a window at a time from its start,
            // until a turn that says anything: never the whole of it.
            // Unanswered or refused: no title now and nothing written, so
            // the next render asks again.
            let first: string | undefined;
            for (let start: string | null = null; ;) {
              const window = await storedWindow(
                { machineId, sessionKey, cwd: cwd ?? "", harness },
                { start, limit: TITLE_WINDOW }
              );
              if ("fault" in window) {
                return { id: ask.id, title: null };
              }
              first = firstTurnOf(window.entries);
              if (first || window.newer === null) {
                break;
              }
              start = window.newer;
            }
            if (!first) {
              return { id: ask.id, title: null };
            }

            // Written down on the way past, so the next render of this tab is
            // the cheap path — and so is every other reader's.
            const derived = row
              ? nameFromFirstTurn(row.machineId, row.id, first)
              : deriveTitleFromFirstMessage(first);
            return { id: ask.id, title: derived || null };
          })
        );
      }
    );
