import { forget, hubReturn, isTrusted, RETURN_AFTER_MS, recall, trust } from './handoff.ts';

const page = document.querySelector<HTMLElement>('.handback');
const text = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page has no #${id}.`);
  return element;
};
const title = text('title');
const message = text('msg');
const target = text('target');
const hub = text('hub');
const note = text('note');
const go = text('go') as HTMLButtonElement;

const say = (state: string, heading: string, body: string): void => {
  if (page) page.dataset.state = state;
  title.textContent = heading;
  message.textContent = body;
};

const answer = new URLSearchParams(location.search);
// The code is read once and taken out of the address bar and history at once.
history.replaceState(null, '', location.pathname);
const state = answer.get('state');
const origin = recall(state);

if (answer.get('error')) {
  say(
    'stopped',
    "Sign-in wasn't completed",
    `The provider didn't finish the sign-in (${answer.get('error')}). Start it again from CawCo.`,
  );
} else if (!(answer.get('code') && state && origin)) {
  say(
    'stopped',
    "This sign-in can't continue",
    'It expired, or you started it on another device. Start it again from CawCo.',
  );
} else {
  hub.textContent = origin;
  target.hidden = false;
  const forward = (): void => {
    forget(state);
    location.assign(hubReturn(origin, answer).href);
  };
  // Asking is for a hub this browser has not approved. It protects against a
  // link that would send the code to someone else's hub.
  const ask = (): void => {
    say('ask', 'Finish signing in', 'You approved access. Send it back to your hub to finish.');
    go.textContent = 'Continue to your hub';
    note.textContent =
      'Only continue if you just started this sign-in from your own CawCo. This hub is then remembered in this browser, so the next sign-in continues on its own.';
    go.onclick = () => {
      trust(origin);
      forward();
    };
  };
  if (isTrusted(origin)) {
    say('returning', 'Signed in', 'Returning to your hub…');
    go.textContent = 'Cancel';
    note.textContent = '';
    const timer = setTimeout(forward, RETURN_AFTER_MS);
    go.onclick = () => {
      clearTimeout(timer);
      ask();
    };
  } else {
    ask();
  }
}
