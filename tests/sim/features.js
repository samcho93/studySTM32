#!/usr/bin/env node
/* tests/sim/features.js — 중급 HAL 기능(입력 캡처·IWDG·RTC·저전력·UART idle·RTOS) 확인 */
'use strict';
const path = require('path'); const ROOT = path.resolve(__dirname, '..', '..'); global.window = global;
for (const f of ['chips', 'runtime', 'devices', 'codegen', 'project']) require(path.join(ROOT, 'assets/js/stm32', f + '.js'));
global.STM32C = require(path.join(ROOT, 'assets/js/stm32/ccompiler.js'));
const G = global.STM32Codegen, R = global.STM32Runtime, D = global.STM32Devices, PJ = global.STM32Project;
let fail = 0;
const only = process.argv[2];

function run(name, setup, user, ms, check, hook) {
  if (only && only !== name) return;
  const P = PJ.create('STM32F411RE', 'NUCLEO-F411RE'); setup(P); PJ.normalize(P);
  P.mainc = G.genMainC(P, G.userFromExample(user));
  const files = Object.assign({ 'Core/Src/main.c': P.mainc, 'Core/Inc/main.h': G.genMainH(P), 'stm32f4xx_hal.h': '' }, R.VIRTUAL_HEADERS);
  const r = global.STM32C.compile({ files, entry: 'Core/Src/main.c', env: R.compilerEnv() });
  if (!r.ok) {
    fail++; console.log('FAIL ' + name + ' compile: ' + r.errors.map(e => e.line + ':' + e.msg).join(' | '));
    console.log(P.mainc.split('\n').slice(r.errors[0].line - 3, r.errors[0].line + 2).join('\n')); return;
  }
  const m = new R.Machine({ project: P }), logs = []; let term = '';
  m.on('log', (l, s) => logs.push(l + ': ' + s)); m.on('terminal', (i, b) => { term += Buffer.from(b).toString(); });
  const devs = D.instantiate(m, P.nodes, P.wires);
  try { m.load(r.js); } catch (e) { fail++; console.log('FAIL ' + name + ' load ' + e.message); return; }
  for (let t = 0; t < ms && m.state === 'running'; t += 10) { if (hook) hook(t, devs, m); m.step(10, 200); devs.forEach(d => d.tick && d.tick(10)); }
  const res = check(term, m, logs);
  if (res !== true || m.state !== 'running' || logs.some(l => /^error/.test(l))) {
    fail++; console.log('FAIL ' + name + ': ' + res + ' state=' + m.state);
    logs.slice(-8).forEach(l => console.log('   ' + l)); console.log('   TERM ' + JSON.stringify(term.slice(0, 400)));
  } else console.log('ok   ' + name.padEnd(15) + JSON.stringify(term.slice(0, 120)));
  if (only) { logs.forEach(l => console.log('   ' + l)); console.log('   TERM ' + JSON.stringify(term.slice(0, 1500))); }
}
const PUT = 'int __io_putchar(int ch) { HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY); return ch; }\n';

// 1) 입력 캡처: PA6(TIM3_CH1) 1 kHz PWM 을 PA0(TIM2_CH1) 로 받아 주기 측정 → 1000 µs
run('input-capture', P => {
  P.pins.PA0 = { signal: 'TIM2_CH1' }; P.pins.PA6 = { signal: 'TIM3_CH1' };
  P.periph.TIM2 = { psc: 83, arr: 4294967295, ch: { 1: 'ic' } }; P.periph.TIM3 = { psc: 83, arr: 999, ch: { 1: 'pwm' }, pulse: { 1: 250 } };
  P.nvic.TIM2 = true;
}, {
  includes: '#include <stdio.h>\n', pv: 'volatile uint32_t last = 0, period = 0;\n',
  u2: '  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);\n  HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_1);\n',
  loop: '    printf("period=%lu us\\r\\n", period);\n    HAL_Delay(100);\n',
  u4: PUT + 'void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)\n{\n  if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1)\n  {\n    uint32_t now = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);\n    period = now - last;\n    last = now;\n  }\n}\n'
}, 300, t => /period=1000 us/.test(t) || 'no 1000us',
  (t, d, m) => { if (t === 0) m.watch('PA6', (lv, tt, isPwm) => { if (!isPwm) m.drive('PA0', lv); }); m._pwmJumper = m._pwmJumper || (function () {
    // PWM 은 레벨 변화 이벤트가 없으므로 1 kHz 에지를 직접 만들어 준다 (점퍼선 역할)
    (function edge(k) { m.at(k * 0.5, () => { m.drive('PA0', k % 2 ? 0 : 1); edge(k + 1); }); })(1); return true; })(); });

// 2) IWDG: Refresh 를 멈추면 리셋 → 리셋 원인 출력
run('iwdg', P => { }, {
  includes: '#include <stdio.h>\n', pv: 'IWDG_HandleTypeDef hiwdg;\nuint32_t n = 0;\n',
  u2: '  if (__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) printf("reset by IWDG\\r\\n"); else printf("power on\\r\\n");\n  __HAL_RCC_CLEAR_RESET_FLAGS();\n  hiwdg.Instance = IWDG;\n  hiwdg.Init.Prescaler = IWDG_PRESCALER_32;\n  hiwdg.Init.Reload = 499;\n  HAL_IWDG_Init(&hiwdg);\n',
  loop: '    if (n++ < 5) HAL_IWDG_Refresh(&hiwdg);\n    HAL_Delay(100);\n', u4: PUT
}, 2000, (t, m) => (/power on[\s\S]*reset by IWDG/.test(t) && m.resetCount >= 1) || 'no iwdg reset');

// 3) RTC: 23:59:58 설정 → 자정·연도 넘김
run('rtc', P => { }, {
  includes: '#include <stdio.h>\n', pv: 'RTC_HandleTypeDef hrtc;\n',
  u2: '  hrtc.Instance = RTC;\n  HAL_RTC_Init(&hrtc);\n  RTC_TimeTypeDef t = {0};\n  RTC_DateTypeDef d = {0};\n  t.Hours = 23; t.Minutes = 59; t.Seconds = 58;\n  HAL_RTC_SetTime(&hrtc, &t, RTC_FORMAT_BIN);\n  d.Year = 26; d.Month = 12; d.Date = 31;\n  HAL_RTC_SetDate(&hrtc, &d, RTC_FORMAT_BIN);\n',
  loop: '    RTC_TimeTypeDef t;\n    RTC_DateTypeDef d;\n    HAL_RTC_GetTime(&hrtc, &t, RTC_FORMAT_BIN);\n    HAL_RTC_GetDate(&hrtc, &d, RTC_FORMAT_BIN);\n    printf("20%02d-%02d-%02d %02d:%02d:%02d\\r\\n", d.Year, d.Month, d.Date, t.Hours, t.Minutes, t.Seconds);\n    HAL_Delay(1000);\n',
  u4: PUT
}, 3500, t => /2027-01-01 00:00:0[01]/.test(t) || 'no rollover');

// 4) 저전력: STOP 모드에서 B1(EXTI) 로 깨어남
run('stop-mode', P => { P.nvic.EXTI15_10 = true; }, {
  includes: '#include <stdio.h>\n', pv: 'volatile uint32_t wakes = 0;\n',
  loop: '    printf("sleep\\r\\n");\n    HAL_SuspendTick();\n    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);\n    HAL_ResumeTick();\n    SystemClock_Config();\n    printf("woke %lu\\r\\n", wakes);\n',
  u4: PUT + 'void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { if (GPIO_Pin == B1_Pin) wakes++; }\n'
}, 3000, (t, m) => (/woke [1-9]/.test(t) && m.powerStats().stop > 1000) || 'no wake / no stop time',
  (t, d) => { const b = d.find(x => x.def.type === 'board-button'); if (t === 1000) b.press(true); if (t === 1200) b.press(false); });

// 5) UART ReceiveToIdle: 가변 길이 줄 수신
run('uart-idle', P => { P.nvic.USART2 = true; }, {
  includes: '#include <stdio.h>\n', pv: 'uint8_t rx[64];\nvolatile uint16_t got = 0;\n',
  u2: '  HAL_UARTEx_ReceiveToIdle_IT(&huart2, rx, sizeof(rx));\n',
  loop: '    if (got) { printf("got %u bytes\\r\\n", got); got = 0; HAL_UARTEx_ReceiveToIdle_IT(&huart2, rx, sizeof(rx)); }\n    HAL_Delay(10);\n',
  u4: PUT + 'void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size) { got = Size; }\n'
}, 1500, t => /got 12 bytes/.test(t) || 'no idle event',
  (t, d) => { if (t === 500) d.find(x => x.def.type === 'vcp').send('hello world'); });

// 6) RTOS: 두 태스크 + 메시지 큐 + 뮤텍스
run('rtos', P => { }, {
  includes: '#include <stdio.h>\n#include "cmsis_os.h"\n',
  pv: 'osThreadId_t prodHandle, consHandle;\nconst osThreadAttr_t prod_attr = { .name = "producer", .stack_size = 128 * 4, .priority = (osPriority_t) osPriorityNormal };\nconst osThreadAttr_t cons_attr = { .name = "consumer", .stack_size = 128 * 4, .priority = (osPriority_t) osPriorityAboveNormal };\nosMessageQueueId_t q;\nosMutexId_t mtx;\n',
  pfp: 'void Producer(void *argument);\nvoid Consumer(void *argument);\n',
  u2: '  osKernelInitialize();\n  q = osMessageQueueNew(8, sizeof(uint32_t), NULL);\n  mtx = osMutexNew(NULL);\n  prodHandle = osThreadNew(Producer, NULL, &prod_attr);\n  consHandle = osThreadNew(Consumer, NULL, &cons_attr);\n  osKernelStart();\n',
  u4: PUT + 'void Producer(void *argument)\n{\n  uint32_t n = 0;\n  for (;;) { n++; osMessageQueuePut(q, &n, 0, osWaitForever); osDelay(200); }\n}\nvoid Consumer(void *argument)\n{\n  uint32_t v;\n  for (;;)\n  {\n    if (osMessageQueueGet(q, &v, NULL, osWaitForever) == osOK)\n    {\n      osMutexAcquire(mtx, osWaitForever);\n      printf("[%lu] %s got %lu\\r\\n", osKernelGetTickCount(), osThreadGetName(osThreadGetId()), v);\n      osMutexRelease(mtx);\n    }\n  }\n}\n'
}, 1200, t => /consumer got 5/.test(t) || 'no queue flow');

// 7) CubeMX 생성 경로: FREERTOS 미들웨어 + 태스크 2개 (USER CODE 5 / StartBlink)
run('rtos-codegen', P => {
  P.periph.FREERTOS = { tasks: [{ name: 'defaultTask', fn: 'StartDefaultTask', prio: 'osPriorityNormal' }, { name: 'blink', fn: 'StartBlink', prio: 'osPriorityLow' }] };
}, {
  includes: '#include <stdio.h>\n',
  tasks: {
    StartDefaultTask: '  for(;;)\n  {\n    printf("tick %lu\\r\\n", osKernelGetTickCount());\n    osDelay(250);\n  }\n',
    StartBlink: '  for(;;)\n  {\n    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);\n    osDelay(100);\n  }\n'
  },
  u4: PUT
}, 1100, (t, m) => (/tick 10\d\d/.test(t) && m.pins.PA5.hist.length >= 9) || 'tasks did not run');

// 8) CubeMX 생성 경로: RTC 웨이크업 1초 + STOP 모드 반복
run('rtc-wakeup-stop', P => { P.periph.RTC = { hours: 8, minutes: 30, seconds: 0, wakeup: 1 }; P.nvic.RTC_WKUP = true; }, {
  includes: '#include <stdio.h>\n',
  loop: '    RTC_TimeTypeDef t; RTC_DateTypeDef d;\n    HAL_RTC_GetTime(&hrtc, &t, RTC_FORMAT_BIN);\n    HAL_RTC_GetDate(&hrtc, &d, RTC_FORMAT_BIN);\n    printf("%02d:%02d:%02d\\r\\n", t.Hours, t.Minutes, t.Seconds);\n    HAL_SuspendTick();\n    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);\n    HAL_ResumeTick();\n',
  u4: PUT + 'void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc) { }\n'
}, 3500, (t, m) => (/08:30:03/.test(t) && m.powerStats().avgMA < 5) || ('no wake/avg ' + m.powerStats().avgMA.toFixed(2)));

// 9) CubeMX 생성 경로: IWDG 주변장치
run('iwdg-codegen', P => { P.periph.IWDG = { prescaler: 32, reload: 999 }; }, {
  includes: '#include <stdio.h>\n', pv: 'uint32_t n = 0;\n',
  u2: '  printf(__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST) ? "IWDG reset\\r\\n" : "boot\\r\\n");\n  __HAL_RCC_CLEAR_RESET_FLAGS();\n',
  loop: '    if (++n < 10) HAL_IWDG_Refresh(&hiwdg);\n    HAL_Delay(200);\n', u4: PUT
}, 4000, t => /boot\r\nIWDG reset/.test(t) || 'no reset');

console.log(fail ? fail + ' 개 실패' : '모두 통과'); process.exit(fail ? 1 : 0);
