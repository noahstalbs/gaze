// Demo page logic (plain JS — extension CSP forbids inline scripts).
let clicks = 0;
const log = document.getElementById('click-log');

document.getElementById('targets').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  clicks += 1;
  log.textContent = `Click ${clicks}: "${btn.textContent}" at ${new Date().toLocaleTimeString()}`;
});

document.getElementById('targets').addEventListener('contextmenu', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  e.preventDefault();
  clicks += 1;
  log.textContent = `Right-click ${clicks}: "${btn.textContent}" at ${new Date().toLocaleTimeString()}`;
});

// A long alternating scroll run with inline links as extra click targets.
const filler = document.getElementById('filler');
for (let i = 1; i <= 30; i++) {
  const div = document.createElement('div');
  div.className = 'filler';
  div.innerHTML =
    `<strong>Section ${i} of 30.</strong> Dwell your gaze near the bottom of ` +
    'the window to scroll down, near the top to scroll back up. ' +
    `<a href="#top">A link target</a> for good measure.`;
  filler.appendChild(div);
}
