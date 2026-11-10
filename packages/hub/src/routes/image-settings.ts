/**
 * Image generation's settings.
 */
import {
  IMAGE_PROVIDER_MODELS,
  type ImageSettings,
  imageProviderOf,
  offersModelChoice,
} from "@cawco/core/image-generation";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";

export const imageSettingRoutes = ({ db }: Pick<HubContext, "db">) =>
  new Elysia()
    // ── image default (core ImageSettings) ────────────────────────────────
    // The provider and model a generate_image call that names no provider
    // goes to; with no row, ChatGPT on its own model.
    .get("/api/image-settings", (): ImageSettings => db.imageSettings())
    .put(
      "/api/image-settings",
      {
        body: t.Object({
          // One of core's IMAGE_PROVIDERS, checked below in words.
          provider: t.String(),
          model: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
      ({ body }) => {
        const provider = imageProviderOf(body.provider);
        if (!provider) {
          return problem(400, {
            code: "no-such-provider",
            detail: imageGenerationWords.noSuchProvider(body.provider),
          });
        }
        const model = body.model?.trim() || null;
        const models = IMAGE_PROVIDER_MODELS[provider];
        if (model && !offersModelChoice(provider)) {
          return problem(400, {
            code: "settings-no-model-choice",
            detail: imageGenerationWords.settingsNoModelChoice(
              provider,
              models[0]
            ),
          });
        }
        if (model && !models.includes(model)) {
          return problem(400, {
            code: "settings-unknown-model",
            detail: imageGenerationWords.settingsUnknownModel(provider, model, [
              ...models,
            ]),
          });
        }
        const chosen: ImageSettings = { provider, model };
        db.setImageSettings(chosen);
        console.log(
          `[images] default: ${provider}${model ? ` on ${model}` : ""}`
        );
        return chosen;
      }
    );
