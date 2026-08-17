(() => {
'use strict';

/* ===================== CONFIG & DATA ===================== */

const CW = 900, CH = 560;
const MARGIN = 40;
const FIELD_LEFT = MARGIN, FIELD_RIGHT = CW - MARGIN;
const FIELD_TOP = MARGIN, FIELD_BOTTOM = CH - MARGIN;
const CX = CW / 2, CY = (FIELD_TOP + FIELD_BOTTOM) / 2;
const GOAL_H = 140;
const GOAL_TOP = CY - GOAL_H / 2, GOAL_BOTTOM = CY + GOAL_H / 2;
const MATCH_SECONDS = 120;

const TEAMS = [
  { id: 'rayos',     name: 'Rayos FC',   colors: ['#f5c518', '#161616'], speed: 1.00, power: 1.05, defense: 0.95 },
  { id: 'tiburones', name: 'Tiburones',  colors: ['#29b6f6', '#ffffff'], speed: 1.10, power: 0.90, defense: 1.00 },
  { id: 'condores',  name: 'Cóndores',   colors: ['#e53935', '#ffffff'], speed: 0.95, power: 1.15, defense: 0.90 },
  { id: 'lobos',     name: 'Lobos',      colors: ['#43a047', '#1b1b1b'], speed: 0.90, power: 0.95, defense: 1.15 },
];

const POWERUP_DEFS = {
  speed:  { icon: '⚡', label: 'Velocidad' },
  turbo:  { icon: '🚀', label: 'Tiro Turbo' },
  magnet: { icon: '🧲', label: 'Imán' },
  freeze: { icon: '❄️', label: 'Congelar rivales' },
};
const POWERUP_KEYS = Object.keys(POWERUP_DEFS);

/* ===================== UTILS ===================== */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
function normalize(x, y) {
  const m = Math.hypot(x, y);
  return m < 1e-6 ? { x: 0, y: 0 } : { x: x / m, y: y / m };
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---- tiny procedural audio (no assets) ---- */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
}
function beep(freq, dur, type = 'sine', vol = 0.14, delay = 0) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
function sfxKick() { beep(220, 0.08, 'square', 0.12); }
function sfxPass() { beep(340, 0.06, 'triangle', 0.09); }
function sfxPowerup() { beep(520, 0.09, 'sine', 0.12); beep(780, 0.12, 'sine', 0.1, 0.08); }
function sfxGoal() { beep(392, 0.14, 'sawtooth', 0.14); beep(523, 0.16, 'sawtooth', 0.14, 0.12); beep(659, 0.22, 'sawtooth', 0.14, 0.24); }
function sfxWhistle() { beep(1200, 0.25, 'square', 0.08); }

/* ===================== APP / SCREEN STATE ===================== */

const App = {
  screen: 'screen-menu',
  selectedTeamIdx: null,
  tournament: null,
  match: null,
  pen: null,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  App.screen = id;
}

/* ===================== MENU / TEAM SELECT ===================== */

function initMenus() {
  document.getElementById('btn-play').addEventListener('click', () => {
    ensureAudio();
    populateTeamCards();
    showScreen('screen-select');
  });
  document.getElementById('btn-howto').addEventListener('click', () => showScreen('screen-howto'));
  document.getElementById('btn-howto-back').addEventListener('click', () => showScreen('screen-menu'));
  document.getElementById('btn-select-back').addEventListener('click', () => showScreen('screen-menu'));
  document.getElementById('btn-champion-restart').addEventListener('click', () => {
    App.tournament = null;
    showScreen('screen-menu');
  });
}

function populateTeamCards() {
  const wrap = document.getElementById('team-cards');
  wrap.innerHTML = '';
  TEAMS.forEach((team, idx) => {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML = `
      <div class="team-jersey" style="background:${team.colors[0]}; border-color:${team.colors[1]}"></div>
      <h3>${team.name}</h3>
      <div class="team-stats">
        Velocidad: ${'★'.repeat(Math.round(team.speed * 4))}<br>
        Potencia: ${'★'.repeat(Math.round(team.power * 4))}<br>
        Defensa: ${'★'.repeat(Math.round(team.defense * 4))}
      </div>`;
    card.addEventListener('click', () => {
      App.selectedTeamIdx = idx;
      buildTournament(idx);
    });
    wrap.appendChild(card);
  });
}

/* ===================== TOURNAMENT / BRACKET ===================== */

function simulateCpuMatch(teamA, teamB) {
  const strengthA = (teamA.speed + teamA.power + teamA.defense) * (0.85 + Math.random() * 0.3);
  const strengthB = (teamB.speed + teamB.power + teamB.defense) * (0.85 + Math.random() * 0.3);
  let goalsA = Math.max(0, Math.round(strengthA * 1.4 - 2 + Math.random() * 1.5));
  let goalsB = Math.max(0, Math.round(strengthB * 1.4 - 2 + Math.random() * 1.5));
  if (goalsA === goalsB) (strengthA >= strengthB ? goalsA++ : goalsB++);
  return { teamA, teamB, goalsA, goalsB, winner: goalsA > goalsB ? teamA : teamB };
}

function buildTournament(idx) {
  const userTeam = TEAMS[idx];
  const others = shuffle(TEAMS.filter((t, i) => i !== idx));
  const sfOpponent = others[0];
  const otherSF = simulateCpuMatch(others[1], others[2]);
  App.tournament = {
    userTeam, sfOpponent, otherSF,
    round: 'sf',
    sfResult: null,
    finalResult: null,
  };
  renderBracket();
  showScreen('screen-bracket');
}

function renderBracket() {
  const t = App.tournament;
  const view = document.getElementById('bracket-view');
  const nextBtn = document.getElementById('btn-bracket-next');

  if (t.round === 'sf') {
    view.innerHTML = `
      <div class="bracket-col">
        <div class="bracket-label">Semifinal 1 · Tu partido</div>
        <div class="bracket-match">
          <div class="team-row you">${t.userTeam.name}</div>
          <div class="vs">vs</div>
          <div class="team-row">${t.sfOpponent.name}</div>
        </div>
      </div>
      <div class="bracket-col">
        <div class="bracket-label">Semifinal 2 · ya jugada</div>
        <div class="bracket-match">
          <div class="team-row ${t.otherSF.winner === t.otherSF.teamA ? 'win' : ''}">${t.otherSF.teamA.name} <b>${t.otherSF.goalsA}</b></div>
          <div class="vs">vs</div>
          <div class="team-row ${t.otherSF.winner === t.otherSF.teamB ? 'win' : ''}">${t.otherSF.teamB.name} <b>${t.otherSF.goalsB}</b></div>
        </div>
      </div>`;
    nextBtn.textContent = 'Jugar semifinal';
  } else if (t.round === 'final') {
    view.innerHTML = `
      <div class="bracket-col">
        <div class="bracket-label">Final</div>
        <div class="bracket-match">
          <div class="team-row you">${t.userTeam.name}</div>
          <div class="vs">vs</div>
          <div class="team-row">${t.otherSF.winner.name}</div>
        </div>
      </div>`;
    nextBtn.textContent = 'Jugar la final';
  }
  nextBtn.onclick = () => {
    if (t.round === 'sf') startMatch(t.sfOpponent, 'Semifinal', 1);
    else startMatch(t.otherSF.winner, 'Final', 1.15);
  };
}

/* ===================== MATCH ENGINE ===================== */

function formationFor(side) {
  const base = [
    { role: 'GK', x: FIELD_LEFT + 16,  y: CY,        gk: true },
    { role: 'DF', x: FIELD_LEFT + 130, y: CY - 95 },
    { role: 'DF', x: FIELD_LEFT + 130, y: CY + 95 },
    { role: 'MF', x: FIELD_LEFT + 300, y: CY },
    { role: 'FW', x: FIELD_LEFT + 430, y: CY },
  ];
  if (side === 'user') return base;
  return base.map(p => ({ ...p, x: FIELD_RIGHT - (p.x - FIELD_LEFT) }));
}

class Match {
  constructor(userTeamDef, cpuTeamDef, roundName, difficulty) {
    this.userTeam = userTeamDef;
    this.cpuTeam = cpuTeamDef;
    this.roundName = roundName;
    this.difficulty = difficulty;
    this.scoreUser = 0;
    this.scoreCpu = 0;
    this.clock = MATCH_SECONDS;
    this.elapsed = 0;
    this.state = 'live'; // live | goal | ended
    this.goalTimer = 0;
    this.players = [];
    this.controlledPlayer = null;
    this.activeCpu = null;
    this.keys = {};
    this.isCharging = false;
    this.chargeTime = 0;
    this.facing = { x: 1, y: 0 };
    this.powerup = null; // {type,x,y}
    this.powerupSpawnAt = 5 + Math.random() * 5;
    this.freezeUntil = { user: 0, cpu: 0 };
    this.goalFlashHideAt = 0;
    this.finished = false;
    this.finishedResult = null;
    this._buildPlayers();
    this._resetBall();
    this._bindHud();
    this._onKeyDown = (e) => this._handleKeyDown(e);
    this._onKeyUp = (e) => this._handleKeyUp(e);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    sfxWhistle();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  _bindHud() {
    document.getElementById('hud-dot-left').style.background = this.userTeam.colors[0];
    document.getElementById('hud-dot-right').style.background = this.cpuTeam.colors[0];
    document.getElementById('hud-name-left').textContent = this.userTeam.name;
    document.getElementById('hud-name-right').textContent = this.cpuTeam.name;
    document.getElementById('hud-round').textContent = this.roundName;
    this._updateHud();
  }

  _updateHud() {
    document.getElementById('hud-score-left').textContent = this.scoreUser;
    document.getElementById('hud-score-right').textContent = this.scoreCpu;
    const m = Math.floor(Math.max(0, this.clock) / 60);
    const s = Math.floor(Math.max(0, this.clock) % 60);
    document.getElementById('hud-clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  _buildPlayers() {
    this.players = [];
    let id = 0;
    formationFor('user').forEach(f => this.players.push(this._makePlayer(id++, 'user', f)));
    formationFor('cpu').forEach(f => this.players.push(this._makePlayer(id++, 'cpu', f)));
  }

  _makePlayer(id, team, f) {
    return {
      id, team, role: f.role, isGK: !!f.gk,
      homeX: f.x, homeY: f.y,
      x: f.x, y: f.y, vx: 0, vy: 0,
      radius: 12,
      speedBoostUntil: 0, magnetUntil: 0, turboReady: false, turboExpiresAt: 0,
      possessionImmuneUntil: 0,
    };
  }

  _resetBall(kickoffTeam) {
    this.ball = { x: CX, y: CY, vx: 0, vy: 0, radius: 7, owner: null, lastTouchTeam: null };
    this.players.forEach(p => {
      p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      p.speedBoostUntil = 0; p.magnetUntil = 0; p.turboReady = false;
    });
    if (kickoffTeam) {
      const kicker = this.players.find(p => p.team === kickoffTeam && p.role === 'FW');
      if (kicker) { kicker.x = CX - (kickoffTeam === 'user' ? 20 : -20); kicker.y = CY; this.ball.owner = kicker; }
    }
  }

  _handleKeyDown(e) {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) {
      if (e.code === 'Space') return; // ignore repeat, charging handled via held state
    }
    this.keys[e.code] = true;
    if (e.code === 'Space' && !this.isCharging) {
      this.isCharging = true;
      this.chargeTime = 0;
    }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
      this._tryPass();
    }
  }

  _handleKeyUp(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space' && this.isCharging) {
      this._tryShoot();
      this.isCharging = false;
      this.chargeTime = 0;
    }
  }

  _inputVector() {
    let x = 0, y = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) x -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) x += 1;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) y -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) y += 1;
    return normalize(x, y);
  }

  _pickControlled() {
    if (this.ball.owner && this.ball.owner.team === 'user' && !this.ball.owner.isGK) {
      this.controlledPlayer = this.ball.owner;
      return;
    }
    const candidates = this.players.filter(p => p.team === 'user' && !p.isGK);
    let nearest = candidates[0];
    let nd = dist(nearest, this.ball);
    for (const p of candidates) {
      const d = dist(p, this.ball);
      if (d < nd) { nd = d; nearest = p; }
    }
    if (!this.controlledPlayer) { this.controlledPlayer = nearest; return; }
    const dCur = dist(this.controlledPlayer, this.ball);
    if (nearest !== this.controlledPlayer && nd < dCur - 18) this.controlledPlayer = nearest;
  }

  _pickActiveCpu() {
    if (this.ball.owner && this.ball.owner.team === 'cpu' && !this.ball.owner.isGK) {
      this.activeCpu = this.ball.owner;
      return;
    }
    const candidates = this.players.filter(p => p.team === 'cpu' && !p.isGK);
    let nearest = candidates[0];
    let nd = dist(nearest, this.ball);
    for (const p of candidates) {
      const d = dist(p, this.ball);
      if (d < nd) { nd = d; nearest = p; }
    }
    if (!this.activeCpu) { this.activeCpu = nearest; return; }
    const dCur = dist(this.activeCpu, this.ball);
    if (nearest !== this.activeCpu && nd < dCur - 18) this.activeCpu = nearest;
  }

  _teamDef(team) { return team === 'user' ? this.userTeam : this.cpuTeam; }

  _speedOf(p) {
    let s = 150 * this._teamDef(p.team).speed;
    if (this.elapsed < p.speedBoostUntil) s *= 1.5;
    if (this.freezeUntil[p.team] > this.elapsed && !p.isGK) s = 0;
    return s;
  }

  _grabRadius(p) {
    let r = p.radius + this.ball.radius + 6;
    if (this.elapsed < p.magnetUntil) r += 12;
    return r;
  }

  _tryPass() {
    const cp = this.controlledPlayer;
    if (!cp || this.ball.owner !== cp) return;
    const mates = this.players.filter(p => p.team === 'user' && p !== cp && !p.isGK);
    if (!mates.length) return;
    let best = null, bestScore = -Infinity;
    for (const m of mates) {
      const opponents = this.players.filter(p => p.team === 'cpu');
      const openness = Math.min(...opponents.map(o => dist(o, m)));
      const score = m.x * 0.6 + openness * 1.2 - dist(cp, m) * 0.3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    this._kick(cp, best.x, best.y, 340, false);
    sfxPass();
  }

  _tryShoot() {
    const cp = this.controlledPlayer;
    if (!cp || this.ball.owner !== cp) return;
    const targetX = FIELD_RIGHT, targetY = CY + (Math.random() - 0.5) * 40;
    const chargeFrac = clamp(this.chargeTime / 0.55, 0, 1);
    let power = 420 + chargeFrac * 260;
    if (this.elapsed < cp.turboExpiresAt && cp.turboReady) { power *= 1.5; cp.turboReady = false; }
    power *= this._teamDef(cp.team).power;
    this._kick(cp, targetX, targetY, power, true, this.facing);
    sfxKick();
  }

  _kick(player, targetX, targetY, power, isShot, aimDir) {
    let dir;
    if (isShot && aimDir) {
      const toGoal = normalize(targetX - player.x, targetY - player.y);
      dir = normalize(lerp(aimDir.x, toGoal.x, 0.55), lerp(aimDir.y, toGoal.y, 0.55));
    } else {
      dir = normalize(targetX - player.x, targetY - player.y);
    }
    this.ball.owner = null;
    this.ball.vx = dir.x * power;
    this.ball.vy = dir.y * power;
    this.ball.lastTouchTeam = player.team;
    player.possessionImmuneUntil = this.elapsed + 0.25;
  }

  update(dt) {
    if (this.state === 'ended') return;
    this.elapsed += dt;

    if (this.state === 'goal') {
      this.goalTimer -= dt;
      if (this.goalTimer <= 0) {
        this.state = 'live';
        this._resetBall(this._lastConceded);
        document.getElementById('goal-flash').classList.add('hidden');
      }
      return;
    }

    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = 0;
      this._updateHud();
      this._endRegulation();
      return;
    }

    this._pickControlled();
    this._pickActiveCpu();
    if (this.isCharging) this.chargeTime = Math.min(this.chargeTime + dt, 0.6);

    this._updateUserPlayer(dt);
    this._updateUserSupport(dt);
    this._updateCpu(dt);
    this._updateGoalkeepers(dt);
    this._updateBall(dt);
    this._updatePowerups(dt);
    this._updateHud();
  }

  _updateUserPlayer(dt) {
    const cp = this.controlledPlayer;
    if (!cp) return;
    const inp = this._inputVector();
    if (inp.x !== 0 || inp.y !== 0) this.facing = inp;
    const speed = this._speedOf(cp);
    cp.vx = inp.x * speed; cp.vy = inp.y * speed;
    this._integratePlayer(cp, dt);
    this._tryGrab(cp);
  }

  _updateUserSupport(dt) {
    const cp = this.controlledPlayer;
    const supports = this.players.filter(p => p.team === 'user' && p !== cp && !p.isGK);
    for (const p of supports) this._steerSupport(p, dt);
  }

  _steerSupport(p, dt) {
    const shiftX = clamp((this.ball.x - CX) * 0.28, -100, 100);
    const shiftY = (this.ball.y - p.homeY) * 0.18;
    const tx = clamp(p.homeX + shiftX, FIELD_LEFT + 20, FIELD_RIGHT - 20);
    const ty = clamp(p.homeY + shiftY, FIELD_TOP + 20, FIELD_BOTTOM - 20);
    const dir = normalize(tx - p.x, ty - p.y);
    const speed = this._speedOf(p) * 0.82;
    p.vx = dir.x * speed; p.vy = dir.y * speed;
    this._integratePlayer(p, dt);
    this._tryGrab(p);
  }

  _updateCpu(dt) {
    const active = this.activeCpu;
    for (const p of this.players.filter(pl => pl.team === 'cpu' && !pl.isGK)) {
      if (p === active) {
        if (this.ball.owner === p) {
          const goalX = FIELD_LEFT, goalY = CY;
          const inRange = dist(p, { x: goalX, y: goalY }) < 260;
          const dir = normalize(goalX - p.x, goalY - p.y + (Math.random() - 0.5) * 30);
          const speed = this._speedOf(p);
          p.vx = dir.x * speed; p.vy = dir.y * speed;
          this._integratePlayer(p, dt);
          const shootChance = dt * 1.4 * this.difficulty * this._teamDef(p.team).power;
          if (inRange && Math.random() < shootChance) {
            const ty = GOAL_TOP + Math.random() * GOAL_H;
            const power = (430 + Math.random() * 220) * this._teamDef(p.team).power;
            this._kick(p, goalX, ty, power, true, dir);
            sfxKick();
          } else if (!inRange && Math.random() < dt * 0.5) {
            const mates = this.players.filter(o => o.team === 'cpu' && o !== p && !o.isGK);
            const target = mates[Math.floor(Math.random() * mates.length)];
            if (target) { this._kick(p, target.x, target.y, 330, false); sfxPass(); }
          }
        } else {
          const dir = normalize(this.ball.x - p.x, this.ball.y - p.y);
          const speed = this._speedOf(p);
          p.vx = dir.x * speed; p.vy = dir.y * speed;
          this._integratePlayer(p, dt);
        }
      } else {
        this._steerSupport(p, dt);
      }
      this._tryGrab(p);
    }
  }

  _updateGoalkeepers(dt) {
    for (const gk of this.players.filter(p => p.isGK)) {
      const isUser = gk.team === 'user';
      const lineX = isUser ? FIELD_LEFT + 16 : FIELD_RIGHT - 16;
      const ty = clamp(this.ball.y, GOAL_TOP + 18, GOAL_BOTTOM - 18);
      const ballNear = Math.abs(this.ball.x - lineX) < 90;
      const tx = ballNear ? lineX + (isUser ? 1 : -1) * clamp(90 - Math.abs(this.ball.x - lineX), 0, 26) : lineX;
      const dir = normalize(tx - gk.x, ty - gk.y);
      gk.vx = dir.x * 130; gk.vy = dir.y * 130;
      this._integratePlayer(gk, dt);
      const ownerIsOpp = this.ball.owner && this.ball.owner.team !== gk.team;
      const ballFree = !this.ball.owner;
      if ((ownerIsOpp || ballFree) && dist(gk, this.ball) < gk.radius + this.ball.radius + 16 && Math.abs(this.ball.x - lineX) < 70) {
        const clearDir = normalize((isUser ? 1 : -1) * 1, (Math.random() - 0.5) * 1.4);
        this.ball.owner = null;
        this.ball.vx = clearDir.x * 300; this.ball.vy = clearDir.y * 300;
        this.ball.lastTouchTeam = gk.team;
      }
    }
  }

  _integratePlayer(p, dt) {
    p.x = clamp(p.x + p.vx * dt, FIELD_LEFT + p.radius * 0.4, FIELD_RIGHT - p.radius * 0.4);
    p.y = clamp(p.y + p.vy * dt, FIELD_TOP + p.radius * 0.4, FIELD_BOTTOM - p.radius * 0.4);
  }

  _tryGrab(p) {
    if (this.elapsed < p.possessionImmuneUntil) return;
    if (this.ball.owner === p) return;
    const d = dist(p, this.ball);
    if (d < this._grabRadius(p)) {
      this.ball.owner = p;
    }
  }

  _updateBall(dt) {
    const b = this.ball;
    if (b.owner) {
      const o = b.owner;
      let dirx = 0, diry = 0;
      if (o.team === 'user' && o === this.controlledPlayer) { dirx = this.facing.x; diry = this.facing.y; }
      else if (o.vx || o.vy) { const n = normalize(o.vx, o.vy); dirx = n.x; diry = n.y; }
      else { dirx = o.team === 'user' ? 1 : -1; }
      b.x = o.x + dirx * (o.radius + b.radius + 4);
      b.y = o.y + diry * (o.radius + b.radius + 4);
      b.vx = 0; b.vy = 0;
      return;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    const fr = Math.pow(0.06, dt);
    b.vx *= fr; b.vy *= fr;

    if (b.y - b.radius < FIELD_TOP) { b.y = FIELD_TOP + b.radius; b.vy *= -0.7; }
    if (b.y + b.radius > FIELD_BOTTOM) { b.y = FIELD_BOTTOM - b.radius; b.vy *= -0.7; }

    const inGoalMouth = b.y > GOAL_TOP && b.y < GOAL_BOTTOM;
    if (b.x - b.radius < FIELD_LEFT) {
      if (inGoalMouth && b.x < FIELD_LEFT - 6) { this._scoreGoal('cpu'); return; }
      if (!inGoalMouth) { b.x = FIELD_LEFT + b.radius; b.vx *= -0.7; }
    }
    if (b.x + b.radius > FIELD_RIGHT) {
      if (inGoalMouth && b.x > FIELD_RIGHT + 6) { this._scoreGoal('user'); return; }
      if (!inGoalMouth) { b.x = FIELD_RIGHT - b.radius; b.vx *= -0.7; }
    }

    let candidates = this.players.slice().sort((a, c) => dist(a, b) - dist(c, b));
    for (const p of candidates) { this._tryGrab(p); if (b.owner) break; }
  }

  _scoreGoal(scoringTeam) {
    if (scoringTeam === 'user') this.scoreUser++; else this.scoreCpu++;
    this._lastConceded = scoringTeam === 'user' ? 'cpu' : 'user';
    this.state = 'goal';
    this.goalTimer = 1.5;
    sfxGoal();
    document.getElementById('goal-flash').classList.remove('hidden');
    this._updateHud();
  }

  _updatePowerups(dt) {
    if (!this.powerup) {
      if (this.elapsed >= this.powerupSpawnAt) {
        this.powerup = {
          type: pick(POWERUP_KEYS),
          x: FIELD_LEFT + 200 + Math.random() * (FIELD_RIGHT - FIELD_LEFT - 400),
          y: FIELD_TOP + 40 + Math.random() * (FIELD_BOTTOM - FIELD_TOP - 80),
          bornAt: this.elapsed,
        };
      }
      return;
    }
    if (this.elapsed - this.powerup.bornAt > 12) {
      this.powerup = null;
      this.powerupSpawnAt = this.elapsed + 6 + Math.random() * 6;
      return;
    }
    for (const p of this.players.filter(pl => !pl.isGK)) {
      if (dist(p, this.powerup) < p.radius + 16) {
        this._applyPowerup(p, this.powerup.type);
        this.powerup = null;
        this.powerupSpawnAt = this.elapsed + 6 + Math.random() * 6;
        break;
      }
    }
  }

  _applyPowerup(p, type) {
    sfxPowerup();
    const def = POWERUP_DEFS[type];
    const teamName = this._teamDef(p.team).name;
    let msg = `${def.icon} ${teamName} activó ${def.label}`;
    if (type === 'speed') p.speedBoostUntil = this.elapsed + 8;
    else if (type === 'turbo') { p.turboReady = true; p.turboExpiresAt = this.elapsed + 15; }
    else if (type === 'magnet') p.magnetUntil = this.elapsed + 8;
    else if (type === 'freeze') {
      const opp = p.team === 'user' ? 'cpu' : 'user';
      this.freezeUntil[opp] = this.elapsed + 3;
      msg = `${def.icon} ${teamName} congeló a los rivales`;
    }
    const banner = document.getElementById('powerup-banner');
    banner.textContent = msg;
    banner.classList.remove('hidden');
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => banner.classList.add('hidden'), 1800);
  }

  _endRegulation() {
    this.state = 'ended';
    this.finished = true;
    if (this.scoreUser === this.scoreCpu) {
      this.finishedResult = 'penalties';
    } else {
      this.finishedResult = this.scoreUser > this.scoreCpu ? 'win' : 'lose';
    }
  }

  render() {
    const ctx = pitchCtx;
    ctx.clearRect(0, 0, CW, CH);
    drawPitch(ctx);

    if (this.powerup) drawPowerup(ctx, this.powerup, this.elapsed);

    for (const p of this.players) drawPlayer(ctx, p, this, p === this.controlledPlayer);

    drawBall(ctx, this.ball);

    if (this.isCharging && this.controlledPlayer && this.ball.owner === this.controlledPlayer) {
      const frac = clamp(this.chargeTime / 0.55, 0, 1);
      ctx.beginPath();
      ctx.arc(this.controlledPlayer.x, this.controlledPlayer.y, 20, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = `hsl(${120 * frac}, 90%, 55%)`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

function drawPitch(ctx) {
  ctx.fillStyle = '#0b3d16';
  ctx.fillRect(0, 0, CW, CH);
  const stripeW = (FIELD_RIGHT - FIELD_LEFT) / 10;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(FIELD_LEFT + i * stripeW, FIELD_TOP, stripeW, FIELD_BOTTOM - FIELD_TOP);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
  ctx.beginPath(); ctx.moveTo(CX, FIELD_TOP); ctx.lineTo(CX, FIELD_BOTTOM); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 55, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

  [FIELD_LEFT, FIELD_RIGHT].forEach(x => {
    const dir = x === FIELD_LEFT ? 1 : -1;
    ctx.strokeRect(x - (dir === 1 ? 0 : 90), CY - 90, 90, 180);
    ctx.strokeRect(x - (dir === 1 ? 0 : 40), CY - 40, 40, 80);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(FIELD_LEFT - 6, GOAL_TOP, 6, GOAL_H);
  ctx.fillRect(FIELD_RIGHT, GOAL_TOP, 6, GOAL_H);
}

function drawPowerup(ctx, pu, t) {
  const pulse = 1 + Math.sin(t * 6) * 0.12;
  ctx.save();
  ctx.translate(pu.x, pu.y);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERUP_DEFS[pu.type].icon, 0, 1);
  ctx.restore();
}

function drawPlayer(ctx, p, match, isControlled) {
  const team = match._teamDef(p.team);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = p.isGK ? '#eeeeee' : team.colors[0];
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = team.colors[1];
  ctx.stroke();

  if (isControlled) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (match.elapsed < p.speedBoostUntil) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', p.x, p.y - p.radius - 6);
  }
}

function drawBall(ctx, b) {
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#333';
  ctx.stroke();
}

/* ===================== MATCH FLOW / RESULT ===================== */

let pitchCanvas, pitchCtx;

function startMatch(opponentTeam, roundName, difficulty) {
  const t = App.tournament;
  App.match = new Match(t.userTeam, opponentTeam, roundName, difficulty);
  showScreen('screen-match');
}

function goToResult(title, scoreText, detail, onNext) {
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-score').textContent = scoreText;
  document.getElementById('result-detail').textContent = detail;
  const btn = document.getElementById('btn-result-next');
  btn.onclick = onNext;
  showScreen('screen-result');
}

function handleMatchFinished(match) {
  match.destroy();
  const t = App.tournament;
  if (match.finishedResult === 'penalties') {
    startPenalties(match);
    return;
  }
  concludeMatch(match, match.finishedResult === 'win');
}

function concludeMatch(match, userWon, penScore) {
  const t = App.tournament;
  const scoreText = penScore
    ? `${match.scoreUser}-${match.scoreCpu} (${penScore[0]}-${penScore[1]} penales)`
    : `${match.scoreUser} - ${match.scoreCpu}`;

  if (t.round === 'sf') {
    if (userWon) {
      goToResult('¡Ganaste la semifinal!', scoreText, `${t.userTeam.name} avanza a la final contra ${t.otherSF.winner.name}.`, () => {
        t.round = 'final';
        renderBracket();
        showScreen('screen-bracket');
      });
    } else {
      goToResult('Eliminado en semifinales', scoreText, `${t.sfOpponent.name} fue mejor esta vez. ¡Probá de nuevo!`, () => {
        App.tournament = null;
        showScreen('screen-menu');
      });
    }
  } else {
    if (userWon) {
      showChampion(t.userTeam);
    } else {
      goToResult('Subcampeón', scoreText, `${t.otherSF.winner.name} se llevó la copa esta vez. ¡A intentarlo de nuevo!`, () => {
        App.tournament = null;
        showScreen('screen-menu');
      });
    }
  }
}

function showChampion(team) {
  document.getElementById('champion-team').textContent = `${team.name} levanta la Copa Turbo`;
  spawnConfetti();
  showScreen('screen-champion');
}

function spawnConfetti() {
  const wrap = document.getElementById('confetti');
  wrap.innerHTML = '';
  const colors = ['#43e97b', '#ffd23f', '#e53935', '#29b6f6', '#fff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 6;
    el.style.position = 'absolute';
    el.style.top = '-20px';
    el.style.left = Math.random() * 100 + '%';
    el.style.width = size + 'px';
    el.style.height = size * 0.6 + 'px';
    el.style.background = colors[i % colors.length];
    el.style.opacity = '0.9';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    el.style.animation = `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 1.5}s forwards`;
    wrap.appendChild(el);
  }
}
const confettiStyle = document.createElement('style');
confettiStyle.textContent = `@keyframes confettiFall { to { transform: translateY(620px) rotate(400deg); opacity: 0.2; } }`;
document.head.appendChild(confettiStyle);

/* ===================== PENALTIES ===================== */

const PW = 900, PH = 420;
const PGOAL_W = 420, PGOAL_H = 190;
const PGOAL_X = (PW - PGOAL_W) / 2, PGOAL_Y = 70;
const PSPOT = { x: PW / 2, y: 340 };

class Penalties {
  constructor(match) {
    this.userTeam = match.userTeam;
    this.cpuTeam = match.cpuTeam;
    this.onDone = (userWon, penScore) => concludeMatch(match, userWon, penScore);
    this.kickCountUser = 0;
    this.kickCountCpu = 0;
    this.scoreUser = 0;
    this.scoreCpu = 0;
    this.firstKicker = Math.random() < 0.5 ? 'user' : 'cpu';
    this.secondKicker = this.firstKicker === 'user' ? 'cpu' : 'user';
    this.decided = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.cursor = 0.5; this.cursorDir = 1;
    this.power = 0; this.powerDir = 1;
    this.lockedX = 0.5; this.lockedPower = 0.8;
    this.gkX = 0.5; this.gkTargetX = 0.5;
    this.ballAnim = 0;
    this.resultMsg = '';
    this.cpuShot = null;
    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);
    this._beginKick();
  }

  destroy() { window.removeEventListener('keydown', this._onKeyDown); }

  _currentKicker() {
    const total = this.kickCountUser + this.kickCountCpu;
    return total % 2 === 0 ? this.firstKicker : this.secondKicker;
  }

  _beginKick() {
    this.kicker = this._currentKicker();
    this.phase = this.kicker === 'user' ? 'aim' : 'cpu-wind';
    this.phaseT = 0;
    this.cursor = 0.5; this.cursorDir = 1;
    this.power = 0; this.powerDir = 1;
    this.gkX = 0.5;
    this.resultMsg = '';
    if (this.kicker === 'cpu') {
      const targets = [0.15, 0.5, 0.85];
      const cpuPowerStat = this.cpuTeam.power;
      this.cpuShot = {
        x: clamp(pick(targets) + (Math.random() - 0.5) * 0.14, 0.04, 0.96),
        power: clamp(0.75 + (Math.random() - 0.5) * 0.35 / cpuPowerStat, 0.1, 1),
      };
    }
  }

  _handleKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code !== 'Space') return;
    if (this.phase === 'aim' || this.phase === 'gk-defend') this._lockAimOrDefend();
    else if (this.phase === 'power') this._lockPower();
  }

  _lockAimOrDefend() {
    if (this.phase === 'aim') {
      this.lockedX = this.cursor;
      this.phase = 'power';
      this.phaseT = 0;
      this.power = 0; this.powerDir = 1;
    } else if (this.phase === 'gk-defend') {
      this.gkX = this.cursor;
      this._resolveCpuShot();
    }
  }

  _lockPower() {
    this.lockedPower = this.power;
    this._resolveUserShot();
  }

  update(dt) {
    if (this.phase === 'aim' || this.phase === 'gk-defend') {
      this.cursor += this.cursorDir * dt * 0.7;
      if (this.cursor > 1) { this.cursor = 1; this.cursorDir = -1; }
      if (this.cursor < 0) { this.cursor = 0; this.cursorDir = 1; }
    } else if (this.phase === 'power') {
      this.power += this.powerDir * dt * 1.3;
      if (this.power > 1) { this.power = 1; this.powerDir = -1; }
      if (this.power < 0) { this.power = 0; this.powerDir = 1; }
    } else if (this.phase === 'cpu-wind') {
      this.phaseT += dt;
      if (this.phaseT > 0.9) { this.phase = 'gk-defend'; this.phaseT = 0; this.cursor = 0.5; this.cursorDir = 1; }
    } else if (this.phase === 'anim') {
      this.phaseT += dt;
      this.ballAnim = clamp(this.phaseT / 0.5, 0, 1);
      if (this.phaseT > 0.9) this._afterKickResolved();
    } else if (this.phase === 'summary') {
      this.phaseT += dt;
      if (this.phaseT > 1.3) this._advance();
    }
  }

  _resolveUserShot() {
    const quality = clamp(1 - Math.abs(this.lockedPower - 0.78) * 1.3, 0, 1);
    const jitter = (1 - quality) * 0.22 * (Math.random() - 0.5) * 2;
    const effX = clamp(this.lockedX + jitter, 0, 1);
    let goal, msg;
    if (effX < 0.035 || effX > 0.965) {
      goal = false; msg = '¡Afuera! Se fue desviado.';
    } else {
      const reach = 0.30 + (this.cpuTeam.defense - 1) * 0.15 - quality * 0.08;
      const aiGkX = clamp(0.5 + (Math.random() - 0.5) * 1.1 + (Math.random() < 0.5 ? (effX - 0.5) * 0.4 : 0), 0, 1);
      this.gkTargetX = aiGkX;
      if (Math.abs(aiGkX - effX) < reach) { goal = false; msg = `¡Atajada de ${this.cpuTeam.name}!`; }
      else { goal = true; msg = '¡GOL!'; }
    }
    this.shotX = effX;
    this.shotGoal = goal;
    this.resultMsg = msg;
    this.phase = 'anim'; this.phaseT = 0; this.ballAnim = 0;
  }

  _resolveCpuShot() {
    const cs = this.cpuShot;
    const reach = 0.30 + (this.userTeam.defense - 1) * 0.15;
    let goal, msg;
    if (cs.x < 0.035 || cs.x > 0.965) { goal = false; msg = '¡La tiró afuera!'; }
    else if (Math.abs(this.gkX - cs.x) < reach) { goal = false; msg = `¡${this.userTeam.name} ataja!`; }
    else { goal = true; msg = '¡GOL rival!'; }
    this.shotX = cs.x;
    this.shotGoal = goal;
    this.resultMsg = msg;
    this.phase = 'anim'; this.phaseT = 0; this.ballAnim = 0;
    this.gkTargetX = this.gkX;
  }

  _afterKickResolved() {
    if (this.kicker === 'user') {
      this.kickCountUser++;
      if (this.shotGoal) this.scoreUser++;
    } else {
      this.kickCountCpu++;
      if (this.shotGoal) this.scoreCpu++;
    }
    this.phase = 'summary'; this.phaseT = 0;
    this._checkDecided();
  }

  _checkDecided() {
    const total = this.kickCountUser + this.kickCountCpu;
    if (total < 6) {
      const leftUser = Math.max(0, 3 - this.kickCountUser);
      const leftCpu = Math.max(0, 3 - this.kickCountCpu);
      if (this.scoreUser > this.scoreCpu + leftCpu) this.decided = 'user';
      else if (this.scoreCpu > this.scoreUser + leftUser) this.decided = 'cpu';
    } else if (total % 2 === 0) {
      if (this.scoreUser !== this.scoreCpu) this.decided = this.scoreUser > this.scoreCpu ? 'user' : 'cpu';
    }
  }

  _advance() {
    if (this.decided) {
      this.onDone(this.decided === 'user', [this.scoreUser, this.scoreCpu]);
      return;
    }
    this._beginKick();
  }

  render() {
    const ctx = penCtx;
    ctx.clearRect(0, 0, PW, PH);
    ctx.fillStyle = '#0b3d16';
    ctx.fillRect(0, 0, PW, PH);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(i * PW / 10, 0, PW / 10, PH);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.strokeRect(PGOAL_X, PGOAL_Y, PGOAL_W, PGOAL_H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(PGOAL_X, PGOAL_Y, PGOAL_W, PGOAL_H);
    ctx.beginPath(); ctx.ellipse(PSPOT.x, PSPOT.y, 90, 22, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(PSPOT.x, PSPOT.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    const gkColor = this.kicker === 'user' ? this.cpuTeam.colors[0] : this.userTeam.colors[0];
    const gkX = PGOAL_X + (this._gkRenderX()) * PGOAL_W;
    ctx.fillStyle = gkColor;
    ctx.fillRect(gkX - 16, PGOAL_Y + PGOAL_H - 46, 32, 46);
    ctx.beginPath(); ctx.arc(gkX, PGOAL_Y + PGOAL_H - 52, 10, 0, Math.PI * 2); ctx.fill();

    let ballX = PSPOT.x, ballY = PSPOT.y;
    if (this.phase === 'anim' || this.phase === 'summary') {
      const t = this.phase === 'summary' ? 1 : this.ballAnim;
      const targetX = PGOAL_X + this.shotX * PGOAL_W;
      const targetY = PGOAL_Y + PGOAL_H - 30 - (this.shotGoal ? 20 : 40) * t;
      ballX = lerp(PSPOT.x, targetX, t);
      ballY = lerp(PSPOT.y, targetY, t);
    }
    ctx.beginPath(); ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();

    if (this.phase === 'aim') this._drawCursor(this.cursor, '#43e97b');
    if (this.phase === 'gk-defend') this._drawCursor(this.cursor, '#29b6f6');

    document.getElementById('pen-title').textContent =
      (this.kickCountUser + this.kickCountCpu) >= 6 ? 'Muerte súbita' : `Penal ${this.kickCountUser + this.kickCountCpu + 1} de 6`;

    const infoEl = document.getElementById('pen-info');
    const meterWrap = document.getElementById('pen-meter-wrap');
    const hintEl = document.getElementById('pen-hint');
    const fill = document.getElementById('pen-meter-fill');
    const marker = document.getElementById('pen-meter-marker');

    if (this.phase === 'intro') {
      infoEl.textContent = `${this.kicker === 'user' ? this.userTeam.name : this.cpuTeam.name} patea`;
    } else if (this.phase === 'aim') {
      infoEl.textContent = `${this.userTeam.name} patea — Izq/Der para apuntar, Espacio para fijar`;
      meterWrap.classList.remove('hidden');
      fill.style.width = '100%'; marker.style.left = (this.cursor * 100) + '%';
      hintEl.textContent = 'Elegí dónde apuntar';
    } else if (this.phase === 'power') {
      infoEl.textContent = `${this.userTeam.name} patea — Espacio para la potencia`;
      meterWrap.classList.remove('hidden');
      marker.style.left = (this.power * 100) + '%';
      hintEl.textContent = 'Frená la barra cerca del centro-alto para más precisión';
    } else if (this.phase === 'cpu-wind') {
      infoEl.textContent = `${this.cpuTeam.name} toma carrera...`;
      meterWrap.classList.add('hidden');
    } else if (this.phase === 'gk-defend') {
      infoEl.textContent = `¡Defendé! Izq/Der para mover al arquero, Espacio para atajar`;
      meterWrap.classList.remove('hidden');
      fill.style.width = '100%'; marker.style.left = (this.cursor * 100) + '%';
      hintEl.textContent = '';
    } else if (this.phase === 'anim') {
      infoEl.textContent = '...';
      meterWrap.classList.add('hidden');
    } else if (this.phase === 'summary') {
      infoEl.textContent = this.resultMsg;
      meterWrap.classList.add('hidden');
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.userTeam.name} ${this.scoreUser}  -  ${this.scoreCpu} ${this.cpuTeam.name}`, PW / 2, 30);
  }

  _gkRenderX() {
    if (this.phase === 'gk-defend' || this.phase === 'aim' || this.phase === 'power' || this.phase === 'cpu-wind') return 0.5;
    return this.gkTargetX !== undefined ? lerp(0.5, this.gkTargetX, this.ballAnim) : 0.5;
  }

  _drawCursor(frac, color) {
    const x = PGOAL_X + frac * PGOAL_W;
    penCtx.beginPath();
    penCtx.moveTo(x, PGOAL_Y - 10);
    penCtx.lineTo(x - 8, PGOAL_Y - 22);
    penCtx.lineTo(x + 8, PGOAL_Y - 22);
    penCtx.closePath();
    penCtx.fillStyle = color;
    penCtx.fill();
  }
}

let penCanvas, penCtx;

function startPenalties(match) {
  App.pen = new Penalties(match);
  showScreen('screen-penalties');
}

/* ===================== MAIN LOOP ===================== */

let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  dt = clamp(dt, 0, 0.05);

  if (App.screen === 'screen-match' && App.match) {
    App.match.update(dt);
    App.match.render();
    if (App.match.finished) {
      const m = App.match;
      App.match = null;
      handleMatchFinished(m);
    }
  } else if (App.screen === 'screen-penalties' && App.pen) {
    App.pen.update(dt);
    App.pen.render();
  }
}

/* ===================== INIT ===================== */

function init() {
  pitchCanvas = document.getElementById('pitch');
  pitchCtx = pitchCanvas.getContext('2d');
  penCanvas = document.getElementById('pen-canvas');
  penCtx = penCanvas.getContext('2d');
  initMenus();
  showScreen('screen-menu');
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', init);

})();
