#!/usr/bin/env node
/* tests/sim/mcus.js — 모든 MCU 에서 맨 칩 / 보드 프리셋으로 LED·타이머·UART 스켈레톤을 생성→컴파일→실행 */
'use strict';
const path = require('path'); const ROOT = path.resolve(__dirname, '..', '..'); global.window = global;
for (const f of ['chips', 'runtime', 'devices', 'codegen', 'project']) require(path.join(ROOT, 'assets/js/stm32', f + '.js'));
global.STM32C = require(path.join(ROOT, 'assets/js/stm32/ccompiler.js'));
const C = global.STM32Chips, G = global.STM32Codegen, R = global.STM32Runtime, D = global.STM32Devices, PJ = global.STM32Project;
let fail = 0;
function run(label, P, user) {
  PJ.normalize(P); P.mainc = G.genMainC(P, G.userFromExample(user));
  const chip = C.chipOf(P), files = { 'Core/Src/main.c': P.mainc, 'Core/Inc/main.h': G.genMainH(P) }; files[chip.halPrefix + '_hal.h'] = '';
  const r = global.STM32C.compile({ files, entry: 'Core/Src/main.c', env: R.compilerEnv() });
  const out = { logs: [], toggles: {}, term: '' };
  if (!r.ok) { fail++; console.log('FAIL ' + label + ' compile: ' + r.errors.map(e => e.line + ':' + e.msg).join(' | ')); return; }
  const m = new R.Machine({ project: P }); m.on('log', (l, s) => out.logs.push(l + ': ' + s)); m.on('terminal', (i, b) => out.term += Buffer.from(b).toString());
  const devs = D.instantiate(m, P.nodes, P.wires); Object.keys(m.pins).forEach(p => m.watch(p, () => { out.toggles[p] = (out.toggles[p] || 0) + 1; }));
  try { m.load(r.js); } catch (e) { fail++; console.log('FAIL ' + label + ' load: ' + e.message); return; }
  const btn = devs.find(d => /button/.test(d.def.type));
  for (let t = 0; t < 3000 && m.state === 'running'; t += 16) { if (btn && t === 1008) btn.press(true); if (btn && t === 1200) btn.press(false); m.step(16, 50); devs.forEach(d => d.tick && d.tick(16)); m.frameMark(); }
  const bad = m.state !== 'running' || out.logs.some(l => /^error/.test(l));
  if (bad) fail++;
  console.log((bad ? 'FAIL ' : 'ok   ') + label.padEnd(34) + ' isr=' + m.stats.isr + ' toggles=' + JSON.stringify(out.toggles).slice(0, 70) + ' term=' + JSON.stringify(out.term.slice(0, 30)));
  if (bad) out.logs.forEach(l => console.log('     ' + l));
}
const user = { includes: '#include <stdio.h>\n', pv: 'volatile uint32_t ticks = 0;\n', u2: 'HAL_TIM_Base_Start_IT(&htim3);\nHAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);\n__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 300);\n',
  loop: '    HAL_GPIO_TogglePin(LED1_GPIO_Port, LED1_Pin);\n    printf("t=%lu ticks=%lu", HAL_GetTick(), ticks); puts("");\n    HAL_Delay(200);\n',
  u4: 'int __io_putchar(int ch) { HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY); return ch; }\nvoid HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) { if (htim->Instance == TIM3) ticks++; }\nvoid HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { ticks += 1000; }\n' };
Object.keys(C.CHIPS).forEach(id => {
  const chip = C.CHIPS[id], ck = C.clocks(chip, chip.defClk);
  // 맨 칩: LED PB0, 버튼 PB1(EXTI), TIM3 1kHz + PWM CH1(PA6), USART2, 터미널 노드
  const P = PJ.create(id, null);
  P.pins = { PB0: { signal: 'GPIO_Output', label: 'LED1' }, PB1: { signal: 'GPIO_EXTI', label: 'SW1', pull: 'up', trigger: 'falling' }, PA6: { signal: 'TIM3_CH1' } };
  P.periph = { USART2: { mode: 'async', baud: 115200 }, TIM3: { psc: Math.round(ck.tim1) - 1, arr: 999, ch: { 1: 'pwm' } } };
  P.nvic = {}; P.nvic[C.extiLine(chip, 1)] = true; P.nvic[chip.periph.TIM3.irq] = true;
  P.nodes = [{ id: 'led1', type: 'led', x: 0, y: 0, props: {} }, { id: 'sw1', type: 'button', x: 0, y: 0, props: { wiring: 'gnd' } }, { id: 'ser1', type: 'uart', x: 0, y: 0, props: {} }];
  P.wires = [['PB0', 'led1.in'], ['PB1', 'sw1.out'], ['PA2', 'ser1.rx'], ['PA3', 'ser1.tx']];
  run(id + ' (bare)', P, user);
  C.boardsFor(id).forEach(b => {
    const Q = PJ.create(id, b); const led = C.BOARDS[b].builtin.find(x => x.type === 'board-led');
    Q.pins.PA6 = { signal: 'TIM3_CH1' }; Q.periph.TIM3 = { psc: Math.round(ck.tim1) - 1, arr: 999, ch: { 1: 'pwm' } }; Q.nvic[chip.periph.TIM3.irq] = true;
    const btnPin = C.BOARDS[b].builtin.find(x => x.type === 'board-button'); if (btnPin) Q.nvic[C.extiLine(chip, +btnPin.pin.slice(2))] = true;
    if (!Q.periph.USART2) { Q.periph.USART2 = { mode: 'async', baud: 115200 }; Q.nodes.push({ id: 'ser1', type: 'uart', x: 0, y: 0, props: {} }); Q.wires.push(['PA2', 'ser1.rx'], ['PA3', 'ser1.tx']); }
    const u2 = Object.assign({}, user, { loop: user.loop.replace(/LED1_GPIO_Port, LED1_Pin/, led.id + '_GPIO_Port, ' + led.id + '_Pin') });
    run(id + ' + ' + b, Q, u2);
  });
});
console.log(fail ? fail + ' 개 실패' : '모두 통과');
process.exit(fail ? 1 : 0);
