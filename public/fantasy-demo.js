// Fictional data for the guided Fantasy impact walkthrough.
(() => {
  if (new URLSearchParams(location.search).get('demo') !== '1') return;

  const boston = { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' };
  const miami = { id: '14', abbreviation: 'MIA', displayName: 'Miami Heat' };
  const date = new Date();
  const year = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  const season = `${year}-${String(year + 1).slice(-2)}`;
  const players = [
    { id: '900002', name: 'Jordan Reed', position: 'G', status: 'Active' },
    { id: '900003', name: 'Casey Brooks', position: 'G', status: 'Active' }
  ];
  const profiles = [
    { GP: 24, MIN: 28, PTS: 14, REB: 4, AST: 5, STL: 1, BLK: 0, TO: 2 },
    { GP: 21, MIN: 24, PTS: 12, REB: 3, AST: 3, STL: 1, BLK: 1, TO: 1 }
  ];
  const injuries = [
    { ...boston, injuries: [{ athleteId: '900001', player: 'Alex Morgan', status: 'Out', position: 'G', detail: 'Ankle sprain' }] },
    { ...miami, injuries: [{ athleteId: '900004', player: 'Taylor Ellis', status: 'Questionable', position: 'F', detail: 'Knee soreness' }] }
  ];
  const source = 'Fictional demo data';

  window.courtsideDemoResponse = url => {
    const { pathname, searchParams } = new URL(url, location.href);
    let payload;
    if (pathname === '/api/injuries') payload = { source, teams: injuries, timestamp: date.toISOString() };
    if (pathname === '/api/schedule') {
      const start = searchParams.get('start');
      const days = [0, 2, 4].map(offset => {
        const gameDate = new Date(`${start}T12:00:00Z`);
        gameDate.setUTCDate(gameDate.getUTCDate() + offset);
        return { date: gameDate.toISOString().slice(0, 10), games: [{ home: boston, away: miami, status: { state: 'pre' } }] };
      });
      payload = { source, retrievedAt: date.toISOString(), days };
    }
    if (pathname === '/api/teams/2/roster') payload = { team: boston, players, coaches: [] };
    if (pathname === '/api/teams/14/roster') payload = { team: miami, players: [], coaches: [] };
    const playerIndex = players.findIndex(player => pathname === `/api/players/${player.id}`);
    if (playerIndex !== -1) {
      payload = { source, history: [{ season, team: 'BOS', values: profiles[playerIndex] }], awards: [] };
    }
    return payload && Response.json(payload);
  };
  document.querySelector('#impactDemo').hidden = false;
})();
