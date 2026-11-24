/**
 * The notifications ask, put up as a toast as soon as the dashboard loads
 * in a browser that was never asked (person.svelte.ts `askStands`), on any
 * page of the app, before anything needs the person. The hub sends an
 * alert to this tab as a desktop notification only once this browser
 * allows them (presence.ts, hub notifications.ts `deskTab`); else it goes
 * to the phone. It stands until it is answered: Allow, or Not now, which
 * this browser keeps; the presence menu still offers Allow after.
 *
 * One house toast (#lib/platform/toasts) by one id: each change (a press
 * under way, a refusal, the tick) puts it again with its new props, and it
 * changes in place. Swiping it away answers nothing, so it can't be.
 */
import { untrack } from "svelte";
import { toast } from "#lib/platform/toasts.js";
import NotifyAsk from "./NotifyAsk.svelte";
import {
  allowHere,
  askAtLoad,
  askStands,
  onPhone,
  person,
  skipHere,
} from "./person.svelte";

/** The toast's one id: every change puts it again in place. */
const NOTIFY_ASK = "cawco-notify-ask";

/** Puts the ask up while it stands, changes it as it changes, and takes it down once answered. */
export function startNotifyAsk(): () => void {
  return $effect.root(() => {
    let up = false;
    $effect(() => {
      if (!askStands()) {
        if (up) {
          untrack(() => toast.dismiss(NOTIFY_ASK));
          up = false;
        }
        return;
      }
      // Its own press's answer only: a press in the presence menu is
      // answered there.
      const own = person.asked !== null;
      const props = {
        ask: person.asked ?? askAtLoad(),
        phone: onPhone(),
        pending: own && person.pending === "allow",
        refusal: own ? person.refusal : null,
        done: own && person.ticked,
        // Called in the press itself, so the browser's prompt keeps its
        // user activation.
        onallow: () => allowHere("ask"),
        onskip: skipHere,
      };
      untrack(() =>
        toast.custom(NotifyAsk, {
          id: NOTIFY_ASK,
          duration: Number.POSITIVE_INFINITY,
          dismissable: false,
          componentProps: props,
          // svelte-sonner measures a toast again only when its title or
          // description changes; a custom toast draws neither, so its
          // state stands here to have its new height measured.
          description: [props.done, props.pending, props.refusal?.title].join(
            "|"
          ),
        })
      );
      up = true;
    });
  });
}
