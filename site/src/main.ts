import { gsap } from 'gsap';
import { all, one } from './dom';
import { initStage } from './stage';

const stage = initStage(one(document, '[data-stage]'));

// Scenes move only for visitors who have not asked for reduced motion, and the
// setting is followed live if it changes while the page is open.
gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
  stage.setMotion(true);
  return () => stage.setMotion(false);
});

const status = one(document, '[data-status]');

for (const button of all<HTMLButtonElement>(document, '[data-copy]')) {
  const label = one(button, '[data-copy-label]');
  let reset = 0;
  button.addEventListener('click', async () => {
    const command = one(button.parentElement ?? document, '[data-cmd]').textContent.trim();
    await navigator.clipboard.writeText(command);
    button.classList.add('is-copied');
    label.textContent = 'Copied';
    status.textContent = 'Install command copied.';
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      button.classList.remove('is-copied');
      label.textContent = 'Copy';
      status.textContent = '';
    }, 2000);
  });
}
