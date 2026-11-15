// Fantasy impact uses live reports as prompts for investigation, not projections.
(() => {
  const board = document.querySelector('#impactBoard');
  const sources = document.querySelector('#impactSources');
  const search = document.querySelector('#impactSearch');
  const statusFilter = document.querySelector('#impactStatus');
  const teamFilter = document.querySelector('#impactTeam');
  const count = document.querySelector('#impactCount');
  const refresh = document.querySelector('#refreshImpact');
  const rosters = new Map();
  let teams = [], schedule = null, injuryTime = null;
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const safe = value => escapeHtml(value);
  const portrait = (name, headshot) => `<span class="impact-portrait" aria-hidden="true"><span class="impact-portrait-fallback">${safe(String(name || '?').trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase())}</span>${headshot ? `<img src="${safe(headshot)}" alt="" loading="lazy">` : ''}</span>`;
  board.addEventListener('error', event => { if (event.target.matches('.impact-portrait img')) event.target.remove(); }, true);
  const get = async url => { const response = await fetch(url); if (!response.ok) throw new Error('Unavailable'); return response.json(); };
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function statusGroup(status) {
    const value = normalized(status);
    if (/^(out|injured reserve)$/.test(value)) return 'out';
    if (value.includes('doubtful')) return 'doubtful';
    if (/questionable|day.to.day|gtd|game.time/.test(value)) return 'questionable';
    if (value.includes('probable')) return 'probable';
    return 'other';
  }
  function upcoming(team) {
    if (!schedule) return null;
    return schedule.days.flatMap(day => day.games.filter(game => game.status?.state !== 'post' && [game.home, game.away].some(side => String(side.id) === String(team.id) || (team.abbreviation && side.abbreviation === team.abbreviation))).map(game => ({ date: day.date, opponent: (String(game.home.id) === String(team.id) || (team.abbreviation && game.home.abbreviation === team.abbreviation)) ? game.away.abbreviation : game.home.abbreviation })));
  }
  function render() {
    const query = normalized(search.value.trim());
    const allRows = teams.flatMap(team => team.injuries.map(injury => ({team, injury})));
    const priority = { out: 0, doubtful: 1, questionable: 2, probable: 3, other: 4 };
    const rows = allRows.filter(({team, injury}) =>
      (teamFilter.value === 'all' || String(team.id) === teamFilter.value)
      && (statusFilter.value === 'all' || statusGroup(injury.status) === statusFilter.value)
      && normalized(`${team.displayName} ${team.abbreviation} ${injury.player} ${injury.detail || ''} ${injury.shortComment || ''}`).includes(query)
    ).sort((a, b) => priority[statusGroup(a.injury.status)] - priority[statusGroup(b.injury.status)]
      || a.team.displayName.localeCompare(b.team.displayName) || a.injury.player.localeCompare(b.injury.player));
    count.textContent = `${rows.length} of ${allRows.length} reported players | Out first, then availability and team`;
    const schedules = new Map(teams.map(team => [team.id, upcoming(team)]));
    board.innerHTML = rows.length ? rows.map(({team, injury}, index) => {
      const games = schedules.get(team.id);
      const gameText = games === null ? 'Schedule unavailable' : `${games.length} upcoming game${games.length === 1 ? '' : 's'} in 7 days`;
      const dates = games?.map(game => `${game.date.slice(5)} vs ${game.opponent}`).join(' · ');
      return `<article class="panel impact-card"><div class="impact-card-top"><div class="impact-player">${portrait(injury.player, injury.headshot)}<div><p class="eyebrow">${safe(team.displayName)} · ${safe(injury.position)}</p><h2>${safe(injury.player)}</h2></div></div><span class="availability limited">${safe(injury.status)}</span></div><p>${safe(injury.shortComment || injury.detail || 'No further injury details provided.')}</p><div class="impact-schedule"><strong>${safe(gameText)}</strong><small>${safe(dates || (games?.length === 0 ? 'No upcoming games found in this window.' : ''))}</small></div><button class="secondary-action impact-replacements" type="button" data-index="${index}" aria-expanded="false">Explore possible replacements</button><div class="impact-result" hidden></div></article>`;
    }).join('') : `<div class="panel empty-state">${allRows.length ? 'No players match these filters. Try another search or clear filters.' : 'No injuries are currently listed.'}</div>`;
    board.querySelectorAll('.impact-replacements').forEach(button => button.addEventListener('click', async () => {
      const {team, injury} = rows[Number(button.dataset.index)];
      const result = button.nextElementSibling;
      if (!result.hidden) { result.hidden = true; button.setAttribute('aria-expanded','false'); return; }
      result.hidden = false; button.setAttribute('aria-expanded','true'); result.textContent = 'Loading team roster…';
      try {
        if (!/^\d+$/.test(String(team.id))) throw new Error('Roster unavailable');
        if (!rosters.has(team.id)) rosters.set(team.id, get(`/api/teams/${team.id}/roster`).catch(error => { rosters.delete(team.id); throw error; }));
        const roster = await rosters.get(team.id);
        const position = String(injury.position || '').toUpperCase();
        const unavailable = new Set(team.injuries.map(item => String(item.athleteId || '')));
        const candidates = roster.players.filter(player => position !== '-' && position && String(player.position || '').toUpperCase() === position && String(player.id) !== String(injury.athleteId) && !unavailable.has(String(player.id)) && /^(active|available)$/i.test(player.status) && !player.injuries?.length);
        result.innerHTML = candidates.length ? `<p><strong>Same-position teammates to investigate</strong></p><p>${candidates.map(player => safe(player.name)).join(' · ')}</p><small>Position match only; minutes, role, and waiver availability are not verified. A teammate may not replace this player in the rotation.</small>` : '<p>No available same-position teammates found in the roster data. Check the team rotation for alternatives.</p>';
      } catch (_) { result.textContent = 'Roster data is unavailable right now. Try again later.'; }
    }));
  }
  async function load() {
    refresh.disabled = true;
    rosters.clear();
    count.textContent = '';
    board.innerHTML = '<div class="panel empty-state">Loading fantasy impact…</div>';
    sources.textContent = 'Loading injury and schedule data…';
    const [injuries, games] = await Promise.allSettled([get('/api/injuries'), get(`/api/schedule?start=${localDate(new Date())}&days=7`)]);
    refresh.disabled = false;
    schedule = games.status === 'fulfilled' ? games.value : null;
    if (injuries.status !== 'fulfilled') { teams = []; sources.textContent = 'Injury report unavailable.'; board.innerHTML = '<div class="panel empty-state">Could not load the injury report. Use Refresh to try again.</div>'; return; }
    teams = injuries.value.teams || []; injuryTime = injuries.value.timestamp;
    const selectedTeam = teamFilter.value;
    teamFilter.innerHTML = '<option value="all">All teams</option>' + [...teams].sort((a,b) => a.displayName.localeCompare(b.displayName)).map(team => `<option value="${safe(team.id)}">${safe(team.displayName)}</option>`).join('');
    teamFilter.value = teams.some(team => String(team.id) === selectedTeam) ? selectedTeam : 'all';
    sources.textContent = `Injuries: ${injuries.value.source || 'ESPN'}${injuryTime ? ` · report updated ${new Date(injuryTime).toLocaleString()}` : ' · report time unavailable'}. Schedule: ${schedule ? `${schedule.source} · retrieved ${new Date(schedule.retrievedAt).toLocaleString()}` : 'unavailable'}.`;
    render();
  }
  search.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  teamFilter.addEventListener('change', render);
  document.querySelector('#clearImpactFilters').addEventListener('click', () => { search.value = ''; statusFilter.value = teamFilter.value = 'all'; render(); });
  document.querySelector('#refreshImpact').addEventListener('click', load);
  load();
})();
