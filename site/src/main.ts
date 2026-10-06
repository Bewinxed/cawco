import { gsap } from 'gsap';
import { initChannel } from './channel';
import { all, one } from './dom';
import { initStage } from './stage';

const stage = initStage(one(document, '[data-stage]'));
initChannel(one(document, '[data-channel]'));

// Scenes move only for visitors who have not asked for reduced motion, and the
// setting is followed live if it changes while the page is open.
gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
  stage.setMotion(true);
  return () => stage.setMotion(false);
});

// Further down the page Caw peers over the edge of a block, and his clip plays
// once, when a good part of that block has scrolled into view. The clip itself
// is CSS (see `.caw` in styles.css); this only says when.
const arrivals = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const clip of all(entry.target, '.caw[data-wait]')) clip.classList.add('is-playing');
      arrivals.unobserve(entry.target);
    }
  },
  { threshold: 0.35 },
);
for (const block of all(document, '[data-arrives]')) arrivals.observe(block);

/** What a copy button says in each outcome, and how long it says it. */
const OUTCOMES = {
  copied: { label: 'Copied', status: 'Install command copied.', hold: 2000 },
  // Held longer: this one asks the visitor to do something, so it needs reading.
  blocked: {
    label: 'Not copied',
    status: 'Copying is blocked here. Select the command instead.',
    hold: 6000,
  },
} as const;

const status = one(document, '[data-status]');

for (const button of all<HTMLButtonElement>(document, '[data-copy]')) {
  const box = button.closest<HTMLElement>('.cmd');
  if (!box) throw new Error('A copy button sits outside a command box.');
  const label = one(button, '[data-copy-label]');
  let reset = 0;

  const show = (outcome: keyof typeof OUTCOMES) => {
    const { label: text, status: line, hold } = OUTCOMES[outcome];
    box.dataset.state = outcome;
    label.textContent = text;
    status.textContent = line;
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      delete box.dataset.state;
      label.textContent = 'Copy';
      status.textContent = '';
    }, hold);
  };

  button.addEventListener('click', async () => {
    const command = one(box, '[data-cmd]').textContent.trim();
    try {
      // Throws where the Clipboard API is absent, rejects where it is refused.
      await navigator.clipboard.writeText(command);
    } catch {
      show('blocked');
      return;
    }
    show('copied');
  });
}
