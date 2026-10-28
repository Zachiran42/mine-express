/* Mine Express — original game code, MIT. No network or external assets. */
(function () {
  'use strict';
  const COLS = 10, ROWS = 12, CELL = 33, LEFT = 45, TOP = 66;
  const ink = '#f4eee1', muted = '#a4b7b9', gold = '#ffc96d', teal = '#64dfc5';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function round(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function text(c, s, x, y, size, color, align) {
    c.fillStyle = color || ink; c.font = `600 ${size}px system-ui, sans-serif`;
    c.textAlign = align || 'left'; c.fillText(s, x, y);
  }
  function gem(c, x, y, color, scale) {
    const k = scale || 1;
    c.beginPath(); c.moveTo(x, y - 9 * k); c.lineTo(x + 8 * k, y - 3 * k);
    c.lineTo(x + 5 * k, y + 6 * k); c.lineTo(x - 5 * k, y + 6 * k);
    c.lineTo(x - 8 * k, y - 3 * k); c.closePath(); c.fillStyle = color; c.fill();
    c.strokeStyle = '#ffffff77'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(x - 6 * k, y - 3 * k); c.lineTo(x + 6 * k, y - 3 * k);
    c.moveTo(x, y - 8 * k); c.lineTo(x + 3 * k, y - 3 * k); c.lineTo(x, y + 5 * k); c.stroke();
  }
  window.createGame = function (api) {
    let s, touch = null, flash = 0, totalTime = 0;
    const p = api.progress;
    function normalizeProgress() {
      p.credits = Number.isFinite(p.credits) ? clamp(Math.floor(p.credits), 0, 99999999) : 0;
      p.tank = Number.isInteger(p.tank) ? clamp(p.tank, 0, 3) : 0;
      p.bag = Number.isInteger(p.bag) ? clamp(p.bag, 0, 3) : 0;
      p.day = Number.isInteger(p.day) ? clamp(p.day, 1, 999) : 1;
      p.best = Number.isFinite(p.best) ? Math.max(0, p.best) : 0;
    }
    normalizeProgress();
    const oxygenMax = () => 55 + p.tank * 17;
    const bagMax = () => 8 + p.bag * 4;
    const target = () => 90 + Math.min(s.day - 1, 12) * 25;
    const price = kind => kind === 'tank' ? 70 + p.tank * 65 : 65 + p.bag * 60;
    function hud() {
      api.hud('OXYGÈNE', Math.ceil(s.oxygen) + ' s', 'SAC', s.cargo + '/' + bagMax(), 'CRÉDITS', p.credits);
    }
    function generate() {
      const grid = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => {
        if (y === 0) return 0;
        const r = Math.random();
        if (y > 2 && r < 0.09 && x !== 4 && x !== 5) return 2;
        if (r < 0.37) return y > 7 ? 5 : y > 3 ? 4 : 3;
        return r > 0.92 ? 0 : 1;
      }));
      // The shaft is always diggable, and shallow deposits guarantee a first return.
      for (let y = 1; y < ROWS; y++) grid[y][4] = y % 2 ? 1 : (y > 6 ? 5 : 4);
      for (let x = 2; x <= 7; x++) grid[1][x] = 3;
      return grid;
    }
    function reset() {
      normalizeProgress();
      s = { grid: generate(), x: 4, y: 0, oxygen: oxygenMax(), cargo: 0, value: 0,
        earned: 0, day: p.day, mode: 'surface', finished: false };
      touch = null; flash = 0; totalTime = 0; hud();
      api.toast('Au camp : améliorez le matériel, puis descendez.'); api.save();
    }
    function finish(won) {
      if (s.finished) return;
      s.finished = true;
      p.best = Math.max(p.best, s.earned);
      hud(); api.save();
      api.end(won ? 'Belle extraction !' : 'Réserve épuisée', won
        ? s.earned + ' crédits rapportés au camp. Le secteur suivant vous attend.'
        : 'Votre sac est perdu, mais les crédits déjà déposés et vos améliorations sont conservés.', s.earned, won);
    }
    function dive() {
      if (s.finished || s.mode !== 'surface') return;
      s.mode = 'mine'; s.oxygen = oxygenMax();
      api.toast('Touchez une case voisine ou balayez pour creuser. Revenez à la surface.');
      move(0, 1); api.save();
    }
    function upgrade(kind) {
      if (s.finished || s.mode !== 'surface') return;
      if (p[kind] >= 3) { api.toast('Cette amélioration est au niveau maximum.'); return; }
      const cost = price(kind);
      if (p.credits < cost) { api.toast('Il manque ' + (cost - p.credits) + ' crédits.'); return; }
      p.credits -= cost; p[kind]++; s.oxygen = oxygenMax();
      hud(); api.save(); api.toast(kind === 'tank' ? 'Réserve d’oxygène agrandie.' : 'Sac agrandi.');
    }
    function bank() {
      const amount = s.value;
      p.credits += amount; s.earned += amount; s.cargo = 0; s.value = 0;
      s.mode = 'surface'; s.oxygen = oxygenMax(); hud(); api.save();
      if (s.earned >= target()) { finish(true); return; }
      api.toast(amount ? amount + ' crédits déposés. Encore ' + (target() - s.earned) + ' pour ce secteur.' : 'Oxygène rechargé au camp.');
    }
    function move(dx, dy) {
      if (!s || s.finished || s.mode !== 'mine') return;
      const x = s.x + dx, y = s.y + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
      const tile = s.grid[y][x];
      if (tile === 2) { flash = 0.22; api.toast('Roche dure : contournez-la.'); return; }
      if (tile >= 3 && s.cargo >= bagMax()) { api.toast('Sac plein : remontez déposer vos minerais.'); return; }
      s.x = x; s.y = y;
      if (tile >= 3) {
        s.cargo++; s.value += tile === 3 ? 12 : tile === 4 ? 23 : 38;
        s.oxygen -= 0.8;
      } else if (tile === 1) s.oxygen -= 0.55;
      s.grid[y][x] = 0;
      if (s.oxygen <= 0) { s.oxygen = 0; finish(false); return; }
      if (y === 0) bank();
      hud(); api.save();
    }
    function update(dt) {
      if (!s) return;
      dt = clamp(Number(dt) || 0, 0, 0.15); totalTime += dt; flash = Math.max(0, flash - dt);
      if (s.mode === 'mine' && !s.finished) {
        const before = Math.ceil(s.oxygen); s.oxygen = Math.max(0, s.oxygen - dt);
        if (before !== Math.ceil(s.oxygen)) hud();
        if (s.oxygen <= 0) finish(false);
      }
    }
    function draw(c) {
      if (!s) return;
      c.fillStyle = '#101e26'; c.fillRect(0, 0, 420, 600);
      const glow = c.createRadialGradient(210, 100, 5, 210, 160, 390);
      glow.addColorStop(0, '#233c42'); glow.addColorStop(1, '#101820'); c.fillStyle = glow; c.fillRect(0, 0, 420, 600);
      text(c, 'SECTEUR ' + String(s.day).padStart(2, '0'), 28, 28, 12, teal);
      text(c, 'Chaque retour compte.', 28, 49, 17, ink);
      text(c, s.earned + ' / ' + target() + ' cr.', 390, 42, 16, gold, 'right');
      round(c, LEFT - 7, TOP - 6, CELL * COLS + 14, CELL * ROWS + 12, 10, '#091217', '#40545a');
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const px = LEFT + x * CELL, py = TOP + y * CELL, tile = s.grid[y][x];
        if (y === 0) {
          c.fillStyle = '#264e44'; c.fillRect(px, py, CELL - 1, CELL - 1);
          c.fillStyle = '#6ebc80'; c.fillRect(px, py, CELL - 1, 3);
          if (x === 4) { round(c, px + 6, py + 6, 20, 22, 3, '#9dd7af'); c.fillStyle = '#25473c'; c.fillRect(px + 13, py + 14, 7, 14); }
        } else if (tile === 0) {
          c.fillStyle = y % 2 ? '#152229' : '#17262d'; c.fillRect(px, py, CELL - 1, CELL - 1);
          c.fillStyle = '#294049'; c.fillRect(px + 5, py + 25, 3, 2);
        } else {
          const stone = tile === 2;
          round(c, px + 1, py + 1, CELL - 3, CELL - 3, 4, stone ? '#465463' : '#775449');
          c.strokeStyle = stone ? '#6c7d8b' : '#a2735b'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(px + 4, py + 7); c.lineTo(px + 25, py + 7); c.stroke();
          if (tile >= 3) gem(c, px + 16, py + 16, tile === 3 ? gold : tile === 4 ? '#70e4dd' : '#be9bff');
          if (tile === 2) { c.strokeStyle = '#24313d'; c.beginPath(); c.moveTo(px + 8, py + 28); c.lineTo(px + 14, py + 15); c.lineTo(px + 23, py + 10); c.stroke(); }
        }
      }
      const px = LEFT + s.x * CELL + CELL / 2, py = TOP + s.y * CELL + CELL / 2;
      if (s.mode === 'mine') {
        c.fillStyle = '#ffcd7533'; c.beginPath(); c.arc(px, py, 26 + Math.sin(totalTime * 3) * 2, 0, Math.PI * 2); c.fill();
        round(c, px - 9, py - 7, 18, 18, 5, flash > 0 ? '#ff947b' : '#f3b94f');
        round(c, px - 10, py - 11, 20, 7, 3, '#e9dfbf');
        c.fillStyle = '#fff9cf'; c.beginPath(); c.arc(px, py - 8, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3b3332'; c.fillRect(px - 5, py - 1, 3, 3); c.fillRect(px + 2, py - 1, 3, 3);
      }
      round(c, 28, 485, 364, 52, 12, '#1b3036', '#344d54');
      text(c, 'CONTENU DU SAC', 43, 505, 10, muted); text(c, s.value + ' crédits', 43, 525, 19, gold);
      const ratio = s.oxygen / oxygenMax();
      round(c, 233, 505, 143, 10, 5, '#0d1d24');
      if (ratio > 0) round(c, 233, 505, Math.max(7, 143 * ratio), 10, 5, ratio < 0.25 ? '#ff7e70' : teal);
      text(c, 'O₂  ' + Math.ceil(s.oxygen) + ' / ' + oxygenMax() + ' s', 376, 529, 12, ratio < 0.25 ? '#ff9e8c' : muted, 'right');
      text(c, 'Balayez • Touchez une case voisine', 210, 561, 13, muted, 'center');
      text(c, 'La ligne verte est votre camp.', 210, 582, 12, '#748e94', 'center');
      if (s.mode === 'surface' && !s.finished) {
        c.fillStyle = '#09151bbf'; c.fillRect(28, 112, 364, 344);
        round(c, 36, 132, 348, 300, 18, '#183039', '#4f716f');
        text(c, 'LE CAMP DE BASE', 210, 168, 13, teal, 'center');
        text(c, 'Préparez la prochaine descente', 210, 199, 18, ink, 'center');
        text(c, 'Objectif : rapporter ' + target() + ' crédits', 210, 224, 14, muted, 'center');
        round(c, 53, 248, 151, 79, 11, '#23414a', '#43616a');
        round(c, 216, 248, 151, 79, 11, '#23414a', '#43616a');
        text(c, 'Oxygène  +' + 17 + ' s', 128, 272, 14, ink, 'center');
        text(c, p.tank >= 3 ? 'NIVEAU MAX.' : price('tank') + ' crédits', 128, 296, 14, gold, 'center');
        text(c, 'Niveau ' + p.tank + '/3', 128, 315, 11, muted, 'center');
        text(c, 'Sac  +4 places', 291, 272, 14, ink, 'center');
        text(c, p.bag >= 3 ? 'NIVEAU MAX.' : price('bag') + ' crédits', 291, 296, 14, gold, 'center');
        text(c, 'Niveau ' + p.bag + '/3', 291, 315, 11, muted, 'center');
        round(c, 53, 345, 314, 51, 12, gold);
        text(c, 'DESCENDRE DANS LA MINE', 210, 377, 15, '#28302e', 'center');
        text(c, s.earned ? 'Déjà déposés : ' + s.earned + ' crédits' : 'Les achats restent entre les parties.', 210, 416, 12, muted, 'center');
      }
    }
    function pointer(type, x, y) {
      if (type === 'down') { touch = { x, y }; return; }
      if (type === 'cancel') { touch = null; return; }
      if (type !== 'up' || !touch || !s || s.finished) return;
      const dx = x - touch.x, dy = y - touch.y; touch = null;
      if (s.mode === 'surface') {
        if (y >= 345 && y <= 399 && x >= 53 && x <= 367) dive();
        else if (y >= 248 && y <= 327 && x >= 53 && x <= 204) upgrade('tank');
        else if (y >= 248 && y <= 327 && x >= 216 && x <= 367) upgrade('bag');
        return;
      }
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 18) {
        if (Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx), 0); else move(0, Math.sign(dy));
      } else {
        const tx = Math.floor((x - LEFT) / CELL), ty = Math.floor((y - TOP) / CELL);
        if (Math.abs(tx - s.x) + Math.abs(ty - s.y) === 1) move(tx - s.x, ty - s.y);
      }
    }
    function key(k, down) {
      if (!down || !s || s.finished) return;
      const key = String(k).toLowerCase();
      if (s.mode === 'surface') { if (key === ' ' || key === 'space' || key === 'enter' || key === 'arrowdown') dive(); return; }
      if (key === 'arrowleft' || key === 'a' || key === 'q') move(-1, 0);
      if (key === 'arrowright' || key === 'd') move(1, 0);
      if (key === 'arrowup' || key === 'w' || key === 'z') move(0, -1);
      if (key === 'arrowdown' || key === 's') move(0, 1);
    }
    function snapshot() { return JSON.parse(JSON.stringify(s)); }
    function restore(data) {
      const ok = data && Array.isArray(data.grid) && data.grid.length === ROWS &&
        data.grid.every(row => Array.isArray(row) && row.length === COLS && row.every(v => Number.isInteger(v) && v >= 0 && v <= 5)) &&
        Number.isInteger(data.x) && data.x >= 0 && data.x < COLS && Number.isInteger(data.y) && data.y >= 0 && data.y < ROWS &&
        Number.isFinite(data.oxygen) && data.oxygen > 0 && data.oxygen <= oxygenMax() &&
        Number.isInteger(data.cargo) && data.cargo >= 0 && data.cargo <= bagMax() && Number.isInteger(data.value) && data.value >= 0 && data.value <= data.cargo * 38 &&
        Number.isInteger(data.earned) && data.earned >= 0 && Number.isInteger(data.day) && data.day >= 1 && data.day <= 999 &&
        (data.mode === 'surface' || data.mode === 'mine') && !data.finished;
      if (!ok) { reset(); return false; }
      s = JSON.parse(JSON.stringify(data)); touch = null; flash = 0; totalTime = 0; hud(); return true;
    }
    function next() { p.day = Math.min(999, Math.max(p.day, s.day + 1)); reset(); }
    return { reset, update, draw, pointer, key, snapshot, restore, next };
  };
}());