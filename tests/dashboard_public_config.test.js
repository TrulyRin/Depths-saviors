const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'dashboard.js'), 'utf8');
const panels = new Map();
const sandbox = {
  console,
  window: {},
  document: {
    getElementById(id) {
      if (!panels.has(id)) panels.set(id, { innerHTML: '', style: {}, children: [], appendChild(child) { this.children.push(child); }, classList: { add() {}, remove() {} } });
      return panels.get(id);
    },
    createElement() { return { innerHTML: '', style: {}, className: '', querySelector() { return { value: '' }; } }; },
    querySelectorAll() { return []; },
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  location: { hostname: 'example.test' },
  navigator: {},
  AbortSignal: { timeout() { return undefined; } },
  setTimeout,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
};
vm.runInNewContext(source, sandbox, { filename: 'dashboard.js' });

const DS = sandbox.window.DS;
DS.currentGuild = { id: '1540063801410584668' };
DS.channels = [];
DS.roles = [];
const requestedEndpoints = [];
DS.fetchAPI = async endpoint => {
  requestedEndpoints.push(endpoint);
  return ({
  theme: { name: 'aurora' },
  guided_setup: { pack: 'community', theme: 'aurora' },
  standard_antialt: { enabled: true },
  ticket_config: { transcript_retention_days: 7, allow_reopen: true },
  automod_config: { blocked_terms: [], max_mentions: 4 },
  pilot_slowmode_config: { window_seconds: 10, thresholds: [] },
  faq_entries: { "where is zako's build": 'Check the archive.' },
});
};

(async () => {
  await DS.renderPanel('public_setup');
  const html = panels.get('content-public_setup').innerHTML;
  assert.match(html, /Server Setup/);
  assert.match(html, /Save Public Setup/);
  assert.match(html, /Community/);
  assert.match(html, /Preview Missing Resources/);
  assert.match(html, /Apply Additive Setup/);
  requestedEndpoints.length = 0;
  await DS.renderPanel('faq');
  assert.deepEqual(requestedEndpoints, ['/guild/1540063801410584668/public-config']);
  assert.match(panels.get('content-faq').innerHTML, /Pilot FAQ/);
})().catch(error => { console.error(error); process.exitCode = 1; });
