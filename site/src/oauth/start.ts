import { readStart, remember } from './handoff.ts';

const title = document.querySelector<HTMLElement>('#title');
const message = document.querySelector<HTMLElement>('#msg');

try {
  const { origin, auth, state } = readStart(location.hash);
  if (message) message.textContent = `Opening ${auth.host}…`;
  remember(state, origin);
  history.replaceState(null, '', location.pathname);
  location.replace(auth.href);
} catch {
  if (title) title.textContent = "This sign-in link isn't valid";
  if (message) message.textContent = 'Start sign-in again from CawCo.';
}
