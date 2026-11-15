const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, '../public/fantasy-analysis.js'), 'utf8');
  vm.runInContext(source, context);
  const analysis = context.CourtsideFantasyAnalysis;
  const now = new Date('2026-11-15T17:00:00Z');
  const values = { PTS: '20', REB: '5', AST: '4', STL: '1', BLK: '1', TO: '2', GP: '10', MIN: '30' };
  assert.equal(analysis.points(values), 36);
  assert.equal(analysis.points({ ...values, TO: undefined, TOV: '2' }), 36);
  for (const missing of ['-', '', null, undefined]) assert.equal(analysis.points({ ...values, BLK: missing }), null);
  assert.equal(analysis.points({ ...values, REB: -1 }), null);
  const row = { season: '2026-27', team: 'BOS', values };
  const production = analysis.production([row], now);
  assert.equal(production.points, 36);
  assert.equal(production.minutes, 30);
  assert.equal(analysis.baseline(production, 3), 108);
  assert.equal(analysis.baseline(production, 0), 0);
  assert.equal(analysis.baseline(production, null), null);
  assert.equal(analysis.production([{ ...row, season: '2025-26' }], now).points, null);
  assert.equal(analysis.production([{ ...row, category: 'Regular Season Totals' }], now).points, null);
  assert.equal(analysis.production([{ ...row, values: { ...values, GP: '0' } }], now).points, null);
  const traded = [row, { ...row, team: 'MIA', values: { ...values, GP: '5', PTS: '32', MIN: '36' } }];
  assert.equal(analysis.production(traded, now).points, 40);
  assert.equal(analysis.production(traded, now).minutes, 32);
  assert.equal(analysis.production([...traded, { ...row, team: 'TOT' }], now).points, 36, 'combined row must not be double-counted');
  const schedule = { days: [{ games: [
    { home: { abbreviation: 'BOS' }, away: { abbreviation: 'NYK' }, status: { state: 'pre' } },
    { home: { abbreviation: 'BOS' }, away: { abbreviation: 'MIA' }, status: { state: 'post' } }
  ] }] };
  assert.equal(analysis.scheduledGames(schedule, 'BOS'), 1);
  assert.equal(analysis.scheduledGames(null, 'BOS'), null);
  assert.equal(analysis.scheduledGames(schedule, null), null);

  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', isConnected: true, open: false, showModal() { this.open = true; } });
    return nodes.get(selector);
  };
  const ui = vm.createContext({ CourtsideFantasyAnalysis: analysis, escapeHtml: String,
    document: { querySelector: node }, teams: {}, updateCompareTray() {}, fetch: async url => ({ ok: true, json: async () => url.includes('/schedule') ? schedule : { history: [row] } }) });
  vm.runInContext('const comparisonState = []; let comparisonRequest = 0;\n' + app.slice(app.indexOf('function fantasyProductionMarkup('), app.indexOf("document.querySelector('#closeComparison')")), ui);
  await ui.addFantasyComparison({ id: '1', name: 'Player One', teamCode: 'BOS', position: 'G' }, 'Boston Celtics');
  await ui.addFantasyComparison({ id: '2', name: 'Player Two', teamCode: 'BOS', position: 'F' }, 'Boston Celtics');
  await node('#openComparison').onclick();
  assert.equal(vm.runInContext('comparisonState[0].profile', ui), null, 'comparison fetches must not mutate shared selection objects');
  assert.match(node('#comparisonContent').innerHTML, /Fantasy player comparison/);
  assert.match(node('#comparisonContent').innerHTML, /Player One/);
  assert.match(node('#comparisonContent').innerHTML, /7-day baseline projection/);
  await ui.addFantasyComparison({ id: '2', name: 'Duplicate' }, 'Boston');
  await ui.addFantasyComparison({ id: '3', name: 'Third' }, 'Boston');
  await assert.rejects(ui.addFantasyComparison({ id: '4' }, 'Boston'), /full/);
  console.log('Fantasy scoring, missing data, season boundaries, traded players, schedule baselines, and comparison flow verified');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
