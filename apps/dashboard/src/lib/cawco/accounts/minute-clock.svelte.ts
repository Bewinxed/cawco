import { MINUTE_MS } from "@cawco/core/time";

/**
 * The clock an account's room is read against (its limit's reset, what it
 * has left), a minute at a time while the component that calls it stands:
 * the account picker's rows, a project's account chip.
 */
export function minuteClock(): { readonly now: number } {
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, MINUTE_MS);
    return () => clearInterval(timer);
  });
  return {
    get now() {
      return now;
    },
  };
}
