// The same fixed points rules used by Courtside leagues. Missing stats stay missing.
globalThis.CourtsideFantasyAnalysis = (() => {
  const weights = { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 3, TO: -1 };
  const number = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  function points(values = {}) {
    let total = 0;
    for (const [label, weight] of Object.entries(weights)) {
      const value = number(label === 'TO' ? values.TO ?? values.TOV : values[label]);
      if (value === null || value < 0) return null;
      total += value * weight;
    }
    return Math.round(total * 100) / 100;
  }
  function production(history = [], now = new Date()) {
    const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    const season = `${year}-${String(year + 1).slice(-2)}`;
    const rows = history.filter(row => (row.season === season || row.season === String(year + 1))
      && (!row.category || row.category === 'Regular Season Averages'));
    const combined = rows.find(row => /^(TOT|TOTAL|\d+TM)$/i.test(row.team));
    if (!rows.length) return { season, points: null, gamesPlayed: null, minutes: null };
    if (combined || rows.length === 1) {
      const row = combined || rows[0];
      const gamesPlayed = number(row.values.GP);
      return { season, points: gamesPlayed === 0 ? null : points(row.values), gamesPlayed, minutes: number(row.values.MIN), team: row.team, values: row.values };
    }
    // Traded players may have one averages row per team; weight by games played.
    const gamesPlayed = rows.reduce((sum, row) => sum + (number(row.values.GP) || 0), 0);
    if (!gamesPlayed || rows.some(row => number(row.values.GP) === null || points(row.values) === null)) return { season, points: null, gamesPlayed, minutes: null };
    const average = field => rows.reduce((sum, row) => sum + field(row) * number(row.values.GP), 0) / gamesPlayed;
    return { season, points: average(row => points(row.values)), gamesPlayed,
      minutes: rows.some(row => number(row.values.MIN) === null) ? null : average(row => number(row.values.MIN)),
      values: Object.fromEntries(Object.keys(weights).map(label => [label, average(row => number(label === 'TO' ? row.values.TO ?? row.values.TOV : row.values[label])).toFixed(1)])) };
  }
  function scheduledGames(schedule, team) {
    if (!schedule || !Array.isArray(schedule.days) || !team) return null;
    return schedule.days.flatMap(day => day.games || []).filter(game => game.status?.state !== 'post'
      && [game.home, game.away].some(side => side.abbreviation === team)).length;
  }
  function baseline(production, games) {
    return production.points === null || games === null ? null : Math.round(production.points * games * 10) / 10;
  }
  return { points, production, scheduledGames, baseline };
})();
