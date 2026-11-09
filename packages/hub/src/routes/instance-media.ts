import { readForgeAsk } from "@cawco/core/forge-post";
import type { GeneratedImage } from "@cawco/core/image-generation";
import {
  effectiveImageChoice,
  GENERATE_IMAGE,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_PROVIDERS,
  imageProviderOf,
} from "@cawco/core/image-generation";
import { secondsOf } from "@cawco/core/time";
import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";
import { unreachable } from "../unreachable";

export const instanceMediaRoutes = ({
  callAgent,
  db,
  forgePosts,
  sessionWorkspace,
}: Pick<HubContext, "callAgent" | "db" | "forgePosts" | "sessionWorkspace">) =>
  new Elysia()
    // A session's forge_post (forge-posts.ts): what it says is the
    // tool's answer; a write that did not go is a refusal in its words.
    .post(
      "/api/instances/:id/forge-post",
      {
        ...hidden,
        body: t.Object({
          repo: t.Optional(t.String({ minLength: 1 })),
          write: t.Any(),
        }),
      },
      async ({ params, body, status, request, server }) => {
        const [row] = db.listedInstancesByIds([params.id]);
        const write = readForgeAsk({ repo: "-", write: body.write })?.write;
        if (!(row && write)) {
          return status(
            row ? 400 : 404,
            row ? "forge_post takes one write." : "Unknown calling session."
          );
        }
        server?.timeout(request, 0);
        const answer = await forgePosts.post(row, {
          write,
          ...(body.repo ? { repo: body.repo } : {}),
        });
        return answer.ok
          ? answer.text
          : refusal(422, "forge-post-refused", answer.text);
      }
    )
    .post(
      "/api/instances/:id/generate-image",
      {
        body: t.Object({
          prompt: t.String(),
          output_path: t.String(),
          reference_images: t.Optional(t.Array(t.String())),
          size: t.Optional(t.String()),
          quality: t.Optional(
            t.Union([
              t.Literal("auto"),
              t.Literal("low"),
              t.Literal("medium"),
              t.Literal("high"),
            ])
          ),
          provider: t.Optional(t.UnionEnum(IMAGE_PROVIDERS)),
          model: t.Optional(t.String()),
        }),
      },
      async ({ params, body, request, server }) => {
        const [row] = db.listedInstancesByIds([params.id]);
        if (!row) {
          return refusal(
            404,
            "unknown-calling-session",
            "Unknown calling session."
          );
        }
        server?.timeout(request, 0);
        // The provider the call names wins; else the fleet's default,
        // which with nothing set is ChatGPT on its own model.
        const { provider: named, model, ...asked } = body;
        const provider = named ? imageProviderOf(named) : undefined;
        const chosen = effectiveImageChoice(
          {
            ...(provider ? { provider } : {}),
            ...(model ? { model } : {}),
          },
          db.imageSettings()
        );
        const answer = await callAgent(
          row.machineId,
          GENERATE_IMAGE,
          // Its boundary, when it runs in one: the output lands in its clone or
          // $TMPDIR alone, and its references are read from those and its
          // project's folder alone.
          [
            row.id,
            row.cwd,
            { ...asked, ...chosen },
            sessionWorkspace(row) ?? null,
            row.projectId ?? null,
          ],
          IMAGE_GENERATION_TIMEOUT_MS + 30_000
        );
        switch (answer.kind) {
          case "unanswered":
            return answer.reason === "dead"
              ? refusal(
                  503,
                  "sessions-machine-offline-image",
                  "The session's machine is offline; image generation was not started."
                )
              : refusal(
                  504,
                  "image-generation-did-not",
                  `Image generation did not finish within ${secondsOf(answer.after)} s. Check the output path before retrying; do not submit a duplicate automatically.`
                );
          case "answered":
            return answer.value.ok
              ? (answer.value.result as GeneratedImage)
              : refusal(
                  422,
                  "image-not-generated",
                  answer.value.error ?? "Image generation failed."
                );
          default:
            throw unreachable(answer);
        }
      }
    );
