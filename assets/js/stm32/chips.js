/*
 * chips.js — MCU 카탈로그 (단일 출처)
 * -------------------------------------------------------------------------
 * 프로젝트의 중심은 MCU 이고, 보드는 "내장 장치 + 기본 핀"을 채워 주는 선택 프리셋이다.
 *   CHIPS[part]  : 제품군, 코어, 패키지 핀 배열, 핀별 대체기능(AF), 주변장치·IRQ 이름, 클럭 정보, HAL 접두어
 *   BOARDS[id]   : chip 과 내장 장치(LED·버튼·VCP), 기본 핀 설정
 * 값은 각 데이터시트 "Pin definitions" 표와 레퍼런스 매뉴얼 벡터 표를 기준으로 추렸다.
 * LQFP 핀 순서는 F1/F4/L4 64핀과 F407 100핀은 데이터시트 순서이고, F0/G0 64핀은 주요 핀만 맞춘 개략 배치다(pinsApprox).
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 패키지 핀 순서
  var LQFP64_F4 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP64_F1 = LQFP64_F4.map(function (p) { return p === 'PH0' ? 'PD0' : p === 'PH1' ? 'PD1' : p; });
  var LQFP64_F0 = LQFP64_F4.map(function (p) { return p === 'PH0' ? 'PF0' : p === 'PH1' ? 'PF1' : p === 'VBAT' ? 'VDD' : p; });
  var LQFP48 = [
    'VBAT', 'PC13', 'PC14', 'PC15', 'PD0', 'PD1', 'NRST', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
    'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PB2', 'PB10', 'PB11', 'VSS', 'VDD',
    'PB12', 'PB13', 'PB14', 'PB15', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
    'PA14', 'PA15', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD'
  ];
  var LQFP100_F4 = [
    'PE2', 'PE3', 'PE4', 'PE5', 'PE6', 'VBAT', 'PC13', 'PC14', 'PC15', 'VSS', 'VDD', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VDD', 'VSSA', 'VREF+', 'VDDA',
    'PA0', 'PA1', 'PA2', 'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PE7', 'PE8', 'PE9', 'PE10', 'PE11',
    'PE12', 'PE13', 'PE14', 'PE15', 'PB10', 'PB11', 'VCAP1', 'VDD', 'PB12', 'PB13', 'PB14', 'PB15', 'PD8', 'PD9', 'PD10', 'PD11', 'PD12', 'PD13', 'PD14', 'PD15',
    'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VCAP2', 'VSS', 'VDD', 'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD0', 'PD1',
    'PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PD7', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'PE0', 'PE1', 'VSS', 'VDD'
  ];

  // ---------------------------------------------------------------- 대체기능(AF) 표
  // 각 항목: 핀 → 이 시뮬레이터가 다루는 신호(USART/I2C/SPI/TIMx_CHn/ADC1_INn)
  function merge(a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k].slice(); }); Object.keys(b).forEach(function (k) { o[k] = b[k].slice(); }); return o; }
  function withoutSignals(af, re) { var o = {}; Object.keys(af).forEach(function (k) { o[k] = af[k].filter(function (s) { return !re.test(s); }); }); return o; }
  function withAdc(af, map) { var o = withoutSignals(af, /^ADC1_IN/); Object.keys(map).forEach(function (p) { o[p] = ['ADC1_IN' + map[p]].concat(o[p] || []); }); return o; }

  var AF_F1 = {
    PA0: ['ADC1_IN0', 'TIM2_CH1'], PA1: ['ADC1_IN1', 'TIM2_CH2'], PA2: ['ADC1_IN2', 'USART2_TX', 'TIM2_CH3'],
    PA3: ['ADC1_IN3', 'USART2_RX', 'TIM2_CH4'], PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK'],
    PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'], PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1'],
    PA9: ['USART1_TX', 'TIM1_CH2'], PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['TIM1_CH4'], PA12: [], PA15: [],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: [], PB4: [], PB5: [],
    PB6: ['I2C1_SCL', 'TIM4_CH1'], PB7: ['I2C1_SDA', 'TIM4_CH2'], PB8: ['TIM4_CH3', 'I2C1_SCL'], PB9: ['TIM4_CH4', 'I2C1_SDA'],
    PB10: ['I2C2_SCL', 'USART3_TX'], PB11: ['I2C2_SDA', 'USART3_RX'], PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'],
    PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12'], PC3: ['ADC1_IN13'], PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'],
    PC6: ['TIM3_CH1'], PC7: ['TIM3_CH2'], PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4'],
    PC10: ['USART3_TX'], PC11: ['USART3_RX'], PC12: [], PC13: [], PD2: []
  };
  var AF_F4 = {
    PA0: ['ADC1_IN0', 'TIM2_CH1', 'TIM5_CH1'], PA1: ['ADC1_IN1', 'TIM2_CH2', 'TIM5_CH2'],
    PA2: ['ADC1_IN2', 'USART2_TX', 'TIM2_CH3', 'TIM5_CH3'], PA3: ['ADC1_IN3', 'USART2_RX', 'TIM2_CH4', 'TIM5_CH4'],
    PA4: ['ADC1_IN4', 'SPI1_NSS'], PA5: ['ADC1_IN5', 'SPI1_SCK', 'TIM2_CH1'], PA6: ['ADC1_IN6', 'SPI1_MISO', 'TIM3_CH1'],
    PA7: ['ADC1_IN7', 'SPI1_MOSI', 'TIM3_CH2'], PA8: ['TIM1_CH1', 'I2C3_SCL'], PA9: ['USART1_TX', 'TIM1_CH2'],
    PA10: ['USART1_RX', 'TIM1_CH3'], PA11: ['USART6_TX', 'TIM1_CH4'], PA12: ['USART6_RX'], PA15: ['TIM2_CH1', 'SPI1_NSS'],
    PB0: ['ADC1_IN8', 'TIM3_CH3'], PB1: ['ADC1_IN9', 'TIM3_CH4'], PB2: [], PB3: ['TIM2_CH2', 'SPI1_SCK', 'I2C2_SDA'],
    PB4: ['TIM3_CH1', 'SPI1_MISO', 'I2C3_SDA'], PB5: ['TIM3_CH2', 'SPI1_MOSI'], PB6: ['I2C1_SCL', 'TIM4_CH1', 'USART1_TX'],
    PB7: ['I2C1_SDA', 'TIM4_CH2', 'USART1_RX'], PB8: ['I2C1_SCL', 'TIM4_CH3'], PB9: ['I2C1_SDA', 'TIM4_CH4'],
    PB10: ['I2C2_SCL', 'TIM2_CH3', 'SPI2_SCK', 'USART3_TX'], PB11: ['I2C2_SDA', 'TIM2_CH4', 'USART3_RX'], PB12: ['SPI2_NSS'], PB13: ['SPI2_SCK'], PB14: ['SPI2_MISO'], PB15: ['SPI2_MOSI'],
    PC0: ['ADC1_IN10'], PC1: ['ADC1_IN11'], PC2: ['ADC1_IN12', 'SPI2_MISO'], PC3: ['ADC1_IN13', 'SPI2_MOSI'],
    PC4: ['ADC1_IN14'], PC5: ['ADC1_IN15'], PC6: ['TIM3_CH1', 'USART6_TX'], PC7: ['TIM3_CH2', 'USART6_RX'],
    PC8: ['TIM3_CH3'], PC9: ['TIM3_CH4', 'I2C3_SDA'], PC10: ['USART3_TX'], PC11: ['USART3_RX'], PC12: [], PC13: [], PD2: []
  };
  var AF_F4_100 = merge(AF_F4, {
    PD5: ['USART2_TX'], PD6: ['USART2_RX'], PD8: ['USART3_TX'], PD9: ['USART3_RX'], PD12: ['TIM4_CH1'], PD13: ['TIM4_CH2'], PD14: ['TIM4_CH3'], PD15: ['TIM4_CH4'],
    PE9: ['TIM1_CH1'], PE11: ['TIM1_CH2'], PE13: ['TIM1_CH3'], PE14: ['TIM1_CH4'], PE5: ['TIM9_CH1'], PE6: ['TIM9_CH2'],
    PD0: [], PD1: [], PD3: [], PD4: [], PD7: [], PD10: [], PD11: [], PE0: [], PE1: [], PE2: [], PE3: [], PE4: [], PE7: [], PE8: [], PE10: [], PE12: [], PE15: []
  });
  // L4: 주변장치 핀은 F4 와 거의 같고 ADC 채널 번호가 다르다 (PA0=IN5 …)
  var AF_L4 = withAdc(withoutSignals(AF_F4, /USART6|I2C3|TIM5/), {
    PA0: 5, PA1: 6, PA2: 7, PA3: 8, PA4: 9, PA5: 10, PA6: 11, PA7: 12, PB0: 15, PB1: 16, PC0: 1, PC1: 2, PC2: 3, PC3: 4, PC4: 13, PC5: 14
  });
  // G0: TIM4/5 없음, ADC 채널 PA0–7 = IN0–7, PB0 IN8, PB1 IN9, PB2 IN10, PB10 IN11
  var AF_G0 = withAdc(withoutSignals(AF_F4, /USART6|I2C3|TIM4|TIM5/), { PA0: 0, PA1: 1, PA2: 2, PA3: 3, PA4: 4, PA5: 5, PA6: 6, PA7: 7, PB0: 8, PB1: 9, PB2: 10, PB10: 11 });
  AF_G0.PC13 = []; AF_G0.PF0 = []; AF_G0.PF1 = [];
  // F0 (F030): TIM2/4/5 없음, TIM3/TIM1 만; USART3 없음(F030R8 은 USART1/2)
  var AF_F0 = withoutSignals(AF_F1, /TIM2|TIM4|USART3/);
  AF_F0.PF0 = []; AF_F0.PF1 = [];

  // ---------------------------------------------------------------- 주변장치 · IRQ 이름 (제품군별)
  function periphSet(family, opts) {
    opts = opts || {};
    var f4 = family === 'F4', f1 = family === 'F1', l4 = family === 'L4', g0 = family === 'G0', f0 = family === 'F0';
    var m0 = g0 || f0;
    var p = {
      USART1: { kind: 'usart', pins: { TX: 'PA9', RX: 'PA10' }, bus: 'APB2', irq: 'USART1' },
      USART2: { kind: 'usart', pins: { TX: 'PA2', RX: 'PA3' }, bus: 'APB1', irq: 'USART2' },
      I2C1: { kind: 'i2c', pins: { SCL: (f1 || f0) ? 'PB6' : 'PB8', SDA: (f1 || f0) ? 'PB7' : 'PB9' }, irq: m0 ? 'I2C1' : 'I2C1_EV' },
      I2C2: { kind: 'i2c', pins: { SCL: 'PB10', SDA: f4 ? 'PB3' : 'PB11' }, irq: m0 ? 'I2C2' : 'I2C2_EV' },
      SPI1: { kind: 'spi', pins: { SCK: 'PA5', MISO: 'PA6', MOSI: 'PA7' }, irq: 'SPI1' },
      SPI2: { kind: 'spi', pins: { SCK: 'PB13', MISO: 'PB14', MOSI: 'PB15' }, irq: 'SPI2' },
      TIM1: { kind: 'tim', bits: 16, bus: 'APB2', chPins: { 1: 'PA8', 2: 'PA9', 3: 'PA10', 4: 'PA11' },
        irq: f4 ? 'TIM1_UP_TIM10' : f1 ? 'TIM1_UP' : l4 ? 'TIM1_UP_TIM16' : 'TIM1_BRK_UP_TRG_COM' },
      TIM3: { kind: 'tim', bits: 16, bus: 'APB1', chPins: { 1: 'PA6', 2: 'PA7', 3: 'PB0', 4: 'PB1' }, irq: 'TIM3' },
      ADC1: { kind: 'adc', irq: f4 ? 'ADC' : (f1 || l4) ? 'ADC1_2' : 'ADC1' }
    };
    if (!f0) p.TIM2 = { kind: 'tim', bits: (f4 || l4 || g0) ? 32 : 16, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM2' };
    if (f4 || f1 || l4) p.TIM4 = { kind: 'tim', bits: 16, bus: 'APB1', chPins: opts.tim4d ? { 1: 'PD12', 2: 'PD13', 3: 'PD14', 4: 'PD15' } : { 1: 'PB6', 2: 'PB7', 3: 'PB8', 4: 'PB9' }, irq: 'TIM4' };
    if (f4 || l4) p.TIM5 = { kind: 'tim', bits: 32, bus: 'APB1', chPins: { 1: 'PA0', 2: 'PA1', 3: 'PA2', 4: 'PA3' }, irq: 'TIM5' };
    if (f1 || l4 || g0 || opts.usart3) p.USART3 = { kind: 'usart', pins: { TX: 'PB10', RX: 'PB11' }, bus: 'APB1', irq: g0 ? 'USART3_4' : 'USART3' };
    if (f4 && opts.usart6) p.USART6 = { kind: 'usart', pins: { TX: 'PC6', RX: 'PC7' }, bus: 'APB2', irq: 'USART6' };
    return p;
  }

  // ---------------------------------------------------------------- 제품군 공통 정보
  var FAMILIES = {
    F0: { name: 'STM32F0', core: 'Cortex-M0', hal: 'STM32F0xx_HAL_Driver', halPrefix: 'stm32f0xx', hsi: 8, exti: 'm0', apb1Max: 48, apb2Max: 48, desc: '입문형 32비트, Cortex-M0 48 MHz' },
    F1: { name: 'STM32F1', core: 'Cortex-M3', hal: 'STM32F1xx_HAL_Driver', halPrefix: 'stm32f1xx', hsi: 8, exti: 'm3', apb1Max: 36, apb2Max: 72, desc: '고전적인 메인스트림, Cortex-M3 72 MHz' },
    F4: { name: 'STM32F4', core: 'Cortex-M4F', hal: 'STM32F4xx_HAL_Driver', halPrefix: 'stm32f4xx', hsi: 16, exti: 'm3', apb1Max: 42, apb2Max: 84, desc: '고성능 메인스트림, Cortex-M4F + FPU' },
    G0: { name: 'STM32G0', core: 'Cortex-M0+', hal: 'STM32G0xx_HAL_Driver', halPrefix: 'stm32g0xx', hsi: 16, exti: 'm0', apb1Max: 64, apb2Max: 64, desc: '차세대 입문형, Cortex-M0+ 64 MHz' },
    L4: { name: 'STM32L4', core: 'Cortex-M4F', hal: 'STM32L4xx_HAL_Driver', halPrefix: 'stm32l4xx', hsi: 16, exti: 'm3', apb1Max: 80, apb2Max: 80, desc: '초저전력, Cortex-M4F 80 MHz' }
  };

  function chip(part, o) {
    var fam = FAMILIES[o.family];
    var c = {
      part: part, name: part + 'Tx', family: fam.name, series: o.family, core: fam.core, pkg: o.pkg, pins: o.pins, pinsApprox: !!o.pinsApprox,
      af: o.af, flash: o.flash, ram: o.ram, maxClk: o.maxClk, sysclks: o.sysclks, defClk: o.defClk, hsi: fam.hsi,
      apb1Max: o.apb1Max || fam.apb1Max, apb2Max: o.apb2Max || fam.apb2Max, exti: fam.exti,
      periph: periphSet(o.family, o.periph || {}), hal: fam.hal, halPrefix: fam.halPrefix, desc: o.desc || fam.desc, note: o.note || ''
    };
    return c;
  }

  var CHIPS = {
    STM32F030R8: chip('STM32F030R8', { family: 'F0', pkg: 'LQFP64', pins: LQFP64_F0, pinsApprox: true, af: AF_F0, flash: 64, ram: 8, maxClk: 48, sysclks: [8, 24, 48], defClk: 48,
      desc: 'Cortex-M0 48 MHz · 64 KB Flash · 8 KB RAM', note: 'TIM2/TIM4 가 없어 32비트 타이머와 TIM4 채널을 쓸 수 없습니다.' }),
    STM32F103C8: chip('STM32F103C8', { family: 'F1', pkg: 'LQFP48', pins: LQFP48, af: AF_F1, flash: 64, ram: 20, maxClk: 72, sysclks: [8, 36, 48, 64, 72], defClk: 72,
      desc: 'Cortex-M3 72 MHz · 64 KB Flash · 20 KB RAM (Blue Pill)' }),
    STM32F103RB: chip('STM32F103RB', { family: 'F1', pkg: 'LQFP64', pins: LQFP64_F1, af: AF_F1, flash: 128, ram: 20, maxClk: 72, sysclks: [8, 36, 48, 64, 72], defClk: 72,
      desc: 'Cortex-M3 72 MHz · 128 KB Flash · 20 KB RAM' }),
    STM32F401RE: chip('STM32F401RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 96, maxClk: 84, sysclks: [16, 48, 84], defClk: 84, periph: { usart6: true },
      desc: 'Cortex-M4F 84 MHz · 512 KB Flash · 96 KB RAM' }),
    STM32F411RE: chip('STM32F411RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 128, maxClk: 100, sysclks: [16, 48, 84, 100], defClk: 84, apb1Max: 50, apb2Max: 100, periph: { usart6: true },
      desc: 'Cortex-M4F 100 MHz · 512 KB Flash · 128 KB RAM' }),
    STM32F446RE: chip('STM32F446RE', { family: 'F4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_F4, flash: 512, ram: 128, maxClk: 180, sysclks: [16, 48, 84, 168, 180], defClk: 180, apb1Max: 45, apb2Max: 90, periph: { usart6: true, usart3: true },
      desc: 'Cortex-M4F 180 MHz · 512 KB Flash · 128 KB RAM' }),
    STM32F407VG: chip('STM32F407VG', { family: 'F4', pkg: 'LQFP100', pins: LQFP100_F4, af: AF_F4_100, flash: 1024, ram: 192, maxClk: 168, sysclks: [16, 48, 84, 168], defClk: 168, apb1Max: 42, apb2Max: 84, periph: { usart6: true, usart3: true, tim4d: true },
      desc: 'Cortex-M4F 168 MHz · 1 MB Flash · 192 KB RAM · 100핀' }),
    STM32G071RB: chip('STM32G071RB', { family: 'G0', pkg: 'LQFP64', pins: LQFP64_F0, pinsApprox: true, af: AF_G0, flash: 128, ram: 36, maxClk: 64, sysclks: [16, 32, 64], defClk: 64,
      desc: 'Cortex-M0+ 64 MHz · 128 KB Flash · 36 KB RAM' }),
    STM32L476RG: chip('STM32L476RG', { family: 'L4', pkg: 'LQFP64', pins: LQFP64_F4, af: AF_L4, flash: 1024, ram: 128, maxClk: 80, sysclks: [16, 40, 80], defClk: 80,
      desc: 'Cortex-M4F 80 MHz · 1 MB Flash · 128 KB RAM · 초저전력' })
  };

  // ---------------------------------------------------------------- 보드 프리셋 (선택)
  function nucleo64(id, chipId, ledId) {
    return {
      chip: chipId, title: id, kind: 'Nucleo-64',
      desc: CHIPS[chipId].desc + ' · ST-Link/V2-1 내장 (VCP = USART2)',
      builtin: [
        { id: ledId || 'LD2', type: 'board-led', pin: 'PA5', props: { color: 'green', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PC13', props: { wiring: 'module', label: 'B1 USER' } },
        { id: 'VCP', type: 'vcp', pins: { tx: 'PA3', rx: 'PA2' }, props: { baud: 115200, name: 'ST-Link VCP' } }
      ],
      defaults: {
        pins: { PA5: { signal: 'GPIO_Output', label: ledId || 'LD2' }, PC13: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'falling' },
          PA2: { signal: 'USART2_TX', label: 'USART_TX' }, PA3: { signal: 'USART2_RX', label: 'USART_RX' } },
        periph: { USART2: { mode: 'async', baud: 115200 } }, nvic: {}
      }
    };
  }
  var BOARDS = {
    'NUCLEO-F411RE': nucleo64('NUCLEO-F411RE', 'STM32F411RE'),
    'NUCLEO-F401RE': nucleo64('NUCLEO-F401RE', 'STM32F401RE'),
    'NUCLEO-F446RE': nucleo64('NUCLEO-F446RE', 'STM32F446RE'),
    'NUCLEO-F103RB': nucleo64('NUCLEO-F103RB', 'STM32F103RB'),
    'NUCLEO-L476RG': nucleo64('NUCLEO-L476RG', 'STM32L476RG'),
    'NUCLEO-G071RB': nucleo64('NUCLEO-G071RB', 'STM32G071RB', 'LD4'),
    'NUCLEO-F030R8': nucleo64('NUCLEO-F030R8', 'STM32F030R8'),
    'BLUEPILL-F103C8': {
      chip: 'STM32F103C8', title: 'Blue Pill (F103C8)', kind: '모듈',
      desc: 'STM32F103C8T6 · 8 MHz 크리스털 · 외부 ST-Link 필요',
      builtin: [{ id: 'LED', type: 'board-led', pin: 'PC13', props: { color: 'green', active: 'low' } }],
      defaults: { pins: { PC13: { signal: 'GPIO_Output', label: 'LED', level: 1 } }, periph: {}, nvic: {} }
    },
    'DISCO-F407VG': {
      chip: 'STM32F407VG', title: 'STM32F4DISCOVERY', kind: 'Discovery',
      desc: 'STM32F407VG · LED 4개(PD12–PD15) · 사용자 버튼 PA0 · ST-Link/V2 (VCP 없음)',
      builtin: [
        { id: 'LD4', type: 'board-led', pin: 'PD12', props: { color: 'green', active: 'high' } },
        { id: 'LD3', type: 'board-led', pin: 'PD13', props: { color: 'yellow', active: 'high' } },
        { id: 'LD5', type: 'board-led', pin: 'PD14', props: { color: 'red', active: 'high' } },
        { id: 'LD6', type: 'board-led', pin: 'PD15', props: { color: 'blue', active: 'high' } },
        { id: 'B1', type: 'board-button', pin: 'PA0', props: { wiring: 'vcc', label: 'B1 USER' } }
      ],
      defaults: {
        pins: { PD12: { signal: 'GPIO_Output', label: 'LD4' }, PD13: { signal: 'GPIO_Output', label: 'LD3' }, PD14: { signal: 'GPIO_Output', label: 'LD5' }, PD15: { signal: 'GPIO_Output', label: 'LD6' },
          PA0: { signal: 'GPIO_EXTI', label: 'B1', trigger: 'rising', pull: 'down' } },
        periph: {}, nvic: {}
      }
    }
  };

  // ---------------------------------------------------------------- 도우미
  function isGpio(name) { return /^P[A-H]\d+$/.test(name); }
  var RESERVED = { PA13: 'SYS_JTMS-SWDIO', PA14: 'SYS_JTCK-SWCLK', PC14: 'RCC_OSC32_IN', PC15: 'RCC_OSC32_OUT',
    PH0: 'RCC_OSC_IN', PH1: 'RCC_OSC_OUT', PD0: 'RCC_OSC_IN', PD1: 'RCC_OSC_OUT', PF0: 'RCC_OSC_IN', PF1: 'RCC_OSC_OUT' };
  function reserved(chip, pin) {
    // PD0/PD1 은 F1 48/64핀에서만 오실레이터. 100핀 F4 의 PD0/PD1 은 일반 GPIO.
    if ((pin === 'PD0' || pin === 'PD1') && chip.series !== 'F1') return null;
    return RESERVED[pin] || null;
  }

  /** 핀에서 고를 수 있는 신호 목록 (CubeMX 핀 메뉴와 같은 순서) */
  function pinSignals(chip, pin) {
    if (!isGpio(pin)) return [];
    var r = reserved(chip, pin); if (r) return [r];
    return ['Reset_State', 'GPIO_Input', 'GPIO_Output', 'GPIO_Analog', 'GPIO_EXTI'].concat(chip.af[pin] || []);
  }
  /** ADC 채널 → 핀 */
  function adcPin(chip, ch) { for (var p in chip.af) if (chip.af[p].indexOf('ADC1_IN' + ch) >= 0) return p; return null; }
  /** 신호 이름 → 가능한 핀 목록 */
  function signalPins(chip, sig) {
    var out = [];
    chip.pins.forEach(function (p) { if ((chip.af[p] || []).indexOf(sig) >= 0 && out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  /** EXTI 핀 번호 → NVIC 라인 이름 (M0 계열은 0_1 / 2_3 / 4_15) */
  function extiLine(chip, n) {
    if (chip && chip.exti === 'm0') return n <= 1 ? 'EXTI0_1' : n <= 3 ? 'EXTI2_3' : 'EXTI4_15';
    return n <= 4 ? 'EXTI' + n : n <= 9 ? 'EXTI9_5' : 'EXTI15_10';
  }
  /** 버스 분주: sysclk(MHz) 를 apbMax 이하로 만드는 최소 2^n */
  function apbDiv(mhz, max) { var d = 1; while (mhz / d > max + 1e-9 && d < 16) d *= 2; return d; }
  /** 클럭 요약 { sysclk, apb1, apb2, tim1, tim2, div1, div2 } (MHz) */
  function clocks(chip, mhz) {
    var d1 = apbDiv(mhz, chip.apb1Max), d2 = apbDiv(mhz, chip.apb2Max);
    return { sysclk: mhz, div1: d1, div2: d2, apb1: mhz / d1, apb2: mhz / d2, tim1: mhz / d1 * (d1 > 1 ? 2 : 1), tim2: mhz / d2 * (d2 > 1 ? 2 : 1) };
  }
  /** 프로젝트 / 보드 id / 칩 id 무엇을 주어도 칩 객체 */
  function chipOf(x) {
    if (!x) return CHIPS.STM32F411RE;
    if (typeof x === 'object') { if (x.mcu && CHIPS[x.mcu]) return CHIPS[x.mcu]; if (x.board && BOARDS[x.board]) return CHIPS[BOARDS[x.board].chip]; return CHIPS.STM32F411RE; }
    if (CHIPS[x]) return CHIPS[x];
    if (BOARDS[x]) return CHIPS[BOARDS[x].chip];
    return CHIPS.STM32F411RE;
  }
  function boardsFor(chipId) { return Object.keys(BOARDS).filter(function (b) { return BOARDS[b].chip === chipId; }); }

  global.STM32Chips = {
    CHIPS: CHIPS, BOARDS: BOARDS, FAMILIES: FAMILIES, RESERVED: RESERVED,
    isGpio: isGpio, reserved: reserved, pinSignals: pinSignals, adcPin: adcPin, signalPins: signalPins,
    extiLine: extiLine, clocks: clocks, chipOf: chipOf, boardsFor: boardsFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
