import { IMAGE_PROVIDERS } from "@cawco/core/image-generation";
import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import type { MachineReadsContext } from "../machine-reads";
import { mediaCalls } from "../session-calls";

export const instanceMediaRoutes = (
  ctx: Pick<
    HubContext,
    "callAgent" | "db" | "forgePosts" | "sessionWorkspace"
  > &
    MachineReadsContext
) => {
  const { forgePost, generateImage } = mediaCalls(ctx);
  return (
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
        ({ params, body, request, server }) => {
          server?.timeout(request, 0);
          return forgePost(params.id, body);
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
        ({ params, body, request, server }) => {
          server?.timeout(request, 0);
          return generateImage(params.id, body);
        }
      )
  );
};
