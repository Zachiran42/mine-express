'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function setup(slug, progress = {}) {
  let seed = 16571;
  const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = { window: {}, Math: math };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'docs/game.js'), 'utf8'), sandbox);
  const events = [];
  const api = { progress, hud() {}, toast() {}, save() {}, end(...args) { events.push(args); } };
  const game = sandbox.window.createGame(api); game.reset();
  return { game, progress, events };
}
function tick(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 10); i++) game.update(0.1); }
function click(game, x, y) { game.pointer('down', x, y); game.pointer('up', x, y); }
function clone(s) { return JSON.parse(JSON.stringify(s)); }
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get(target, key) { if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient; return target[key] || (() => {}); }, set(target, key, val) { target[key] = val; return true; } });
const test = require('node:test');
test('mine: guaranteed accessible deposits across 100 generated maps', () => {
  const { game } = setup('mine-express');
  for (let sample = 0; sample < 100; sample++) {
    game.reset(); const s = game.snapshot(); const seen = new Set(['4,0']), queue = [[4, 0]]; let value = 0;
    while (queue.length) {
      const [x, y] = queue.shift(); const cell = s.grid[y][x];
      value += cell === 3 ? 12 : cell === 4 ? 23 : cell === 5 ? 38 : 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy, key = a + ',' + b;
        if (a >= 0 && a < 10 && b >= 0 && b < 12 && !seen.has(key) && s.grid[b][a] !== 2) { seen.add(key); queue.push([a, b]); }
      }
    }
    assert(value >= 90); for (let y = 0; y < 12; y++) assert.notEqual(s.grid[y][4], 2);
  }
});
test('mine: digging, returning, and depositing credits', () => {
  const { game, progress, events } = setup('mine-express'); game.key('Enter', true);
  assert.equal(game.snapshot().y, 1); assert.equal(game.snapshot().cargo, 1);
  game.key('ArrowUp', true); const s = game.snapshot();
  assert.equal(s.mode, 'surface'); assert.equal(s.cargo, 0); assert.equal(s.earned, 12); assert.equal(progress.credits, 12); assert.equal(events.length, 0);
});
test('mine: full bag and bedrock block movement', () => {
  const { game } = setup('mine-express'); game.key('Enter', true); let s = game.snapshot();
  s.cargo = 8; s.value = 96; s.grid[1][5] = 3; assert.equal(game.restore(s), true);
  game.key('ArrowRight', true); assert.equal(game.snapshot().x, 4);
  s.cargo = 0; s.value = 0; s.grid[1][5] = 2; game.restore(s); game.key('ArrowRight', true); assert.equal(game.snapshot().x, 4);
});
test('mine: upgrades spend credits and increase tank', () => {
  const { game, progress } = setup('mine-express', { credits: 200 }); click(game, 128, 280);
  assert.equal(progress.tank, 1); assert.equal(progress.credits, 130); assert.equal(game.snapshot().oxygen, 72);
});
test('mine: oxygen failure triggers once and keeps banked credits', () => {
  const { game, progress, events } = setup('mine-express', { credits: 50 }); game.key('Enter', true);
  const s = game.snapshot(); s.oxygen = 0.01; game.restore(s); tick(game, 2);
  assert.equal(events.length, 1); assert.equal(events[0][3], false); assert.equal(progress.credits, 50);
});
test('mine: successful mission unlocks next sector', () => {
  const { game, progress, events } = setup('mine-express'); game.key('Enter', true);
  const s = game.snapshot(); s.earned = 89; s.cargo = 1; s.value = 12; game.restore(s); game.key('ArrowUp', true);
  assert.equal(events.length, 1); assert.equal(events[0][3], true); game.next(); assert.equal(progress.day, 2); assert.equal(game.snapshot().day, 2);
});
test('mine: snapshot restores exactly and malformed saves reset safely', () => {
  const one = setup('mine-express'); one.game.key('Enter', true); tick(one.game, 2); const save = one.game.snapshot();
  const two = setup('mine-express', clone(one.progress)); assert.equal(two.game.restore(save), true); assert.deepEqual(clone(two.game.snapshot()), clone(save));
  assert.equal(two.game.restore({ grid: [[2]], oxygen: 'bad' }), false); assert.equal(two.game.snapshot().mode, 'surface');
  const before = JSON.stringify(two.game.snapshot()); two.game.draw(context); two.game.draw(context); assert.equal(JSON.stringify(two.game.snapshot()), before);
});

