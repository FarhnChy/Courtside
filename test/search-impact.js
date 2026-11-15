const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', querySelectorAll: () => [], addEventListener() {} });
    return nodes.get(id);
  };
  const pending = [], timers = [];
  const context = vm.createContext({
    document: { querySelector: node }, escapeHtml: String, Date, Map, AbortController,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
    fetch: () => new Promise(resolve => pending.push(resolve))
  });
  vm.runInContext(source.slice(source.indexOf('let searchTimer ='), source.indexOf('async function renderFavoriteDashboard()')), context);
  const input = node('#globalSearchInput');
  const response = name => ({ ok: true, json: async () => ({ results: [{ kind: 'player', name, subtitle: 'NBA' }] }) });
  input.oninput({ target: { value: 'older' } }); timers.pop()();
  input.oninput({ target: { value: 'newer' } }); timers.pop()();
  pending[1](response('New result'));
  await new Promise(resolve => setImmediate(resolve));
  pending[0](response('Old result'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(node('#searchResults').innerHTML, /New result/);
  assert.doesNotMatch(node('#searchResults').innerHTML, /Old result/);
  input.oninput({ target: { value: 'newer' } });
  assert.equal(pending.length, 2, 'a repeated query should use the browser cache');
  input.oninput({ target: { value: 'x' } });
  assert.match(node('#searchResults').innerHTML, /2 to 60/);

  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  let release, directoryCalls = 0;
  const serverContext = vm.createContext({ Date, Map, Promise, espn: {
    teamsList: () => { directoryCalls++; return new Promise(resolve => { release = resolve; }); },
    roster: async (_, options) => {
      assert.equal(options.includeCoaches, false, 'player search must not wait for coach enrichment');
      return { team: { displayName: 'Boston' }, players: [{ id: '1', name: 'Test Player', position: 'G' }] };
    },
    scoreboard: async () => ({ games: [] })
  }, finance: { freeAgents: async () => ({ players: [] }) } });
  vm.runInContext('let searchCache = null, searchPending = null;\n' + server.slice(server.indexOf('async function searchableDirectory()'), server.indexOf('async function routeRequest(')), serverContext);
  const first = serverContext.searchableDirectory(), second = serverContext.searchableDirectory();
  assert.equal(directoryCalls, 1, 'concurrent searches must share directory loading');
  release({ teams: [{ id: '1', displayName: 'Boston', abbreviation: 'BOS' }] });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  await serverContext.searchableDirectory();
  assert.equal(directoryCalls, 1, 'warm directory should not refetch feeds');

  const impact = fs.readFileSync(path.join(__dirname, '../public/fantasy-impact.js'), 'utf8');
  const impactNodes = new Map();
  const impactNode = id => {
    if (!impactNodes.has(id)) impactNodes.set(id, { value: id === '#impactSearch' ? '' : 'all', innerHTML: '', textContent: '', addEventListener() {}, querySelectorAll: () => [] });
    return impactNodes.get(id);
  };
  const impactContext = vm.createContext({ document: { querySelector: impactNode }, escapeHtml: String, Date, Map, Set,
    fetch: async url => ({ ok: true, json: async () => url.includes('/injuries') ? { teams: [
      { id: '1', displayName: 'Boston', abbreviation: 'BOS', injuries: [{ player: 'Questionable Player', status: 'Day-To-Day', position: 'G' }, { player: 'Out Player', status: 'Out', position: 'G' }] },
      { id: '2', displayName: 'Miami', abbreviation: 'MIA', injuries: [{ player: 'Other Player', status: 'Out', position: 'F' }] }
    ] } : { days: [], source: 'Fixture', retrievedAt: new Date().toISOString() } })
  });
  // Expose only render for controlled filter changes; keep the real initial load.
  vm.runInContext(impact.replace('  load();', '  globalThis.renderImpact = render;\n  load();'), impactContext);
  await new Promise(resolve => setImmediate(resolve));
  const board = impactNode('#impactBoard');
  assert.ok(board.innerHTML.indexOf('<h2>Out Player') < board.innerHTML.indexOf('<h2>Questionable Player'));
  impactNode('#impactStatus').value = 'questionable';
  impactContext.renderImpact();
  assert.match(board.innerHTML, /Questionable Player/);
  assert.doesNotMatch(board.innerHTML, /<h2>Out Player/);
  impactNode('#impactTeam').value = '2';
  impactContext.renderImpact();
  assert.match(board.innerHTML, /No players match/);
  assert.match(impactNode('#impactCount').textContent, /0 of 3/);
  console.log('Search request ordering, caching, shared loads, and impact filters verified');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
