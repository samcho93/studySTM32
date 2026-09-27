#!/usr/bin/env node
/*
 * C 서브셋 컴파일러 테스트: node tests/compiler/run.js [필터]
 *  - cases/*.c  : 테스트 프로그램 (Core/Src/main.c 로 컴파일). cases/*.h 는 모두 Core/Inc/ 에 들어간다.
 *  - cases/*.out: 기대 출력 (printf / UART / I2C 로그). \r\n 은 \n 으로 비교.
 *  - cases/*.err: 기대 오류. 첫 줄 = 줄 번호, 둘째 줄 = 메시지에 포함돼야 할 문자열.
 *  - cases/*.globals: (선택) 실행 후 globals() 값 비교용 JSON (부분 비교).
 *  - 첫 줄이 "// maxTime: N" 이면 가상 시간 N ms 까지만 실행 (무한 루프용, 기본 5000).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const STM32C = require('../../assets/js/stm32/ccompiler.js');

// ------------------------------------------------------------ 모의 런타임 H
function makeRuntime() {
  class Ptr {
    constructor(a, o) { this.a = a; this.o = o | 0; }
    add(n) { return new Ptr(this.a, this.o + n); }
  }
  const out = [];            // 출력 바이트
  const emit = (s) => { for (const b of Buffer.from(s, 'utf8')) out.push(b); };
  const state = { time: 0, fns: null };
  const kIds = {};
  let kNext = 0x1000;

  function cstr(p) {
    if (!(p instanceof Ptr)) return String(p);
    const b = [];
    for (let i = p.o; i < p.a.length && p.a[i] !== 0; i++) b.push(p.a[i] & 255);
    return Buffer.from(b).toString('utf8');
  }
  function format(fmt, args) {
    let ai = 0, r = '';
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c !== '%') { r += c; continue; }
      const m = /^([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|z)?([diuxXcsfFeEgGp%o])/.exec(fmt.slice(i + 1));
      if (!m) { r += c; continue; }
      i += m[0].length;
      const flags = m[1];
      let width = m[2] === '*' ? args[ai++] : m[2] ? +m[2] : 0;
      let prec = m[3] === '*' ? args[ai++] : m[3] !== undefined ? +m[3] : undefined;
      const conv = m[5];
      let s;
      if (conv === '%') { r += '%'; continue; }
      const a = args[ai++];
      switch (conv) {
        case 'd': case 'i': s = String(Math.trunc(a) | 0); break;
        case 'u': s = String(Math.trunc(a) >>> 0); break;
        case 'x': s = (a >>> 0).toString(16); break;
        case 'X': s = (a >>> 0).toString(16).toUpperCase(); break;
        case 'o': s = (a >>> 0).toString(8); break;
        case 'c': s = String.fromCharCode(a & 255); break;
        case 's': s = cstr(a); if (prec !== undefined) s = s.slice(0, prec); break;
        case 'f': case 'F': s = Number(a).toFixed(prec === undefined ? 6 : prec); break;
        case 'e': case 'E': s = Number(a).toExponential(prec === undefined ? 6 : prec); break;
        case 'g': case 'G': s = String(Number(a)); break;
        case 'p': s = '0x' + ((a && a.o) || 0).toString(16); break;
      }
      if (flags.includes('+') && /[dif]/.test(conv) && a >= 0) s = '+' + s;
      if (s.length < width) {
        if (flags.includes('-')) s = s + ' '.repeat(width - s.length);
        else if (flags.includes('0') && conv !== 's' && conv !== 'c') {
          const neg = s[0] === '-' || s[0] === '+';
          s = (neg ? s[0] : '') + '0'.repeat(width - s.length) + (neg ? s.slice(1) : s);
        } else s = ' '.repeat(width - s.length) + s;
      }
      r += s;
    }
    return r;
  }
  function autoStruct(type) {
    const make = () => new Proxy({}, {
      get(t, k) {
        if (typeof k === 'symbol' || k === 'toJSON' || k === 'then') return t[k];
        if (!(k in t)) t[k] = make();
        return t[k];
      }
    });
    const o = make();
    o.__type = type;
    return o;
  }
  const odr = { GPIOA: 0, GPIOB: 0, GPIOC: 0 };
  const gpio = (name) => ({
    get ODR() { return odr[name]; }, set ODR(v) { odr[name] = v >>> 0; },
    get IDR() { return odr[name]; },
    set BSRR(v) { odr[name] = ((odr[name] | (v & 0xFFFF)) & ~(v >>> 16)) >>> 0; }
  });
  const o = {
    GPIOA: gpio('GPIOA'), GPIOB: gpio('GPIOB'), GPIOC: gpio('GPIOC'),
    TIM2: { CCR1: 0, CCR2: 0, CCR3: 0, CCR4: 0, ARR: 999, PSC: 0, CNT: 0 },
    TIM3: { CCR1: 0, CCR2: 0, CCR3: 0, CCR4: 0, ARR: 9999, PSC: 8399, CNT: 0 },
    USART2: {}, I2C1: {}, RCC: {}
  };
  const hex2 = (b) => (b & 255).toString(16).toUpperCase().padStart(2, '0');
  const f = {
    HAL_Init: () => 0,
    HAL_Delay: function* (ms) { yield { delay: ms >>> 0 }; },
    HAL_GetTick: () => state.time >>> 0,
    HAL_GPIO_TogglePin: (port, pin) => { port.ODR ^= pin; },
    HAL_GPIO_WritePin: (port, pin, s) => { if (s) port.ODR |= pin; else port.ODR &= ~pin; },
    HAL_GPIO_ReadPin: (port, pin) => (port.IDR & pin) ? 1 : 0,
    HAL_GPIO_Init: () => {},
    HAL_RCC_OscConfig: () => 0,
    HAL_RCC_ClockConfig: () => 0,
    HAL_UART_Init: () => 0,
    HAL_TIM_PWM_Start: () => 0,
    __HAL_RCC_GPIOA_CLK_ENABLE: () => {}, __HAL_RCC_GPIOB_CLK_ENABLE: () => {},
    __HAL_RCC_GPIOC_CLK_ENABLE: () => {}, __HAL_RCC_GPIOH_CLK_ENABLE: () => {},
    __HAL_RCC_PWR_CLK_ENABLE: () => {}, __HAL_PWR_VOLTAGESCALING_CONFIG: () => {},
    __disable_irq: () => {}, __enable_irq: () => {}, __NOP: () => {},
    __HAL_TIM_SET_COMPARE: (h, ch, v) => { h.Instance['CCR' + ((ch >> 2) + 1)] = v >>> 0; },
    __HAL_TIM_GET_COMPARE: (h, ch) => h.Instance['CCR' + ((ch >> 2) + 1)],
    HAL_UART_Transmit: function* (h, p, n) {
      for (let i = 0; i < n; i++) out.push(p.a[p.o + i] & 255);
      return 0;
    },
    HAL_I2C_Master_Transmit: function* (h, addr, p, n) {
      const b = [];
      for (let i = 0; i < n; i++) b.push(hex2(p.a[p.o + i]));
      emit('I2C ' + hex2(addr) + ': ' + b.join(' ') + '\n');
      return 0;
    },
    printf: function* (fmt, ...args) {
      const s = format(cstr(fmt), args);
      const bytes = Buffer.from(s, 'utf8');
      if (state.fns && state.fns.__io_putchar) { for (const b of bytes) yield* state.fns.__io_putchar(b); }
      else for (const b of bytes) out.push(b);
      return bytes.length;
    },
    sprintf: (dst, fmt, ...args) => {
      const bytes = Buffer.from(format(cstr(fmt), args), 'utf8');
      for (let i = 0; i < bytes.length; i++) dst.a[dst.o + i] = bytes[i];
      dst.a[dst.o + bytes.length] = 0;
      return bytes.length;
    },
    strlen: (p) => { let n = 0; while (p.a[p.o + n] !== 0 && p.o + n < p.a.length) n++; return n; }
  };
  const H = {
    Ptr, o, f,
    $: { n: 0, q: 1000, l: 0 },
    str(s) { const b = Buffer.from(s, 'utf8'); const a = new Uint8Array(b.length + 1); a.set(b); return new Ptr(a, 0); },
    idiv(a, b) { if (b === 0) throw new Error('HardFault: 0으로 나눔'); return Math.trunc(a / b); },
    imod(a, b) { if (b === 0) throw new Error('HardFault: 0으로 나눔'); return a % b; },
    peq(a, b) { if (a instanceof Ptr && b instanceof Ptr) return a.a === b.a && a.o === b.o; return a === b; },
    k(name) { if (!(name in kIds)) kIds[name] = kNext++; return kIds[name]; },
    struct: autoStruct,
    handle(name, type) { const h = autoStruct(type); h.__name = name; return h; }
  };
  return { H, out, state };
}

// ------------------------------------------------------------ 컴파일 환경
function makeEnv() {
  const constants = {
    HAL_OK: 0, HAL_ERROR: 1, HAL_BUSY: 2, HAL_TIMEOUT: 3, HAL_MAX_DELAY: 0xFFFFFFFF,
    GPIO_PIN_SET: 1, GPIO_PIN_RESET: 0, TIM_CHANNEL_1: 0, TIM_CHANNEL_2: 4, TIM_CHANNEL_3: 8, TIM_CHANNEL_4: 12,
    GPIO_MODE_OUTPUT_PP: 1, GPIO_NOPULL: 0, GPIO_SPEED_FREQ_LOW: 0
  };
  for (let i = 0; i < 16; i++) constants['GPIO_PIN_' + i] = 1 << i;
  const gen = { gen: true, ret: 'void' };
  const functions = {
    HAL_Init: { ret: 'HAL_StatusTypeDef' }, HAL_Delay: gen, HAL_GetTick: { ret: 'uint32_t' },
    HAL_GPIO_TogglePin: { ret: 'void' }, HAL_GPIO_WritePin: { ret: 'void' }, HAL_GPIO_ReadPin: { ret: 'GPIO_PinState' },
    HAL_GPIO_Init: { ret: 'void' }, HAL_RCC_OscConfig: { ret: 'HAL_StatusTypeDef' }, HAL_RCC_ClockConfig: { ret: 'HAL_StatusTypeDef' },
    HAL_UART_Init: { ret: 'HAL_StatusTypeDef' }, HAL_TIM_PWM_Start: { ret: 'HAL_StatusTypeDef' },
    __HAL_RCC_GPIOA_CLK_ENABLE: { ret: 'void' }, __HAL_RCC_GPIOB_CLK_ENABLE: { ret: 'void' },
    __HAL_RCC_GPIOC_CLK_ENABLE: { ret: 'void' }, __HAL_RCC_GPIOH_CLK_ENABLE: { ret: 'void' },
    __HAL_RCC_PWR_CLK_ENABLE: { ret: 'void' }, __HAL_PWR_VOLTAGESCALING_CONFIG: { ret: 'void' },
    __disable_irq: { ret: 'void' }, __enable_irq: { ret: 'void' }, __NOP: { ret: 'void' },
    __HAL_TIM_SET_COMPARE: { ret: 'void' }, __HAL_TIM_GET_COMPARE: { ret: 'uint32_t' },
    HAL_UART_Transmit: { gen: true, ret: 'HAL_StatusTypeDef' }, HAL_I2C_Master_Transmit: { gen: true, ret: 'HAL_StatusTypeDef' },
    printf: { gen: true, ret: 'int', variadic: true }, sprintf: { ret: 'int', variadic: true }, strlen: { ret: 'size_t' }
  };
  return {
    functions, constants,
    objects: ['GPIOA', 'GPIOB', 'GPIOC', 'TIM2', 'TIM3', 'USART2', 'I2C1', 'RCC'],
    structTypes: ['GPIO_InitTypeDef', 'RCC_OscInitTypeDef', 'RCC_ClkInitTypeDef', 'TIM_OC_InitTypeDef',
      'UART_HandleTypeDef', 'TIM_HandleTypeDef', 'ADC_HandleTypeDef', 'I2C_HandleTypeDef', 'SPI_HandleTypeDef'],
    handleTypes: ['UART_HandleTypeDef', 'TIM_HandleTypeDef', 'ADC_HandleTypeDef', 'I2C_HandleTypeDef', 'SPI_HandleTypeDef'],
    constantPattern: /^(RCC|FLASH|UART|USART|TIM|ADC|I2C|SPI|GPIO|PWR|SYSTICK|NVIC|DMA|EXTI)_[A-Z0-9_]+$|^[A-Z0-9_]+_IRQn$/
  };
}

// ------------------------------------------------------------ 실행
function runProgram(js, maxTime) {
  const rt = makeRuntime();
  const mod = new Function('H', js)(rt.H);
  rt.state.fns = mod.fns;
  const g = mod.fns.main();
  let spins = 0;
  for (let step = 0; step < 1e6; step++) {
    const r = g.next();
    if (r.done) break;
    if (r.value && typeof r.value === 'object' && 'delay' in r.value) {
      rt.state.time += r.value.delay;
      if (rt.state.time > maxTime) break;
    } else {
      rt.H.$.n = 0;
      if (++spins > 3000) break;
    }
  }
  return { text: Buffer.from(rt.out).toString('utf8'), globals: mod.globals() };
}

function main() {
  const dir = path.join(__dirname, 'cases');
  const filter = process.argv[2] || '';
  const headers = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.h')) headers['Core/Inc/' + f] = fs.readFileSync(path.join(dir, f), 'utf8');
  const env = makeEnv();
  let pass = 0, failN = 0;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.c')).sort()) {
    if (filter && !f.includes(filter)) continue;
    const base = f.slice(0, -2);
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const files = Object.assign({ 'Core/Src/main.c': src }, headers);
    const res = STM32C.compile({ files, entry: 'Core/Src/main.c', env });
    const errFile = path.join(dir, base + '.err');
    const outFile = path.join(dir, base + '.out');
    let ok = false, detail = '';
    try {
      if (fs.existsSync(errFile)) {
        const [lineS, ...rest] = fs.readFileSync(errFile, 'utf8').replace(/\r/g, '').split('\n');
        const want = rest.join('\n').trim();
        if (res.ok) detail = '오류를 기대했지만 컴파일 성공';
        else {
          const e = res.errors[0];
          ok = e.line === +lineS && e.msg.includes(want) && e.file === 'Core/Src/main.c';
          if (!ok) detail = '기대: ' + lineS + ' "' + want + '"\n  실제: ' + JSON.stringify(res.errors);
        }
      } else {
        if (!res.ok) { detail = '컴파일 실패: ' + JSON.stringify(res.errors, null, 1); }
        else {
          const m = /^\/\/\s*maxTime:\s*(\d+)/.exec(src);
          const r = runProgram(res.js, m ? +m[1] : 5000);
          const norm = s => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
          const want = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
          ok = norm(r.text) === norm(want);
          if (!ok) detail = '--- 기대\n' + norm(want) + '\n--- 실제\n' + norm(r.text);
          const gFile = path.join(dir, base + '.globals');
          if (ok && fs.existsSync(gFile)) {
            const wantG = JSON.parse(fs.readFileSync(gFile, 'utf8'));
            for (const k of Object.keys(wantG)) {
              if (r.globals[k] !== wantG[k]) { ok = false; detail = 'globals.' + k + ' 기대 ' + wantG[k] + ', 실제 ' + r.globals[k]; }
            }
          }
          if (process.env.SHOWJS) console.log(res.js);
        }
      }
    } catch (e) {
      detail = '실행 오류: ' + (e.stack || e) + (process.env.SHOWJS ? '' : '\n(SHOWJS=1 로 생성 코드 보기)');
      if (process.env.SHOWJS && res.js) console.log(res.js);
    }
    if (ok) { pass++; console.log('PASS ' + f); }
    else { failN++; console.log('FAIL ' + f + '\n  ' + detail); }
    if (res.warnings && res.warnings.length && process.env.SHOWWARN) console.log('  warnings: ' + JSON.stringify(res.warnings));
  }
  console.log('\n' + pass + ' passed, ' + failN + ' failed');
  process.exitCode = failN ? 1 : 0;
}
main();
