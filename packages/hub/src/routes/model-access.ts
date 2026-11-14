/**
 * The hub's model access: the OpenRouter connection and its OAuth exchange, Jev's model route, and the composer's suggestion.
 */

import { generateCodeChallenge, generateCodeVerifier } from "@cawco/auth/pkce";
import { CAPABILITY_KINDS } from "@cawco/core/suggest";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";
import { jevAccess } from "../jev";

import { suggest } from "../suggest";

export const modelAccessRoutes = ({
  db,
  jevView,
}: Pick<HubContext, "db" | "jevView">) => {
  /**
   * The PKCE verifier of the OpenRouter connect in progress. One at a time: a
   * new connect replaces it, and a finished exchange spends it.
   */
  let openrouterVerifier: string | undefined;
  return (
    new Elysia()
      // ── OpenRouter (OAuth PKCE; the key never leaves the hub) ─────────────
      .get("/api/openrouter", () => {
        const connection = db.getOpenRouterConnection();
        return {
          connected: connection !== undefined,
          connectedAt: connection?.connectedAt.getTime() ?? null,
        };
      })
      // ── Jev: its route, the TypeSafe key, suggestions ─────────────────────
      // The key is set from the owner's terminal (`cawco jev set-key`) or
      // Settings, and no route answers it: only its last four characters.
      .get("/api/jev", () => jevView())
      .put(
        "/api/jev/typesafe-key",
        { body: t.Object({ key: t.String({ minLength: 1 }) }) },
        ({ body }) => {
          const key = body.key.trim();
          if (!key) {
            return problem(400, {
              code: "typesafe-key-empty-nothing",
              detail: "The TypeSafe key is empty; nothing was saved.",
            });
          }
          db.setTypesafeKey(key);
          console.log("[jev] TypeSafe key set: Jev takes route=typesafe");
          return jevView();
        }
      )
      .delete("/api/jev/typesafe-key", () => {
        db.setTypesafeKey(null);
        const view = jevView();
        console.log(
          `[jev] TypeSafe key removed: Jev takes ${view.route ? `route=${view.route}` : "no route (off)"}`
        );
        return view;
      })
      .put(
        "/api/jev/suggest",
        { body: t.Object({ enabled: t.Boolean() }) },
        ({ body }) => {
          if (!jevAccess(db)) {
            return problem(409, {
              code: "jev-off-set-typesafe",
              detail:
                "Jev is off. Set a TypeSafe key or connect OpenRouter in Settings first.",
            });
          }
          db.setSuggestWhileTyping(body.enabled);
          return { ok: true };
        }
      )
      .post(
        "/api/suggest",
        {
          body: t.Object({
            text: t.String(),
            candidates: t.Array(
              t.Object({
                id: t.String(),
                kind: t.UnionEnum(CAPABILITY_KINDS),
                name: t.String(),
                description: t.String(),
              })
            ),
          }),
        },
        async ({ body }) => {
          const access = jevAccess(db);
          if (!access) {
            return problem(409, {
              code: "jev-off-set-typesafe",
              detail:
                "Jev is off. Set a TypeSafe key or connect OpenRouter in Settings first.",
            });
          }
          const result = await suggest(db, access, body.text, body.candidates);
          if ("error" in result) {
            return problem(502, {
              code: "suggest-failed",
              detail: result.error,
            });
          }
          return result;
        }
      )
      .post(
        "/api/openrouter/connect",
        { body: t.Object({ callbackUrl: t.String() }) },
        ({ body }) => {
          openrouterVerifier = generateCodeVerifier();
          const auth = new URL("https://openrouter.ai/auth");
          auth.searchParams.set("callback_url", body.callbackUrl);
          auth.searchParams.set(
            "code_challenge",
            generateCodeChallenge(openrouterVerifier)
          );
          auth.searchParams.set("code_challenge_method", "S256");
          return { authUrl: auth.toString() };
        }
      )
      .post(
        "/api/openrouter/exchange",
        { body: t.Object({ code: t.String() }) },
        async ({ body }) => {
          if (!openrouterVerifier) {
            return problem(409, {
              code: "no-openrouter-connect-progress",
              detail:
                "No OpenRouter connect is in progress on this hub. Start again from Settings.",
            });
          }
          const response = await fetch(
            "https://openrouter.ai/api/v1/auth/keys",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: body.code,
                code_verifier: openrouterVerifier,
                code_challenge_method: "S256",
              }),
            }
          );
          if (!response.ok) {
            return problem(502, {
              code: "openrouter-exchange-failed",
              detail: `OpenRouter answered ${response.status}: ${(await response.text()) || response.statusText}`,
            });
          }
          const { key } = (await response.json()) as { key: string };
          db.setOpenRouterConnection(key);
          openrouterVerifier = undefined;
          return { ok: true };
        }
      )
      .delete("/api/openrouter", () => {
        db.clearOpenRouterConnection();
        return { ok: true };
      })
  );
};
