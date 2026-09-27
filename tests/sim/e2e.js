#!/usr/bin/env node
/*
 * tests/sim/e2e.js — 예제 프로젝트를 컴파일러 → 런타임으로 끝까지 돌려 보는 검사
 *   node tests/sim/e2e.js            # 모든 예제
 *   node tests/sim/e2e.js l03-blink  # 하나만, 자세히
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
global.window = global;
for (const f of ['chips', 'runtime', 'devices', 'codegen', 'project', 'examples']) require(path.join(ROOT, 'assets/js/stm32', f + '.js'));
global.STM32C = require(path.join(ROOT, 'assets/js/stm32/ccompiler.js'));
const C = global.STM32Chips, G = global.STM32Codegen, R = global.STM32Runtime, D = global.STM32Devices, EX = global.STM32_EXAMPLES || {};

function project(id, ex) {
  const P = global.STM32Project.fromExample(id, ex);
  P.mainc = G.genMainC(P, G.userFromExample(ex.user || {}));
  return P;
}

function runOne(id, verbose) {
  const ex = EX[id], P = project(id, ex), chip = C.chipOf(P);
  const files = { 'Core/Src/main.c': P.mainc, 'Core/Inc/main.h': G.genMainH(P) }; files[chip.halPrefix + '_hal.h'] = '';
  const r = global.STM32C.compile({ files, entry: 'Core/Src/main.c', env: R.compilerEnv() });
  const out = { id, ok: r.ok, errors: r.errors || [], warnings: r.warnings || [], logs: [], term: '', toggles: {}, isr: 0 };
  if (!r.ok) return out;
  const m = new R.Machine({ project: P });
  m.on('log', (lv, msg) => out.logs.push(lv + ': ' + msg));
  m.on('terminal', (inst, bytes) => { out.term += Buffer.from(bytes).toString('utf8'); });
  const devs = D.instantiate(m, P.nodes, P.wires);
  Object.keys(m.pins).forEach(p => m.watch(p, () => { out.toggles[p] = (out.toggles[p] || 0) + 1; }));
  try { m.load(r.js); } catch (e) { out.ok = false; out.errors.push({ line: 0, msg: 'load: ' + e.message }); return out; }
  // 5 초 가상 시간, 버튼은 1 초에 눌렀다 1.3 초에 뗌, 터미널엔 2 초에 "hello" 전송
  const btn = devs.find(d => d.def.type === 'board-button' || d.def.type === 'button');
  const term = devs.find(d => d.def.type === 'vcp' || d.def.type === 'uart');
  const pot = devs.find(d => d.def.type === 'pot');
  let pressed = false, sent = false;
  for (let t = 0; t < 5000 && m.state === 'running'; t += 16) {
    if (btn && t >= 1000 && !pressed) { pressed = true; btn.press(true); }
    if (btn && t >= 1300 && pressed === true) { pressed = 2; btn.press(false); }
    if (term && t >= 2000 && !sent) { sent = true; term.send('hello'); }
    if (pot && t >= 2500 && t < 2520) pot.set(3000);
    m.step(16, 50);
    devs.forEach(d => d.tick && d.tick(16));
    m.frameMark();
  }
  out.state = m.state; out.isr = m.stats.isr; out.t = m.now();
  out.devices = devs.map(d => d.node.id + ':' + JSON.stringify(d.state()).slice(0, 90));
  return out;
}

const only = process.argv[2];
const ids = only ? [only] : Object.keys(EX);
if (!ids.length) { console.log('예제가 없습니다 (assets/js/stm32/examples.js)'); process.exit(1); }
let fail = 0;
for (const id of ids) {
  const o = runOne(id, !!only);
  const bad = !o.ok || o.state === 'fault' || o.logs.some(l => /^error/.test(l));
  if (bad) fail++;
  console.log((bad ? 'FAIL ' : 'ok   ') + id.padEnd(22) + (o.ok ? ' state=' + o.state + ' t=' + (o.t / 1000).toFixed(2) + 's isr=' + o.isr + ' toggles=' + JSON.stringify(o.toggles).slice(0, 80) : ' COMPILE ERROR'));
  o.errors.forEach(e => console.log('     error main.c:' + e.line + ': ' + e.msg));
  if (only || bad) { o.warnings.forEach(w => console.log('     warn: ' + (w.msg || w))); o.logs.forEach(l => console.log('     ' + l)); if (o.term) console.log('     TERM: ' + JSON.stringify(o.term.slice(0, 300))); (o.devices || []).forEach(d => console.log('     ' + d)); }
}
console.log(fail ? fail + ' 개 실패' : '모두 통과 (' + ids.length + ')');
process.exit(fail ? 1 : 0);
