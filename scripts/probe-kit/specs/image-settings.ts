/**
 * The fleet's image default (hub `image_settings`, `GET`/`PUT
 * /api/image-settings`) and what a `generate_image` call runs on with it
 * (core `effectiveImageChoice`, which the hub's generate-image route puts
 * on the request it sends the machine), on an in-process hub over a
 * scratch database:
 *
 * - a. No row: ChatGPT on its own model, today's behaviour; a call that
 *   names nothing runs on chatgpt with no model said.
 * - b. A model on a provider with one (antigravity), a model the Gemini API
 *   doesn't offer, a provider there is none of: each refused in words, the
 *   setting unchanged.
 * - c. Gemini API on gemini-3-pro-image: kept, read back.
 * - d. With it set: a call naming nothing runs on it; one naming chatgpt
 *   runs on chatgpt with no model; one naming gemini-api runs on the
 *   setting's model; one naming a model runs on that model.
 *
 *   bun scripts/probe-kit/run.ts image-settings
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HubClient } from "../../../packages/agent/src/hub-client";
import { effectiveImageChoice } from "../../../packages/core/src/image-generation";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import { answerText, type HubAsk, handled } from "../hub";
import type { Kit, Spec } from "../kit";

export default {
  group: "The hub and machines",
  name: "image-settings",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const { check } = kit;
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "image-settings-")
    );
    try {
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(
        join(scratch, "hub", "hub.db"),
        join(scratch, "home")
      );
      const call = async (
        body?: Parameters<HubClient["api"]["image-settings"]["put"]>[0]
      ) => {
        const request: HubAsk = body
          ? (client) => client.api["image-settings"].put(body)
          : (client) => client.api["image-settings"].get();
        const answer = await request(handled((r) => hub.handle(r)));
        return { status: answer.status, text: answerText(answer) };
      };

      const unset = await call();
      check(
        "a. no row: chatgpt on its own model",
        unset.status === 200 &&
          unset.text === JSON.stringify({ provider: "chatgpt", model: null }),
        unset.text
      );
      check(
        "a. a call that names nothing runs on chatgpt, no model said",
        JSON.stringify(effectiveImageChoice({}, db.imageSettings())) ===
          JSON.stringify({ provider: "chatgpt" })
      );

      const oneModel = await call({
        provider: "antigravity",
        model: "other",
      });
      const unknown = await call({
        provider: "gemini-api",
        model: "nope",
      });
      const none = await call({ provider: "dall-e" });
      check(
        "b. a model on antigravity, an unknown Gemini model, no such provider: refused in words",
        oneModel.status === 400 &&
          oneModel.text ===
            imageGenerationWords.settingsNoModelChoice(
              "antigravity",
              "gemini-3.1-flash-image"
            ) &&
          unknown.status === 400 &&
          unknown.text.startsWith(
            imageGenerationWords
              .settingsUnknownModel("gemini-api", "nope", [])
              .split(";")[0] ?? "-"
          ) &&
          none.status === 400,
        JSON.stringify({ oneModel, unknown, none })
      );
      check(
        "b. the setting is unchanged",
        (await call()).text ===
          JSON.stringify({ provider: "chatgpt", model: null })
      );

      const set = await call({
        provider: "gemini-api",
        model: "gemini-3-pro-image",
      });
      const read = await call();
      check(
        "c. gemini-api on gemini-3-pro-image: kept and read back",
        set.status === 200 &&
          read.text ===
            JSON.stringify({
              provider: "gemini-api",
              model: "gemini-3-pro-image",
            }),
        JSON.stringify({ set, read })
      );

      const settings = db.imageSettings();
      const runs = {
        nothing: effectiveImageChoice({}, settings),
        chatgpt: effectiveImageChoice({ provider: "chatgpt" }, settings),
        gemini: effectiveImageChoice({ provider: "gemini-api" }, settings),
        model: effectiveImageChoice(
          { model: "gemini-3.1-flash-image" },
          settings
        ),
      };
      kit.note(`d: ${JSON.stringify(runs)}`);
      check(
        "d. naming nothing: the setting; chatgpt named: chatgpt, no model; gemini-api named: the setting's model; a model named: that model",
        JSON.stringify(runs) ===
          JSON.stringify({
            nothing: { provider: "gemini-api", model: "gemini-3-pro-image" },
            chatgpt: { provider: "chatgpt" },
            gemini: { provider: "gemini-api", model: "gemini-3-pro-image" },
            model: { provider: "gemini-api", model: "gemini-3.1-flash-image" },
          }),
        JSON.stringify(runs)
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
