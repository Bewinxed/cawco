/**
 * The picks on a previewed page, as the hub keeps them (the hub's
 * `choices.ts`): read and changed by the page's path inside the preview, and
 * sent to the session as one message. Every call throws the hub's own words
 * when it refuses.
 */
import type { ChoiceOp, PreviewChoices } from "@cawco/core";
import { hubFailure } from "../hub-read";

const base = (instanceId: string) =>
  `/api/instances/${encodeURIComponent(instanceId)}/preview/choices`;

async function answer<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await hubFailure(response)).detail);
  }
  return (await response.json()) as T;
}

export async function readChoices(
  instanceId: string,
  path: string
): Promise<PreviewChoices> {
  return answer(
    await fetch(`${base(instanceId)}?path=${encodeURIComponent(path)}`)
  );
}

export async function writeChoice(
  instanceId: string,
  path: string,
  op: ChoiceOp
): Promise<PreviewChoices> {
  return answer(
    await fetch(base(instanceId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, ...op }),
    })
  );
}

/** One message to the session that made the page; `uuid` keeps a retry from sending twice. */
export async function sendChoices(
  canvasId: string,
  uuid: string,
  text?: string
): Promise<{ instanceId: string; state: string; uuid: string }> {
  return answer(
    await fetch(`/api/choices/${encodeURIComponent(canvasId)}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uuid, ...(text ? { text } : {}) }),
    })
  );
}
