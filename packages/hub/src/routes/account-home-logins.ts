import type {
  HomeCredential,
  HomeLogin,
  HomeStore,
} from "@cawco/core/accounts";
import {
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_READ_HOME_LOGIN,
} from "@cawco/core/accounts/controls";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";
import { SIGNIN_TIMEOUT_MS } from "../login-moves";
import type { MachineReadsContext } from "../machine-reads";
import { awayStatus } from "../machine-reads";

import { unreachable } from "../unreachable";

/**
 * One of a machine's own stores a credential is moved out of, in the order
 * the apps' generated schema has it.
 */
const homeStore = t.UnionEnum([
  "claude",
  "pi",
  "opencode",
] as const satisfies readonly HomeStore[]);

export const accountHomeLoginRoutes = (
  ctx: Pick<
    HubContext,
    | "awayWords"
    | "homeCredentialOf"
    | "moveResults"
    | "movingLogins"
    | "readAgent"
    | "startMove"
    | keyof MachineReadsContext
  >
) => {
  const {
    awayWords,
    homeCredentialOf,
    moveResults,
    movingLogins,
    readAgent,
    startMove,
  } = ctx;
  return (
    new Elysia()
      // What a machine's own stores hold that CawCo can move into accounts:
      // `~/.claude`'s login, and each credential in pi's and OpenCode's own
      // `auth.json` (a Claude subscription's OAuth there is never listed).
      .get(
        "/api/accounts/home-credentials",
        { query: t.Object({ machineId: t.String() }) },
        async ({ query, set }) => {
          const [claude, others] = await Promise.all([
            readAgent(
              query.machineId,
              CONTROL_READ_HOME_LOGIN,
              [],
              SIGNIN_TIMEOUT_MS,
              "claude"
            ),
            readAgent(
              query.machineId,
              CONTROL_READ_HOME_CREDENTIALS,
              [],
              SIGNIN_TIMEOUT_MS
            ),
          ]);
          switch (others.kind) {
            case "unanswered":
              if (others.reason === "dead") {
                return awayStatus(ctx, set, query.machineId);
              }
              return problem(503, {
                code: "machine-away",
                detail: awayWords(query.machineId, others),
              });
            case "answered":
              if (!others.value.ok) {
                return problem(422, {
                  code: "home-logins-unread",
                  detail: others.value.error ?? "The machine gave no reason.",
                });
              }
              break;
            default:
              throw unreachable(others);
          }
          // `null` is Claude Code's answer that it holds no login to read; a
          // read it did not answer is said, never shown as no login.
          let home: HomeLogin | null;
          switch (claude.kind) {
            case "unanswered":
              if (claude.reason === "dead") {
                return awayStatus(ctx, set, query.machineId);
              }
              return problem(503, {
                code: "machine-away",
                detail: awayWords(query.machineId, claude),
              });
            case "answered":
              home = claude.value.ok
                ? (claude.value.result as HomeLogin)
                : null;
              break;
            default:
              throw unreachable(claude);
          }
          return {
            claude: home,
            credentials: others.value.result as HomeCredential[],
          };
        }
      )
      // Moves one credential out of a machine's own store into CawCo, once:
      // into the account of the identity it is (made now when there is none),
      // in that account's store on the machine, so it works in CawCo without
      // a second sign-in. `store` `claude` is `~/.claude`'s login; `pi` and
      // `opencode` name their own `auth.json`, and `provider` the entry there.
      // The sessions that run from it go on running from it, and the machine
      // moves it at the first moment all of them are at rest; the answer says
      // how many run from it now, and GET says how it came out.
      .post(
        "/api/accounts/move-login",
        {
          body: t.Object({
            machineId: t.String(),
            store: homeStore,
            provider: t.Optional(t.String()),
          }),
        },
        async ({ body, status }) => {
          const { machineId, store } = body;
          const found = await homeCredentialOf(machineId, store, body.provider);
          if ("error" in found) {
            return problem(found.status, {
              code: "home-login-refused",
              detail: found.error,
            });
          }
          const started = await startMove(machineId, store, found);
          return "error" in started
            ? problem(started.status, {
                code: "home-login-refused",
                detail: started.error,
              })
            : status(202, started);
        }
      )
      .get("/api/accounts/move-login", () => ({
        moving: movingLogins().map((move) => ({
          machineId: move.machineId,
          store: move.store,
          storeProvider: move.storeProvider,
          provider: move.provider,
          accountId: move.accountId,
          since: move.since,
        })),
        done: [...moveResults.values()],
      }))
  );
};
