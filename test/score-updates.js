const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

async function run() {
  const pending = [], installed = [], status = {};
  const context = vm.createContext({
    document: { querySelector: () => status },
    live: { date: 'first' }, isoDate: value => value,
    fetchApi: () => new Promise(resolve => pending.push(resolve)),
    installLiveGames: payload => installed.push(payload.season),
  });
  vm.runInContext(source.slice(source.indexOf('let scoreboardRequest ='), source.indexOf('function summaryTabs')), context);
  const first = context.loadScoreboard();
  context.live.date = 'second';
  const second = context.loadScoreboard();
  const response = (season, stale = false) => ({ ok:true, json:async () => ({ season }), headers:{ get:() => stale ? 'stale' : null } });
  pending[1](response('second')); await second;
  pending[0](response('first')); await first;
  assert.deepEqual(installed, ['second'], 'a late date response must not overwrite the current scoreboard');
  const cached = context.loadScoreboard(); pending[2](response('saved', true)); await cached;
  assert.match(status.textContent, /Offline.*saved scores/, 'cached scores must be labeled offline');

  const gameCenter = { innerHTML: '' };
  const summaryContext = vm.createContext({
    selected: { away: 'BOS', home: 'NYK', as: null, hs: null, status: 'UPCOMING', detail: '7:00 PM' },
    teams: { BOS: { name: 'Celtics' }, NYK: { name: 'Knicks' } }, escapeHtml: String, logo: () => '',
    renderGameLeaders() {}, renderBoxScore: () => '', renderTeamStats: () => '', renderPlayByPlay: () => '',
    document: { querySelector: () => gameCenter, querySelectorAll: () => [] }
  });
  vm.runInContext(source.slice(source.indexOf('function summaryTabs('), source.indexOf('function renderGameLeaders(')), summaryContext);
  const summary = { game: { away: { abbreviation: 'BOS', score: 0 }, home: { abbreviation: 'NYK', score: 0 } } };
  summaryContext.summaryTabs(summary);
  assert.doesNotMatch(gameCenter.innerHTML, /null|undefined/);
  assert.match(gameCenter.innerHTML, /Waiting for game to start/);
  assert.equal((gameCenter.innerHTML.match(/&mdash;/g) || []).length, 4, 'pregame scoreboard and totals must use dashes');
  Object.assign(summaryContext.selected, { status: 'LIVE', as: 0, hs: 5 });
  summaryContext.summaryTabs(summary);
  assert.match(gameCenter.innerHTML, /class="">0<\/span>/, 'a real zero score must remain visible');
  assert.doesNotMatch(gameCenter.innerHTML, /Waiting for game to start/);

  vm.runInContext(source.slice(source.indexOf('const teamLogoPath ='), source.indexOf('const logo=')), context);
  for (const code of 'ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS NO NY GS SA UTAH WSH PHO'.split(' ')) {
    const file = vm.runInContext(`teamLogoPath('${code}')`, context);
    const bytes = fs.readFileSync(path.join(__dirname, '../public', file));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${code} has a bundled logo`);
  }
  console.log('✓ Score request ordering, offline labels, and all team logos verified');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
