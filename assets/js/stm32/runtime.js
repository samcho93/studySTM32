/*
 * runtime.js — STM32 HAL 런타임과 가상 MCU
 * -------------------------------------------------------------------------
 * ccompiler.js 가 만든 코드(generator 함수)를 가상 시간 위에서 실행한다.
 *   - H 객체: 컴파일된 코드가 쓰는 런타임 (docs/SPEC.md 6.1 계약)
 *   - Machine: 핀 · 타이머 · UART · I2C · SPI · ADC · NVIC 상태와 스케줄러
 *
 * 시간 모델
 *   가상 시간 t(ms). 루프 한 바퀴 = CYCLE_MS 로 계산해 바쁜 대기도 시간이 흐른다.
 *   HAL_Delay 는 main 을 재우고, 타이머·UART 수신·EXTI 는 이벤트 큐로 처리해
 *   main 이 양보(yield)한 사이에 인터럽트 콜백(ISR)을 끝까지 실행한다.
 */
(function (global) {
  'use strict';

  var CYCLE_MS = 0.0005;          // 루프 1회 ≈ 0.5 µs
  var QUANTUM = 200;              // 루프 200회마다 스케줄러로 양보

  // ------------------------------------------------------------ 포인터
  function Ptr(a, o) { this.a = a; this.o = o | 0; }
  Ptr.prototype.add = function (n) { return new Ptr(this.a, this.o + (n | 0)); };
  Ptr.prototype.toString = function () { return '0x2000' + (0x1000 + this.o).toString(16); };

  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;
  function utf8(s) {
    if (enc) return enc.encode(s);
    var out = []; for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255); return new Uint8Array(out);
  }
  function strPtr(s) {
    var b = utf8(s), a = new Uint8Array(b.length + 1); a.set(b); return new Ptr(a, 0);
  }
  /** Ptr / 배열 / 문자열 → 바이트 배열 (n 개, 없으면 null 종료까지) */
  function bytesOf(p, n) {
    if (p == null || p === 0) return [];
    if (typeof p === 'string') { var u = utf8(p); return Array.prototype.slice.call(u, 0, n == null ? u.length : n); }
    var a = p.a || p, o = p.a ? p.o : 0, out = [];
    if (n == null) { for (var i = o; i < a.length && a[i]; i++) out.push(a[i] & 255); return out; }
    for (var j = 0; j < n; j++) out.push((a[o + j] || 0) & 255);
    return out;
  }
  function cstr(p) {
    if (typeof p === 'string') return p;
    var b = bytesOf(p);
    return dec ? dec.decode(new Uint8Array(b)) : String.fromCharCode.apply(null, b);
  }
  function writeBytes(p, bytes, withNul) {
    var a = p.a || p, o = p.a ? p.o : 0;
    for (var i = 0; i < bytes.length && o + i < a.length; i++) a[o + i] = bytes[i];
    if (withNul && o + bytes.length < a.length) a[o + bytes.length] = 0;
  }

  // ------------------------------------------------------------ 구조체 프록시 (HAL 구조체·핸들)
  function autoStruct(name) {
    var store = {};
    return new Proxy(store, {
      get: function (t, k) {
        if (k === '__type') return name;
        if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return t[k];
        if (!(k in t)) t[k] = autoStruct();
        return t[k];
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }
  function num(v, d) { return typeof v === 'number' ? v : (typeof v === 'boolean' ? +v : d); }

  // ------------------------------------------------------------ 상수
  var K = {
    NULL: 0, true: 1, false: 0, ENABLE: 1, DISABLE: 0, SET: 1, RESET: 0,
    HAL_OK: 0, HAL_ERROR: 1, HAL_BUSY: 2, HAL_TIMEOUT: 3, HAL_MAX_DELAY: 0xFFFFFFFF,
    GPIO_PIN_RESET: 0, GPIO_PIN_SET: 1, GPIO_PIN_All: 0xFFFF,
    GPIO_MODE_INPUT: 0, GPIO_MODE_OUTPUT_PP: 1, GPIO_MODE_OUTPUT_OD: 0x11, GPIO_MODE_AF_PP: 2, GPIO_MODE_AF_OD: 0x12,
    GPIO_MODE_ANALOG: 3, GPIO_MODE_IT_RISING: 0x10110000, GPIO_MODE_IT_FALLING: 0x10210000, GPIO_MODE_IT_RISING_FALLING: 0x10310000,
    GPIO_NOPULL: 0, GPIO_PULLUP: 1, GPIO_PULLDOWN: 2,
    GPIO_SPEED_FREQ_LOW: 0, GPIO_SPEED_FREQ_MEDIUM: 1, GPIO_SPEED_FREQ_HIGH: 2, GPIO_SPEED_FREQ_VERY_HIGH: 3,
    TIM_CHANNEL_1: 0, TIM_CHANNEL_2: 4, TIM_CHANNEL_3: 8, TIM_CHANNEL_4: 12, TIM_CHANNEL_ALL: 0x3C,
    I2C_MEMADD_SIZE_8BIT: 1, I2C_MEMADD_SIZE_16BIT: 0x10,
    UART_WORDLENGTH_8B: 0, UART_STOPBITS_1: 0, UART_PARITY_NONE: 0,
    EXTI0_IRQn: 6, EXTI1_IRQn: 7, EXTI2_IRQn: 8, EXTI3_IRQn: 9, EXTI4_IRQn: 10, ADC_IRQn: 18, ADC1_2_IRQn: 18,
    EXTI9_5_IRQn: 23, TIM1_UP_TIM10_IRQn: 25, TIM1_UP_IRQn: 25, TIM2_IRQn: 28, TIM3_IRQn: 29, TIM4_IRQn: 30,
    I2C1_EV_IRQn: 31, I2C2_EV_IRQn: 33, SPI1_IRQn: 35, SPI2_IRQn: 36, USART1_IRQn: 37, USART2_IRQn: 38, USART3_IRQn: 39,
    EXTI15_10_IRQn: 40, TIM5_IRQn: 50, DMA2_Stream0_IRQn: 56, DMA1_Channel1_IRQn: 11, USART6_IRQn: 71, SysTick_IRQn: -1,
    EOF: -1, RAND_MAX: 2147483647
  };
  for (var i = 0; i < 16; i++) K['GPIO_PIN_' + i] = 1 << i;
  for (i = 0; i <= 18; i++) K['ADC_CHANNEL_' + i] = i;
  for (i = 1; i <= 16; i++) K['ADC_REGULAR_RANK_' + i] = i;
  K.ADC_CHANNEL_TEMPSENSOR = 16; K.ADC_CHANNEL_VREFINT = 17;
  var IRQ_NAME = {};
  Object.keys(K).forEach(function (k) { if (/_IRQn$/.test(k) && !(K[k] in IRQ_NAME)) IRQ_NAME[K[k]] = k.replace(/_IRQn$/, ''); });

  // 컴파일러에 넘길 함수 목록 (gen: 가상 시간을 쓰거나 사용자 함수를 부르는 것)
  var FUNCS = {
    HAL_Init: 'int', HAL_Delay: 'g:void', HAL_GetTick: 'uint32_t', HAL_IncTick: 'void', HAL_GetHalVersion: 'uint32_t',
    HAL_NVIC_SetPriority: 'void', HAL_NVIC_EnableIRQ: 'void', HAL_NVIC_DisableIRQ: 'void', HAL_NVIC_SetPriorityGrouping: 'void',
    HAL_RCC_OscConfig: 'int', HAL_RCC_ClockConfig: 'int', HAL_RCC_GetSysClockFreq: 'uint32_t', HAL_RCC_GetHCLKFreq: 'uint32_t',
    HAL_RCC_GetPCLK1Freq: 'uint32_t', HAL_RCC_GetPCLK2Freq: 'uint32_t',
    __HAL_RCC_PWR_CLK_ENABLE: 'void', __HAL_PWR_VOLTAGESCALING_CONFIG: 'void', __HAL_RCC_AFIO_CLK_ENABLE: 'void',
    __HAL_RCC_GPIOA_CLK_ENABLE: 'void', __HAL_RCC_GPIOB_CLK_ENABLE: 'void', __HAL_RCC_GPIOC_CLK_ENABLE: 'void',
    __HAL_RCC_GPIOD_CLK_ENABLE: 'void', __HAL_RCC_GPIOH_CLK_ENABLE: 'void', __HAL_RCC_DMA1_CLK_ENABLE: 'void', __HAL_RCC_DMA2_CLK_ENABLE: 'void', __HAL_AFIO_REMAP_SWJ_NOJTAG: 'void',
    __disable_irq: 'void', __enable_irq: 'void', __NOP: 'void', __WFI: 'void', NVIC_SystemReset: 'void',
    HAL_GPIO_Init: 'void', HAL_GPIO_DeInit: 'void', HAL_GPIO_WritePin: 'void', HAL_GPIO_ReadPin: 'int', HAL_GPIO_TogglePin: 'void',
    HAL_UART_Init: 'int', HAL_UART_Transmit: 'g:int', HAL_UART_Receive: 'g:int', HAL_UART_Transmit_IT: 'int', HAL_UART_Receive_IT: 'int',
    HAL_UART_Transmit_DMA: 'int', HAL_UART_Receive_DMA: 'int', HAL_UART_AbortReceive_IT: 'int',
    HAL_TIM_Base_Init: 'int', HAL_TIM_ConfigClockSource: 'int', HAL_TIM_PWM_Init: 'int', HAL_TIMEx_MasterConfigSynchronization: 'int',
    HAL_TIM_PWM_ConfigChannel: 'int', HAL_TIM_MspPostInit: 'void', HAL_TIM_Base_Start: 'int', HAL_TIM_Base_Start_IT: 'int',
    HAL_TIM_Base_Stop: 'int', HAL_TIM_Base_Stop_IT: 'int', HAL_TIM_PWM_Start: 'int', HAL_TIM_PWM_Stop: 'int',
    __HAL_TIM_SET_COMPARE: 'void', __HAL_TIM_GET_COMPARE: 'uint32_t', __HAL_TIM_SET_AUTORELOAD: 'void', __HAL_TIM_GET_AUTORELOAD: 'uint32_t',
    __HAL_TIM_SET_COUNTER: 'void', __HAL_TIM_GET_COUNTER: 'uint32_t', __HAL_TIM_SET_PRESCALER: 'void', __HAL_TIM_CLEAR_IT: 'void',
    HAL_ADC_Init: 'int', HAL_ADC_ConfigChannel: 'int', HAL_ADC_Start: 'int', HAL_ADC_Stop: 'int', HAL_ADC_PollForConversion: 'g:int',
    HAL_ADC_GetValue: 'uint32_t', HAL_ADC_Start_IT: 'int', HAL_ADC_Stop_IT: 'int', HAL_ADC_Start_DMA: 'int', HAL_ADC_Stop_DMA: 'int',
    HAL_ADCEx_Calibration_Start: 'int',
    HAL_I2C_Init: 'int', HAL_I2C_Master_Transmit: 'g:int', HAL_I2C_Master_Receive: 'g:int', HAL_I2C_Mem_Write: 'g:int',
    HAL_I2C_Mem_Read: 'g:int', HAL_I2C_IsDeviceReady: 'g:int', HAL_I2C_GetError: 'uint32_t',
    HAL_SPI_Init: 'int', HAL_SPI_Transmit: 'g:int', HAL_SPI_Receive: 'g:int', HAL_SPI_TransmitReceive: 'g:int',
    printf: 'g:int*', puts: 'g:int', putchar: 'g:int', fflush: 'g:int', setvbuf: 'int', sprintf: 'int*', snprintf: 'int*',
    strlen: 'uint32_t', strcpy: 'ptr', strncpy: 'ptr', strcat: 'ptr', strcmp: 'int', strncmp: 'int', strchr: 'ptr', strstr: 'ptr',
    memset: 'ptr', memcpy: 'ptr', memcmp: 'int', atoi: 'int', atol: 'int', atof: 'double', strtol: 'int', itoa: 'ptr',
    abs: 'int', labs: 'int', fabs: 'double', fabsf: 'float', sqrt: 'double', sqrtf: 'float', pow: 'double', powf: 'float',
    sin: 'double', cos: 'double', tan: 'double', atan: 'double', atan2: 'double', exp: 'double', log: 'double', log10: 'double',
    floor: 'double', ceil: 'double', round: 'double', roundf: 'float', fmod: 'double', rand: 'int', srand: 'void',
    isdigit: 'int', isalpha: 'int', isalnum: 'int', isspace: 'int', isupper: 'int', islower: 'int', toupper: 'int', tolower: 'int'
  };
  function envFunctions() {
    var out = {};
    Object.keys(FUNCS).forEach(function (k) {
      var v = FUNCS[k], g = v.indexOf('g:') === 0; v = v.replace('g:', '');
      var va = /\*$/.test(v); v = v.replace('*', '');
      out[k] = { gen: g, ret: v === 'ptr' ? 'char*' : v, variadic: va };
    });
    return out;
  }

  var STRUCT_TYPES = ['GPIO_InitTypeDef', 'UART_HandleTypeDef', 'TIM_HandleTypeDef', 'ADC_HandleTypeDef', 'I2C_HandleTypeDef',
    'SPI_HandleTypeDef', 'RCC_OscInitTypeDef', 'RCC_ClkInitTypeDef', 'TIM_ClockConfigTypeDef', 'TIM_MasterConfigTypeDef',
    'TIM_OC_InitTypeDef', 'ADC_ChannelConfTypeDef', 'GPIO_TypeDef', 'TIM_TypeDef', 'USART_TypeDef', 'ADC_TypeDef',
    'I2C_TypeDef', 'SPI_TypeDef', 'RCC_TypeDef', 'DMA_HandleTypeDef', 'FILE'];
  var HANDLE_TYPES = ['UART_HandleTypeDef', 'TIM_HandleTypeDef', 'ADC_HandleTypeDef', 'I2C_HandleTypeDef', 'SPI_HandleTypeDef'];
  var OBJECTS = ['GPIOA', 'GPIOB', 'GPIOC', 'GPIOD', 'GPIOH', 'TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'USART1', 'USART2', 'USART3',
    'USART6', 'I2C1', 'I2C2', 'SPI1', 'SPI2', 'ADC1', 'RCC', 'stdout', 'stdin', 'stderr'];

  function compilerEnv(extraConst) {
    var c = {}; Object.keys(K).forEach(function (k) { c[k] = K[k]; });
    Object.keys(extraConst || {}).forEach(function (k) { c[k] = extraConst[k]; });
    return {
      functions: envFunctions(), constants: c, objects: OBJECTS.slice(), structTypes: STRUCT_TYPES.slice(), handleTypes: HANDLE_TYPES.slice(),
      constantPattern: /^(RCC|FLASH|UART|USART|TIM|ADC|I2C|SPI|GPIO|PWR|SYSTICK|NVIC|DMA|EXTI|HAL)_[A-Z0-9_]+$|^[A-Za-z0-9_]+_IRQn$/
    };
  }

  // ------------------------------------------------------------ printf 형식
  function format(fmt, args, opt) {
    var s = typeof fmt === 'string' ? fmt : cstr(fmt), ai = 0, out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch !== '%') { out += ch; continue; }
      var m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|z|L)?([diuxXcsfFeEgGp%])/.exec(s.slice(i));
      if (!m) { out += ch; continue; }
      i += m[0].length - 1;
      var flags = m[1] || '', width = m[2] === '*' ? args[ai++] : (m[2] ? +m[2] : 0), prec = m[3] === '*' ? args[ai++] : (m[3] != null ? +m[3] : null);
      var conv = m[5], len = m[4] || '', v, str;
      if (conv === '%') { out += '%'; continue; }
      v = args[ai++];
      switch (conv) {
        case 'd': case 'i':
          v = Math.trunc(num(v, 0));
          if (len === 'hh') v = v << 24 >> 24; else if (len === 'h') v = v << 16 >> 16; else if (len !== 'll') v = v | 0;
          str = String(Math.abs(v)); if (prec != null) while (str.length < prec) str = '0' + str;
          str = (v < 0 ? '-' : flags.indexOf('+') >= 0 ? '+' : flags.indexOf(' ') >= 0 ? ' ' : '') + str; break;
        case 'u': v = Math.trunc(num(v, 0)); if (len === 'hh') v &= 255; else if (len === 'h') v &= 65535; else if (len !== 'll') v = v >>> 0; str = String(v); break;
        case 'x': case 'X': case 'p':
          v = Math.trunc(num(v && v.a ? 0x20001000 + v.o : v, 0)); if (len === 'hh') v &= 255; else if (len === 'h') v &= 65535; else v = v >>> 0;
          str = v.toString(16); if (prec != null) while (str.length < prec) str = '0' + str;
          if (conv === 'X') str = str.toUpperCase(); if (conv === 'p' || flags.indexOf('#') >= 0) str = '0x' + str; break;
        case 'c': str = String.fromCharCode(num(v, 0) & 255); break;
        case 's': str = v == null || v === 0 ? '(null)' : cstr(v); if (prec != null) str = str.slice(0, prec); break;
        default:
          if (opt && opt.noFloat) { str = ''; if (opt.onNoFloat) opt.onNoFloat(); break; }
          v = num(v, 0);
          if (conv === 'f' || conv === 'F') str = v.toFixed(prec == null ? 6 : prec);
          else if (conv === 'e' || conv === 'E') { str = v.toExponential(prec == null ? 6 : prec).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') str = str.toUpperCase(); }
          else { str = String(+v.toPrecision(prec || 6)); }
          if (v >= 0 && flags.indexOf('+') >= 0) str = '+' + str;
      }
      if (str.length < width) {
        if (flags.indexOf('-') >= 0) while (str.length < width) str += ' ';
        else if (flags.indexOf('0') >= 0 && conv !== 's' && conv !== 'c') {
          var sign = /^[-+ ]/.test(str) ? str[0] : ''; str = str.slice(sign.length);
          while (str.length + sign.length < width) str = '0' + str; str = sign + str;
        } else while (str.length < width) str = ' ' + str;
      }
      out += str;
    }
    return out;
  }

  // ------------------------------------------------------------ Machine
  function Machine(opts) {
    this.opts = opts || {};
    this.listeners = {};
    this.speed = 1;
    this.state = 'idle';          // idle | running | paused | halted | fault | done
    this.reset(this.opts.project);
  }

  Machine.prototype.on = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
  Machine.prototype.emit = function (ev, a, b, c) { (this.listeners[ev] || []).forEach(function (f) { f(a, b, c); }); };
  Machine.prototype.log = function (level, msg) { this.emit('log', level, msg); };
  Machine.prototype.warnOnce = function (key, msg) {
    this._warned = this._warned || {};
    if (this._warned[key]) return; this._warned[key] = 1; this.log('warn', msg);
  };

  Machine.prototype.reset = function (project) {
    var self = this;
    if (project) this.project = project;
    var P = this.project || { board: 'NUCLEO-F411RE', pins: {}, periph: {}, nvic: {} };
    var chip = global.STM32Chips.chipOf(P.board);
    this.chip = chip;
    this.sysclk = ((P.clock && P.clock.sysclk) || chip.defClk) * 1e6;
    this.timclk = this.sysclk;
    this.t = 0; this.wake = 0; this.events = []; this.pendingIsr = [];
    this.$ = { n: 0, q: QUANTUM, l: 0 };
    this.nvic = {}; this.irqOff = false;
    this._warned = {};
    this.stdoutBuf = [];
    this.randSeed = 1;
    this.stats = { isr: 0 };
    // 핀
    this.pins = {};
    chip.pins.forEach(function (name) {
      if (!global.STM32Chips.isGpio(name) || self.pins[name]) return;
      self.pins[name] = { name: name, port: name[1], num: parseInt(name.slice(2), 10), mode: 'reset', pull: 'none', od: false,
        odr: 0, af: null, trigger: null, drive: null, analog: null, pwm: null, last: 0, hiAcc: 0, hiFrom: 0, hist: [] };
    });
    this.watchers = {};
    // 레지스터 객체
    var o = {};
    ['A', 'B', 'C', 'D', 'H'].forEach(function (x) { o['GPIO' + x] = self._gpioPort(x); });
    this.tims = {};
    Object.keys(chip.periph).forEach(function (n) {
      var info = chip.periph[n];
      if (info.kind === 'tim') { self.tims[n] = self._timer(n, info); o[n] = self.tims[n].regs; }
      else o[n] = self._regs(n);
    });
    ['TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'USART1', 'USART2', 'USART3', 'USART6', 'I2C1', 'I2C2', 'SPI1', 'SPI2', 'ADC1'].forEach(function (n) {
      if (!o[n]) o[n] = self._regs(n);
    });
    o.RCC = this._regs('RCC'); o.stdout = { name: 'stdout' }; o.stdin = { name: 'stdin' }; o.stderr = { name: 'stderr' };
    this.o = o;
    this.uarts = {}; this.i2cs = {}; this.spis = {}; this.adc = null;
    this.handles = {};
    this.kmap = {}; this.knext = 0x4000;
    this.mod = null; this.main = null;
    this.state = 'idle';
    this.emit('reset');
  };

  Machine.prototype._regs = function (name) {
    var store = { __name: name };
    return new Proxy(store, { get: function (t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; return 0; },
      set: function (t, k, v) { t[k] = v; return true; } });
  };

  Machine.prototype._gpioPort = function (x) {
    var self = this, extra = { __name: 'GPIO' + x };
    function pinsOf() { return Object.keys(self.pins).map(function (k) { return self.pins[k]; }).filter(function (p) { return p.port === x; }); }
    var regs = {
      get ODR() { var v = 0; pinsOf().forEach(function (p) { if (p.odr) v |= 1 << p.num; }); return v; },
      set ODR(v) { pinsOf().forEach(function (p) { self._setOdr(p, (v >> p.num) & 1); }); },
      get IDR() { var v = 0; pinsOf().forEach(function (p) { if (self.level(p.name)) v |= 1 << p.num; }); return v; },
      set IDR(v) { },
      get BSRR() { return 0; },
      set BSRR(v) { pinsOf().forEach(function (p) { if ((v >> p.num) & 1) self._setOdr(p, 1); else if ((v >> (p.num + 16)) & 1) self._setOdr(p, 0); }); },
      get BRR() { return 0; },
      set BRR(v) { pinsOf().forEach(function (p) { if ((v >> p.num) & 1) self._setOdr(p, 0); }); }
    };
    return new Proxy(regs, {
      get: function (t, k) { if (k in t) return t[k]; if (k in extra) return extra[k]; return typeof k === 'symbol' ? undefined : 0; },
      set: function (t, k, v) { if (Object.getOwnPropertyDescriptor(t, k)) t[k] = v; else extra[k] = v; return true; }
    });
  };

  // ---- 핀 상태 ------------------------------------------------------------
  Machine.prototype.pinByMask = function (portObj, mask) {
    var x = (portObj && portObj.__name || 'GPIOA').slice(4), out = [];
    for (var i = 0; i < 16; i++) if ((mask >> i) & 1) { var p = this.pins['P' + x + i]; if (p) out.push(p); }
    return out;
  };

  /** 핀의 실제 전기 레벨 (0/1). 출력이면 ODR, 입력이면 외부 구동 → 풀업/풀다운 → 플로팅(0) */
  Machine.prototype.level = function (name) {
    var p = this.pins[name]; if (!p) return 0;
    if (p.mode === 'output') { if (p.od && p.odr) return p.drive != null ? p.drive : (p.pull === 'up' ? 1 : 0); return p.odr; }
    if (p.mode === 'af' && p.pwm) return this.pwmLevel(p);
    if (p.mode === 'af' && /USART\d_TX/.test(p.af || '')) return 1;
    if (p.drive != null) return p.drive;
    if (p.pull === 'up') return 1;
    if (p.pull === 'down') return 0;
    return p.floatLevel || 0;
  };
  Machine.prototype.isFloating = function (name) {
    var p = this.pins[name];
    return p && (p.mode === 'input' || p.mode === 'exti') && p.drive == null && p.pull === 'none';
  };
  Machine.prototype.pwmLevel = function (p) {
    var w = this.pwmOf(p.name); if (!w) return 0;
    if (w.duty <= 0) return 0; if (w.duty >= 1) return 1;
    var per = 1000 / w.freq, ph = (this.now() % per) / per; return ph < w.duty ? 1 : 0;
  };
  /** PWM 출력 정보 {freq, duty} 또는 null */
  Machine.prototype.pwmOf = function (name) {
    var p = this.pins[name]; if (!p || !p.pwm) return null;
    var tm = this.tims[p.pwm.tim]; if (!tm || !tm.running) return null;
    var c = tm.ch[p.pwm.ch]; if (!c || !c.running) return null;
    var per = (tm.arr + 1), duty = Math.max(0, Math.min(1, c.ccr / per));
    return { freq: this.timclk / (tm.psc + 1) / per, duty: duty };
  };
  /** 장치가 읽는 출력 듀티 (0–1): PWM 이면 듀티, 아니면 최근 프레임의 HIGH 시간 비율 */
  Machine.prototype.duty = function (name) {
    var w = this.pwmOf(name); if (w) return w.duty;
    var p = this.pins[name]; if (!p) return 0;
    if (p.mode !== 'output') return this.level(name);
    var now = this.now(), span = now - p.hiFrom;
    if (span <= 0.5) return p.odr;
    var acc = p.hiAcc + (p.odr ? now - p.last : 0);
    return Math.max(0, Math.min(1, acc / span));
  };
  /** 프레임마다 UI 가 호출: 듀티 누적 창 초기화 */
  Machine.prototype.frameMark = function () {
    var now = this.now(), self = this;
    Object.keys(this.pins).forEach(function (k) {
      var p = self.pins[k];
      p._duty = self.duty(k);
      p.hiAcc = 0; p.hiFrom = now; p.last = now;
    });
  };
  Machine.prototype.outDuty = function (name) { var p = this.pins[name]; return p && p._duty != null ? p._duty : this.duty(name); };

  Machine.prototype._setOdr = function (p, v) {
    v = v ? 1 : 0;
    if (p.odr === v) return;
    var now = this.now();
    if (p.odr) p.hiAcc += now - Math.max(p.last, p.hiFrom);
    p.last = now; p.odr = v;
    this._changed(p);
  };
  Machine.prototype._changed = function (p) {
    var lv = this.level(p.name), now = this.now();
    if (p.hist.length && p.hist[p.hist.length - 1][1] === lv) return;
    p.hist.push([now, lv]); if (p.hist.length > 4000) p.hist.splice(0, 1000);
    var w = this.watchers[p.name];
    if (w) for (var i = 0; i < w.length; i++) w[i](lv, now);
    this._exti(p, lv);
  };
  Machine.prototype.watch = function (pin, fn) { (this.watchers[pin] = this.watchers[pin] || []).push(fn); };

  /** 장치가 핀을 구동 (0/1) 하거나 놓음 (null) */
  Machine.prototype.drive = function (name, v) {
    var p = this.pins[name]; if (!p) return;
    var before = this.level(name);
    p.drive = v == null ? null : (v ? 1 : 0);
    if (p.mode === 'output' && !p.od && p.drive != null && p.drive !== p.odr)
      this.warnOnce('short' + name, name + ': 출력 핀을 외부 장치가 반대 레벨로 구동합니다 (단락 위험).');
    if (this.level(name) !== before) this._changed(p);
  };
  Machine.prototype.setAnalog = function (name, v) {
    var p = this.pins[name]; if (!p) return; p.analog = v;
    this.drive(name, v == null ? null : (v > 2048 ? 1 : 0));
  };

  Machine.prototype._exti = function (p, lv) {
    if (p.mode !== 'exti') return;
    var prev = p.extiPrev == null ? (lv ? 0 : 1) : p.extiPrev; p.extiPrev = lv;
    if (prev === lv) return;
    var rising = lv === 1;
    if (p.trigger === 'both' || (p.trigger === 'rising' && rising) || (p.trigger === 'falling' && !rising)) {
      var line = p.num <= 4 ? 'EXTI' + p.num : p.num <= 9 ? 'EXTI9_5' : 'EXTI15_10';
      if (!this.nvic[line]) { this.warnOnce('nvic' + line, p.name + ' 에지를 감지했지만 NVIC 에서 ' + line + ' 인터럽트가 꺼져 있어 콜백이 불리지 않습니다.'); return; }
      this.raise('HAL_GPIO_EXTI_Callback', [1 << p.num], line);
    }
  };

  // ---- 타이머 --------------------------------------------------------------
  Machine.prototype._timer = function (name, info) {
    var self = this;
    var tm = { name: name, info: info, psc: 0, arr: info.bits === 32 ? 0xFFFFFFFF : 65535, t0: 0, running: false, it: false,
      ch: { 1: { ccr: 0, pwm: false, running: false }, 2: { ccr: 0, pwm: false, running: false }, 3: { ccr: 0, pwm: false, running: false }, 4: { ccr: 0, pwm: false, running: false } },
      ev: null };
    var extra = { __name: name };
    tm.regs = new Proxy({}, {
      get: function (t, k) {
        if (k === '__name') return name;
        var m = /^CCR([1-4])$/.exec(k); if (m) return tm.ch[m[1]].ccr;
        if (k === 'ARR') return tm.arr; if (k === 'PSC') return tm.psc; if (k === 'CNT') return self.timCount(tm);
        if (typeof k === 'symbol') return undefined;
        return k in extra ? extra[k] : 0;
      },
      set: function (t, k, v) {
        var m = /^CCR([1-4])$/.exec(k);
        if (m) { tm.ch[m[1]].ccr = v >>> 0; self._pwmChanged(tm); }
        else if (k === 'ARR') { self.timSet(tm, 'arr', v >>> 0); }
        else if (k === 'PSC') { self.timSet(tm, 'psc', v & 0xFFFF); }
        else if (k === 'CNT') { tm.t0 = self.now() - (v >>> 0) * self.timTick(tm); }
        else extra[k] = v;
        return true;
      }
    });
    return tm;
  };
  Machine.prototype.timTick = function (tm) { return (tm.psc + 1) / this.timclk * 1000; };        // ms / count
  Machine.prototype.timPeriod = function (tm) { return this.timTick(tm) * (tm.arr + 1); };
  Machine.prototype.timCount = function (tm) {
    if (!tm.running) return tm.frozen || 0;
    var c = Math.floor((this.now() - tm.t0) / this.timTick(tm) + 1e-9);
    return c % (tm.arr + 1);
  };
  Machine.prototype.timSet = function (tm, key, v) {
    var cnt = this.timCount(tm);
    tm[key] = v;
    tm.t0 = this.now() - Math.min(cnt, tm.arr) * this.timTick(tm);
    if (tm.running && tm.it) this._timSchedule(tm);
    this._pwmChanged(tm);
  };
  Machine.prototype._timSchedule = function (tm) {
    var self = this;
    if (tm.ev) tm.ev.dead = true;
    var per = this.timPeriod(tm);
    if (per < 0.02) {
      this.warnOnce('timfast' + tm.name, tm.name + ' 업데이트 인터럽트가 ' + Math.round(1 / per) + ' kHz 입니다. 시뮬레이터는 50 kHz 로 제한합니다 (실물에서도 CPU 가 인터럽트만 처리하게 됩니다).');
      per = 0.02;
    }
    var elapsed = (this.now() - tm.t0) % per;
    tm.ev = this.at(this.now() + (per - elapsed), function tick() {
      if (!tm.running || !tm.it) return;
      tm.ev = self.at(self.t + per, tick);
      var irq = tm.info.irq;
      if (self.nvic[irq]) self.raise('HAL_TIM_PeriodElapsedCallback', [self.handleOf(tm.name)], irq);
      else self.warnOnce('timnvic' + tm.name, tm.name + ' 인터럽트가 NVIC 에서 꺼져 있습니다 (CubeMX → ' + tm.name + ' → NVIC Settings).');
    });
  };
  Machine.prototype._pwmChanged = function (tm) {
    var self = this;
    Object.keys(this.pins).forEach(function (k) {
      var p = self.pins[k]; if (p.pwm && p.pwm.tim === tm.name) { p.pwmVer = (p.pwmVer || 0) + 1; self._pwmHist(p); var w = self.watchers[p.name]; if (w) w.forEach(function (f) { f(self.level(p.name), self.now(), true); }); }
    });
  };
  Machine.prototype._pwmHist = function (p) {
    var w = this.pwmOf(p.name);
    p.hist.push([this.now(), w ? { duty: w.duty, freq: w.freq } : 0]);
    if (p.hist.length > 4000) p.hist.splice(0, 1000);
  };

  // ---- 이벤트 / 인터럽트 ------------------------------------------------------
  Machine.prototype.now = function () { return this.t + this.$.n * CYCLE_MS; };
  Machine.prototype.at = function (t, fn) {
    var ev = { t: t, fn: fn, dead: false }, a = this.events, i = a.length;
    while (i > 0 && a[i - 1].t > t) i--;
    a.splice(i, 0, ev); return ev;
  };
  Machine.prototype.raise = function (name, args, irq) {
    if (this.irqOff) { this.pendingIsr.push({ name: name, args: args, irq: irq, masked: true }); return; }
    this.pendingIsr.push({ name: name, args: args, irq: irq });
  };
  Machine.prototype.handleOf = function (inst) {
    var h = this.handles[inst];
    if (h) return h;
    // 인스턴스 이름으로 등록된 핸들이 없으면 이름 규칙으로 찾는다
    var guess = /^USART(\d)/.test(inst) ? 'huart' + inst.slice(5) : /^TIM/.test(inst) ? 'htim' + inst.slice(3) : /^ADC/.test(inst) ? 'hadc' + inst.slice(3) : null;
    return (guess && this.handleByName[guess]) || autoStruct();
  };
  Machine.prototype.instOf = function (h) {
    if (!h) return null;
    var inst = h.Instance; if (inst && inst.__name) return inst.__name;
    return h.__hname ? null : null;
  };

  /** ISR 실행 (끝까지) */
  Machine.prototype._runIsr = function (req) {
    var fn = this.mod && this.mod.fns[req.name];
    if (!fn) {
      this.warnOnce('nocb' + req.name, req.name + '() 가 정의되어 있지 않아 인터럽트가 무시됩니다 (USER CODE BEGIN 4 에 작성하세요).');
      return;
    }
    this.stats.isr++;
    this.inIsr = (this.inIsr || 0) + 1;
    var g = fn.apply(null, req.args || []), r, guard = 0, saveL = this.$.l;
    try {
      while (!(r = g.next()).done) {
        if (r.value && r.value.delay != null) {
          this.warnOnce('isrdelay', '인터럽트 콜백 안에서 HAL_Delay() 를 호출했습니다. 실물에서는 SysTick 우선순위 때문에 멈출 수 있습니다.');
          this.t += r.value.delay;
        } else { this.t += this.$.n * CYCLE_MS; this.$.n = 0; }
        if (++guard > 2e6) throw new Error('ISR_TIMEOUT');
      }
    } finally { this.inIsr--; this.$.l = saveL; }
  };

  // ---- 실행 ----------------------------------------------------------------
  Machine.prototype.load = function (js) {
    var H = this.makeH();
    this.handleByName = {};
    this.mod = (new Function('H', js))(H);
    this.main = this.mod.fns.main ? this.mod.fns.main() : null;
    if (!this.main) throw new Error('main() 함수가 없습니다.');
    this.state = 'running';
    this.log('info', '실행 시작 — ' + this.chip.name + ' @ ' + this.sysclk / 1e6 + ' MHz');
  };

  /**
   * 가상 시간을 dt(ms) 만큼 진행. budgetMs: 이번 호출에 쓸 실제 시간 한도.
   */
  Machine.prototype.step = function (dt, budgetMs) {
    if (this.state !== 'running') return;
    var target = this.t + dt, t0 = performance.now(), budget = budgetMs || 12, $ = this.$;
    try {
      while (this.state === 'running') {
        // 1) 때가 된 이벤트
        while (this.events.length && this.events[0].t <= this.t) {
          var ev = this.events.shift(); if (!ev.dead) ev.fn();
        }
        // 2) 대기 중인 ISR
        while (this.pendingIsr.length && !this.irqOff) {
          var req = this.pendingIsr.shift();
          this._runIsr(req);
        }
        if (this.t >= target) break;
        if (performance.now() - t0 > budget) break;
        // 3) main 이 자는 중이면 다음 사건까지 시간 이동
        if (this.wake > this.t) {
          var next = Math.min(this.wake, target, this.events.length ? this.events[0].t : Infinity);
          this.t = Math.max(this.t, next);
          continue;
        }
        // 4) main 실행
        var r = this.main.next();
        this.t += $.n * CYCLE_MS; $.n = 0;
        if (r.done) { this.state = 'done'; this.log('warn', 'main() 이 반환했습니다. 실물 MCU 에서는 보통 while(1) 로 끝나지 않게 만듭니다.'); break; }
        if (r.value && r.value.delay != null) this.wake = this.t + r.value.delay;
        else if (r.value && r.value.halt) { this.state = 'halted'; this.log('error', r.value.halt); break; }
      }
    } catch (e) {
      this.fault(e);
    }
    this.flushPending();
  };
  Machine.prototype.flushPending = function () { };

  Machine.prototype.fault = function (e) {
    this.state = 'fault';
    var msg = e && e.message || String(e);
    if (e instanceof RangeError && /call stack/i.test(msg)) msg = '스택 오버플로 (재귀 호출이 너무 깊습니다)';
    else if (msg === 'ISR_TIMEOUT') msg = '인터럽트 콜백이 끝나지 않습니다 (콜백 안의 무한 루프)';
    else if (/is not a function|Cannot read|undefined/.test(msg)) msg = '잘못된 메모리 접근 — ' + msg;
    this.log('error', 'HardFault: ' + msg + ' (main.c ' + this.$.l + '번째 줄 근처)');
    this.emit('fault', msg, this.$.l);
  };

  // ------------------------------------------------------------ H (컴파일된 코드용 런타임)
  Machine.prototype.makeH = function () {
    var self = this, $ = this.$;
    var H = {
      $: $, Ptr: Ptr, o: this.o,
      str: strPtr,
      idiv: function (a, b) { if (!b) throw new Error('0으로 나누기 (Division by zero)'); return Math.trunc(a / b); },
      imod: function (a, b) { if (!b) throw new Error('0으로 나머지 연산 (Division by zero)'); return a % b; },
      peq: function (a, b) { if (a && b && a.a) return a.a === b.a && a.o === b.o; return a === b; },
      struct: function (type) { return autoStruct(type); },
      handle: function (name, type) { var h = autoStruct(type); h.__hname = name; self.handleByName[name] = h; return h; },
      k: function (name) { if (!(name in self.kmap)) self.kmap[name] = self.knext++; return self.kmap[name]; },
      f: this.halFunctions()
    };
    return H;
  };

  Machine.prototype.halFunctions = function () {
    var M = this, $ = this.$;
    function inst(h) {
      var n = h && h.Instance && h.Instance.__name;
      if (!n) throw new Error('핸들의 Instance 가 설정되지 않았습니다 (MX_*_Init() 호출 확인)');
      return n;
    }
    function bindHandle(h) { var n = inst(h); M.handles[n] = h; return n; }
    function pinsFor(periph, sig) {
      var out = [];
      Object.keys(M.project.pins || {}).forEach(function (p) { if ((M.project.pins[p].signal || '') === periph + '_' + sig) out.push(p); });
      if (!out.length) { var d = (M.chip.periph[periph] || {}).pins; if (d && d[sig]) out.push(d[sig]); }
      return out;
    }
    function setAf(periph) {
      var pins = M.project.pins || {};
      Object.keys(pins).forEach(function (p) {
        var s = pins[p].signal || '';
        if (s.indexOf(periph + '_') === 0 && M.pins[p]) {
          var pin = M.pins[p]; pin.mode = /ADC/.test(periph) ? 'analog' : 'af'; pin.af = s;
          var m = /^(TIM\d+)_CH(\d)$/.exec(s); if (m) pin.pwm = { tim: m[1], ch: +m[2] };
          M._changed(pin);
        }
      });
    }
    function chIdx(c) { return (c >> 2) + 1; }
    function* wait(ms) { if (ms > 0) yield { delay: ms }; }
    var rnd = function () { M.randSeed = (M.randSeed * 1103515245 + 12345) & 0x7fffffff; return M.randSeed; };

    // --- stdout
    function* stdoutWrite(bytes) {
      for (var i = 0; i < bytes.length; i++) {
        M.stdoutBuf.push(bytes[i]);
        if (bytes[i] === 10 || M.stdoutBuf.length >= 1024) yield* flush();
      }
    }
    function* flush() {
      var b = M.stdoutBuf; M.stdoutBuf = [];
      if (!b.length) return;
      var fns = M.mod.fns;
      if (fns._write) { var arr = new Uint8Array(b); yield* fns._write(1, new Ptr(arr, 0), b.length); }
      else if (fns.__io_putchar) { for (var i = 0; i < b.length; i++) yield* fns.__io_putchar(b[i]); }
      else M.warnOnce('noretarget', 'printf 출력이 어디에도 나가지 않습니다. int __io_putchar(int ch) 또는 _write() 리타깃 함수를 USER CODE BEGIN 0/4 에 작성하세요.');
    }
    var fmtOpt = { get noFloat() { return M.project.settings && M.project.settings.printfFloat === false; },
      onNoFloat: function () { M.warnOnce('nofloat', 'printf/sprintf 의 %f 가 비어 있습니다: 프로젝트 설정에서 "printf float 사용"(-u _printf_float)을 켜세요.'); } };

    var F = {
      // ---- 코어
      HAL_Init: function () { return 0; },
      HAL_Delay: function* (ms) { yield { delay: (ms >>> 0) === 0xFFFFFFFF ? 1e12 : (ms >>> 0) + 1 }; },
      HAL_GetTick: function () { return Math.floor(M.now()) >>> 0; },
      HAL_IncTick: function () { }, HAL_GetHalVersion: function () { return 0x01080300; },
      HAL_NVIC_SetPriority: function () { }, HAL_NVIC_SetPriorityGrouping: function () { },
      HAL_NVIC_EnableIRQ: function (n) { var nm = IRQ_NAME[n]; if (nm) M.nvic[nm] = true; },
      HAL_NVIC_DisableIRQ: function (n) { var nm = IRQ_NAME[n]; if (nm) M.nvic[nm] = false; },
      HAL_RCC_OscConfig: function () { return 0; }, HAL_RCC_ClockConfig: function () { return 0; },
      HAL_RCC_GetSysClockFreq: function () { return M.sysclk; }, HAL_RCC_GetHCLKFreq: function () { return M.sysclk; },
      HAL_RCC_GetPCLK1Freq: function () { return M.sysclk > M.chip.apb1Max * 1e6 ? M.sysclk / 2 : M.sysclk; },
      HAL_RCC_GetPCLK2Freq: function () { return M.sysclk; },
      __disable_irq: function () { M.irqOff = true; }, __enable_irq: function () { M.irqOff = false; M.pendingIsr.forEach(function (r) { r.masked = false; }); },
      __NOP: function () { }, __WFI: function () { }, NVIC_SystemReset: function () { throw new Error('NVIC_SystemReset 호출 — 시뮬레이터를 다시 실행하세요'); },

      // ---- GPIO
      HAL_GPIO_Init: function (port, init) {
        var mode = num(init.Mode, 0), pull = num(init.Pull, 0);
        M.pinByMask(port, num(init.Pin, 0)).forEach(function (p) {
          p.pull = pull === 1 ? 'up' : pull === 2 ? 'down' : 'none';
          p.od = (mode & 0x10) !== 0 && (mode & 3) !== 0;
          if (mode === 0) p.mode = 'input';
          else if ((mode & 3) === 1) p.mode = 'output';
          else if ((mode & 3) === 2) p.mode = 'af';
          else if (mode === 3) p.mode = 'analog';
          else if (mode & 0x10000000) {
            p.mode = 'exti';
            var e = (mode >> 20) & 3; p.trigger = e === 1 ? 'rising' : e === 2 ? 'falling' : 'both';
            p.extiPrev = M.level(p.name);
          }
          M._changed(p);
        });
      },
      HAL_GPIO_DeInit: function (port, mask) { M.pinByMask(port, mask).forEach(function (p) { p.mode = 'reset'; p.pull = 'none'; M._changed(p); }); },
      HAL_GPIO_WritePin: function (port, mask, st) {
        M.pinByMask(port, mask).forEach(function (p) {
          if (p.mode !== 'output') M.warnOnce('wmode' + p.name, p.name + ' 은(는) 출력으로 설정되지 않았습니다 (현재: ' + p.mode + '). CubeMX 에서 GPIO_Output 으로 설정하세요.');
          M._setOdr(p, st);
        });
      },
      HAL_GPIO_TogglePin: function (port, mask) {
        M.pinByMask(port, mask).forEach(function (p) {
          if (p.mode !== 'output') M.warnOnce('wmode' + p.name, p.name + ' 은(는) 출력으로 설정되지 않았습니다 (현재: ' + p.mode + ').');
          M._setOdr(p, !p.odr);
        });
      },
      HAL_GPIO_ReadPin: function (port, mask) {
        var ps = M.pinByMask(port, mask); if (!ps.length) return 0;
        var p = ps[0];
        if (M.isFloating(p.name)) {
          M.warnOnce('float' + p.name, p.name + ' 입력이 떠 있습니다(플로팅). 풀업/풀다운을 설정하거나 모듈을 확인하세요. 값이 무작위로 바뀝니다.');
          p.floatLevel = rnd() & 1;
        }
        if (p.mode === 'reset') M.warnOnce('rmode' + p.name, p.name + ' 을(를) 입력으로 설정하지 않고 읽었습니다.');
        return M.level(p.name);
      },

      // ---- UART
      HAL_UART_Init: function (h) {
        var n = bindHandle(h), baud = num(h.Init.BaudRate, 115200);
        M.uarts[n] = { name: n, baud: baud, rx: [], it: null, h: h, tx: pinsFor(n, 'TX'), rxPins: pinsFor(n, 'RX') };
        setAf(n);
        return 0;
      },
      HAL_UART_Transmit: function* (h, data, size, timeout) {
        var u = M.uarts[inst(h)]; if (!u) { M.warnOnce('uinit', 'HAL_UART_Init() 전에 HAL_UART_Transmit() 을 호출했습니다.'); return 1; }
        var bytes = bytesOf(data, size >>> 0);
        M.uartOut(u, bytes);
        yield* wait(bytes.length * 10 / u.baud * 1000);
        return 0;
      },
      HAL_UART_Transmit_IT: function (h, data, size) {
        var u = M.uarts[inst(h)]; if (!u) return 1;
        var bytes = bytesOf(data, size >>> 0); M.uartOut(u, bytes);
        M.at(M.now() + bytes.length * 10 / u.baud * 1000, function () {
          if (M.nvic[M.chip.periph[u.name].irq]) M.raise('HAL_UART_TxCpltCallback', [h], u.name);
        });
        return 0;
      },
      HAL_UART_Transmit_DMA: function (h, d, s) { return F.HAL_UART_Transmit_IT(h, d, s); },
      HAL_UART_Receive: function* (h, buf, size, timeout) {
        var u = M.uarts[inst(h)]; if (!u) return 1;
        size = size >>> 0; timeout = timeout >>> 0;
        var end = timeout === 0xFFFFFFFF ? Infinity : M.now() + timeout, got = 0;
        while (got < size) {
          if (u.rx.length) { buf.a[buf.o + got++] = u.rx.shift(); continue; }
          if (M.now() >= end) return 3;
          yield { delay: Math.min(0.05, end - M.now()) };
        }
        return 0;
      },
      HAL_UART_Receive_IT: function (h, buf, size) {
        var u = M.uarts[inst(h)]; if (!u) return 1;
        if (u.it) return 2;
        u.it = { buf: buf, size: size >>> 0, n: 0, h: h };
        if (!M.nvic[M.chip.periph[u.name].irq]) M.warnOnce('unvic' + u.name, u.name + ' global interrupt 가 NVIC 에서 꺼져 있어 수신 완료 콜백이 불리지 않습니다.');
        M.uartDrain(u);
        return 0;
      },
      HAL_UART_Receive_DMA: function (h, b, s) { return F.HAL_UART_Receive_IT(h, b, s); },
      HAL_UART_AbortReceive_IT: function (h) { var u = M.uarts[inst(h)]; if (u) u.it = null; return 0; },

      // ---- TIM
      HAL_TIM_Base_Init: function (h) {
        var n = bindHandle(h), tm = M.tims[n]; if (!tm) return 1;
        tm.psc = num(h.Init.Prescaler, 0) & 0xFFFF; tm.arr = num(h.Init.Period, 65535) >>> 0; tm.t0 = M.now();
        return 0;
      },
      HAL_TIM_ConfigClockSource: function () { return 0; },
      HAL_TIM_PWM_Init: function (h) { return F.HAL_TIM_Base_Init(h); },
      HAL_TIMEx_MasterConfigSynchronization: function () { return 0; },
      HAL_TIM_PWM_ConfigChannel: function (h, oc, ch) {
        var tm = M.tims[bindHandle(h)]; if (!tm) return 1;
        var c = tm.ch[chIdx(ch)]; c.pwm = true; c.ccr = num(oc.Pulse, 0) >>> 0;
        setAf(tm.name);
        return 0;
      },
      HAL_TIM_MspPostInit: function () { },
      HAL_TIM_Base_Start: function (h) { var tm = M.tims[bindHandle(h)]; if (!tm) return 1; if (!tm.running) { tm.running = true; tm.t0 = M.now(); } M._pwmChanged(tm); return 0; },
      HAL_TIM_Base_Start_IT: function (h) {
        var tm = M.tims[bindHandle(h)]; if (!tm) return 1;
        if (!tm.running) { tm.running = true; tm.t0 = M.now(); }
        tm.it = true; M._timSchedule(tm); M._pwmChanged(tm); return 0;
      },
      HAL_TIM_Base_Stop: function (h) { var tm = M.tims[inst(h)]; if (tm) { tm.frozen = M.timCount(tm); tm.running = tm.it = false; M._pwmChanged(tm); } return 0; },
      HAL_TIM_Base_Stop_IT: function (h) { var tm = M.tims[inst(h)]; if (tm) { tm.it = false; if (tm.ev) tm.ev.dead = true; } return 0; },
      HAL_TIM_PWM_Start: function (h, ch) {
        var tm = M.tims[bindHandle(h)]; if (!tm) return 1;
        var c = tm.ch[chIdx(ch)];
        if (!c.pwm) M.warnOnce('pwmcfg' + tm.name + ch, tm.name + ' CH' + chIdx(ch) + ' 이(가) PWM Generation 으로 설정되지 않았습니다 (CubeMX 에서 설정).');
        c.running = true; if (!tm.running) { tm.running = true; tm.t0 = M.now(); }
        var hasPin = Object.keys(M.pins).some(function (k) { var p = M.pins[k]; return p.pwm && p.pwm.tim === tm.name && p.pwm.ch === chIdx(ch); });
        if (!hasPin) M.warnOnce('pwmpin' + tm.name + ch, tm.name + '_CH' + chIdx(ch) + ' 출력 핀이 없습니다 (핀아웃에서 ' + tm.name + '_CH' + chIdx(ch) + ' 핀 지정).');
        M._pwmChanged(tm); return 0;
      },
      HAL_TIM_PWM_Stop: function (h, ch) { var tm = M.tims[inst(h)]; if (tm) { tm.ch[chIdx(ch)].running = false; M._pwmChanged(tm); } return 0; },
      __HAL_TIM_SET_COMPARE: function (h, ch, v) { var tm = M.tims[inst(h)]; if (tm) { tm.ch[chIdx(ch)].ccr = v >>> 0; M._pwmChanged(tm); } },
      __HAL_TIM_GET_COMPARE: function (h, ch) { var tm = M.tims[inst(h)]; return tm ? tm.ch[chIdx(ch)].ccr : 0; },
      __HAL_TIM_SET_AUTORELOAD: function (h, v) { var tm = M.tims[inst(h)]; if (tm) { M.timSet(tm, 'arr', v >>> 0); h.Init.Period = v >>> 0; } },
      __HAL_TIM_GET_AUTORELOAD: function (h) { var tm = M.tims[inst(h)]; return tm ? tm.arr : 0; },
      __HAL_TIM_SET_COUNTER: function (h, v) { var tm = M.tims[inst(h)]; if (tm) { if (tm.running) tm.t0 = M.now() - (v >>> 0) * M.timTick(tm); else tm.frozen = v >>> 0; } },
      __HAL_TIM_GET_COUNTER: function (h) { var tm = M.tims[inst(h)]; return tm ? M.timCount(tm) : 0; },
      __HAL_TIM_SET_PRESCALER: function (h, v) { var tm = M.tims[inst(h)]; if (tm) M.timSet(tm, 'psc', v & 0xFFFF); },
      __HAL_TIM_CLEAR_IT: function () { },

      // ---- ADC
      HAL_ADC_Init: function (h) {
        bindHandle(h);
        var n = Math.max(1, num(h.Init.NbrOfConversion, 1));
        M.adc = { h: h, seq: new Array(n).fill(0), idx: 0, value: 0, started: false, cont: !!num(h.Init.ContinuousConvMode, 0), dma: null, eoc: false };
        setAf('ADC1');
        return 0;
      },
      HAL_ADC_ConfigChannel: function (h, cfg) {
        if (!M.adc) F.HAL_ADC_Init(h);
        var rank = Math.max(1, num(cfg.Rank, 1)), ch = num(cfg.Channel, 0);
        if (rank > M.adc.seq.length) M.adc.seq.length = rank;
        M.adc.seq[rank - 1] = ch; M.adc.idx = 0;
        var pin = global.STM32Chips.adcPin(M.chip, ch);
        if (pin && M.pins[pin] && M.pins[pin].mode === 'reset') M.pins[pin].mode = 'analog';
        return 0;
      },
      HAL_ADC_Start: function (h) { if (!M.adc) return 1; M.adc.started = true; M.adc.eoc = false; M.adc.startT = M.now(); return 0; },
      HAL_ADC_Stop: function () { if (M.adc) { M.adc.started = false; M.adc.idx = 0; } return 0; },
      HAL_ADC_PollForConversion: function* (h, timeout) {
        var a = M.adc; if (!a || !a.started) return 3;
        yield* wait(0.004);
        a.value = M.adcSample(a.seq[a.idx] || 0);
        a.idx = (a.idx + 1) % a.seq.length; a.eoc = true;
        if (!a.cont && a.idx === 0) a.started = false;
        return 0;
      },
      HAL_ADC_GetValue: function () { return M.adc ? M.adc.value : 0; },
      HAL_ADC_Start_IT: function (h) {
        var a = M.adc; if (!a) return 1; a.started = true;
        M.at(M.now() + 0.004, function conv() {
          if (!a.started) return;
          a.value = M.adcSample(a.seq[a.idx] || 0); a.idx = (a.idx + 1) % a.seq.length;
          var irq = M.chip.periph.ADC1.irq;
          if (M.nvic[irq]) M.raise('HAL_ADC_ConvCpltCallback', [h], irq);
          else M.warnOnce('adcnvic', 'ADC 인터럽트가 NVIC 에서 꺼져 있습니다.');
          if (a.cont) M.at(M.t + 0.05, conv); else a.started = false;
        });
        return 0;
      },
      HAL_ADC_Stop_IT: function () { if (M.adc) M.adc.started = false; return 0; },
      HAL_ADC_Start_DMA: function (h, buf, n) {
        var a = M.adc; if (!a) return 1;
        a.dma = { buf: buf, n: n >>> 0 }; a.started = true;
        (function fill() {
          if (!a.dma) return;
          for (var i = 0; i < a.dma.n; i++) buf.a[buf.o + i] = M.adcSample(a.seq[i % a.seq.length] || 0);
          M.at(M.t + 1, fill);
        })();
        return 0;
      },
      HAL_ADC_Stop_DMA: function () { if (M.adc) { M.adc.dma = null; M.adc.started = false; } return 0; },
      HAL_ADCEx_Calibration_Start: function () { return 0; },

      // ---- I2C
      HAL_I2C_Init: function (h) {
        var n = bindHandle(h);
        M.i2cs[n] = { name: n, h: h, speed: num(h.Init.ClockSpeed, 100000), scl: pinsFor(n, 'SCL'), sda: pinsFor(n, 'SDA') };
        setAf(n);
        return 0;
      },
      HAL_I2C_Master_Transmit: function* (h, addr, data, size) {
        var bus = M.i2cs[inst(h)]; if (!bus) return 1;
        var bytes = bytesOf(data, size >>> 0), dev = M.i2cFind(bus, addr);
        yield* wait((bytes.length + 1) * 9 / bus.speed * 1000);
        M.emit('bus', { kind: 'i2c', bus: bus.name, dir: 'W', addr: (addr >> 1) & 0x7F, bytes: bytes, ack: !!dev, t: M.now() });
        if (!dev) { h.ErrorCode = 4; return 1; }
        dev.i2cWrite(bytes); return 0;
      },
      HAL_I2C_Master_Receive: function* (h, addr, buf, size) {
        var bus = M.i2cs[inst(h)]; if (!bus) return 1;
        var dev = M.i2cFind(bus, addr);
        yield* wait(((size >>> 0) + 1) * 9 / bus.speed * 1000);
        if (!dev) { M.emit('bus', { kind: 'i2c', bus: bus.name, dir: 'R', addr: (addr >> 1) & 0x7F, bytes: [], ack: false, t: M.now() }); h.ErrorCode = 4; return 1; }
        var r = dev.i2cRead(size >>> 0); writeBytes(buf, r);
        M.emit('bus', { kind: 'i2c', bus: bus.name, dir: 'R', addr: (addr >> 1) & 0x7F, bytes: r, ack: true, t: M.now() });
        return 0;
      },
      HAL_I2C_Mem_Write: function* (h, addr, mem, msize, data, size) {
        var pre = msize === 0x10 ? [(mem >> 8) & 255, mem & 255] : [mem & 255];
        return yield* F.HAL_I2C_Master_Transmit(h, addr, pre.concat(bytesOf(data, size >>> 0)), pre.length + (size >>> 0));
      },
      HAL_I2C_Mem_Read: function* (h, addr, mem, msize, buf, size) {
        var pre = msize === 0x10 ? [(mem >> 8) & 255, mem & 255] : [mem & 255];
        var r = yield* F.HAL_I2C_Master_Transmit(h, addr, pre, pre.length);
        if (r) return r;
        return yield* F.HAL_I2C_Master_Receive(h, addr, buf, size);
      },
      HAL_I2C_IsDeviceReady: function* (h, addr) {
        var bus = M.i2cs[inst(h)]; if (!bus) return 1;
        yield* wait(9 / bus.speed * 1000);
        return M.i2cFind(bus, addr) ? 0 : 1;
      },
      HAL_I2C_GetError: function (h) { return num(h.ErrorCode, 0); },

      // ---- SPI
      HAL_SPI_Init: function (h) {
        var n = bindHandle(h);
        M.spis[n] = { name: n, h: h, sck: pinsFor(n, 'SCK'), mosi: pinsFor(n, 'MOSI'), miso: pinsFor(n, 'MISO'),
          presc: num(h.Init.BaudRatePrescaler, 16) };
        setAf(n);
        return 0;
      },
      HAL_SPI_Transmit: function* (h, data, size) {
        var bus = M.spis[inst(h)]; if (!bus) return 1;
        var tx = bytesOf(data, size >>> 0); M.spiXfer(bus, tx);
        yield* wait(tx.length * 8 / 1e3); return 0;
      },
      HAL_SPI_Receive: function* (h, buf, size) {
        var bus = M.spis[inst(h)]; if (!bus) return 1;
        var tx = []; for (var i = 0; i < (size >>> 0); i++) tx.push(0xFF);
        writeBytes(buf, M.spiXfer(bus, tx)); yield* wait(tx.length * 8 / 1e3); return 0;
      },
      HAL_SPI_TransmitReceive: function* (h, txd, rxd, size) {
        var bus = M.spis[inst(h)]; if (!bus) return 1;
        var tx = bytesOf(txd, size >>> 0); writeBytes(rxd, M.spiXfer(bus, tx)); yield* wait(tx.length * 8 / 1e3); return 0;
      },

      // ---- stdio
      printf: function* (fmt) { var s = format(fmt, Array.prototype.slice.call(arguments, 1), fmtOpt); var b = utf8(s); yield* stdoutWrite(b); return b.length; },
      puts: function* (s) { var b = Array.prototype.slice.call(utf8(cstr(s) + '\n')); yield* stdoutWrite(b); return b.length; },
      putchar: function* (c) { yield* stdoutWrite([c & 255]); return c; },
      fflush: function* () { yield* flush(); return 0; },
      setvbuf: function () { return 0; },
      sprintf: function (buf, fmt) { var b = utf8(format(fmt, Array.prototype.slice.call(arguments, 2), fmtOpt)); M.checkBounds(buf, b.length + 1, 'sprintf'); writeBytes(buf, b, true); return b.length; },
      snprintf: function (buf, n, fmt) {
        var b = utf8(format(fmt, Array.prototype.slice.call(arguments, 3), fmtOpt)), len = b.length;
        n = n >>> 0; if (n === 0) return len;
        writeBytes(buf, Array.prototype.slice.call(b, 0, n - 1), true); return len;
      },
      // ---- string.h
      strlen: function (s) { return bytesOf(s).length; },
      strcpy: function (d, s) { var b = bytesOf(s); M.checkBounds(d, b.length + 1, 'strcpy'); writeBytes(d, b, true); return d; },
      strncpy: function (d, s, n) { var b = bytesOf(s).slice(0, n); while (b.length < n) b.push(0); writeBytes(d, b); return d; },
      strcat: function (d, s) { var l = bytesOf(d).length; var b = bytesOf(s); M.checkBounds(d.add(l), b.length + 1, 'strcat'); writeBytes(d.add(l), b, true); return d; },
      strcmp: function (a, b) { var x = cstr(a), y = cstr(b); return x < y ? -1 : x > y ? 1 : 0; },
      strncmp: function (a, b, n) { var x = cstr(a).slice(0, n), y = cstr(b).slice(0, n); return x < y ? -1 : x > y ? 1 : 0; },
      strchr: function (s, c) { var b = bytesOf(s), i = b.indexOf(c & 255); return i < 0 ? 0 : s.add(i); },
      strstr: function (s, t) { var i = cstr(s).indexOf(cstr(t)); return i < 0 ? 0 : s.add(utf8(cstr(s).slice(0, i)).length); },
      memset: function (d, v, n) { var a = d.a || d, o = d.a ? d.o : 0; for (var i = 0; i < (n >>> 0) && o + i < a.length; i++) a[o + i] = v; return d; },
      memcpy: function (d, s, n) { writeBytes(d, bytesOf(s, n >>> 0)); return d; },
      memcmp: function (a, b, n) { var x = bytesOf(a, n), y = bytesOf(b, n); for (var i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; },
      // ---- stdlib / math / ctype
      atoi: function (s) { return parseInt(cstr(s), 10) | 0; }, atol: function (s) { return parseInt(cstr(s), 10) | 0; },
      atof: function (s) { return parseFloat(cstr(s)) || 0; },
      strtol: function (s, e, b) { return parseInt(cstr(s), b || 10) | 0; },
      itoa: function (v, buf, base) { writeBytes(buf, utf8((v | 0).toString(base || 10)), true); return buf; },
      abs: Math.abs, labs: Math.abs, fabs: Math.abs, fabsf: Math.abs, sqrt: Math.sqrt, sqrtf: Math.sqrt, pow: Math.pow, powf: Math.pow,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, exp: Math.exp, log: Math.log, log10: Math.log10,
      floor: Math.floor, ceil: Math.ceil, round: function (x) { return x < 0 ? -Math.round(-x) : Math.round(x); }, roundf: function (x) { return x < 0 ? -Math.round(-x) : Math.round(x); },
      fmod: function (a, b) { return a % b; },
      rand: rnd, srand: function (s) { M.randSeed = s >>> 0; },
      isdigit: function (c) { return c >= 48 && c <= 57 ? 1 : 0; }, isalpha: function (c) { return (c | 32) >= 97 && (c | 32) <= 122 ? 1 : 0; },
      isalnum: function (c) { return F.isdigit(c) || F.isalpha(c); }, isspace: function (c) { return c === 32 || (c >= 9 && c <= 13) ? 1 : 0; },
      isupper: function (c) { return c >= 65 && c <= 90 ? 1 : 0; }, islower: function (c) { return c >= 97 && c <= 122 ? 1 : 0; },
      toupper: function (c) { return c >= 97 && c <= 122 ? c - 32 : c; }, tolower: function (c) { return c >= 65 && c <= 90 ? c + 32 : c; }
    };
    // 클럭 매크로들은 아무것도 하지 않는다
    Object.keys(FUNCS).forEach(function (k) { if (!F[k]) F[k] = function () { return 0; }; });
    return F;
  };

  Machine.prototype.checkBounds = function (p, n, fn) {
    if (!p || !p.a) return;
    if (p.o + n > p.a.length) throw new Error(fn + '(): 버퍼 넘침 — 배열 크기 ' + p.a.length + ' 바이트에 ' + (p.o + n) + ' 바이트를 쓰려 했습니다');
  };

  // ---- 버스 라우팅 (devices.js 가 채우는 this.devices) ---------------------------
  Machine.prototype.devicesOn = function (pin, port) {
    return (this.devices || []).filter(function (d) { return d.pinOf && d.pinOf(port) === pin; });
  };
  Machine.prototype.i2cFind = function (bus, addr8) {
    var a7 = (addr8 >> 1) & 0x7F, self = this;
    if (addr8 < 0x10 && addr8 > 0) this.warnOnce('i2caddr', 'I2C 주소가 0x' + addr8.toString(16) + ' 입니다. HAL 은 7비트 주소를 왼쪽으로 1비트 민 값(addr << 1)을 받습니다.');
    var list = (this.devices || []).filter(function (d) {
      return d.i2cAddr != null && bus.scl.indexOf(d.pinOf('scl')) >= 0 && bus.sda.indexOf(d.pinOf('sda')) >= 0;
    });
    var hit = list.filter(function (d) { return d.i2cAddr() === a7; })[0];
    if (!hit && list.length) this.warnOnce('i2cnack' + a7, bus.name + ': 주소 0x' + a7.toString(16).toUpperCase() + ' 에 응답(ACK)하는 장치가 없습니다. 연결된 장치 주소: ' +
      list.map(function (d) { return '0x' + d.i2cAddr().toString(16).toUpperCase(); }).join(', '));
    if (!hit && !list.length) this.warnOnce('i2cnone' + bus.name, bus.name + ' 의 SCL(' + bus.scl.join('/') + ') / SDA(' + bus.sda.join('/') + ') 에 연결된 I2C 장치가 없습니다.');
    return hit || null;
  };
  Machine.prototype.spiXfer = function (bus, tx) {
    var self = this;
    var devs = (this.devices || []).filter(function (d) {
      if (!d.spiXfer) return false;
      if (bus.sck.indexOf(d.pinOf('sck')) < 0) return false;
      var cs = d.pinOf('cs'); return !cs || self.level(cs) === 0;
    });
    var rx = tx.map(function (b) {
      var r = 0xFF;
      devs.forEach(function (d) { r = d.spiXfer(b); });
      return r & 255;
    });
    if (!devs.length) this.warnOnce('spinone' + bus.name, bus.name + ': 선택된(CS=LOW) SPI 장치가 없습니다. CS 핀을 LOW 로 내린 뒤 전송하세요.');
    this.emit('bus', { kind: 'spi', bus: bus.name, tx: tx, rx: rx, t: this.now() });
    return rx;
  };
  /** MCU UART TX → 장치 */
  Machine.prototype.uartOut = function (u, bytes) {
    var self = this;
    this.emit('bus', { kind: 'uart', bus: u.name, dir: 'TX', bytes: bytes, t: this.now() });
    var hit = false;
    (this.devices || []).forEach(function (d) {
      if (!d.uartRx) return;
      if (u.tx.indexOf(d.pinOf('rx')) >= 0) { hit = true; d.uartRx(bytes, u.baud); }
    });
    if (!hit) this.warnOnce('utx' + u.name, u.name + ' TX(' + u.tx.join('/') + ') 에 연결된 수신 장치(UART 터미널)가 없습니다.');
  };
  /** 장치 → MCU UART RX (핀 이름으로) */
  Machine.prototype.uartIn = function (pin, bytes, baud) {
    var self = this;
    var u = Object.keys(this.uarts).map(function (k) { return self.uarts[k]; }).filter(function (x) { return x.rxPins.indexOf(pin) >= 0; })[0];
    if (!u) { this.log('warn', pin + ' 에 초기화된 UART RX 가 없어 보낸 데이터가 버려졌습니다 (실행 중인지, USART 가 켜져 있는지 확인).'); return; }
    var byteMs = 10 / u.baud * 1000, t = this.now();
    bytes.forEach(function (b, i) {
      if (baud && Math.abs(baud - u.baud) / u.baud > 0.03) b = (b * 7 + 0x5A + (baud > u.baud ? 0x80 : 0)) & 0xFF;   // 보레이트 불일치 → 깨진 글자
      self.at(t + byteMs * (i + 1), function () {
        if (u.rx.length >= 64) { self.warnOnce('ore' + u.name, u.name + ': 수신 버퍼 넘침(Overrun) — 받은 바이트를 제때 읽지 않았습니다.'); return; }
        u.rx.push(b); self.uartDrain(u);
      });
    });
    this.emit('bus', { kind: 'uart', bus: u.name, dir: 'RX', bytes: bytes, t: this.now() });
  };
  Machine.prototype.uartDrain = function (u) {
    var it = u.it;
    while (it && u.rx.length) {
      it.buf.a[it.buf.o + it.n++] = u.rx.shift();
      if (it.n >= it.size) {
        u.it = null;
        if (this.nvic[this.chip.periph[u.name].irq]) this.raise('HAL_UART_RxCpltCallback', [it.h], u.name);
        it = null;
      }
    }
  };
  Machine.prototype.adcSample = function (ch) {
    if (ch === 16) return 940 + (Math.random() * 6 | 0);
    if (ch === 17) return 1500 + (Math.random() * 4 | 0);
    var pin = global.STM32Chips.adcPin(this.chip, ch), p = pin && this.pins[pin];
    if (!p) return 0;
    if (p.analog != null) return Math.max(0, Math.min(4095, Math.round(p.analog + (Math.random() * 5 - 2))));
    if (p.drive != null) return p.drive ? 4095 : 0;
    this.warnOnce('adcfloat' + pin, pin + '(ADC1_IN' + ch + ') 에 아무것도 연결되지 않아 값이 떠 있습니다.');
    return 1200 + (Math.random() * 1600 | 0);
  };

  global.STM32Runtime = {
    Machine: Machine, Ptr: Ptr, compilerEnv: compilerEnv, format: format, cstr: cstr, CONSTANTS: K, FUNCS: FUNCS,
    STRUCT_TYPES: STRUCT_TYPES, HANDLE_TYPES: HANDLE_TYPES, OBJECTS: OBJECTS, IRQ_NAME: IRQ_NAME, CYCLE_MS: CYCLE_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
